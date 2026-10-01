/**
 * When to keep asking, and when a parent service is the honest answer.
 *
 * THE FAILURE THIS REPLACES
 *
 * The interview used to end as soon as the intake plan ran out of questions. On
 * the sixteen coverage complaint families that had no routing questions at all,
 * that meant the run ended the moment the description was complete, every time,
 * and printed General Medicine. Nothing asked whether there was anything left
 * worth asking.
 *
 * THE RULE NOW
 *
 * Before a parent service is offered, the interview asks one question of
 * itself: is there still an unanswered question that could materially separate
 * the services that remain plausible here? If yes, it asks it. A parent service
 * is a conclusion, not an exit.
 *
 * TWO STAGES, TWO BUDGETS
 *
 *   Stage A  core intake. Complaint, character, impact, duration, onset,
 *            pattern, associated features. Always runs.
 *   Stage B  discrimination extension. Only the questions a published referral
 *            criterion still needs. Runs only while it can change the outcome.
 *
 * Safety questions are counted separately and never consume routing budget. A
 * run of negative safety answers used to eat the question allowance and leave
 * nothing for discrimination; it no longer can, because the two counters are
 * different numbers.
 */
import type { RegionAssessmentContext } from '../body-explorer/clinical-coverage.ts';
import {
  evaluateDirectionGate,
  type DirectionGateResult,
  type FallbackReason,
  type GateEvidence,
} from './direction-gate.ts';
import {
  DIRECTION_GATE_QUESTION_IDS,
  type IntakeAnswer,
  type IntakeQuestion,
} from './intake-questions.ts';

/**
 * The most Stage B discriminators one run may ask.
 *
 * This is a question-burden ceiling, not an evidence threshold. No criteria set
 * needs more than three unanswered discriminators, so in practice this bounds
 * the pathological case rather than the ordinary one.
 */
export const MAX_DISCRIMINATION_EXTENSION = 4;

/** Counted apart so one never starves the other. */
export interface QuestionBudgetState {
  routingQuestionCount: number;
  safetyQuestionCount: number;
  contextQuestionCount: number;
  discriminationQuestionCount: number;
}

export const EMPTY_BUDGET: QuestionBudgetState = {
  routingQuestionCount: 0,
  safetyQuestionCount: 0,
  contextQuestionCount: 0,
  discriminationQuestionCount: 0,
};

export type QuestionOwnerKind = 'intake' | 'safety' | 'screened-routing' | 'routing';

export function countQuestion(
  budget: QuestionBudgetState,
  owner: QuestionOwnerKind,
  questionId: string,
): QuestionBudgetState {
  if (owner === 'safety') {
    return { ...budget, safetyQuestionCount: budget.safetyQuestionCount + 1 };
  }
  if (owner === 'routing' || owner === 'screened-routing') {
    return { ...budget, routingQuestionCount: budget.routingQuestionCount + 1 };
  }
  if (DIRECTION_GATE_QUESTION_IDS.has(questionId)) {
    return { ...budget, discriminationQuestionCount: budget.discriminationQuestionCount + 1 };
  }
  return { ...budget, contextQuestionCount: budget.contextQuestionCount + 1 };
}

/** Rebuild the budget from a recorded interview, for audits and replays. */
export function budgetFromAnswers(
  intakeAnswers: readonly IntakeAnswer[],
  safetyAnswerCount: number,
  routingAnswerCount: number,
): QuestionBudgetState {
  return intakeAnswers.reduce(
    (budget, answer) => countQuestion(budget, 'intake', answer.questionId),
    {
      ...EMPTY_BUDGET,
      safetyQuestionCount: safetyAnswerCount,
      routingQuestionCount: routingAnswerCount,
    },
  );
}

/** Why the questionnaire stopped. `DEFAULT_STOP` is deliberately not a member. */
export type StopCondition =
  | 'SPECIALTY_SUFFICIENT'
  | 'NO_HIGH_VALUE_DISCRIMINATORS'
  | 'HARD_STOP'
  | 'QUESTION_BURDEN_WITH_LOW_ADDITIONAL_VALUE';

export interface DiscriminationState {
  context: RegionAssessmentContext;
  intakeAnswers: readonly IntakeAnswer[];
  /** Every intake question the plan can still offer, already filtered for premise. */
  eligibleQuestions: readonly IntakeQuestion[];
  budget: QuestionBudgetState;
  /** True only for a `must_stop` R3 rule. An urgent rule is not a hard stop. */
  hardStop: boolean;
  /** Answers already given to a weighted complaint's approved R1 questions, read by the gate only. */
  routingAnswers?: readonly GateEvidence[];
}

export interface DiscriminationDecision {
  shouldContinue: boolean;
  /** Present when `shouldContinue` is false. */
  stopCondition: StopCondition | null;
  /** Present when the run would now end at a parent service. */
  fallbackReason: FallbackReason | null;
  gate: DirectionGateResult;
  /** Questions that could still change the outcome, highest value first. */
  remainingDiscriminatorIds: readonly string[];
  /** Direction ids that are still in play. */
  remainingCandidateDirections: readonly string[];
}

/**
 * Should the interview keep going?
 *
 * The answer is yes while an eligible, unanswered question belongs to a
 * criteria set that is still reachable for this anatomy. It is no when a
 * direction is already supported, when nothing eligible remains, or when the
 * discrimination extension has spent its burden ceiling.
 *
 * A hard stop overrides everything, because delaying it would be unsafe. An
 * urgent but continuable rule does not: that case finishes the interview and
 * carries its urgency to the result.
 */
export function shouldContinueDiscrimination(state: DiscriminationState): DiscriminationDecision {
  const gate = evaluateDirectionGate(state.context, state.intakeAnswers, state.routingAnswers ?? []);
  const answered = new Set(state.intakeAnswers.map((answer) => answer.questionId));
  const openIds = new Set(gate.openDiscriminatorQuestionIds);
  const remainingDiscriminatorIds = state.eligibleQuestions
    .filter((question) => !answered.has(question.id) && openIds.has(question.id))
    .toSorted(
      (left, right) =>
        (left.informationGainRank ?? Number.MAX_SAFE_INTEGER) -
        (right.informationGainRank ?? Number.MAX_SAFE_INTEGER),
    )
    .map((question) => question.id);
  const remainingCandidateDirections = [
    ...new Set(
      gate.assessments
        .filter((assessment) => assessment.reachable && !assessment.supported)
        .map((assessment) => assessment.directionId),
    ),
  ];

  const base = { gate, remainingDiscriminatorIds, remainingCandidateDirections };

  if (state.hardStop) {
    return { ...base, shouldContinue: false, stopCondition: 'HARD_STOP', fallbackReason: null };
  }
  if (gate.status === 'supported') {
    return { ...base, shouldContinue: false, stopCondition: 'SPECIALTY_SUFFICIENT', fallbackReason: null };
  }
  if (remainingDiscriminatorIds.length === 0) {
    return {
      ...base,
      shouldContinue: false,
      stopCondition: 'NO_HIGH_VALUE_DISCRIMINATORS',
      fallbackReason: gate.fallbackReason ?? 'INSUFFICIENT_SUPPORTED_EVIDENCE',
    };
  }
  if (state.budget.discriminationQuestionCount >= MAX_DISCRIMINATION_EXTENSION) {
    return {
      ...base,
      shouldContinue: false,
      stopCondition: 'QUESTION_BURDEN_WITH_LOW_ADDITIONAL_VALUE',
      fallbackReason: 'QUESTION_BURDEN_LIMIT_REACHED',
    };
  }
  return { ...base, shouldContinue: true, stopCondition: null, fallbackReason: null };
}

export interface FallbackGuardResult {
  ok: boolean;
  /** Named reason the parent service is correct here. Never null when `ok`. */
  reason: FallbackReason | null;
  message: string;
  remainingDiscriminatorIds: readonly string[];
  remainingCandidateDirections: readonly string[];
}

/**
 * The guard in front of General Medicine and Paediatrics.
 *
 * It fails when more than one candidate direction is still reachable, relevant
 * questions are still unanswered, the burden ceiling has not been reached and
 * no hard stop applies. In development and in tests that failure is loud; in
 * production the interview simply continues, because asking one more question
 * is always safer than printing a direction the answers did not support.
 */
export function assertNoUsefulDiscriminatorsRemain(state: DiscriminationState): FallbackGuardResult {
  const decision = shouldContinueDiscrimination(state);
  if (decision.shouldContinue) {
    return {
      ok: false,
      reason: null,
      message:
        `A parent service was about to be shown while ${decision.remainingDiscriminatorIds.length} relevant ` +
        `question(s) remain unanswered and ${decision.remainingCandidateDirections.length} narrower direction(s) ` +
        `are still reachable: ${decision.remainingCandidateDirections.join(', ') || 'none named'}. ` +
        'The interview must continue instead.',
      remainingDiscriminatorIds: decision.remainingDiscriminatorIds,
      remainingCandidateDirections: decision.remainingCandidateDirections,
    };
  }
  const reason = decision.fallbackReason
    ?? (decision.stopCondition === 'HARD_STOP' ? 'INSUFFICIENT_SUPPORTED_EVIDENCE' : 'NO_VALIDATED_NARROW_ROUTE');
  return {
    ok: true,
    reason,
    message: `Parent service is correct here: ${reason}.`,
    remainingDiscriminatorIds: decision.remainingDiscriminatorIds,
    remainingCandidateDirections: decision.remainingCandidateDirections,
  };
}
