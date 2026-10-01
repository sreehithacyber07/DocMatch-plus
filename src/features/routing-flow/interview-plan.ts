/**
 * The interview plan: what to ask next.
 *
 * One pure function decides the next step for the live interview, the routing
 * QA harness and the tests, so the order a patient experiences is the order the
 * audits verify.
 *
 * THREE LAYERS
 *
 *   Layer A  intake       the branch questionnaire in intake-questions.ts.
 *                         Describes the symptom; some answers are read by the
 *                         published criteria in direction-gate.ts. Never
 *                         changes the belief.
 *   Layer B  routing      approved R2 discriminators for the four weighted adult
 *                         complaints, chosen by R1 information gain. The only
 *                         layer that moves specialty belief.
 *   R3       safety       warning-sign screening and red-flag rules. Owns
 *                         escalation.
 *
 * The order, and why it is safe, is documented on nextInterviewStep below.
 * It is a presentation policy outside the frozen R3 knowledge; rules,
 * predicates and payloads are unchanged. It is listed for clinical sign-off.
 */
import type {
  ResolvedSafetyQuestion,
  SafetyControllerResult,
} from '../../engine/safety/index.ts';
import {
  DIRECTION_GATE_QUESTION_IDS,
  INTAKE_QUESTION_IDS,
  intakePlanFor,
  nextIntakeQuestion,
  questionIsEligible,
  selectedOptionIds,
  type IntakeAnswer,
  type IntakeQuestion,
} from './intake-questions.ts';
import { budgetFromAnswers, shouldContinueDiscrimination, type StopCondition } from './discrimination.ts';
import type { FallbackReason, GateEvidence } from './direction-gate.ts';
import { weightedRouteSelected } from './route-outcome.ts';
import { isGenericCoverageComplaint, type RegionAssessmentContext } from '../body-explorer/clinical-coverage.ts';
import { EARLY_SAFETY_QUESTION_IDS } from './contextual-safety.ts';

/**
 * Retained for the weighted adult complaints, whose approved intake set is
 * short enough that the historical bound still describes them: at most this
 * many description questions precede their R3 screen. Coverage branches no
 * longer interleave safety after a fixed count; see nextInterviewStep.
 */
export const MAX_INTAKE_BEFORE_SCREENING = 4;

export type InterviewPhase = 'describe' | 'measure' | 'timeline' | 'pattern' | 'safety' | 'refine' | 'route';

/** Who owns the answer to the question on screen. */
export type QuestionOwner = 'intake' | 'safety' | 'screened-routing' | 'routing';

export type InterviewStep =
  | { kind: 'interrupted' }
  | { kind: 'intake'; phase: InterviewPhase; question: IntakeQuestion; label: string }
  | {
      kind: 'engine';
      phase: InterviewPhase;
      owner: Exclude<QuestionOwner, 'intake'>;
      question: ResolvedSafetyQuestion;
      label: string;
    }
  | { kind: 'result' };

/* --- Presentation metadata for engine questions ---------------------------
   Labels and phases only. They change what the eyebrow says and where the step
   sits in the progression; they never change an option id, an option order or
   what an answer means to the engine or to R3.
   ------------------------------------------------------------------------- */

const ROUTING_PRESENTATION: Readonly<Record<string, { phase: InterviewPhase; label: string }>> = {
  'upper-abdominal-pain-exertional': { phase: 'pattern', label: 'Activity relation' },
  'upper-abdominal-pain-meal-relation': { phase: 'pattern', label: 'Meal relation' },
  'upper-abdominal-pain-sweating': { phase: 'refine', label: 'Associated symptoms' },
  'upper-abdominal-pain-breathlessness': { phase: 'refine', label: 'Breathing' },
  'upper-abdominal-pain-nausea-vomiting': { phase: 'refine', label: 'Nausea' },
  'upper-abdominal-pain-burning': { phase: 'route', label: 'Differentiating' },

  'shortness-of-breath-night-variation': { phase: 'pattern', label: 'Timing' },
  'shortness-of-breath-lying-flat': { phase: 'pattern', label: 'Position' },
  'shortness-of-breath-cough': { phase: 'refine', label: 'Associated symptoms' },
  'shortness-of-breath-palpitations': { phase: 'refine', label: 'Heartbeat' },
  'shortness-of-breath-ankle-swelling': { phase: 'refine', label: 'Associated symptoms' },
  'shortness-of-breath-wheeze': { phase: 'route', label: 'Breathing sounds' },

  'headache-activity-worsening': { phase: 'pattern', label: 'Activity relation' },
  'headache-light-sound-sensitivity': { phase: 'refine', label: 'Associated symptoms' },
  'headache-nausea-vomiting': { phase: 'refine', label: 'Nausea' },
  'headache-same-side-eye-nose': { phase: 'refine', label: 'Associated symptoms' },
  'headache-one-sided': { phase: 'route', label: 'Location' },
  'headache-pulsating': { phase: 'route', label: 'Differentiating' },

  'joint-musculoskeletal-pain-injury': { phase: 'pattern', label: 'Injury' },
  'joint-musculoskeletal-pain-activity-related': { phase: 'pattern', label: 'Activity relation' },
  'joint-musculoskeletal-pain-swelling-bruising': { phase: 'refine', label: 'Associated symptoms' },
  'joint-musculoskeletal-pain-morning-stiffness': { phase: 'route', label: 'Stiffness' },
  'joint-musculoskeletal-pain-spasm': { phase: 'route', label: 'Differentiating' },
  'joint-musculoskeletal-pain-use-weight': { phase: 'route', label: 'Function' },
};

const INTAKE_PHASE: Readonly<Record<IntakeQuestion['category'], InterviewPhase>> = {
  character: 'describe',
  intensity: 'measure',
  duration: 'timeline',
  onset: 'pattern',
  pattern: 'pattern',
  change: 'pattern',
  context: 'refine',
};

export function routingPresentation(questionId: string): { phase: InterviewPhase; label: string } {
  return ROUTING_PRESENTATION[questionId] ?? { phase: 'route', label: 'Differentiating' };
}

/** The fixed acuity signals, for callers that have no question metadata. */
const DEFAULT_ACUITY: Readonly<Record<string, readonly string[]>> = {
  [INTAKE_QUESTION_IDS.currentImpact]: ['5'],
  [INTAKE_QUESTION_IDS.onset]: ['sudden'],
};

/**
 * Whether an answer makes a branch-relevant safety check immediately relevant.
 *
 * Each question declares its own acuity answers: the top of the impact scale,
 * a sudden onset, and branch findings such as a harsh noise when breathing in
 * or swallowing that is failing. An acuity answer only ever moves the
 * contextual safety checks EARLIER. It never fires, suppresses or postpones a
 * rule.
 */
export function signalsAcuity(answers: readonly IntakeAnswer[], questions: readonly IntakeQuestion[] = []): boolean {
  const declared = new Map<string, readonly string[]>(Object.entries(DEFAULT_ACUITY));
  for (const question of questions) {
    if (question.acuityOptionIds?.length) declared.set(question.id, question.acuityOptionIds);
  }
  return answers.some((answer) => {
    const acute = declared.get(answer.questionId);
    return acute !== undefined && selectedOptionIds(answer.optionId).some((optionId) => acute.includes(optionId));
  });
}

export interface InterviewPlanInput {
  complaintId: string;
  controller: SafetyControllerResult;
  intakeAnswers: readonly IntakeAnswer[];
  clinicalContext?: RegionAssessmentContext | null;
  /** Answers already given to a weighted complaint's R1 questions, read by the gate only. */
  routingAnswers?: readonly GateEvidence[];
}

function toResolved(question: {
  id: string;
  text: string;
  options: readonly { id: string; label: string }[];
}): ResolvedSafetyQuestion {
  return {
    id: question.id,
    text: question.text,
    options: question.options.map((option) => ({ id: option.id, label: option.label })),
    answerTarget: 'routing_session',
    provenanceIds: [],
  };
}

/** Every intake question whose premise still holds, for the discrimination checks. */
function eligibleIntake(questions: readonly IntakeQuestion[], answers: readonly IntakeAnswer[]): IntakeQuestion[] {
  return questions.filter((question) => questionIsEligible(question, answers));
}

/**
 * THE ORDER
 *
 *   1  Interruption. A satisfied must-stop rule ends the interview at once,
 *      wherever it is. This is checked first and nothing delays it.
 *   2  The IMNCI general danger signs, for a child under five only. The
 *      Government of India IMNCI module checks every sick child for them
 *      after asking what the problem is and before the main symptoms, so they
 *      come first as one short block. The complaint itself was already given
 *      on the body map.
 *   3  Acuity. An answer that makes a branch safety check immediately relevant
 *      (severe impact, sudden onset, a harsh breathing noise, swallowing that
 *      is failing, a limb that cannot be used) brings the contextual safety
 *      checks forward, together, before anything else.
 *   4  The core branch: what is happening, how much, how long, what pattern,
 *      and the branch features.
 *   5  The discrimination extension: only questions a published referral
 *      criterion still needs, and only while that criterion can still be met.
 *   6  Safety completion: the remaining contextually eligible checks, as one
 *      contiguous block.
 *   7  The weighted routing questions, for the four adult demonstration
 *      complaints, which R3 releases only after their screen.
 *   8  The result.
 *
 * WHAT CHANGED, AND WHY IT IS STILL SAFE
 *
 * The screen used to start after at most three description answers, and any
 * safety question an answer made eligible later was slotted in wherever it
 * appeared, so the patient met ordinary, emergency, ordinary, emergency. The
 * founder asked for the questionnaire to establish what is happening first.
 * Three properties keep that from hiding danger:
 *
 *   - Interruption is unconditional (step 1): a hard stop is never deferred.
 *   - Under-fives meet the source-mandated danger signs first (step 2).
 *   - Any answer that makes a check urgent pulls the checks forward (step 3).
 *
 * An urgent but continuable finding is recorded silently and carried to the
 * result; it never interrupts.
 */
export function nextInterviewStep({ complaintId, controller, intakeAnswers, clinicalContext = null, routingAnswers = [] }: InterviewPlanInput): InterviewStep {
  if (controller.status === 'interrupted') return { kind: 'interrupted' };

  const plan = intakePlanFor(complaintId, clinicalContext);
  const allIntake = [...plan.preScreen, ...plan.postScreen];

  const safetyStep = (): InterviewStep | null => {
    if (controller.status !== 'safety-screening') return null;
    const owner = controller.question.answerTarget === 'safety_state' ? 'safety' : 'screened-routing';
    if (owner === 'safety') {
      return { kind: 'engine', phase: 'safety', owner, question: controller.question, label: 'Safety check' };
    }
    const presentation = routingPresentation(controller.question.id);
    return { kind: 'engine', phase: presentation.phase, owner, question: controller.question, label: presentation.label };
  };

  // 2. IMNCI general danger signs first, for under-fives only (the population IMNCI covers).
  const underFive = clinicalContext?.pediatricAgeBand === 'infant-under-one' || clinicalContext?.pediatricAgeBand === 'young-child';
  if (underFive && controller.status === 'safety-screening' && EARLY_SAFETY_QUESTION_IDS.has(controller.question.id)) {
    return safetyStep()!;
  }

  // 3. Acuity brings the contextual checks forward.
  if (controller.status === 'safety-screening' && signalsAcuity(intakeAnswers, allIntake)) {
    return safetyStep()!;
  }

  // 4. The core branch.
  const core = allIntake.filter((question) => question.stage !== 'extension' && !DIRECTION_GATE_QUESTION_IDS.has(question.id));
  // The weighted adult set keeps its historical bound before the R3 screen.
  const weighted = !clinicalContext || !isGenericCoverageComplaint(complaintId);
  const boundedCore = weighted && controller.status === 'safety-screening'
    ? core.slice(0, MAX_INTAKE_BEFORE_SCREENING)
    : core;
  const pendingCore = nextIntakeQuestion(boundedCore, intakeAnswers);
  if (pendingCore) {
    return { kind: 'intake', phase: INTAKE_PHASE[pendingCore.category], question: pendingCore, label: pendingCore.eyebrow };
  }

  /*
    5. The discrimination extension, only while it can change the outcome.

    For a weighted complaint it opens only once R1 has finished WITHOUT
    selecting a route (CORE, then EXTENSION): R1 owns the belief and asks
    first, and the sourced criteria are completed only when R1 did not
    separate a candidate. A converged run is never asked more.
  */
  const extensionOpen = !weighted || (
    controller.status === 'result'
    && !weightedRouteSelected({
      clinicalContext,
      complaintId,
      stoppingDecision: controller.stoppingDecision,
      engineSpecialtyId: controller.routingOutcome.specialtyId,
    })
  );
  if (clinicalContext && extensionOpen) {
    const decision = shouldContinueDiscrimination({
      context: clinicalContext,
      intakeAnswers,
      eligibleQuestions: eligibleIntake(allIntake, intakeAnswers),
      budget: budgetFromAnswers(intakeAnswers, 0, 0),
      hardStop: false,
      routingAnswers,
    });
    if (decision.shouldContinue) {
      const open = new Set(decision.remainingDiscriminatorIds);
      const pendingStageB = nextIntakeQuestion(
        allIntake.filter((question) => open.has(question.id)),
        intakeAnswers,
      );
      if (pendingStageB) {
        return { kind: 'intake', phase: 'route', question: pendingStageB, label: pendingStageB.eyebrow };
      }
    }
  }

  // 6. Safety completion, as one block.
  const screening = safetyStep();
  if (screening) return screening;

  // The weighted set's remaining description, after its screen.
  const pendingRest = nextIntakeQuestion(core, intakeAnswers);
  if (pendingRest) {
    return { kind: 'intake', phase: INTAKE_PHASE[pendingRest.category], question: pendingRest, label: pendingRest.eyebrow };
  }

  // 7. Weighted routing.
  if (controller.status === 'question') {
    const question = toResolved(controller.selection.question);
    const presentation = routingPresentation(question.id);
    return { kind: 'engine', phase: presentation.phase, owner: 'routing', question, label: presentation.label };
  }

  return { kind: 'result' };
}

/**
 * Why this interview stopped, for the result screen and the audits.
 *
 * Every terminated run can name one of these. There is deliberately no
 * `DEFAULT_STOP`: a run that cannot say why it ended is a bug, not a result.
 */
export function interviewStopCondition(input: {
  clinicalContext: RegionAssessmentContext | null;
  controller: SafetyControllerResult;
  intakeAnswers: readonly IntakeAnswer[];
  complaintId: string;
}): { stopCondition: StopCondition; fallbackReason: FallbackReason | null } {
  if (input.controller.status === 'interrupted') {
    return { stopCondition: 'HARD_STOP', fallbackReason: null };
  }
  if (!input.clinicalContext) {
    // An approved weighted complaint: R1 owns the stop reason.
    const converged =
      input.controller.status === 'result' &&
      (input.controller.stoppingDecision.reason === 'top_probability' ||
        input.controller.stoppingDecision.reason === 'margin');
    return converged
      ? { stopCondition: 'SPECIALTY_SUFFICIENT', fallbackReason: null }
      : { stopCondition: 'NO_HIGH_VALUE_DISCRIMINATORS', fallbackReason: 'INSUFFICIENT_SUPPORTED_EVIDENCE' };
  }
  const plan = intakePlanFor(input.complaintId, input.clinicalContext);
  const decision = shouldContinueDiscrimination({
    context: input.clinicalContext,
    intakeAnswers: input.intakeAnswers,
    eligibleQuestions: eligibleIntake([...plan.preScreen, ...plan.postScreen], input.intakeAnswers),
    budget: budgetFromAnswers(input.intakeAnswers, 0, 0),
    hardStop: false,
  });
  return {
    stopCondition: decision.stopCondition ?? 'NO_HIGH_VALUE_DISCRIMINATORS',
    fallbackReason: decision.fallbackReason,
  };
}

/** The progression shown above the question: grouped, never technical. */
export const PHASE_GROUPS: readonly { id: 'understanding' | 'refining'; label: string; phases: readonly InterviewPhase[] }[] = [
  { id: 'understanding', label: 'Understanding', phases: ['describe', 'measure', 'timeline', 'pattern'] },
  { id: 'refining', label: 'Refining', phases: ['refine', 'route'] },
];

export const PHASE_LABEL: Readonly<Record<InterviewPhase, string>> = {
  describe: 'Describe',
  measure: 'Measure',
  timeline: 'Timeline',
  pattern: 'Pattern',
  safety: 'Safety check',
  refine: 'Refine',
  route: 'Route',
};

/**
 * Whether a tap may record an answer.
 *
 * Only an answer to the question currently on screen is accepted. The exiting
 * question keeps its handlers during its exit animation, and because answers
 * overwrite in place, a tap landing there would silently replace the answer
 * the patient just gave. `null` means a submission for the active question is
 * already in flight, so a double tap is dropped too.
 */
export function acceptsSubmission(activeQuestionId: string | null, submittedQuestionId: string): boolean {
  return activeQuestionId !== null && activeQuestionId === submittedQuestionId;
}
