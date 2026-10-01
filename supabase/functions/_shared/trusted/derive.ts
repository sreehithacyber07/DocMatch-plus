/**
 * Trusted derivation from persisted evidence.
 *
 * The server never accepts a safety outcome, a specialty or a stop reason from
 * the browser. It rebuilds the interview from the persisted answer events with
 * the SAME frozen modules the browser runs, in the same call order, and derives
 * the result itself:
 *
 *   R1/R2   createRoutingSession, answerSessionQuestion, materialize...
 *   R3      evaluateSafetyController, reconcileSafetyAnswers
 *   plan    nextInterviewStep (the step the patient's screen would show)
 *   result  hasPresentableRoute and the specialty registry (General Medicine
 *           fallback exactly as the result screen applies it)
 *
 * Nothing here is a second implementation of a clinical rule.
 */
import {
  answerSessionQuestion,
  createRoutingSession,
  type RecordedAnswer,
  type RoutingSession,
  type SpecialtyId,
  type StopReason,
} from '../../../../src/engine/index.ts';
import {
  DEMONSTRATION_ENGINE_CONFIG,
  materializeDemonstrationComplaint,
  R2B_DEMONSTRATION_KNOWLEDGE,
} from '../../../../src/engine/data/index.ts';
import {
  evaluateSafetyController,
  R3_SAFETY_KNOWLEDGE,
  reconcileSafetyAnswers,
  type SafetyAnswer,
  type SafetyControllerResult,
} from '../../../../src/engine/safety/index.ts';
import { intakeQuestionById, type IntakeAnswer } from '../../../../src/features/routing-flow/intake-questions.ts';
import { nextInterviewStep, type InterviewStep } from '../../../../src/features/routing-flow/interview-plan.ts';
import { hasPresentableRoute } from '../../../../src/features/routing-flow/handoff-presentation.ts';
import { GENERAL_MEDICINE, specialtyForEngineId } from '../../../../src/features/routing-flow/specialty-registry.ts';
import { SERVER_VERSIONS, TrustedError } from './contract.ts';
import {
  activeProjection,
  highWater,
  orderedSteps,
  type ActiveAnswer,
  type EvidenceStep,
  type IntakeAnswerRow,
  type RoutingAnswerRow,
  type SafetyAnswerRow,
} from './evidence.ts';

export interface TrustedEvidenceInput {
  complaintId: string;
  routingRows: readonly RoutingAnswerRow[];
  safetyRows: readonly SafetyAnswerRow[];
  intakeRows: readonly IntakeAnswerRow[];
}

export interface TrustedInterviewState {
  complaintId: string;
  session: RoutingSession;
  safetyAnswers: readonly SafetyAnswer[];
  intakeAnswers: readonly IntakeAnswer[];
  controller: SafetyControllerResult;
  step: InterviewStep;
  /** Record that established each retained routing answer, by question. */
  routingRecordByQuestion: ReadonlyMap<string, string>;
  safetyRecordByQuestion: ReadonlyMap<string, string>;
  latestAnsweredAt: string | null;
  highWater: { routing: number; safety: number; intake: number };
}

/** A fixed epoch for the rebuilt session; timestamps never influence belief. */
const REPLAY_CREATED_AT = '1970-01-01T00:00:00.000Z';

export function isApprovedComplaint(complaintId: string): boolean {
  return R2B_DEMONSTRATION_KNOWLEDGE.complaints.some(
    (complaint) => complaint.id === complaintId && complaint.prior.status === 'ready',
  ) && R3_SAFETY_KNOWLEDGE.rules.some((rule) => rule.applicableComplaintIds.includes(complaintId));
}

function materialize(complaintId: string, answers: readonly RecordedAnswer[]) {
  return materializeDemonstrationComplaint(
    R2B_DEMONSTRATION_KNOWLEDGE,
    complaintId,
    answers.map((answer) => ({ questionId: answer.questionId, optionId: answer.optionId })),
  );
}

/**
 * Rebuilds the R1 session exactly as RoutingFlow evolves it:
 *
 *   selected  answerSessionQuestion with the question bank materialized from
 *             the answers held before this event (RoutingFlow's memo)
 *   cleared   RoutingFlow.removeAnswer: rebuild from the initial belief and fold
 *             the remaining answers, with the pre-removal question bank
 *
 * A clear for a question the replay already dropped (an R1 applicability drop
 * that R9D recorded as a clear) changes nothing, as in the browser.
 */
export function replayRoutingSession(complaintId: string, steps: readonly EvidenceStep[]): {
  session: RoutingSession;
  recordByQuestion: Map<string, string>;
} {
  const floor = DEMONSTRATION_ENGINE_CONFIG.posteriorFloor;
  const prior = materialize(complaintId, []).prior;
  let session = createRoutingSession(complaintId, prior, REPLAY_CREATED_AT);
  const recordByQuestion = new Map<string, string>();

  for (const step of steps) {
    const bank = materialize(complaintId, session.answers).questions;
    if (step.operation === 'selected') {
      session = answerSessionQuestion(
        session,
        { questionId: step.questionId, optionId: step.optionId as string, answeredAt: step.answeredAt },
        bank,
        floor,
      );
      recordByQuestion.set(step.questionId, step.recordId);
      continue;
    }
    if (!session.answers.some((answer) => answer.questionId === step.questionId)) continue;
    const remaining = session.answers.filter((answer) => answer.questionId !== step.questionId);
    const rebuilt = createRoutingSession(complaintId, session.initialBelief, session.createdAt);
    session = remaining.reduce((accumulated, answer) => answerSessionQuestion(accumulated, answer, bank, floor), rebuilt);
  }

  const retained = new Set(session.answers.map((answer) => answer.questionId));
  for (const questionId of [...recordByQuestion.keys()]) {
    if (!retained.has(questionId)) recordByQuestion.delete(questionId);
  }
  return { session, recordByQuestion };
}

function checkRoutingMembership(complaintId: string, steps: readonly EvidenceStep[]): void {
  const complaint = R2B_DEMONSTRATION_KNOWLEDGE.complaints.find((candidate) => candidate.id === complaintId);
  if (!complaint) throw new TrustedError('COMPLAINT_NOT_SUPPORTED');
  for (const step of steps) {
    if (!complaint.questionIds.includes(step.questionId)) throw new TrustedError('INVALID_EVIDENCE');
    if (step.operation !== 'selected') continue;
    const question = R2B_DEMONSTRATION_KNOWLEDGE.questions.find((candidate) => candidate.id === step.questionId);
    if (!question?.options.some((option) => option.id === step.optionId)) throw new TrustedError('INVALID_EVIDENCE');
  }
}

function checkSafetyMembership(complaintId: string, steps: readonly EvidenceStep[]): void {
  for (const step of steps) {
    const question = R3_SAFETY_KNOWLEDGE.questions.find(
      (candidate) =>
        candidate.kind === 'safety_owned' &&
        candidate.id === step.questionId &&
        candidate.applicableComplaintIds.includes(complaintId),
    );
    if (!question || question.kind !== 'safety_owned') throw new TrustedError('INVALID_EVIDENCE');
    if (step.operation === 'selected' && !question.options.some((option) => option.id === step.optionId)) {
      throw new TrustedError('INVALID_EVIDENCE');
    }
  }
}

function checkIntakeMembership(complaintId: string, rows: readonly IntakeAnswerRow[], steps: readonly EvidenceStep[]): void {
  for (const row of rows) {
    const question = intakeQuestionById(complaintId, row.question_id);
    if (!question || question.category !== row.category) throw new TrustedError('INVALID_EVIDENCE');
  }
  for (const step of steps) {
    if (step.operation !== 'selected') continue;
    const question = intakeQuestionById(complaintId, step.questionId);
    if (!question?.options.some((option) => option.id === step.optionId)) throw new TrustedError('INVALID_EVIDENCE');
  }
}

/**
 * Validates the whole persisted interview and rebuilds the state the browser
 * held. Any engine refusal becomes INVALID_EVIDENCE; nothing is guessed.
 */
export function deriveInterviewState(input: TrustedEvidenceInput): TrustedInterviewState {
  const { complaintId } = input;
  if (!isApprovedComplaint(complaintId)) throw new TrustedError('COMPLAINT_NOT_SUPPORTED');
  if (input.routingRows.some((row) => row.knowledge_version !== SERVER_VERSIONS.knowledgeVersion)) {
    throw new TrustedError('VERSION_MISMATCH');
  }
  if (input.safetyRows.some((row) => row.safety_version !== SERVER_VERSIONS.safetyVersion)) {
    throw new TrustedError('VERSION_MISMATCH');
  }

  const routingSteps = orderedSteps(input.routingRows);
  const safetySteps = orderedSteps(input.safetyRows);
  const intakeSteps = orderedSteps(input.intakeRows);
  checkRoutingMembership(complaintId, routingSteps);
  checkSafetyMembership(complaintId, safetySteps);
  checkIntakeMembership(complaintId, input.intakeRows, intakeSteps);

  try {
    const { session, recordByQuestion } = replayRoutingSession(complaintId, routingSteps);
    const safetyActive: ActiveAnswer[] = activeProjection(safetySteps);
    const persistedSafety: SafetyAnswer[] = safetyActive.map(({ questionId, optionId, answeredAt }) => ({ questionId, optionId, answeredAt }));
    // The browser persists its post-reconciliation projection. R3 reconciles
    // again inside the controller; only answers it retains can be evidence, so
    // a clear that is still in flight can never be cited.
    const reconciled = reconcileSafetyAnswers(
      { complaintId, routingAnswers: session.answers, safetyAnswers: persistedSafety },
      R3_SAFETY_KNOWLEDGE,
    );
    const retainedSafety = new Set(reconciled.retained.map((answer) => answer.questionId));

    const intakeAnswers: IntakeAnswer[] = activeProjection(intakeSteps).map(({ questionId, optionId, answeredAt }) => ({
      questionId,
      optionId,
      answeredAt,
    }));
    const complaint = materialize(complaintId, session.answers);
    const controller = evaluateSafetyController({
      session,
      complaint,
      safetyAnswers: persistedSafety,
      safetyKnowledge: R3_SAFETY_KNOWLEDGE,
      engineConfig: DEMONSTRATION_ENGINE_CONFIG,
    });
    const step = nextInterviewStep({ complaintId, controller, intakeAnswers });

    const allSteps = [...routingSteps, ...safetySteps, ...intakeSteps];
    const latestAnsweredAt = allSteps.length
      ? allSteps.map((entry) => entry.answeredAt).reduce((left, right) => (Date.parse(left) >= Date.parse(right) ? left : right))
      : null;

    return {
      complaintId,
      session,
      safetyAnswers: persistedSafety,
      intakeAnswers,
      controller,
      step,
      routingRecordByQuestion: recordByQuestion,
      safetyRecordByQuestion: new Map(
        safetyActive
          .filter((answer) => retainedSafety.has(answer.questionId))
          .map((answer) => [answer.questionId, answer.recordId]),
      ),
      latestAnsweredAt,
      highWater: {
        routing: highWater(input.routingRows),
        safety: highWater(input.safetyRows),
        intake: highWater(input.intakeRows),
      },
    };
  } catch (error) {
    if (error instanceof TrustedError) throw error;
    throw new TrustedError('INVALID_EVIDENCE');
  }
}

/* --- Safety ------------------------------------------------------------------ */

export interface EvidenceReference {
  table: 'routing_answers' | 'safety_answers';
  recordId: string;
}

export interface DerivedSafetyEvent {
  firedRuleIds: string[];
  selectedRuleId: string;
  ruleVersion: string;
  payloadId: string;
  severity: 'emergency' | 'urgent';
  continuationPolicy: 'must_stop' | 'may_continue_after_acknowledgement';
  evidence: EvidenceReference[];
}

/**
 * The R3 event the server itself reaches, or null when no rule fires. Evidence
 * is the accepted answer record behind every question each fired rule
 * requires, in R3's rule order.
 */
export function deriveSafetyEvent(state: TrustedInterviewState): DerivedSafetyEvent | null {
  const { controller } = state;
  if (controller.status !== 'interrupted') return null;
  const rules = R3_SAFETY_KNOWLEDGE.rules;
  const selected = rules.find((rule) => rule.id === controller.selectedRuleId);
  if (!selected) throw new TrustedError('INTERNAL');

  const evidence: EvidenceReference[] = [];
  const seen = new Set<string>();
  const orderedRuleIds = [controller.selectedRuleId, ...controller.firedRuleIds.filter((id) => id !== controller.selectedRuleId)];
  for (const ruleId of orderedRuleIds) {
    const rule = rules.find((candidate) => candidate.id === ruleId);
    if (!rule) throw new TrustedError('INTERNAL');
    for (const questionId of rule.requiredQuestionIds) {
      const routingRecord = state.routingRecordByQuestion.get(questionId);
      const safetyRecord = state.safetyRecordByQuestion.get(questionId);
      const reference: EvidenceReference | null = routingRecord
        ? { table: 'routing_answers', recordId: routingRecord }
        : safetyRecord
          ? { table: 'safety_answers', recordId: safetyRecord }
          : null;
      if (!reference || seen.has(reference.recordId)) continue;
      seen.add(reference.recordId);
      evidence.push(reference);
    }
  }
  if (evidence.length === 0) throw new TrustedError('INVALID_EVIDENCE');

  return {
    firedRuleIds: [...controller.firedRuleIds],
    selectedRuleId: controller.selectedRuleId,
    ruleVersion: selected.version,
    payloadId: controller.payload.id,
    severity: controller.severity,
    continuationPolicy: controller.continuationPolicy,
    evidence,
  };
}

/* --- Routing ----------------------------------------------------------------- */

export interface DerivedRoutingResult {
  engineTopSpecialtyId: SpecialtyId;
  stopReason: StopReason | 'question_pool_exhausted';
  converged: boolean;
  selectedSpecialtyRegistryId: string;
  belief: Readonly<Record<SpecialtyId, number>>;
  /** Accepted routing answer records, in the order R1 consumed them. */
  supportingAnswerRecordIds: string[];
}

/**
 * The routing result, only when the patient's own screen would be showing the
 * result: R3 not interrupted, screening complete, intake complete, and R1
 * stopped. Otherwise ROUTING_NOT_FINAL.
 */
export function deriveRoutingResult(state: TrustedInterviewState): DerivedRoutingResult {
  const { controller, step, session } = state;
  if (controller.status !== 'result' || step.kind !== 'result') throw new TrustedError('ROUTING_NOT_FINAL');
  const engineTop = controller.routingOutcome.specialtyId;
  const converged = hasPresentableRoute(controller.stoppingDecision, engineTop);
  const selectedSpecialtyRegistryId = converged ? specialtyForEngineId(engineTop).id : GENERAL_MEDICINE.id;

  const supportingAnswerRecordIds = session.answers.map((answer) => {
    const recordId = state.routingRecordByQuestion.get(answer.questionId);
    if (!recordId) throw new TrustedError('INVALID_EVIDENCE');
    return recordId;
  });

  return {
    engineTopSpecialtyId: engineTop,
    stopReason: controller.routingOutcome.stopReason,
    converged,
    selectedSpecialtyRegistryId,
    belief: { ...session.belief },
    supportingAnswerRecordIds,
  };
}
