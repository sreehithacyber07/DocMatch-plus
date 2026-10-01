/**
 * Staff authentication and authorization.
 *
 * TWO CLIENTS, ON PURPOSE
 *
 *   patient  anonymous, `persistSession: false`, a fresh client per patient
 *            with a unique storage key, signed out at every reset boundary.
 *   staff    a permanent account with Supabase's standard persistent session,
 *            under its own storage key, so a clinician is not signed out by a
 *            page reload in the middle of a shift.
 *
 * They are separate `createClient` instances with different storage keys, so
 * neither can read, refresh or clear the other's session. The patient client is
 * created only by the patient flow and the staff client only by this module.
 *
 * SIGNING IN IS NOT AUTHORIZATION
 *
 * A valid Supabase account only proves who the caller is. The workspace is
 * opened only when the trusted `staff-session` operation confirms an enabled
 * clinical_staff profile in an enabled facility, and every later request is
 * re-checked server-side. There is no signup path here: accounts are
 * provisioned by a facility administrator through a trusted channel.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types.ts';

export type StaffClient = SupabaseClient<Database>;

/** A single, stable key: one staff session per browser profile. */
export const STAFF_STORAGE_KEY = 'docmatch-staff-session';

export function staffAuthOptions() {
  return {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: STAFF_STORAGE_KEY,
  } as const;
}

export function createStaffClient(url: string, publishableKey: string, fetchImpl?: typeof fetch): StaffClient {
  return createClient<Database>(url, publishableKey, {
    auth: staffAuthOptions(),
    ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
  });
}

export type StaffAuthFailure =
  | 'invalid-credentials'
  | 'not-authorized'
  | 'session-expired'
  | 'unavailable'
  | 'configuration';

export interface StaffWorkspaceContext {
  facilityName: string;
  role: 'clinical_staff';
}

export type StaffAuthorization =
  | { status: 'authorized'; context: StaffWorkspaceContext }
  | { status: 'denied'; reason: StaffAuthFailure };

/** One neutral message per failure; internal role and facility detail is never shown. */
export const STAFF_AUTH_MESSAGE: Readonly<Record<StaffAuthFailure, string>> = {
  'invalid-credentials': 'That email and password combination was not recognised.',
  'not-authorized': 'This account is not authorized for the clinical workspace.',
  'session-expired': 'The session has ended. Sign in again to continue.',
  unavailable: 'The clinical workspace is unavailable right now. Try again shortly.',
  configuration: 'The clinical workspace is not configured in this build.',
};

function functionFailure(status: number | undefined): StaffAuthFailure {
  if (status === 401) return 'session-expired';
  if (status === 403 || status === 404) return 'not-authorized';
  return 'unavailable';
}

/**
 * Asks the trusted operation whether this verified account may use the
 * workspace. A refusal is always reported as `not-authorized`, whether the
 * cause is a missing profile, a disabled profile, a disabled facility or a role
 * without clinical access.
 */
export async function authorizeStaff(client: StaffClient): Promise<StaffAuthorization> {
  try {
    const { data, error } = await client.functions.invoke<{ data?: StaffWorkspaceContext & { authorized?: boolean } }>(
      'staff-session',
      { body: {} },
    );
    if (error) {
      const response = error.context instanceof Response ? error.context : null;
      return { status: 'denied', reason: functionFailure(response?.status) };
    }
    const context = data?.data;
    if (!context?.authorized || typeof context.facilityName !== 'string' || context.role !== 'clinical_staff') {
      return { status: 'denied', reason: 'not-authorized' };
    }
    return { status: 'authorized', context: { facilityName: context.facilityName, role: 'clinical_staff' } };
  } catch {
    return { status: 'denied', reason: 'unavailable' };
  }
}

export async function signInStaff(client: StaffClient, email: string, password: string): Promise<StaffAuthFailure | null> {
  // The password is handed to Supabase Auth and never stored, logged or sent
  // anywhere else by this application.
  try {
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (!error) return null;
    if (typeof error.status === 'number' && error.status >= 500) return 'unavailable';
    return error.status === undefined ? 'unavailable' : 'invalid-credentials';
  } catch {
    return 'unavailable';
  }
}

export interface StaffSignOutResult {
  remoteRevoked: boolean;
  localCleared: boolean;
}

/**
 * A failed network sign-out must not leave a reusable staff credential on a
 * shared tablet. Auth-js normally removes the local session even when its
 * remote request fails, but an exception before that cleanup is also possible.
 * Dispose the old client before clearing its dedicated storage slot, so a
 * pending refresh cannot repopulate it. The caller must discard this client.
 */
export async function signOutStaff(
  client: StaffClient,
  storage?: Pick<Storage, 'getItem' | 'removeItem'> | null,
): Promise<StaffSignOutResult> {
  let remoteRevoked = false;
  try {
    // End only this browser session, not a clinician's other devices.
    const { error } = await client.auth.signOut({ scope: 'local' });
    remoteRevoked = !error;
  } catch {
    // Local cleanup below is still mandatory.
  }
  try {
    await client.auth.dispose();
  } catch {
    // The storage slot is still cleared below.
  }
  try {
    const local = storage === undefined
      ? (typeof window === 'undefined' ? null : window.localStorage)
      : storage;
    if (!local) return { remoteRevoked, localCleared: remoteRevoked };
    local.removeItem(STAFF_STORAGE_KEY);
    return { remoteRevoked, localCleared: local.getItem(STAFF_STORAGE_KEY) === null };
  } catch {
    return { remoteRevoked, localCleared: false };
  }
}
