/**
 * Trusted operation handlers.
 *
 * Pure orchestration over an injected store, so the same code runs in the Edge
 * Function (with the service-role store) and in tests (with a fake). The
 * caller passed in has already been authenticated from a verified JWT; nothing
 * about identity comes from the request body.
 *
 * Order in every handler:
 *   1. the caller must be a temporary anonymous patient
 *   2. the assessment must exist AND be owned by the caller (one answer for
 *      both, so another patient's assessment ID reveals nothing)
 *   3. admission shape, contract version and pinned engine versions must match
 *   4. the derivation runs on persisted evidence only
 *   5. the atomic database function re-checks and writes
 */
import {
  SELF_ADMITTED_DEPLOYMENT_MODE,
  STAFF_ADMITTED_DEPLOYMENT_MODE,
  SERVER_VERSIONS,
  TRUSTED_ASSESSMENT_CONTRACT_VERSION,
  TrustedError,
  isTrustedErrorCode,
  type TrustedComplaintSource,
} from './contract.ts';
import { deriveInterviewState, deriveRoutingResult, deriveSafetyEvent, isApprovedComplaint } from './derive.ts';
import { generateTrustedSoap } from './soap-generate.ts';
import { trustedSoapInputs, type BodySelectionRow, type SoapSectionsRecord } from './soap-boundary.ts';
import { routingResultAgrees, type StoredRoutingResult } from '../../../../src/features/persistence/trusted-result.ts';
import type { IntakeAnswerRow, RoutingAnswerRow, SafetyAnswerRow } from './evidence.ts';
import type { AssessmentOperationRequest, AssessmentStartRequest } from './request.ts';

export interface VerifiedCaller {
  userId: string;
  isAnonymous: boolean;
}

export interface AssessmentRow {
  id: string;
  owner_auth_user_id: string | null;
  contract_version: string;
  deployment_mode: string;
  status: string;
  complaint_id: string | null;
  complaint_source: string | null;
  facility_id: string | null;
  kiosk_device_id: string | null;
  initiated_by_staff_profile_id: string | null;
  engine_version: string;
  knowledge_version: string;
  safety_version: string;
  created_at: string;
}

export interface EvidenceRows {
  routing: RoutingAnswerRow[];
  safety: SafetyAnswerRow[];
  intake: IntakeAnswerRow[];
}

/** What the atomic database functions return. */
export type StoreOutcome =
  | { ok: true; outcome: 'applied' | 'replayed' | 'existing'; status: string; recordId: string | null }
  | { ok: false; code: string };

export interface StartArgs {
  assessmentId: string;
  ownerAuthUserId: string;
  clientEventId: string;
  complaintId: string;
  complaintSource: TrustedComplaintSource;
}

export interface HighWater {
  routing: number;
  safety: number;
  intake: number;
}

export interface SafetyEventArgs {
  assessmentId: string;
  ownerAuthUserId: string;
  clientEventId: string;
  highWater: HighWater;
  firedRuleIds: string[];
  selectedRuleId: string;
  ruleVersion: string;
  payloadId: string;
  severity: string;
  continuationPolicy: string;
  triggeredAt: string;
  evidence: { table: string; id: string }[];
}

export interface FinalizeArgs {
  assessmentId: string;
  ownerAuthUserId: string;
  clientEventId: string;
  highWater: HighWater;
  selectedSpecialtyRegistryId: string;
  engineTopSpecialtyId: string;
  stopReason: string;
  belief: {
    cardiology: number;
    pulmonology: number;
    neurology: number;
    gastroenterology: number;
    orthopedics: number;
    dermatology: number;
  };
  supportingAnswerIds: string[];
}

export interface PrepareSoapArgs {
  assessmentId: string;
  ownerAuthUserId: string;
  clientEventId: string;
  routingResultId: string;
  highWater: HighWater;
  bodyRecordId: string | null;
  soapSchemaVersion: string;
  sections: SoapSectionsRecord;
}

export const SOAP_SCHEMA_VERSION = '1.0.0-r9e';

export interface TrustedStore {
  loadOwnedAssessment(assessmentId: string, ownerAuthUserId: string): Promise<AssessmentRow | null>;
  loadEvidence(assessmentId: string): Promise<EvidenceRows>;
  startAssessment(args: StartArgs): Promise<StoreOutcome>;
  recordSafetyEvent(args: SafetyEventArgs): Promise<StoreOutcome>;
  finalizeRouting(args: FinalizeArgs): Promise<StoreOutcome>;
  loadBodySelections?(assessmentId: string): Promise<BodySelectionRow[]>;
  loadRoutingResult?(assessmentId: string): Promise<StoredRoutingResult | null>;
  prepareSoap?(args: PrepareSoapArgs): Promise<StoreOutcome>;
  endAssessment?(args: { assessmentId: string; ownerAuthUserId: string; clientEventId: string }): Promise<StoreOutcome>;
}

export type OperationResult =
  | { outcome: 'applied' | 'replayed' | 'existing'; status: string }
  | { outcome: 'applied' | 'replayed' | 'existing'; status: string; safetyEventId: string }
  | { outcome: 'not_triggered'; status: string }
  | { outcome: 'applied' | 'replayed' | 'existing'; status: string; routingResultId: string }
  | { outcome: 'applied' | 'replayed' | 'existing'; status: string; soapHandoffId: string };

export function requirePatient(caller: VerifiedCaller): void {
  if (!caller.isAnonymous) throw new TrustedError('PATIENT_REQUIRED');
}

export async function ownedAssessment(store: Pick<TrustedStore, 'loadOwnedAssessment'>, caller: VerifiedCaller, assessmentId: string): Promise<AssessmentRow> {
  const assessment = await store.loadOwnedAssessment(assessmentId, caller.userId);
  // A missing row and another patient's row are indistinguishable by design.
  if (!assessment || assessment.owner_auth_user_id !== caller.userId) throw new TrustedError('ASSESSMENT_NOT_FOUND');
  return assessment;
}

/**
 * The two admitted shapes a patient operation may act on:
 *
 *   web/self-service   no facility, device or staff binding (R9C self-insert);
 *   staffed-tablet     facility and admitting staff profile set by the R9G-B
 *                      trusted admission, and no device binding.
 *
 * Every hospital-kiosk assessment is refused: no trusted kiosk admission
 * exists. The database functions repeat this check and also require the
 * admitting facility to still be enabled.
 */
export function checkAdmission(assessment: AssessmentRow): void {
  const selfService =
    assessment.deployment_mode === SELF_ADMITTED_DEPLOYMENT_MODE &&
    assessment.facility_id === null &&
    assessment.kiosk_device_id === null &&
    assessment.initiated_by_staff_profile_id === null;
  const staffAdmitted =
    assessment.deployment_mode === STAFF_ADMITTED_DEPLOYMENT_MODE &&
    assessment.facility_id !== null &&
    assessment.initiated_by_staff_profile_id !== null &&
    assessment.kiosk_device_id === null;
  if (!selfService && !staffAdmitted) {
    throw new TrustedError('UNSUPPORTED_DEPLOYMENT');
  }
  if (
    assessment.contract_version !== TRUSTED_ASSESSMENT_CONTRACT_VERSION ||
    assessment.engine_version !== SERVER_VERSIONS.engineVersion ||
    assessment.knowledge_version !== SERVER_VERSIONS.knowledgeVersion ||
    assessment.safety_version !== SERVER_VERSIONS.safetyVersion
  ) {
    throw new TrustedError('VERSION_MISMATCH');
  }
}

function unwrap(result: StoreOutcome): Extract<StoreOutcome, { ok: true }> {
  if ('code' in result) throw new TrustedError(isTrustedErrorCode(result.code) ? result.code : 'INTERNAL');
  return result;
}

function requireRecordId(result: Extract<StoreOutcome, { ok: true }>): string {
  if (!result.recordId) throw new TrustedError('INTERNAL');
  return result.recordId;
}

async function derivedState(store: TrustedStore, assessment: AssessmentRow) {
  if (assessment.status === 'created' || !assessment.complaint_id) throw new TrustedError('INVALID_STATE');
  const evidence = await store.loadEvidence(assessment.id);
  return deriveInterviewState({
    complaintId: assessment.complaint_id,
    routingRows: evidence.routing,
    safetyRows: evidence.safety,
    intakeRows: evidence.intake,
  });
}

/** Sets the service-owned complaint fields and moves created -> in_progress. */
export async function handleAssessmentStart(
  store: TrustedStore,
  caller: VerifiedCaller,
  request: AssessmentStartRequest,
): Promise<OperationResult> {
  requirePatient(caller);
  const assessment = await ownedAssessment(store, caller, request.assessmentId);
  checkAdmission(assessment);
  // A staff-admitted assessment is started by its trusted admission, which
  // already recorded the confirmed complaint.
  if (assessment.deployment_mode !== SELF_ADMITTED_DEPLOYMENT_MODE) throw new TrustedError('UNSUPPORTED_DEPLOYMENT');
  if (!isApprovedComplaint(request.complaintId)) throw new TrustedError('COMPLAINT_NOT_SUPPORTED');
  const result = unwrap(
    await store.startAssessment({
      assessmentId: assessment.id,
      ownerAuthUserId: caller.userId,
      clientEventId: request.clientEventId,
      complaintId: request.complaintId,
      complaintSource: request.complaintSource,
    }),
  );
  return { outcome: result.outcome, status: result.status };
}

function clampTimestamp(value: string | null, notBefore: string, now: Date): string {
  const floor = Date.parse(notBefore);
  const ceiling = now.getTime();
  const candidate = value === null ? ceiling : Date.parse(value);
  return new Date(Math.min(Math.max(candidate, floor), ceiling)).toISOString();
}

/**
 * Independently evaluates R3 over persisted evidence. Records a safety event
 * only when the server's own evaluation fires a rule. The browser's local R3
 * interruption never waits for this.
 */
export async function handleSafetyEvaluate(
  store: TrustedStore,
  caller: VerifiedCaller,
  request: AssessmentOperationRequest,
  now: Date = new Date(),
): Promise<OperationResult> {
  requirePatient(caller);
  const assessment = await ownedAssessment(store, caller, request.assessmentId);
  checkAdmission(assessment);
  const state = await derivedState(store, assessment);
  const event = deriveSafetyEvent(state);
  if (!event) {
    if (assessment.status !== 'in_progress') throw new TrustedError('INVALID_STATE');
    return { outcome: 'not_triggered', status: assessment.status };
  }
  const result = unwrap(
    await store.recordSafetyEvent({
      assessmentId: assessment.id,
      ownerAuthUserId: caller.userId,
      clientEventId: request.clientEventId,
      highWater: state.highWater,
      firedRuleIds: event.firedRuleIds,
      selectedRuleId: event.selectedRuleId,
      ruleVersion: event.ruleVersion,
      payloadId: event.payloadId,
      severity: event.severity,
      continuationPolicy: event.continuationPolicy,
      // The trigger moment is the latest accepted answer, bounded to the
      // assessment's lifetime; a browser clock is never taken at face value.
      triggeredAt: clampTimestamp(state.latestAnsweredAt, assessment.created_at, now),
      evidence: event.evidence.map((reference) => ({ table: reference.table, id: reference.recordId })),
    }),
  );
  return { outcome: result.outcome, status: result.status, safetyEventId: requireRecordId(result) };
}

/**
 * Recomputes the routing result from persisted evidence and records it only
 * when the patient's screen would be showing a result.
 */
export async function handleRoutingFinalize(
  store: TrustedStore,
  caller: VerifiedCaller,
  request: AssessmentOperationRequest,
): Promise<OperationResult> {
  requirePatient(caller);
  const assessment = await ownedAssessment(store, caller, request.assessmentId);
  checkAdmission(assessment);
  const state = await derivedState(store, assessment);
  const routing = deriveRoutingResult(state);
  const result = unwrap(
    await store.finalizeRouting({
      assessmentId: assessment.id,
      ownerAuthUserId: caller.userId,
      clientEventId: request.clientEventId,
      highWater: state.highWater,
      selectedSpecialtyRegistryId: routing.selectedSpecialtyRegistryId,
      engineTopSpecialtyId: routing.engineTopSpecialtyId,
      stopReason: routing.stopReason,
      belief: { ...routing.belief },
      supportingAnswerIds: routing.supportingAnswerRecordIds,
    }),
  );
  return { outcome: result.outcome, status: result.status, routingResultId: requireRecordId(result) };
}

/** Generates and validates SOAP from persisted evidence, never a browser document. */
export async function handleSoapPrepare(
  store: TrustedStore,
  caller: VerifiedCaller,
  request: AssessmentOperationRequest,
): Promise<OperationResult> {
  requirePatient(caller);
  const assessment = await ownedAssessment(store, caller, request.assessmentId);
  checkAdmission(assessment);
  if (!store.loadBodySelections || !store.loadRoutingResult || !store.prepareSoap) throw new TrustedError('INTERNAL');
  if (assessment.status !== 'routing_complete' && assessment.status !== 'handoff_prepared') {
    throw new TrustedError('INVALID_STATE');
  }
  if (assessment.complaint_source !== 'bridge-resolved' && assessment.complaint_source !== 'patient-stated') {
    throw new TrustedError('INVALID_EVIDENCE');
  }
  const state = await derivedState(store, assessment);
  const routing = deriveRoutingResult(state);
  const [bodyRows, stored] = await Promise.all([
    store.loadBodySelections(assessment.id),
    // The database has one current result per assessment in R9G-A.
    store.loadRoutingResult(assessment.id),
  ]);
  if (!stored) throw new TrustedError('ROUTING_NOT_FINAL');
  if (!routingResultAgrees(stored, routing)) throw new TrustedError('INVALID_EVIDENCE');
  const input = trustedSoapInputs({ complaintSource: assessment.complaint_source, state, routing, bodyRows });
  const sections = generateTrustedSoap(input);
  const result = unwrap(await store.prepareSoap({
    assessmentId: assessment.id,
    ownerAuthUserId: caller.userId,
    clientEventId: request.clientEventId,
    routingResultId: stored.id,
    highWater: state.highWater,
    bodyRecordId: input.body?.recordId ?? null,
    soapSchemaVersion: SOAP_SCHEMA_VERSION,
    sections,
  }));
  return { outcome: result.outcome, status: result.status, soapHandoffId: requireRecordId(result) };
}

/**
 * R9G-B: the patient's local session ended (New Patient, a location change,
 * kiosk inactivity or leaving the screen). R9A meanings only: an unfinished
 * assessment is cancelled, and one that reached a priority screen or a
 * prepared handoff is closed. Closing never touches a clinical handoff and
 * implies no clinical acknowledgement. Nothing is deleted.
 */
export async function handleAssessmentEnd(
  store: TrustedStore,
  caller: VerifiedCaller,
  request: AssessmentOperationRequest,
): Promise<OperationResult> {
  requirePatient(caller);
  const assessment = await ownedAssessment(store, caller, request.assessmentId);
  if (
    assessment.deployment_mode !== SELF_ADMITTED_DEPLOYMENT_MODE &&
    assessment.deployment_mode !== STAFF_ADMITTED_DEPLOYMENT_MODE
  ) {
    throw new TrustedError('UNSUPPORTED_DEPLOYMENT');
  }
  if (!store.endAssessment) throw new TrustedError('INTERNAL');
  const result = unwrap(await store.endAssessment({
    assessmentId: assessment.id,
    ownerAuthUserId: caller.userId,
    clientEventId: request.clientEventId,
  }));
  return { outcome: result.outcome, status: result.status };
}
