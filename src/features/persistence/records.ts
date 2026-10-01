/**
 * Domain event -> database row.
 *
 * `backend-contract.ts` carries application meaning; `database.types.ts`
 * carries the generated row shapes. These functions are the only place the two
 * meet, and they emit ONLY the columns R9C grants an anonymous patient.
 * Server-owned columns (id, status, recorded_at, facility, device, staff,
 * complaint) are never set by the browser.
 */
import { BODY_DOMAIN_VERSION } from '../../body/index.ts';
import { ENGINE_VERSION } from '../../engine/index.ts';
import { KNOWLEDGE_VERSION } from '../../engine/data/version.ts';
import { SAFETY_VERSION } from '../../engine/safety/index.ts';
import type { Database } from '../../types/database.types.ts';
import type { BodySelectionEvent } from './events.ts';
import type { ResolvedAnswerEvent } from './validation.ts';
import type { ClinicalContextInput } from '../routing-flow/clinical-replay.ts';

type Tables = Database['public']['Tables'];

/** Shape of the assessment payload R9D writes. */
export const ASSESSMENT_CONTRACT_VERSION = '1.0.0-r9d-assessment';

/** The exact column set each patient insert may carry under R9C. */
export type AssessmentInsert = Required<
  Pick<
    Tables['assessment_sessions']['Insert'],
    'contract_version' | 'owner_auth_user_id' | 'deployment_mode' | 'engine_version' | 'knowledge_version' | 'safety_version'
  >
>;

export type BodySelectionInsert = Required<
  Pick<
    Tables['body_selections']['Insert'],
    | 'assessment_id'
    | 'region_id'
    | 'view'
    | 'precision'
    | 'point_x'
    | 'point_y'
    | 'body_domain_version'
    | 'captured_at'
    | 'client_event_id'
    | 'supersedes_record_id'
  >
>;

export type ClinicalContextInsert = Required<Pick<Tables['assessment_clinical_context']['Insert'],
  'assessment_id' | 'body_region_id' | 'face_subregion_id' | 'concern_id' |
  'age_years' | 'sex_for_assessment' | 'reporter' | 'client_event_id'>>;

export function toClinicalContextInsert(assessmentId: string, clientEventId: string,
  context: ClinicalContextInput): ClinicalContextInsert {
  return {
    assessment_id: assessmentId,
    body_region_id: context.bodyRegionId,
    face_subregion_id: context.faceSubregionId,
    concern_id: context.concernId,
    age_years: context.age,
    sex_for_assessment: context.sexForAssessment,
    reporter: context.reporter,
    client_event_id: clientEventId,
  };
}

type AnswerColumns =
  | 'assessment_id'
  | 'question_id'
  | 'option_id'
  | 'operation'
  | 'sequence'
  | 'answered_at'
  | 'client_event_id'
  | 'supersedes_record_id';

export type IntakeAnswerInsert = Required<Pick<Tables['intake_answers']['Insert'], AnswerColumns | 'category'>>;
export type RoutingAnswerInsert = Required<Pick<Tables['routing_answers']['Insert'], AnswerColumns | 'knowledge_version'>>;
export type SafetyAnswerInsert = Required<Pick<Tables['safety_answers']['Insert'], AnswerColumns | 'safety_version'>>;

export type AnswerTable = 'intake_answers' | 'routing_answers' | 'safety_answers';
export type EvidenceTable = AnswerTable | 'body_selections';

export type AnswerInsert =
  | { table: 'intake_answers'; row: IntakeAnswerInsert }
  | { table: 'routing_answers'; row: RoutingAnswerInsert }
  | { table: 'safety_answers'; row: SafetyAnswerInsert };

export type BodyEvidenceInsert = { table: 'body_selections'; row: BodySelectionInsert };
export type EvidenceInsert = AnswerInsert | BodyEvidenceInsert;

export function toAssessmentInsert(ownerAuthUserId: string, contractVersion = ASSESSMENT_CONTRACT_VERSION): AssessmentInsert {
  return {
    contract_version: contractVersion,
    owner_auth_user_id: ownerAuthUserId,
    // Only web/self-service is admitted for anonymous patients under R9C; the
    // config gate guarantees persistence never runs in any other mode.
    deployment_mode: 'web/self-service',
    engine_version: ENGINE_VERSION,
    knowledge_version: KNOWLEDGE_VERSION,
    safety_version: SAFETY_VERSION,
  };
}

export function toBodySelectionInsert(
  assessmentId: string,
  event: BodySelectionEvent,
  supersedesRecordId: string | null,
): BodyEvidenceInsert {
  return {
    table: 'body_selections',
    row: {
      assessment_id: assessmentId,
      region_id: event.regionId,
      view: event.view,
      precision: event.precision,
      point_x: event.precision === 'exact-point' && event.point ? event.point.x : null,
      point_y: event.precision === 'exact-point' && event.point ? event.point.y : null,
      body_domain_version: BODY_DOMAIN_VERSION,
      captured_at: event.capturedAt,
      client_event_id: event.clientEventId,
      supersedes_record_id: supersedesRecordId,
    },
  };
}

export function toAnswerInsert(
  assessmentId: string,
  event: ResolvedAnswerEvent,
  supersedesRecordId: string | null,
): AnswerInsert {
  const base = {
    assessment_id: assessmentId,
    question_id: event.questionId,
    option_id: event.operation === 'selected' ? event.optionId : null,
    operation: event.operation,
    sequence: event.sequence,
    answered_at: event.answeredAt,
    client_event_id: event.clientEventId,
    supersedes_record_id: supersedesRecordId,
  };
  if (event.stream === 'intake') {
    if (!event.intakeCategory) throw new TypeError(`Intake question ${event.questionId} has no approved category.`);
    return { table: 'intake_answers', row: { ...base, category: event.intakeCategory } };
  }
  if (event.stream === 'routing') {
    return { table: 'routing_answers', row: { ...base, knowledge_version: KNOWLEDGE_VERSION } };
  }
  return { table: 'safety_answers', row: { ...base, safety_version: SAFETY_VERSION } };
}

/** Columns compared when an idempotency key already exists. */
export function comparableColumns(insert: EvidenceInsert): Readonly<Record<string, string | number | null>> {
  return insert.row;
}

function sameValue(stored: unknown, sent: string | number | null, column: string): boolean {
  if (sent === null) return stored === null;
  if (column.endsWith('_at')) {
    return typeof stored === 'string' && Date.parse(stored) === Date.parse(String(sent));
  }
  if (typeof sent === 'number') return typeof stored === 'number' && Math.abs(stored - sent) < 1e-12;
  return stored === sent;
}

/**
 * True only when an already-stored row represents the same logical payload as
 * the one being retried. A different payload under the same key is a conflict.
 */
export function storedRowMatches(stored: Readonly<Record<string, unknown>>, insert: EvidenceInsert): boolean {
  return Object.entries(comparableColumns(insert)).every(([column, value]) => sameValue(stored[column], value, column));
}
