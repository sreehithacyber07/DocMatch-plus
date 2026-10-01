/**
 * The one clinical interview loop, and the canonical outcome it produces.
 *
 * WHY THIS EXISTS
 *
 * The browser runs the interview one answer at a time. The trusted server must
 * reach the same clinical outcome from the persisted evidence without trusting
 * anything the browser concluded. If each side had its own loop, "parity"
 * would only mean two implementations happening to agree. Instead there is one
 * loop, here, built from the same modules RoutingFlow calls (the contextual
 * safety scope, the R3 controller, the interview plan and the single route
 * resolver), and two ways to feed it:
 *
 *   runInterview            an answer provider decides each answer as the
 *                           question comes up (the test harness and audits,
 *                           mirroring the live screen);
 *   replayClinicalEvidence  an UNORDERED, validated evidence set supplies the
 *                           answers (the trusted server).
 *
 * Replay asks the questions in the order the plan asks them, so the outcome
 * depends on the evidence, never on the order a client sent it in. An answer
 * the replayed interview never asks is not evidence: it is rejected, which is
 * how a male run's pregnancy answer, a child's reproductive answer or an answer
 * to a question outside the branch is refused.
 *
 * WHAT IT NEVER READS
 *
 * A proposed specialty, route type, urgency, hard stop or gate. Those are the
 * outputs; they are recomputed here and compared, never accepted.
 */
import {
  answerSessionQuestion,
  createRoutingSession,
  type RoutingSession,
} from '../../engine/index.ts';
import {
  DEMONSTRATION_ENGINE_CONFIG,
  materializeDemonstrationComplaint,
  R2B_DEMONSTRATION_KNOWLEDGE,
} from '../../engine/data/index.ts';
import {
  evaluateSafetyController,
  R3_SAFETY_KNOWLEDGE,
  recordSafetyAnswer,
  type SafetyAnswer,
  type SafetyControllerResult,
} from '../../engine/safety/index.ts';
import { BODY_DOMAIN, type BodyRegionId } from '../../body/index.ts';
import {
  concernOptionsFor,
  createRegionAssessmentContext,
  isGenericCoverageComplaint,
  type RegionAssessmentContext,
} from '../body-explorer/clinical-coverage.ts';
import { FACE_HIT_REGIONS, type FaceRegionId } from '../body-explorer/faceHitMap.ts';
import type { PatientContext, SexForAssessment } from '../intake/patient-context.ts';
import { needsReporterChoice, questionVoiceFor, type ReporterChoice } from '../intake/question-voice.ts';
import { safetyQuestionIdsForClinicalContext } from './contextual-safety.ts';
import type { FallbackReason } from './direction-gate.ts';
import {
  CANONICAL_INTAKE_QUESTIONS,
  INTAKE_QUESTION_IDS,
  intakeQuestionsFor,
  MULTI_SELECT_SEPARATOR,
  type IntakeAnswer,
  type IntakeQuestion,
} from './intake-questions.ts';
import { nextInterviewStep, type InterviewStep } from './interview-plan.ts';
import { resolveRouteOutcome, type RouteOutcome } from './route-outcome.ts';
import { SPECIALTY_REGISTRY } from './specialty-registry.ts';

/** A fixed epoch: timestamps never influence a clinical outcome. */
const REPLAY_AT = '1970-01-01T00:00:00.000Z';
const MAX_STEPS = 80;

/* --- Context -------------------------------------------------------------- */

/** The clinical context the evidence was collected in. Age only: never a date of birth. */
export interface ClinicalContextInput {
  bodyRegionId: string;
  faceSubregionId: string | null;
  concernId: string;
  age: number;
  sexForAssessment: string;
  /** Asked only for 12 to 17; null otherwise. */
  reporter: string | null;
}

export type ClinicalReplayErrorCode =
  | 'INVALID_CONTEXT'
  | 'UNKNOWN_QUESTION'
  | 'INVALID_OPTION'
  | 'DUPLICATE_CONFLICT'
  | 'NOT_APPLICABLE'
  | 'INCOMPLETE';

export class ClinicalReplayError extends Error {
  readonly code: ClinicalReplayErrorCode;
  constructor(code: ClinicalReplayErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'ClinicalReplayError';
    this.code = code;
  }
}

const SEXES: readonly SexForAssessment[] = ['female', 'male', 'intersex_or_variation'];
const REPORTERS: readonly ReporterChoice[] = ['young-person', 'caregiver'];
export const MAX_ASSESSMENT_AGE = 130;

/** The minimal patient context the clinical model reads. No name, contact or date of birth. */
export function clinicalPatient(age: number, sex: SexForAssessment, reporter: ReporterChoice | null): PatientContext {
  return {
    derivedAge: age,
    sexForAssessment: sex,
    questionVoice: questionVoiceFor(age, reporter),
    accessibilityNeeds: ['none'],
    existingConditions: ['none_known'],
    previousSimilarEpisode: 'no',
    allergyStatus: 'none_known',
    allergies: [],
    medicationStatus: 'none',
    medications: [],
    surgeryStatus: 'no',
  };
}

/**
 * Builds the assessment context, refusing anything the product cannot produce.
 * Nothing is coerced: an unknown physiology value, a face area on a non-face
 * region, a concern the region does not offer to this age and physiology, or a
 * reporter choice outside 12 to 17 is an error, never a default.
 */
export function trustedClinicalContext(input: ClinicalContextInput): RegionAssessmentContext {
  const region = BODY_DOMAIN.regions.find((candidate) => candidate.id === input.bodyRegionId);
  if (!region) throw new ClinicalReplayError('INVALID_CONTEXT', `unknown region ${input.bodyRegionId}`);
  if (input.faceSubregionId !== null) {
    if (region.id !== 'face') throw new ClinicalReplayError('INVALID_CONTEXT', 'a face area on a non-face region');
    if (!FACE_HIT_REGIONS.some((face) => face.id === input.faceSubregionId)) {
      throw new ClinicalReplayError('INVALID_CONTEXT', `unknown face area ${input.faceSubregionId}`);
    }
  }
  if (!Number.isInteger(input.age) || input.age < 0 || input.age > MAX_ASSESSMENT_AGE) {
    throw new ClinicalReplayError('INVALID_CONTEXT', 'age must be a whole number of years');
  }
  // Physiology is a positive list; an unknown or future value is refused, never treated as eligible.
  if (!SEXES.includes(input.sexForAssessment as SexForAssessment)) {
    throw new ClinicalReplayError('INVALID_CONTEXT', 'unsupported sex for assessment');
  }
  const sex = input.sexForAssessment as SexForAssessment;
  if (input.reporter !== null) {
    if (!REPORTERS.includes(input.reporter as ReporterChoice)) throw new ClinicalReplayError('INVALID_CONTEXT', 'unknown reporter');
    if (!needsReporterChoice(input.age)) throw new ClinicalReplayError('INVALID_CONTEXT', 'a reporter choice outside 12 to 17');
  }
  const face = input.faceSubregionId as FaceRegionId | null;
  const concern = concernOptionsFor(region.id as BodyRegionId, face, { age: input.age, sexForAssessment: sex })
    .find((candidate) => candidate.id === input.concernId);
  if (!concern) throw new ClinicalReplayError('INVALID_CONTEXT', `${input.concernId} is not offered here for this age and physiology`);
  return createRegionAssessmentContext({
    regionId: region.id as BodyRegionId,
    regionLabel: region.label,
    faceSubregionId: face,
    concern,
    patient: clinicalPatient(input.age, sex, input.reporter as ReporterChoice | null),
  });
}

/* --- The loop --------------------------------------------------------------- */

export type StepOwner = 'intake' | 'safety' | 'screened-routing' | 'routing';

export interface AskedQuestion {
  id: string;
  owner: StepOwner;
  options: readonly { id: string; label: string }[];
  /** Present for intake questions. */
  intake: IntakeQuestion | null;
  step: InterviewStep;
}

export interface InterviewRecord {
  questionId: string;
  owner: StepOwner;
  /** Canonical: multi-select parts are de-duplicated and in option order. */
  optionId: string;
  /** Present for intake questions. */
  intake: IntakeQuestion | null;
  step: InterviewStep;
  urgentRuleIds: readonly string[];
}

export interface InterviewRun {
  context: RegionAssessmentContext;
  status: 'result' | 'interrupted' | 'incomplete' | 'guard';
  records: readonly InterviewRecord[];
  /** Set when status is incomplete: the question the evidence does not answer. */
  pendingQuestionId: string | null;
  controller: SafetyControllerResult;
  session: RoutingSession;
  intakeAnswers: readonly IntakeAnswer[];
  safetyAnswers: readonly SafetyAnswer[];
  urgentRuleIds: readonly string[];
  route: RouteOutcome | null;
}

/** Returns an option id for the question, or null when there is no answer for it. */
export type AnswerProvider = (question: AskedQuestion) => string | null;

/** Validates and canonicalizes an answer against the options the question actually offers. */
export function canonicalAnswer(question: AskedQuestion, optionId: string): string {
  const offered = question.options.map((option) => option.id);
  const multi = question.intake?.control === 'multi-select';
  const parts = optionId.split(MULTI_SELECT_SEPARATOR);
  if (!multi && parts.length !== 1) throw new ClinicalReplayError('INVALID_OPTION', `${question.id} takes one answer`);
  if (new Set(parts).size !== parts.length) throw new ClinicalReplayError('INVALID_OPTION', `${question.id} repeats an option`);
  for (const part of parts) {
    if (!offered.includes(part)) throw new ClinicalReplayError('INVALID_OPTION', `${question.id} does not offer ${part}`);
  }
  const exclusive = question.intake?.exclusiveOptionIds ?? [];
  if (parts.length > 1 && parts.some((part) => exclusive.includes(part))) {
    throw new ClinicalReplayError('INVALID_OPTION', `${question.id} combines an exclusive answer`);
  }
  return parts.toSorted((left, right) => offered.indexOf(left) - offered.indexOf(right)).join(MULTI_SELECT_SEPARATOR);
}

/**
 * The interview, exactly as RoutingFlow drives it: contextual safety scope,
 * the R3 controller, the interview plan, then the single route resolver.
 */
export function runInterview(context: RegionAssessmentContext, provide: AnswerProvider, limit = MAX_STEPS): InterviewRun {
  const plan = intakeQuestionsFor(context.complaintId, context);
  // The concern chosen on the body map is the complaint-entry answer.
  let intakeAnswers: readonly IntakeAnswer[] = plan[0]
    ? [{ questionId: plan[0].id, optionId: context.concernId, answeredAt: REPLAY_AT }]
    : [];
  let session: RoutingSession = createRoutingSession(
    context.complaintId,
    materializeDemonstrationComplaint(R2B_DEMONSTRATION_KNOWLEDGE, context.complaintId, []).prior,
    REPLAY_AT,
  );
  let safetyAnswers: readonly SafetyAnswer[] = [];
  const engineConfig = isGenericCoverageComplaint(context.complaintId)
    ? { ...DEMONSTRATION_ENGINE_CONFIG, maxQuestions: 1 }
    : DEMONSTRATION_ENGINE_CONFIG;
  const records: InterviewRecord[] = [];
  let urgentRuleIds: readonly string[] = [];

  const finish = (
    status: InterviewRun['status'],
    controller: SafetyControllerResult,
    route: RouteOutcome | null,
    pendingQuestionId: string | null = null,
  ): InterviewRun => ({
    context, status, records, pendingQuestionId, controller, session, intakeAnswers, safetyAnswers, urgentRuleIds, route,
  });

  let controller: SafetyControllerResult | null = null;
  for (let guard = 0; guard < limit; guard += 1) {
    const complaint = materializeDemonstrationComplaint(
      R2B_DEMONSTRATION_KNOWLEDGE,
      context.complaintId,
      session.answers.map(({ questionId, optionId }) => ({ questionId, optionId })),
    );
    controller = evaluateSafetyController({
      session,
      complaint,
      safetyAnswers,
      safetyKnowledge: R3_SAFETY_KNOWLEDGE,
      engineConfig,
      enabledSafetyQuestionIds: safetyQuestionIdsForClinicalContext(context, intakeAnswers),
    });
    urgentRuleIds = controller.urgentReview?.firedRuleIds ?? urgentRuleIds;
    const routingAnswers = session.answers.map(({ questionId, optionId }) => ({ questionId, optionId }));
    const step = nextInterviewStep({ complaintId: context.complaintId, controller, intakeAnswers, clinicalContext: context, routingAnswers });

    if (step.kind === 'interrupted') return finish('interrupted', controller, null);
    if (step.kind === 'result') {
      const route = controller.status === 'result'
        ? resolveRouteOutcome({
          clinicalContext: context,
          complaintId: context.complaintId,
          intakeAnswers,
          stoppingDecision: controller.stoppingDecision,
          engineSpecialtyId: controller.routingOutcome.specialtyId,
          safetyAnswerCount: safetyAnswers.length,
          routingAnswerCount: session.answers.length,
          routingAnswers,
        })
        : null;
      return finish('result', controller, route);
    }

    const owner: StepOwner = step.kind === 'intake' ? 'intake' : step.owner;
    const asked: AskedQuestion = {
      id: step.question.id,
      owner,
      options: step.question.options,
      intake: step.kind === 'intake' ? step.question : null,
      step,
    };
    const provided = provide(asked);
    if (provided === null) return finish('incomplete', controller, null, asked.id);
    const optionId = canonicalAnswer(asked, provided);

    if (step.kind === 'intake') {
      intakeAnswers = [...intakeAnswers, { questionId: asked.id, optionId, answeredAt: REPLAY_AT }];
    } else if (step.question.answerTarget === 'safety_state') {
      safetyAnswers = recordSafetyAnswer(safetyAnswers, step.question, { questionId: asked.id, optionId, answeredAt: REPLAY_AT });
    } else {
      session = answerSessionQuestion(
        session,
        { questionId: asked.id, optionId, answeredAt: REPLAY_AT },
        complaint.questions,
        engineConfig.posteriorFloor,
      );
    }
    records.push({ questionId: asked.id, owner, optionId, intake: asked.intake, step, urgentRuleIds });
  }
  return finish('guard', controller!, null);
}

/* --- Evidence replay -------------------------------------------------------- */

export interface EvidenceAnswer {
  questionId: string;
  optionId: string;
}

/** Every question id the clinical model defines, across intake, safety and weighted routing. */
export const KNOWN_QUESTION_IDS: ReadonlySet<string> = new Set([
  ...CANONICAL_INTAKE_QUESTIONS.map((question) => question.id),
  ...R3_SAFETY_KNOWLEDGE.questions.map((question) => question.id),
  ...R2B_DEMONSTRATION_KNOWLEDGE.questions.map((question) => question.id),
]);

/**
 * Collapses the evidence to one answer per question. The same answer sent twice
 * is the same fact; two different answers to one question are a conflict and
 * are refused rather than resolved by position.
 */
function evidenceMap(answers: readonly EvidenceAnswer[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const answer of answers) {
    if (typeof answer?.questionId !== 'string' || typeof answer?.optionId !== 'string' || !answer.optionId) {
      throw new ClinicalReplayError('INVALID_OPTION', 'malformed answer');
    }
    if (!KNOWN_QUESTION_IDS.has(answer.questionId)) throw new ClinicalReplayError('UNKNOWN_QUESTION', answer.questionId);
    const normalized = answer.optionId.split(MULTI_SELECT_SEPARATOR).toSorted().join(MULTI_SELECT_SEPARATOR);
    const previous = map.get(answer.questionId);
    if (previous !== undefined) {
      const previousNormalized = previous.split(MULTI_SELECT_SEPARATOR).toSorted().join(MULTI_SELECT_SEPARATOR);
      if (previousNormalized !== normalized) throw new ClinicalReplayError('DUPLICATE_CONFLICT', answer.questionId);
      continue;
    }
    map.set(answer.questionId, answer.optionId);
  }
  return map;
}

export interface ReplayResult {
  run: InterviewRun;
  outcome: CanonicalClinicalOutcome;
  /** Evidence present after a hard stop that the interview never reached. Safety wins; it is reported, not used. */
  ignoredAfterHardStop: readonly string[];
}

/**
 * Replays unordered evidence through the one interview loop.
 *
 *   - Unknown question id, unknown option, a malformed multi-select, or two
 *     different answers to one question: refused.
 *   - A complaint-entry answer that contradicts the context: refused.
 *   - A question the interview asks that the evidence does not answer: the
 *     outcome is not final (INCOMPLETE). Omitting a safety answer can never
 *     produce a routine route.
 *   - Evidence for a question the interview never asks (a male pregnancy
 *     answer, a child's reproductive answer, a skipped branch): refused, unless
 *     a hard stop ended the interview first, in which case the hard stop stands.
 */
export function replayClinicalEvidence(contextInput: ClinicalContextInput, answers: readonly EvidenceAnswer[]): ReplayResult {
  const context = trustedClinicalContext(contextInput);
  const evidence = evidenceMap(answers);
  const entry = evidence.get(INTAKE_QUESTION_IDS.complaintEntry);
  if (entry !== undefined && entry !== context.concernId) {
    throw new ClinicalReplayError('DUPLICATE_CONFLICT', 'the complaint-entry answer contradicts the stated concern');
  }
  evidence.delete(INTAKE_QUESTION_IDS.complaintEntry);

  const consumed = new Set<string>();
  const run = runInterview(context, (question) => {
    const optionId = evidence.get(question.id);
    if (optionId === undefined) return null;
    consumed.add(question.id);
    return optionId;
  });
  if (run.status === 'incomplete') throw new ClinicalReplayError('INCOMPLETE', `no answer for ${run.pendingQuestionId}`);
  if (run.status === 'guard') throw new ClinicalReplayError('INCOMPLETE', 'the interview did not reach an outcome');
  const unconsumed = [...evidence.keys()].filter((questionId) => !consumed.has(questionId)).sort();
  if (run.status === 'result' && unconsumed.length > 0) {
    throw new ClinicalReplayError('NOT_APPLICABLE', `never asked in this context: ${unconsumed.join(', ')}`);
  }
  return {
    run,
    outcome: canonicalOutcomeOf(run),
    ignoredAfterHardStop: run.status === 'interrupted' ? unconsumed : [],
  };
}

/* --- The canonical outcome ------------------------------------------------ */

export type CanonicalRouteType = 'weighted-demonstration' | 'direction-gate' | 'parent-fallback';

/**
 * The semantic result both sides must agree on. No wording, no belief values,
 * no timestamps: identifiers only, sorted, so two equal outcomes are equal
 * objects.
 */
export interface CanonicalClinicalOutcome {
  status: 'route' | 'hard-stop';
  /** Registry id. Null only for a hard stop: routing is paused. */
  specialtyId: string | null;
  routeType: CanonicalRouteType | null;
  /** The same clinical service sees children for this route (a shared-service gate). */
  sharedService: boolean;
  urgency: 'none' | 'urgent';
  urgentRuleIds: readonly string[];
  hardStopRuleId: string | null;
  firedRuleIds: readonly string[];
  fallbackReason: FallbackReason | null;
  gate: {
    directionId: string;
    criterionIds: readonly string[];
    sourceIds: readonly string[];
  } | null;
  /** Canonical question ids the direction rests on. Empty for a parent service or a hard stop. */
  supportingEvidenceQuestionIds: readonly string[];
  calibration: 'SPECIALTY_EVIDENCE_CALIBRATION_REQUIRED' | 'not-applicable';
  evidenceBasis: 'demonstration-only' | 'source-backed-prototype-pending-clinical-review';
}

const sorted = (values: Iterable<string>) => [...new Set(values)].sort();

export function canonicalOutcomeOf(run: Pick<InterviewRun, 'status' | 'controller' | 'route' | 'session' | 'urgentRuleIds' | 'context'>): CanonicalClinicalOutcome {
  if (run.status === 'interrupted' && run.controller.status === 'interrupted') {
    return {
      status: 'hard-stop',
      specialtyId: null,
      routeType: null,
      sharedService: false,
      // A hard stop is its own, higher state; an urgent rule recorded before it is kept for audit.
      urgency: run.urgentRuleIds.length ? 'urgent' : 'none',
      urgentRuleIds: sorted(run.urgentRuleIds),
      hardStopRuleId: run.controller.selectedRuleId,
      firedRuleIds: sorted(run.controller.firedRuleIds),
      fallbackReason: null,
      gate: null,
      supportingEvidenceQuestionIds: [],
      calibration: 'not-applicable',
      evidenceBasis: 'source-backed-prototype-pending-clinical-review',
    };
  }
  const route = run.route;
  if (!route) throw new ClinicalReplayError('INCOMPLETE', 'no route outcome');
  if (!SPECIALTY_REGISTRY.some((record) => record.id === route.registryId && record.routingEnabled)) {
    throw new ClinicalReplayError('INCOMPLETE', `resolver produced a non-routable service ${route.registryId}`);
  }
  const gateDirection = route.basis === 'source-backed-criteria' ? route.gate?.direction ?? null : null;
  const routeType: CanonicalRouteType = route.basis === 'bayesian-convergence'
    ? 'weighted-demonstration'
    : route.basis === 'source-backed-criteria' ? 'direction-gate' : 'parent-fallback';
  const weighted = routeType === 'weighted-demonstration';
  return {
    status: 'route',
    specialtyId: route.registryId,
    routeType,
    sharedService: Boolean(gateDirection && run.context.patientMode === 'pediatric' && gateDirection.directionId !== 'paediatrics'),
    urgency: run.urgentRuleIds.length ? 'urgent' : 'none',
    urgentRuleIds: sorted(run.urgentRuleIds),
    hardStopRuleId: null,
    firedRuleIds: sorted(run.urgentRuleIds),
    fallbackReason: route.fallbackReason,
    gate: gateDirection
      ? {
        directionId: gateDirection.directionId,
        criterionIds: sorted(gateDirection.satisfied.map((criterion) => criterion.criterionId)),
        sourceIds: sorted(gateDirection.satisfied.flatMap((criterion) => criterion.sourceIds)),
      }
      : null,
    supportingEvidenceQuestionIds: weighted
      ? sorted(run.session.answers.map((answer) => answer.questionId))
      : gateDirection ? sorted(gateDirection.satisfied.map((criterion) => criterion.evidenceQuestionId)) : [],
    calibration: weighted || route.fallbackReason === 'SPECIALTY_EVIDENCE_CALIBRATION_REQUIRED' || route.calibrationGap
      ? 'SPECIALTY_EVIDENCE_CALIBRATION_REQUIRED'
      : 'not-applicable',
    evidenceBasis: weighted ? 'demonstration-only' : 'source-backed-prototype-pending-clinical-review',
  };
}

/** The canonical evidence set an interview produced, for persistence and for replay. */
export function evidenceOf(run: Pick<InterviewRun, 'records'>): EvidenceAnswer[] {
  return run.records.map((record) => ({ questionId: record.questionId, optionId: record.optionId }));
}
