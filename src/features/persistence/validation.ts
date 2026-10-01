/**
 * R9D boundary validation.
 *
 * Runs before any database write. The database constraints and RLS remain the
 * final integrity boundary; this layer rejects what the database cannot know
 * is wrong: a question that does not belong to the assessment's complaint, an
 * option that does not belong to its question, a body region the frozen domain
 * does not define, or a malformed event identity.
 *
 * Membership is checked against the SAME frozen catalogs the engines use, so
 * validation cannot drift from clinical behaviour. Nothing here changes it.
 */
import {
  BODY_DOMAIN,
  BODY_VIEW_IDS,
  bodyRegionById,
  regionAvailableInView,
  type BodyRegionId,
} from '../../body/index.ts';
import { R2B_DEMONSTRATION_COMPLAINTS, R2B_DEMONSTRATION_QUESTIONS } from '../../engine/data/index.ts';
import { R3_SAFETY_KNOWLEDGE } from '../../engine/safety/index.ts';
import { intakeQuestionById, type IntakeCategory } from '../routing-flow/intake-questions.ts';
import { trustedClinicalContext, type ClinicalContextInput } from '../routing-flow/clinical-replay.ts';
import type { RegionAssessmentContext } from '../body-explorer/clinical-coverage.ts';
import type { AnswerEvent, AssessmentStart, BodyLocation, BodySelectionEvent } from './events.ts';

export type Validation<T> = { ok: true; value: T } | { ok: false; issues: readonly string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

export function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

function isUnitInterval(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function result<T>(issues: string[], value: T): Validation<T> {
  return issues.length === 0 ? { ok: true, value } : { ok: false, issues };
}

export function isKnownComplaint(complaintId: unknown): complaintId is string {
  return typeof complaintId === 'string' && R2B_DEMONSTRATION_COMPLAINTS.some((complaint) => complaint.id === complaintId);
}

export function validateAssessmentStart(start: AssessmentStart): Validation<AssessmentStart> {
  const issues: string[] = [];
  if (!isKnownComplaint(start.complaintId)) issues.push('complaintId is not an approved R2 complaint');
  if (start.complaintSource !== 'bridge-resolved' && start.complaintSource !== 'patient-stated') {
    issues.push('complaintSource is not recognised');
  }
  if (start.location !== null) issues.push(...bodyFieldIssues(start.location));
  if (start.clinicalContext) {
    try {
      const context = trustedClinicalContext(start.clinicalContext);
      if (context.complaintId !== start.complaintId) issues.push('clinicalContext does not resolve to complaintId');
      if (start.location && context.bodyRegionId !== start.location.regionId) issues.push('clinicalContext does not match body location');
    } catch {
      issues.push('clinicalContext is not an approved clinical context');
    }
  }
  return result(issues, start);
}

/** Body Explorer output keeps its exact semantics; no anatomy inference is added. */
export function validateBodySelection(event: BodySelectionEvent): Validation<BodySelectionEvent> {
  const issues: string[] = [];
  if (!isUuid(event.clientEventId)) issues.push('clientEventId must be a UUID');
  issues.push(...bodyFieldIssues(event));
  return result(issues, event);
}

function bodyFieldIssues(event: BodyLocation): string[] {
  const issues: string[] = [];
  const region = typeof event.regionId === 'string' ? bodyRegionById(event.regionId) : undefined;
  if (!region || !BODY_DOMAIN.regions.some((candidate) => candidate.id === event.regionId)) {
    issues.push('regionId is not a body-domain region');
  }
  if (!BODY_VIEW_IDS.includes(event.view)) issues.push('view must be front or back');
  else if (region && !regionAvailableInView(region, event.view)) issues.push('region is not available in this view');
  if (event.precision === 'general-area') {
    if (event.point !== null) issues.push('general-area selection must not carry a point');
  } else if (event.precision === 'exact-point') {
    if (!event.point || !isUnitInterval(event.point.x) || !isUnitInterval(event.point.y)) {
      issues.push('exact-point selection needs x and y in [0, 1]');
    }
  } else {
    issues.push('precision must be general-area or exact-point');
  }
  if (!isIsoTimestamp(event.capturedAt)) issues.push('capturedAt must be an ISO timestamp');
  return issues;
}

export type ResolvedAnswerEvent = AnswerEvent & { intakeCategory: IntakeCategory | null };

function optionsFor(event: AnswerEvent, complaintId: string, clinicalContext: RegionAssessmentContext | null): readonly string[] | null {
  if (event.stream === 'intake') {
    const question = intakeQuestionById(complaintId, event.questionId, clinicalContext);
    return question ? question.options.map((option) => option.id) : null;
  }
  if (event.stream === 'routing') {
    const complaint = R2B_DEMONSTRATION_COMPLAINTS.find((candidate) => candidate.id === complaintId);
    if (!complaint || !complaint.questionIds.includes(event.questionId)) return null;
    const question = R2B_DEMONSTRATION_QUESTIONS.find((candidate) => candidate.id === event.questionId);
    return question ? question.options.map((option) => option.id) : null;
  }
  const question = R3_SAFETY_KNOWLEDGE.questions.find(
    (candidate) =>
      candidate.kind === 'safety_owned' &&
      candidate.id === event.questionId &&
      candidate.applicableComplaintIds.includes(complaintId),
  );
  return question && question.kind === 'safety_owned' ? question.options.map((option) => option.id) : null;
}

/**
 * Stable IDs only: the question must belong to this complaint in this stream,
 * and the option to that question. Visible text is never accepted.
 */
export function validateAnswerEvent(event: AnswerEvent, complaintId: string, clinicalContext?: ClinicalContextInput): Validation<ResolvedAnswerEvent> {
  const issues: string[] = [];
  if (!isUuid(event.clientEventId)) issues.push('clientEventId must be a UUID');
  if (event.stream !== 'intake' && event.stream !== 'routing' && event.stream !== 'safety') {
    issues.push('stream is not recognised');
    return result(issues, { ...event, intakeCategory: null });
  }
  if (!isKnownComplaint(complaintId)) issues.push('complaintId is not an approved R2 complaint');
  let resolvedContext: RegionAssessmentContext | null = null;
  try {
    if (clinicalContext) resolvedContext = trustedClinicalContext(clinicalContext);
  } catch {
    issues.push('clinicalContext is not an approved clinical context');
  }
  if (resolvedContext && resolvedContext.complaintId !== complaintId) issues.push('clinicalContext does not resolve to complaintId');
  const options = optionsFor(event, complaintId, resolvedContext);
  if (!options) issues.push(`question ${event.questionId} does not belong to the ${event.stream} stream for this complaint`);
  if (event.operation === 'selected') {
    if (typeof event.optionId !== 'string' || !options?.includes(event.optionId)) {
      issues.push('optionId is not an option of this question');
    }
  } else if (event.operation === 'cleared') {
    if (event.optionId !== null) issues.push('a cleared event carries no optionId');
    if (!isUuid(event.supersedesClientEventId)) issues.push('a cleared event must supersede an earlier event');
  } else {
    issues.push('operation must be selected or cleared');
  }
  if (event.supersedesClientEventId !== null && !isUuid(event.supersedesClientEventId)) {
    issues.push('supersedesClientEventId must be a UUID or null');
  }
  if (!Number.isInteger(event.sequence) || event.sequence < 1) issues.push('sequence must be a positive integer');
  if (!isIsoTimestamp(event.answeredAt)) issues.push('answeredAt must be an ISO timestamp');
  const intakeCategory =
    event.stream === 'intake' ? intakeQuestionById(complaintId, event.questionId, resolvedContext)?.category ?? null : null;
  return result(issues, { ...event, intakeCategory });
}

export function isBodyRegionId(value: unknown): value is BodyRegionId {
  return typeof value === 'string' && BODY_DOMAIN.regions.some((region) => region.id === value);
}
