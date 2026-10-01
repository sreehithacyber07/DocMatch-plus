import type {
  InterruptedResult,
  SafetyAuditEvent,
  SafetyInterruptionAuditEvent,
  SafetyScreeningAuditEvent,
  SafetyScreeningResult,
  StaffOverrideAction,
  StaffOverrideAuditEvent,
} from './types.ts';

interface AuditEventIdentity {
  eventId: string;
  timestamp: string;
  sessionReference: string;
}

function assertText(value: string, subject: string): void {
  if (value.trim().length === 0) throw new TypeError(`${subject} must be a non-empty string.`);
}

function assertIdentity(identity: Readonly<AuditEventIdentity>): void {
  assertText(identity.eventId, 'eventId');
  assertText(identity.sessionReference, 'sessionReference');
  if (identity.timestamp.trim().length === 0 || !Number.isFinite(Date.parse(identity.timestamp))) {
    throw new TypeError('timestamp must be a valid timestamp string.');
  }
}

export function createSafetyScreeningAuditEvent(
  result: Readonly<SafetyScreeningResult>,
  identity: Readonly<AuditEventIdentity>,
): SafetyScreeningAuditEvent {
  assertIdentity(identity);
  return {
    kind: 'safety_screening_presented',
    ...identity,
    engineVersion: result.audit.engineVersion,
    knowledgeVersion: result.audit.knowledgeVersion,
    safetyVersion: result.audit.safetyVersion,
    provenanceIds: [...result.question.provenanceIds],
    questionId: result.question.id,
  };
}

export function createSafetyInterruptionAuditEvent(
  result: Readonly<InterruptedResult>,
  identity: Readonly<AuditEventIdentity>,
): SafetyInterruptionAuditEvent {
  assertIdentity(identity);
  return {
    kind: 'safety_interruption',
    ...identity,
    engineVersion: result.audit.engineVersion,
    knowledgeVersion: result.audit.knowledgeVersion,
    safetyVersion: result.audit.safetyVersion,
    provenanceIds: [...new Set([...result.audit.provenanceIds, ...result.payload.provenanceIds])].toSorted(),
    firedRuleIds: [...result.firedRuleIds],
    selectedRuleId: result.selectedRuleId,
    payloadId: result.payload.id,
    severity: result.severity,
    continuationPolicy: result.continuationPolicy,
  };
}

interface StaffOverrideInput extends AuditEventIdentity {
  staffActorId: string;
  overrideAction: StaffOverrideAction;
  reason: string;
}

export function createStaffOverrideAuditEvent(
  interruption: Readonly<InterruptedResult>,
  input: Readonly<StaffOverrideInput>,
): StaffOverrideAuditEvent {
  assertIdentity(input);
  assertText(input.staffActorId, 'staffActorId');
  assertText(input.reason, 'reason');
  if (!['request_continuation', 'transfer_to_clinician', 'document_only'].includes(input.overrideAction)) {
    throw new TypeError(`Unknown staff override action ${input.overrideAction}.`);
  }
  return {
    kind: 'staff_override_recorded',
    eventId: input.eventId,
    timestamp: input.timestamp,
    sessionReference: input.sessionReference,
    engineVersion: interruption.audit.engineVersion,
    knowledgeVersion: interruption.audit.knowledgeVersion,
    safetyVersion: interruption.audit.safetyVersion,
    provenanceIds: [...new Set([...interruption.audit.provenanceIds, ...interruption.payload.provenanceIds])].toSorted(),
    staffActorId: input.staffActorId,
    firedRuleIds: [...interruption.firedRuleIds],
    originalPayloadId: interruption.payload.id,
    originalContinuationPolicy: interruption.continuationPolicy,
    overrideAction: input.overrideAction,
    reason: input.reason,
    automaticContinuationEnabled: false,
  };
}

export function appendSafetyAuditEvent(
  history: readonly SafetyAuditEvent[],
  event: Readonly<SafetyAuditEvent>,
): SafetyAuditEvent[] {
  if (history.some((candidate) => candidate.eventId === event.eventId)) {
    throw new TypeError(`Duplicate safety audit event id ${event.eventId}.`);
  }
  return [...structuredClone(history), structuredClone(event)];
}
