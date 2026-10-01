/** R9A proposal only. No persistence or network implementation is implied. */
import type { BodyRegionId, BodyView } from '../body/ids.ts';
import type { NormalizedPoint, PainPrecision } from '../body/types.ts';
import type { SpecialtyId, ReadonlyBelief, StopReason } from '../engine/index.ts';
import type { SafetySeverity, ContinuationPolicy, StaffOverrideAction } from '../engine/safety/types.ts';
import type { IntakeCategory } from '../features/routing-flow/intake-questions.ts';
import type { ComplaintSource } from '../features/body-explorer/unmapped-regions.ts';
import type { DeploymentMode } from '../features/trust/deployment.ts';
import type { SpecialtyRecord } from '../features/routing-flow/specialty-registry.ts';

export type RecordId = string; // Pseudonymous UUID; no patient identity is encoded.
export type IsoTimestamp = string; // UTC ISO 8601, validated at the future service boundary.
export type ClientEventId = string; // UUID generated once per logical action and reused on retry.

export type AssessmentStatus =
  | 'created'
  | 'in_progress'
  | 'priority_escalated'
  | 'routing_complete'
  | 'handoff_prepared'
  | 'closed'
  | 'expired'
  | 'cancelled';

export interface FacilityRecord {
  id: RecordId;
  displayName: string;
  enabled: boolean;
}

export interface KioskDeviceRecord {
  id: RecordId;
  facilityId: RecordId;
  mode: 'hospital-kiosk' | 'staffed-tablet';
  enabled: boolean;
}

export interface StaffProfileRecord {
  id: RecordId;
  authUserId: RecordId;
  facilityId: RecordId;
  role: 'clinical_staff' | 'facility_admin';
  enabled: boolean;
}

/** Reference projection of the existing registry, not a new routability decision. */
export type SpecialtyReference = Readonly<SpecialtyRecord>;

/** Reference projection of the approved R2 complaint catalog. */
export interface ComplaintReference {
  id: string;
  label: string;
  knowledgeVersion: string;
  provenanceIds: readonly string[];
}

export interface AssessmentSessionRecord {
  id: RecordId;
  contractVersion: string;
  facilityId: RecordId | null;
  kioskDeviceId: RecordId | null;
  ownerAuthUserId: RecordId | null;
  initiatedByStaffProfileId: RecordId | null;
  deploymentMode: DeploymentMode;
  complaintId: string | null;
  complaintSource: ComplaintSource | null;
  status: AssessmentStatus;
  engineVersion: string;
  knowledgeVersion: string;
  safetyVersion: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

/** Append-only selection snapshots; laterality is derived from the versioned body catalog. */
export interface BodySelectionRecord {
  id: RecordId;
  assessmentId: RecordId;
  regionId: BodyRegionId;
  view: BodyView;
  precision: PainPrecision;
  point: NormalizedPoint | null;
  bodyDomainVersion: string;
  capturedAt: IsoTimestamp;
  recordedAt: IsoTimestamp;
  clientEventId: ClientEventId;
  supersedesRecordId: RecordId | null;
}

export type AnswerOperation = 'selected' | 'cleared';

export interface AnswerRecordBase {
  id: RecordId;
  assessmentId: RecordId;
  questionId: string;
  optionId: string | null;
  operation: AnswerOperation;
  sequence: number;
  answeredAt: IsoTimestamp;
  recordedAt: IsoTimestamp;
  clientEventId: ClientEventId;
  supersedesRecordId: RecordId | null;
}

/** Descriptive history for SOAP; never a Bayesian likelihood input. */
export interface IntakeAnswerRecord extends AnswerRecordBase {
  category: IntakeCategory;
}

/** R1/R2 answer, including a routing question referenced by R3. */
export interface RoutingAnswerRecord extends AnswerRecordBase {
  knowledgeVersion: string;
}

/** Answer to an R3-owned question; not an R1 belief update. */
export interface SafetyAnswerRecord extends AnswerRecordBase {
  safetyVersion: string;
}

/** A locally evaluated R3 interruption. An event is not a staff notification. */
export interface SafetyEventRecord {
  id: RecordId;
  assessmentId: RecordId;
  firedRuleIds: readonly string[];
  selectedRuleId: string;
  ruleVersion: string;
  payloadId: string;
  severity: SafetySeverity;
  continuationPolicy: ContinuationPolicy;
  evidenceAnswerRecordIds: readonly RecordId[];
  assessmentStatusAtTrigger: AssessmentStatus;
  triggeredAt: IsoTimestamp;
  recordedAt: IsoTimestamp;
  clientEventId: ClientEventId;
}

/** The selected registry endpoint may be General Medicine even when R1 had a top key. */
export interface RoutingResultRecord {
  id: RecordId;
  assessmentId: RecordId;
  selectedSpecialtyRegistryId: string;
  engineTopSpecialtyId: SpecialtyId;
  stopReason: StopReason | 'question_pool_exhausted';
  belief: ReadonlyBelief;
  supportingAnswerRecordIds: readonly RecordId[];
  generatedAt: IsoTimestamp;
  recordedAt: IsoTimestamp;
  clientEventId: ClientEventId;
  supersedesResultId: RecordId | null;
}

export interface SoapLineRecord {
  label: string;
  value: string;
}

/** Frozen rendered snapshot. O contains only actual body-map observations and an absence-of-measurements note. */
export interface SoapHandoffRecord {
  id: RecordId;
  assessmentId: RecordId;
  routingResultId: RecordId;
  soapSchemaVersion: string;
  sections: Readonly<{
    S: readonly SoapLineRecord[];
    O: readonly SoapLineRecord[];
    A: readonly SoapLineRecord[];
    P: readonly SoapLineRecord[];
  }>;
  generatedAt: IsoTimestamp;
  recordedAt: IsoTimestamp;
  clientEventId: ClientEventId;
  supersedesHandoffId: RecordId | null;
}

/** Future workflow only; this state is never inferred from a button tap. */
export type ClinicalHandoffStatus =
  | 'prepared'
  | 'available_for_review'
  | 'opened'
  | 'acknowledged'
  | 'closed'
  | 'cancelled';

export interface ClinicalHandoffRecord {
  id: RecordId;
  assessmentId: RecordId;
  soapHandoffId: RecordId;
  facilityId: RecordId;
  status: ClinicalHandoffStatus;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export type AuditEventKind =
  | 'assessment_transition'
  | 'handoff_transition'
  | 'staff_override_recorded';

/** Future staff action must retain the complete R3 override semantics. */
export interface StaffOverrideDetail {
  firedRuleIds: readonly string[];
  originalPayloadId: string;
  originalContinuationPolicy: ContinuationPolicy;
  overrideAction: StaffOverrideAction;
  reason: string;
  automaticContinuationEnabled: false;
}

/** Append-only state/override ledger; subject and status pairs are validated by event kind. */
export interface AuditEventRecord {
  id: RecordId;
  kind: AuditEventKind;
  assessmentId: RecordId;
  clinicalHandoffId: RecordId | null;
  actorStaffProfileId: RecordId | null;
  fromStatus: AssessmentStatus | ClinicalHandoffStatus | null;
  toStatus: AssessmentStatus | ClinicalHandoffStatus | null;
  reasonCode: string | null;
  staffOverride: StaffOverrideDetail | null;
  occurredAt: IsoTimestamp;
  recordedAt: IsoTimestamp;
  clientEventId: ClientEventId;
}
