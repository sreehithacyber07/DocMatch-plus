/**
 * Trusted clinical finalization: the server side of frontend parity.
 *
 * ONE RESOLVER
 *
 * `deriveTrustedClinicalOutcome` is the only place the server decides a
 * clinical outcome. It does not re-implement a rule: it replays the persisted,
 * validated evidence through `replayClinicalEvidence`, which is the same
 * interview loop and the same `resolveRouteOutcome` the patient's screen runs
 * (src/features/routing-flow/clinical-replay.ts). The weighted R1 path, the
 * source-backed gates, the guarded General Medicine and Paediatrics fallbacks,
 * urgency, hard stops, exclusions and the calibration limitation all come from
 * that one call.
 *
 * WHAT THE CLIENT CAN AND CANNOT DO
 *
 * A patient can write their own answer rows (R9C RLS), so the evidence is the
 * attack surface, and it is validated rather than trusted: unknown questions,
 * unknown options, conflicting duplicates, answers to questions the interview
 * never asks in this context (a male pregnancy answer, a child's reproductive
 * answer), and answers filed in the wrong stream are refused. Nothing the
 * browser concluded (a specialty, a route type, an urgency flag, a hard stop, a
 * gate) is ever read: the operations take only ids, and the outcome is derived.
 *
 * Pure: no Deno, no Node, no network. Imported by Edge Functions and by the
 * Node test suite alike.
 */
import {
  canonicalOutcomeOf,
  ClinicalReplayError,
  replayClinicalEvidence,
  trustedClinicalContext,
  type CanonicalClinicalOutcome,
  type ClinicalContextInput,
  type EvidenceAnswer,
  type ReplayResult,
} from '../../../../src/features/routing-flow/clinical-replay.ts';
import { INTAKE_QUESTION_IDS, intakeQuestionsFor } from '../../../../src/features/routing-flow/intake-questions.ts';
import { buildSoapHandoff, type SoapSection } from '../../../../src/features/routing-flow/soap-handoff.ts';
import { SPECIALTY_REGISTRY } from '../../../../src/features/routing-flow/specialty-registry.ts';
import { R2B_DEMONSTRATION_KNOWLEDGE } from '../../../../src/engine/data/index.ts';
import { R3_SAFETY_KNOWLEDGE } from '../../../../src/engine/safety/index.ts';
import type { TimelineEntry } from '../../../../src/features/routing-flow/timeline-types.ts';
import type { PainLocation, BodyRegionId } from '../../../../src/body/index.ts';
import { SERVER_VERSIONS, TrustedError, isTrustedErrorCode } from './contract.ts';
import { activeBodySelection, type BodySelectionRow } from './soap-boundary.ts';
import {
  activeProjection,
  orderedSteps,
  type ActiveAnswer,
  type IntakeAnswerRow,
  type RoutingAnswerRow,
  type SafetyAnswerRow,
} from './evidence.ts';
import {
  checkAdmission,
  ownedAssessment,
  requirePatient,
  type StoreOutcome,
  type TrustedStore,
  type VerifiedCaller,
} from './operations.ts';
import type { AssessmentOperationRequest } from './request.ts';

/* --- Evidence ------------------------------------------------------------- */

/** One stream per question family. An answer filed in another family's stream is refused. */
export interface TrustedClinicalEvidence {
  context: ClinicalContextInput;
  intake: readonly EvidenceAnswer[];
  safety: readonly EvidenceAnswer[];
  routing: readonly EvidenceAnswer[];
}

const SAFETY_QUESTION_IDS = new Set(R3_SAFETY_KNOWLEDGE.questions.filter((question) => question.kind === 'safety_owned').map((question) => question.id));
const ROUTING_QUESTION_IDS = new Set(R2B_DEMONSTRATION_KNOWLEDGE.questions.map((question) => question.id));

function streamCheck(evidence: TrustedClinicalEvidence): void {
  // Malformed evidence is refused as evidence, never allowed to surface as a runtime fault.
  if (typeof evidence !== 'object' || evidence === null || typeof evidence.context !== 'object' || evidence.context === null) {
    throw new TrustedError('INVALID_EVIDENCE');
  }
  for (const stream of [evidence.intake, evidence.safety, evidence.routing]) {
    if (!Array.isArray(stream)) throw new TrustedError('INVALID_EVIDENCE');
  }
  for (const answer of evidence.safety) if (!SAFETY_QUESTION_IDS.has(answer.questionId)) throw new TrustedError('INVALID_EVIDENCE');
  for (const answer of evidence.routing) if (!ROUTING_QUESTION_IDS.has(answer.questionId)) throw new TrustedError('INVALID_EVIDENCE');
  for (const answer of evidence.intake) {
    if (SAFETY_QUESTION_IDS.has(answer.questionId) || ROUTING_QUESTION_IDS.has(answer.questionId)) throw new TrustedError('INVALID_EVIDENCE');
  }
}

export interface TrustedClinicalResult {
  outcome: CanonicalClinicalOutcome;
  replay: ReplayResult;
}

/**
 * THE trusted clinical outcome. Every trusted output (the persisted route, the
 * safety event, the SOAP direction, the clinical handoff) is taken from this
 * result and from nothing else.
 */
export function deriveTrustedClinicalOutcome(evidence: TrustedClinicalEvidence): TrustedClinicalResult {
  streamCheck(evidence);
  try {
    const replay = replayClinicalEvidence(evidence.context, [...evidence.intake, ...evidence.safety, ...evidence.routing]);
    return { outcome: replay.outcome, replay };
  } catch (error) {
    if (error instanceof ClinicalReplayError) {
      throw new TrustedError(error.code === 'INCOMPLETE' ? 'ROUTING_NOT_FINAL' : 'INVALID_EVIDENCE');
    }
    if (error instanceof TrustedError) throw error;
    throw new TrustedError('INVALID_EVIDENCE');
  }
}

/* --- From persisted rows ---------------------------------------------------- */

/**
 * The trusted clinical context a finalization needs, as it would be persisted
 * at admission or start. Age in whole years only: never a date of birth, a
 * name or a contact. See the report's migration note: the current schema does
 * not yet hold this.
 */
export interface ClinicalContextRow {
  body_region_id: string;
  face_subregion_id: string | null;
  concern_id: string;
  age_years: number;
  sex_for_assessment: string;
  reporter: string | null;
}

export interface ClinicalEvidenceRows {
  context: ClinicalContextRow;
  routing: readonly RoutingAnswerRow[];
  safety: readonly SafetyAnswerRow[];
  intake: readonly IntakeAnswerRow[];
}

export interface TrustedEvidenceWithRecords {
  evidence: TrustedClinicalEvidence;
  /** The accepted record behind each active answer, for audit references. */
  recordByQuestion: ReadonlyMap<string, { table: 'intake_answers' | 'safety_answers' | 'routing_answers'; recordId: string }>;
}

function answersOf(active: readonly ActiveAnswer[]): EvidenceAnswer[] {
  return active.map((answer) => ({ questionId: answer.questionId, optionId: answer.optionId }));
}

/** Checks each event chain (evidence.ts) and projects the active answers the browser held. */
export function trustedEvidenceFromRows(rows: ClinicalEvidenceRows): TrustedEvidenceWithRecords {
  if (rows.routing.some((row) => row.knowledge_version !== SERVER_VERSIONS.knowledgeVersion)) throw new TrustedError('VERSION_MISMATCH');
  if (rows.safety.some((row) => row.safety_version !== SERVER_VERSIONS.safetyVersion)) throw new TrustedError('VERSION_MISMATCH');
  const intake = activeProjection(orderedSteps(rows.intake));
  const safety = activeProjection(orderedSteps(rows.safety));
  const routing = activeProjection(orderedSteps(rows.routing));
  const recordByQuestion = new Map<string, { table: 'intake_answers' | 'safety_answers' | 'routing_answers'; recordId: string }>();
  for (const answer of intake) recordByQuestion.set(answer.questionId, { table: 'intake_answers', recordId: answer.recordId });
  for (const answer of safety) recordByQuestion.set(answer.questionId, { table: 'safety_answers', recordId: answer.recordId });
  for (const answer of routing) recordByQuestion.set(answer.questionId, { table: 'routing_answers', recordId: answer.recordId });
  const context = rows.context;
  if (typeof context.age_years !== 'number') throw new TrustedError('INVALID_EVIDENCE');
  let resolvedContext;
  try {
    resolvedContext = trustedClinicalContext({
      bodyRegionId: context.body_region_id,
      faceSubregionId: context.face_subregion_id,
      concernId: context.concern_id,
      age: context.age_years,
      sexForAssessment: context.sex_for_assessment,
      reporter: context.reporter,
    });
  } catch {
    throw new TrustedError('INVALID_EVIDENCE');
  }
  for (const row of rows.intake) {
    const question = intakeQuestionsFor(resolvedContext.complaintId, resolvedContext)
      .find((candidate) => candidate.id === row.question_id);
    if (!question || question.category !== row.category) throw new TrustedError('INVALID_EVIDENCE');
  }
  return {
    evidence: {
      context: {
        bodyRegionId: context.body_region_id,
        faceSubregionId: context.face_subregion_id,
        concernId: context.concern_id,
        age: context.age_years,
        sexForAssessment: context.sex_for_assessment,
        reporter: context.reporter,
      },
      intake: answersOf(intake),
      safety: answersOf(safety),
      routing: answersOf(routing),
    },
    recordByQuestion,
  };
}

/* --- Handoff -------------------------------------------------------------- */

export interface TrustedHandoff {
  /** The registry id the patient is shown, the SOAP names and the handoff carries. */
  specialtyId: string;
  specialtyLabel: string;
  urgency: 'none' | 'urgent';
  sections: readonly SoapSection[];
}

/**
 * The prepared handoff, from the trusted outcome only. A hard stop never
 * becomes an ordinary handoff: routing is paused, so there is no specialty to
 * hand off to.
 */
export function trustedHandoff(result: TrustedClinicalResult, body: { regionId: BodyRegionId; view: 'front' | 'back'; precision?: 'exact-point' | 'general-area'; point?: { x: number; y: number } | null } | null, complaintSource: 'bridge-resolved' | 'patient-stated' = 'bridge-resolved'): TrustedHandoff {
  const { outcome, replay } = result;
  if (outcome.status !== 'route' || !outcome.specialtyId) throw new TrustedError('INVALID_STATE');
  const record = SPECIALTY_REGISTRY.find((candidate) => candidate.id === outcome.specialtyId);
  if (!record || !record.routingEnabled) throw new TrustedError('INVALID_EVIDENCE');
  const context = replay.run.context;
  const plan = intakeQuestionsFor(context.complaintId, context);
  const timeline: TimelineEntry[] = [];
  for (const entry of replay.run.records) {
    if (entry.owner === 'intake' || entry.step.kind !== 'engine') continue;
    const option = entry.step.question.options.find((candidate) => candidate.id === entry.optionId);
    timeline.push({
      kind: entry.owner === 'safety' ? 'safety' : 'routing',
      questionId: entry.questionId,
      // The clinician-facing handoff uses the neutral patient wording.
      text: entry.step.question.text,
      label: option?.label ?? entry.optionId,
      answeredAt: '',
      changeable: false,
    });
  }
  const location: PainLocation | null = body ? body.precision === 'exact-point' && body.point
    ? { regionId: body.regionId, precision: 'exact-point', point: body.point }
    : { regionId: body.regionId, precision: 'general-area' } : null;
  const sections = buildSoapHandoff({
    complaintLabel: context.complaintLabel,
    complaintSource,
    capture: { painLocation: location, view: body?.view ?? null },
    intakePlan: plan,
    intakeAnswers: replay.run.intakeAnswers.filter((answer) => answer.questionId !== INTAKE_QUESTION_IDS.complaintEntry),
    timeline,
    converged: outcome.routeType !== 'parent-fallback',
    directionLabel: record.patientFacingName,
    urgentReview: outcome.urgency === 'urgent',
  });
  return { specialtyId: record.id, specialtyLabel: record.patientFacingName, urgency: outcome.urgency, sections };
}

/* --- Finalization ------------------------------------------------------------ */

/** The canonical record a clinical finalization persists. Identifiers only. */
export interface ClinicalRouteRecordArgs {
  assessmentId: string;
  ownerAuthUserId: string;
  clientEventId: string;
  specialtyId: string;
  routeType: NonNullable<CanonicalClinicalOutcome['routeType']>;
  fallbackReason: string | null;
  urgentRuleIds: readonly string[];
  gateDirectionId: string | null;
  gateCriterionIds: readonly string[];
  sourceIds: readonly string[];
  calibration: CanonicalClinicalOutcome['calibration'];
  evidenceBasis: CanonicalClinicalOutcome['evidenceBasis'];
  supportingRecords: readonly { table: string; recordId: string }[];
  canonical: CanonicalClinicalOutcome;
  sections: Readonly<Record<'S' | 'O' | 'A' | 'P', readonly { label: string; value: string }[]>>;
  highWater: { routing: number; safety: number; intake: number };
  bodyRecordId: string | null;
}

export interface ClinicalHardStopArgs {
  assessmentId: string;
  ownerAuthUserId: string;
  clientEventId: string;
  selectedRuleId: string;
  firedRuleIds: readonly string[];
  evidence: readonly { table: string; recordId: string }[];
  canonical: CanonicalClinicalOutcome;
  highWater: { routing: number; safety: number; intake: number };
}

/**
 * The storage a clinical finalization needs, beyond the R9 store. These
 * methods have no database counterpart yet: they are the minimal migration the
 * report documents, and this handler is not wired to an Edge Function until
 * that migration is approved and applied.
 */
export interface ClinicalStore extends Pick<TrustedStore, 'loadOwnedAssessment' | 'loadEvidence'> {
  loadClinicalContext(assessmentId: string): Promise<ClinicalContextRow | null>;
  loadBodySelections?(assessmentId: string): Promise<BodySelectionRow[]>;
  loadCanonicalOutcome?(assessmentId: string): Promise<{ id: string; clientEventId: string; trusted: CanonicalClinicalOutcome } | null>;
  finalizeClinicalRoute(args: ClinicalRouteRecordArgs): Promise<StoreOutcome>;
  recordClinicalHardStop(args: ClinicalHardStopArgs): Promise<StoreOutcome>;
}

export type ClinicalFinalizeResult =
  | { outcome: 'route'; persistenceOutcome: 'applied' | 'replayed' | 'existing'; trusted: CanonicalClinicalOutcome; routingResultId: string; soapHandoffId: string; status: string }
  | { outcome: 'hard-stop'; persistenceOutcome: 'applied' | 'replayed' | 'existing'; trusted: CanonicalClinicalOutcome; safetyEventId: string; status: string };

function unwrap(result: StoreOutcome): Extract<StoreOutcome, { ok: true }> {
  if ('code' in result) throw new TrustedError(isTrustedErrorCode(result.code) ? result.code : 'INTERNAL');
  if (!result.recordId) throw new TrustedError('INTERNAL');
  return result;
}

/**
 * Derives the trusted outcome from persisted evidence and persists exactly
 * that: a hard stop as a safety event and never as a route; a route with its
 * urgency, fallback reason, gate criteria, sources and calibration state.
 */
export async function handleClinicalFinalize(
  store: ClinicalStore,
  caller: VerifiedCaller,
  request: AssessmentOperationRequest,
  expectedStatus?: 'route' | 'hard-stop',
): Promise<ClinicalFinalizeResult> {
  requirePatient(caller);
  const assessment = await ownedAssessment(store, caller, request.assessmentId);
  checkAdmission(assessment);
  const existing = await store.loadCanonicalOutcome?.(assessment.id);
  if (existing) {
    if (expectedStatus && existing.trusted.status !== expectedStatus) throw new TrustedError('INVALID_STATE');
    const persistenceOutcome = existing.clientEventId === request.clientEventId ? 'replayed' : 'existing';
    if (existing.trusted.status === 'hard-stop') return {
      outcome: 'hard-stop', persistenceOutcome, trusted: existing.trusted,
      safetyEventId: existing.id, status: assessment.status,
    };
    return { outcome: 'route', persistenceOutcome, trusted: existing.trusted,
      routingResultId: existing.id, soapHandoffId: existing.id, status: assessment.status };
  }
  if (assessment.status !== 'in_progress') throw new TrustedError('INVALID_STATE');
  const context = await store.loadClinicalContext(assessment.id);
  if (!context) throw new TrustedError('INVALID_STATE');
  try {
    const resolved = trustedClinicalContext({
      bodyRegionId: context.body_region_id,
      faceSubregionId: context.face_subregion_id,
      concernId: context.concern_id,
      age: context.age_years,
      sexForAssessment: context.sex_for_assessment,
      reporter: context.reporter,
    });
    if (resolved.complaintId !== assessment.complaint_id) throw new TrustedError('INVALID_EVIDENCE');
  } catch {
    throw new TrustedError('INVALID_EVIDENCE');
  }
  const rows = await store.loadEvidence(assessment.id);
  const { evidence, recordByQuestion } = trustedEvidenceFromRows({ context, ...rows });
  const result = deriveTrustedClinicalOutcome(evidence);
  const trusted = result.outcome;
  if (expectedStatus && trusted.status !== expectedStatus) throw new TrustedError('INVALID_STATE');
  const referenceFor = (questionId: string) => recordByQuestion.get(questionId);
  const highWater = {
    routing: Math.max(0, ...rows.routing.map((row) => row.sequence)),
    safety: Math.max(0, ...rows.safety.map((row) => row.sequence)),
    intake: Math.max(0, ...rows.intake.map((row) => row.sequence)),
  };

  if (trusted.status === 'hard-stop') {
    const rule = R3_SAFETY_KNOWLEDGE.rules.find((candidate) => candidate.id === trusted.hardStopRuleId);
    if (!rule) throw new TrustedError('INTERNAL');
    const evidenceRefs = rule.requiredQuestionIds
      .map(referenceFor)
      .filter((reference): reference is NonNullable<typeof reference> => Boolean(reference));
    if (evidenceRefs.length === 0) throw new TrustedError('INVALID_EVIDENCE');
    const stored = unwrap(await store.recordClinicalHardStop({
      assessmentId: assessment.id,
      ownerAuthUserId: caller.userId,
      clientEventId: request.clientEventId,
      selectedRuleId: trusted.hardStopRuleId!,
      firedRuleIds: trusted.firedRuleIds,
      evidence: evidenceRefs,
      canonical: trusted,
      highWater,
    }));
    return { outcome: 'hard-stop', persistenceOutcome: stored.outcome, trusted,
      safetyEventId: stored.recordId!, status: stored.status };
  }

  const supportingRecords = trusted.supportingEvidenceQuestionIds
    .map(referenceFor)
    .filter((reference): reference is NonNullable<typeof reference> => Boolean(reference));
  if (supportingRecords.length !== trusted.supportingEvidenceQuestionIds.length) throw new TrustedError('INVALID_EVIDENCE');
  const bodyRows = await store.loadBodySelections?.(assessment.id) ?? [];
  const body = activeBodySelection(bodyRows);
  if (body && body.region_id !== context.body_region_id) throw new TrustedError('INVALID_EVIDENCE');
  const complaintSource = assessment.complaint_source;
  if (complaintSource !== 'bridge-resolved' && complaintSource !== 'patient-stated') throw new TrustedError('INVALID_EVIDENCE');
  const handoff = trustedHandoff(result, body ? {
    regionId: body.region_id as BodyRegionId,
    view: body.view as 'front' | 'back',
    precision: body.precision as 'exact-point' | 'general-area',
    point: body.point_x !== null && body.point_y !== null ? { x: body.point_x, y: body.point_y } : null,
  } : null, complaintSource);
  const sections = Object.fromEntries(handoff.sections.map((section) => [section.key, section.lines])) as ClinicalRouteRecordArgs['sections'];
  const urgentRefs = trusted.urgentRuleIds.flatMap((ruleId) =>
    R3_SAFETY_KNOWLEDGE.rules.find((rule) => rule.id === ruleId)?.requiredQuestionIds ?? [])
    .map(referenceFor).filter((reference): reference is NonNullable<typeof reference> => Boolean(reference));
  const evidenceRefs = [...new Map([...supportingRecords, ...urgentRefs]
    .map((reference) => [`${reference.table}:${reference.recordId}`, reference])).values()];
  const stored = unwrap(await store.finalizeClinicalRoute({
    assessmentId: assessment.id,
    ownerAuthUserId: caller.userId,
    clientEventId: request.clientEventId,
    specialtyId: trusted.specialtyId!,
    routeType: trusted.routeType!,
    fallbackReason: trusted.fallbackReason,
    urgentRuleIds: trusted.urgentRuleIds,
    gateDirectionId: trusted.gate?.directionId ?? null,
    gateCriterionIds: trusted.gate?.criterionIds ?? [],
    sourceIds: trusted.gate?.sourceIds ?? [],
    calibration: trusted.calibration,
    evidenceBasis: trusted.evidenceBasis,
    supportingRecords: evidenceRefs,
    canonical: trusted,
    sections,
    highWater,
    bodyRecordId: body?.id ?? null,
  }));
  return { outcome: 'route', persistenceOutcome: stored.outcome, trusted,
    routingResultId: stored.recordId!, soapHandoffId: stored.recordId!, status: stored.status };
}

/** Re-exported so callers compare outcomes through one definition. */
export { canonicalOutcomeOf };
export type { CanonicalClinicalOutcome, ClinicalContextInput, EvidenceAnswer };
