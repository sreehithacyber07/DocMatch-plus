/**
 * R9G-A trusted operation contract.
 *
 * Pure: no Deno, no Node, no network. Imported by the Edge Functions and by the
 * Node test suite, so both exercise exactly the same rules.
 */
import { ENGINE_VERSION } from '../../../../src/engine/config.ts';
import { KNOWLEDGE_VERSION } from '../../../../src/engine/data/version.ts';
import { SAFETY_VERSION } from '../../../../src/engine/safety/version.ts';

/**
 * The only assessment payload shape these operations accept. It must equal
 * `ASSESSMENT_CONTRACT_VERSION` in the R9D browser persistence module; a test
 * guards the two against drift.
 */
export const TRUSTED_ASSESSMENT_CONTRACT_VERSION = '1.0.0-r9d-assessment';

/** Versions the server runs. An assessment pinned to anything else is refused. */
export const SERVER_VERSIONS = {
  engineVersion: ENGINE_VERSION,
  knowledgeVersion: KNOWLEDGE_VERSION,
  safetyVersion: SAFETY_VERSION,
} as const;

/** The only deployment mode an anonymous patient can admit themselves in. */
export const SELF_ADMITTED_DEPLOYMENT_MODE = 'web/self-service';

/**
 * R9G-B: the mode a trusted staff admission creates. The browser never names
 * it; the admission operation writes it. Hospital-kiosk has no trusted
 * admission and stays refused everywhere.
 */
export const STAFF_ADMITTED_DEPLOYMENT_MODE = 'staffed-tablet';

export type TrustedErrorCode =
  | 'METHOD_NOT_ALLOWED'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_REQUEST'
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'PATIENT_REQUIRED'
  | 'STAFF_REQUIRED'
  | 'ASSESSMENT_NOT_FOUND'
  | 'HANDOFF_NOT_FOUND'
  | 'UNSUPPORTED_DEPLOYMENT'
  | 'VERSION_MISMATCH'
  | 'COMPLAINT_NOT_SUPPORTED'
  | 'INVALID_STATE'
  | 'INVALID_EVIDENCE'
  | 'STALE_EVIDENCE'
  | 'ROUTING_NOT_FINAL'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL';

/** HTTP status per code. ASSESSMENT_NOT_FOUND also covers "owned by someone else". */
export const ERROR_STATUS: Readonly<Record<TrustedErrorCode, number>> = {
  METHOD_NOT_ALLOWED: 405,
  UNSUPPORTED_MEDIA_TYPE: 415,
  PAYLOAD_TOO_LARGE: 413,
  INVALID_REQUEST: 400,
  AUTH_REQUIRED: 401,
  AUTH_INVALID: 401,
  PATIENT_REQUIRED: 403,
  STAFF_REQUIRED: 403,
  ASSESSMENT_NOT_FOUND: 404,
  HANDOFF_NOT_FOUND: 404,
  UNSUPPORTED_DEPLOYMENT: 403,
  VERSION_MISMATCH: 409,
  COMPLAINT_NOT_SUPPORTED: 422,
  INVALID_STATE: 409,
  INVALID_EVIDENCE: 422,
  STALE_EVIDENCE: 409,
  ROUTING_NOT_FINAL: 409,
  IDEMPOTENCY_CONFLICT: 409,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export class TrustedError extends Error {
  readonly code: TrustedErrorCode;
  constructor(code: TrustedErrorCode) {
    super(code);
    this.name = 'TrustedError';
    this.code = code;
  }
}

export const TRUSTED_ERROR_CODES = Object.keys(ERROR_STATUS) as readonly TrustedErrorCode[];

export function isTrustedErrorCode(value: unknown): value is TrustedErrorCode {
  return typeof value === 'string' && (TRUSTED_ERROR_CODES as readonly string[]).includes(value);
}

/* --- Lifecycle ---------------------------------------------------------------
   The R9A status vocabulary, unchanged. Only the transitions these trusted
   operations perform are listed; everything else is refused here.
   -------------------------------------------------------------------------- */

export const ASSESSMENT_STATUSES = [
  'created',
  'in_progress',
  'priority_escalated',
  'routing_complete',
  'handoff_prepared',
  'closed',
  'expired',
  'cancelled',
] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export type TrustedTransition =
  | { operation: 'assessment-start'; from: 'created'; to: 'in_progress'; reasonCode: 'patient_confirmed_complaint' }
  | { operation: 'safety-evaluate'; from: 'in_progress'; to: 'priority_escalated'; reasonCode: 'r3_rule_fired' }
  | { operation: 'routing-finalize'; from: 'in_progress'; to: 'routing_complete'; reasonCode: 'routing_finalized' };

export const TRUSTED_TRANSITIONS: readonly TrustedTransition[] = [
  { operation: 'assessment-start', from: 'created', to: 'in_progress', reasonCode: 'patient_confirmed_complaint' },
  { operation: 'safety-evaluate', from: 'in_progress', to: 'priority_escalated', reasonCode: 'r3_rule_fired' },
  { operation: 'routing-finalize', from: 'in_progress', to: 'routing_complete', reasonCode: 'routing_finalized' },
];

export function transitionFor(operation: TrustedTransition['operation']): TrustedTransition {
  const transition = TRUSTED_TRANSITIONS.find((candidate) => candidate.operation === operation);
  if (!transition) throw new TrustedError('INTERNAL');
  return transition;
}

/** Whether a status change is one these operations may make. */
export function isTrustedTransition(from: string, to: string): boolean {
  return TRUSTED_TRANSITIONS.some((transition) => transition.from === from && transition.to === to);
}

export const COMPLAINT_SOURCES = ['bridge-resolved', 'patient-stated'] as const;
export type TrustedComplaintSource = (typeof COMPLAINT_SOURCES)[number];
