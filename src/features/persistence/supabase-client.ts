/**
 * The patient Supabase client.
 *
 * One client per patient assessment. A fresh instance gives every patient a
 * clean ownership boundary even if signing the previous identity out fails.
 *
 * Auth is memory-only:
 *
 *   persistSession: false      auth-js keeps the session in an in-memory
 *                              adapter; nothing is written to web storage,
 *                              browser databases or cookies, and no cross-tab
 *                              BroadcastChannel is opened.
 *   detectSessionInUrl: false  a session is never read from a URL.
 *   storageKey (unique)        a key NAME only, never written anywhere while
 *                              persistence is off; unique per patient so two
 *                              short-lived clients never share auth state.
 *   autoRefreshToken: true     keeps a long web assessment signed in, in
 *                              memory; disposePatientClient stops it.
 *
 * Only the publishable key is accepted (see config.ts). A secret or
 * service-role key never reaches this function.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types.ts';

export type PatientSupabaseClient = SupabaseClient<Database>;

export function patientAuthOptions(instanceId: string) {
  return {
    persistSession: false,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: `docmatch-patient-${instanceId}`,
  } as const;
}

export function createPatientClient(
  url: string,
  publishableKey: string,
  instanceId: string,
  fetchImpl?: typeof fetch,
): PatientSupabaseClient {
  return createClient<Database>(url, publishableKey, {
    auth: patientAuthOptions(instanceId),
    ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
  });
}

/**
 * Ends the temporary patient identity.
 *
 * `signOut({ scope: 'local' })` removes the in-memory session even when the
 * network call fails; `dispose()` then removes the visibility listener and the
 * refresh timer so the discarded client holds no live auth machinery.
 */
export async function disposePatientClient(client: PatientSupabaseClient): Promise<void> {
  try {
    await client.auth.signOut({ scope: 'local' });
  } catch {
    // Sign-out is best effort. The client is discarded regardless.
  }
  try {
    await client.auth.dispose();
  } catch {
    // Nothing further to release.
  }
}
