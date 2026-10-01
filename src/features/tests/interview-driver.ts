/**
 * A headless interview, for tests.
 *
 * Built only from what RoutingFlow calls: the R3 controller, the R1 session
 * update, R3 reconciliation and nextInterviewStep. It holds no ordering logic of
 * its own, so a test that passes here exercises the real sequence.
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
  reconcileSafetyAnswers,
  type SafetyAnswer,
  type SafetyControllerResult,
} from '../../engine/safety/index.ts';
import type { IntakeAnswer } from '../routing-flow/intake-questions.ts';
import { nextInterviewStep, type InterviewStep } from '../routing-flow/interview-plan.ts';

export interface DriverState {
  complaintId: string;
  session: RoutingSession;
  safetyAnswers: readonly SafetyAnswer[];
  intakeAnswers: readonly IntakeAnswer[];
  clock: number;
}

export interface DrivenStep {
  step: InterviewStep;
  optionId: string;
}

export function startInterview(complaintId: string): DriverState {
  const prior = materializeDemonstrationComplaint(R2B_DEMONSTRATION_KNOWLEDGE, complaintId, []).prior;
  return {
    complaintId,
    session: createRoutingSession(complaintId, prior, new Date(0).toISOString()),
    safetyAnswers: [],
    intakeAnswers: [],
    clock: 0,
  };
}

export function controllerFor(state: DriverState): SafetyControllerResult {
  const complaint = materializeDemonstrationComplaint(
    R2B_DEMONSTRATION_KNOWLEDGE,
    state.complaintId,
    state.session.answers.map((answer) => ({ questionId: answer.questionId, optionId: answer.optionId })),
  );
  return evaluateSafetyController({
    session: state.session,
    complaint,
    safetyAnswers: state.safetyAnswers,
    safetyKnowledge: R3_SAFETY_KNOWLEDGE,
    engineConfig: DEMONSTRATION_ENGINE_CONFIG,
  });
}

export function currentStep(state: DriverState): InterviewStep {
  return nextInterviewStep({
    complaintId: state.complaintId,
    controller: controllerFor(state),
    intakeAnswers: state.intakeAnswers,
  });
}

/** Records one answer to the step currently on screen. */
export function answer(state: DriverState, optionId: string): DriverState {
  const step = currentStep(state);
  const clock = state.clock + 1;
  const answeredAt = new Date(clock * 1000).toISOString();

  if (step.kind === 'intake') {
    return {
      ...state,
      clock,
      intakeAnswers: [...state.intakeAnswers, { questionId: step.question.id, optionId, answeredAt }],
    };
  }
  if (step.kind !== 'engine') throw new Error(`No question on screen (step ${step.kind}).`);

  if (step.question.answerTarget === 'safety_state') {
    return {
      ...state,
      clock,
      safetyAnswers: recordSafetyAnswer(state.safetyAnswers, step.question, {
        questionId: step.question.id,
        optionId,
        answeredAt,
      }),
    };
  }

  const complaint = materializeDemonstrationComplaint(
    R2B_DEMONSTRATION_KNOWLEDGE,
    state.complaintId,
    state.session.answers.map((entry) => ({ questionId: entry.questionId, optionId: entry.optionId })),
  );
  const session = answerSessionQuestion(
    state.session,
    { questionId: step.question.id, optionId, answeredAt },
    complaint.questions,
    DEMONSTRATION_ENGINE_CONFIG.posteriorFloor,
  );
  const safetyAnswers = reconcileSafetyAnswers(
    { complaintId: state.complaintId, routingAnswers: session.answers, safetyAnswers: state.safetyAnswers },
    R3_SAFETY_KNOWLEDGE,
  ).retained;
  return { ...state, clock, session, safetyAnswers };
}

/**
 * Runs to a terminal step. Answers come from `answers` by question id; intake
 * questions without one take their first option, engine questions `fallback`.
 */
export function runInterview(
  complaintId: string,
  answers: Readonly<Record<string, string>>,
  fallback: 'yes' | 'no' = 'no',
): { state: DriverState; steps: DrivenStep[]; terminal: InterviewStep; controller: SafetyControllerResult } {
  let state = startInterview(complaintId);
  const steps: DrivenStep[] = [];
  for (let guard = 0; guard < 60; guard += 1) {
    const step = currentStep(state);
    if (step.kind === 'interrupted' || step.kind === 'result') {
      return { state, steps, terminal: step, controller: controllerFor(state) };
    }
    const optionId =
      answers[step.question.id] ?? (step.kind === 'intake' ? step.question.options[0].id : fallback);
    steps.push({ step, optionId });
    state = answer(state, optionId);
  }
  throw new Error('Interview did not terminate.');
}
