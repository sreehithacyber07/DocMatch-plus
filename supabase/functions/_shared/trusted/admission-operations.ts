/**
 * R9G-B trusted staffed-tablet admission.
 *
 * TRUST ROOT
 *
 *   The caller (bearer) is a permanent staff account. The platform gateway and
 *   `verifyCaller` verify that token; the database then requires an enabled
 *   clinical_staff profile in an enabled facility. The facility, the admitting
 *   staff profile and the deployment mode all come from that trusted profile,
 *   never from the request.
 *
 * DUAL IDENTITY
 *
 *   The patient is a separate, fresh anonymous Supabase Auth principal created
 *   on the tablet for this patient only. Its access token travels in the body
 *   over HTTPS and is verified independently by Supabase Auth: signature,
 *   expiry, a live session, and `is_anonymous`. A user id alone is never
 *   accepted. The token is not logged, stored, echoed or put in an error.
 *
 * REPLAY
 *
 *   A patient principal is bound at most once. The database refuses a second
 *   admission of any principal that already owns an assessment, and a unique
 *   index allows one facility binding per principal. Replaying a captured
 *   patient token therefore cannot bind another assessment, and doing it at
 *   all still needs a valid clinical staff session. A retry with the same
 *   operation key returns the original assessment.
 *
 * OWNERSHIP
 *
 *   The anonymous patient owns the assessment and writes its evidence under the
 *   unchanged R9C patient policies. The staff member is recorded as the
 *   admitting profile and audit actor, not as the owner.
 */
import {
  SERVER_VERSIONS,
  STAFF_ADMITTED_DEPLOYMENT_MODE,
  TRUSTED_ASSESSMENT_CONTRACT_VERSION,
  TrustedError,
  isTrustedErrorCode,
  type TrustedComplaintSource,
} from './contract.ts';
import { isApprovedComplaint } from './derive.ts';
import type { StoreOutcome, VerifiedCaller } from './operations.ts';
import type { StaffedAdmissionRequest } from './request.ts';

export interface AdmitArgs {
  staffAuthUserId: string;
  patientAuthUserId: string;
  clientEventId: string;
  contractVersion: string;
  engineVersion: string;
  knowledgeVersion: string;
  safetyVersion: string;
  complaintId: string;
  complaintSource: TrustedComplaintSource;
}

export interface AdmissionStore {
  /** True only for an enabled clinical_staff profile in an enabled facility. */
  isClinicalStaff(authUserId: string): Promise<boolean>;
  /** Verifies an access token through Supabase Auth; null when it is not valid. */
  verifyPrincipal(accessToken: string): Promise<VerifiedCaller | null>;
  admitStaffed(args: AdmitArgs): Promise<StoreOutcome>;
}

export interface AdmissionResult {
  outcome: 'applied' | 'replayed' | 'existing';
  status: string;
  assessmentId: string;
  deploymentMode: typeof STAFF_ADMITTED_DEPLOYMENT_MODE;
}

/**
 * The R9G-B lifecycle transitions, in R9A vocabulary. R9G-A's three remain in
 * `TRUSTED_TRANSITIONS`; nothing here adds a status or an R3 continuation.
 */
export const R9G_B_TRANSITIONS = [
  { operation: 'assessment-admit', from: 'created', to: 'in_progress', reasonCode: 'staff_admitted_patient' },
  { operation: 'assessment-end', from: 'created', to: 'cancelled', reasonCode: 'patient_session_ended' },
  { operation: 'assessment-end', from: 'in_progress', to: 'cancelled', reasonCode: 'patient_session_ended' },
  { operation: 'assessment-end', from: 'priority_escalated', to: 'closed', reasonCode: 'patient_session_ended' },
  { operation: 'assessment-end', from: 'handoff_prepared', to: 'closed', reasonCode: 'patient_session_ended' },
  { operation: 'operator-expiry', from: 'created', to: 'expired', reasonCode: 'idle_policy_expired' },
  { operation: 'operator-expiry', from: 'in_progress', to: 'expired', reasonCode: 'idle_policy_expired' },
] as const;

function unwrap(result: StoreOutcome): Extract<StoreOutcome, { ok: true }> {
  if ('code' in result) throw new TrustedError(isTrustedErrorCode(result.code) ? result.code : 'INTERNAL');
  return result;
}

export async function handleStaffedAdmission(
  store: AdmissionStore,
  caller: VerifiedCaller,
  request: StaffedAdmissionRequest,
): Promise<AdmissionResult> {
  // Staff authority first, so the endpoint is never a patient-token oracle for
  // anyone who is not already clinical staff.
  if (caller.isAnonymous) throw new TrustedError('STAFF_REQUIRED');
  if (!(await store.isClinicalStaff(caller.userId))) throw new TrustedError('STAFF_REQUIRED');
  if (!isApprovedComplaint(request.complaintId)) throw new TrustedError('COMPLAINT_NOT_SUPPORTED');

  const patient = await store.verifyPrincipal(request.patientAccessToken);
  if (!patient || !patient.isAnonymous || patient.userId === caller.userId) {
    throw new TrustedError('PATIENT_REQUIRED');
  }

  const result = unwrap(await store.admitStaffed({
    staffAuthUserId: caller.userId,
    patientAuthUserId: patient.userId,
    clientEventId: request.clientEventId,
    contractVersion: TRUSTED_ASSESSMENT_CONTRACT_VERSION,
    engineVersion: SERVER_VERSIONS.engineVersion,
    knowledgeVersion: SERVER_VERSIONS.knowledgeVersion,
    safetyVersion: SERVER_VERSIONS.safetyVersion,
    complaintId: request.complaintId,
    complaintSource: request.complaintSource,
  }));
  if (!result.recordId) throw new TrustedError('INTERNAL');
  return {
    outcome: result.outcome,
    status: result.status,
    assessmentId: result.recordId,
    deploymentMode: STAFF_ADMITTED_DEPLOYMENT_MODE,
  };
}
