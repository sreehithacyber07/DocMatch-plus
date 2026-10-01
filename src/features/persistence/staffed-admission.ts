/**
 * R9G-B staffed-tablet admission, browser side.
 *
 * Loaded on demand, and only by staffed-tablet builds with a configured
 * backend. Web and hospital-kiosk builds never evaluate this module, so they
 * never touch the persistent staff session.
 *
 * TWO IDENTITIES ON ONE TABLET
 *
 *   staff    the permanent care-team session from `/staff`, under its own
 *            storage key. It is the trust root for admission. This module only
 *            reads and uses it; it never signs it in or out.
 *   patient  a fresh anonymous principal per patient, memory-only, created by
 *            the patient persistence session and disposed at New Patient.
 *
 * The admission request is sent with the STAFF session as the bearer and
 * carries the patient's access token in the body, so the server can verify
 * both principals itself. The browser never names a facility, a staff
 * profile, a deployment mode or an owner. The patient token is sent only over
 * HTTPS to the trusted function; it is never logged or stored.
 */
import { classifyBackendError } from './errors.ts';
import type { GatewayResult } from './gateway.ts';
import { authorizeStaff, createStaffClient, type StaffClient } from '../staff/session.ts';

export interface AdmissionRequest {
  clientEventId: string;
  complaintId: string;
  complaintSource: string;
}

export interface AdmissionResponse {
  outcome: 'applied' | 'replayed' | 'existing';
  status: string;
  assessmentId: string;
}

export type StaffAdmission = (
  patientAccessToken: string,
  request: AdmissionRequest,
  signal: AbortSignal,
) => Promise<GatewayResult<AdmissionResponse>>;

export type TabletStaffState =
  | { state: 'authorized'; facilityName: string }
  | { state: 'sign-in-required' }
  | { state: 'unavailable' };

let shared: { url: string; key: string; client: StaffClient } | null = null;

/** One staff client per page, so two clients never race to refresh one session. */
function staffClientFor(url: string, publishableKey: string): StaffClient {
  if (!shared || shared.url !== url || shared.key !== publishableKey) {
    shared = { url, key: publishableKey, client: createStaffClient(url, publishableKey) };
  }
  return shared.client;
}

/**
 * Whether an authorized care-team member is signed in on this tablet. Every
 * refusal (no session, no profile, disabled profile or facility, a role
 * without clinical access) reads the same: a care-team sign-in is required.
 */
export async function checkTabletStaff(url: string, publishableKey: string): Promise<TabletStaffState> {
  try {
    const client = staffClientFor(url, publishableKey);
    const { data } = await client.auth.getSession();
    if (!data.session) return { state: 'sign-in-required' };
    const authorization = await authorizeStaff(client);
    if (authorization.status === 'authorized') {
      return { state: 'authorized', facilityName: authorization.context.facilityName };
    }
    return authorization.reason === 'unavailable' ? { state: 'unavailable' } : { state: 'sign-in-required' };
  } catch {
    return { state: 'unavailable' };
  }
}

/** `client` is for audits that sign in several care-team accounts; the app never passes one. */
export function createStaffAdmission(url: string, publishableKey: string, client?: StaffClient): StaffAdmission {
  return async (patientAccessToken, request, signal) => {
    try {
      const staff = client ?? staffClientFor(url, publishableKey);
      const { data, error } = await staff.functions.invoke<{ data?: AdmissionResponse }>('assessment-admit', {
        body: { patientAccessToken, ...request },
        signal,
        timeout: 12000,
      });
      if (error) {
        const response = error.context instanceof Response ? error.context : null;
        let code = 'function-error';
        if (response) {
          try {
            const envelope = await response.clone().json() as { error?: { code?: unknown } };
            if (typeof envelope.error?.code === 'string') code = envelope.error.code;
          } catch { /* The HTTP status is still available. */ }
        }
        return { ok: false, error: classifyBackendError({ code, status: response?.status ?? 0 }) };
      }
      const payload = data?.data;
      if (!payload || !['applied', 'replayed', 'existing'].includes(payload.outcome)
        || typeof payload.assessmentId !== 'string' || typeof payload.status !== 'string') {
        return { ok: false, error: { kind: 'rejected', code: 'invalid-function-response', status: null } };
      }
      return { ok: true, value: { outcome: payload.outcome, status: payload.status, assessmentId: payload.assessmentId } };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return { ok: false, error: { kind: aborted ? 'aborted' : 'transient', code: aborted ? 'ABORT_ERR' : 'thrown', status: null } };
    }
  };
}
