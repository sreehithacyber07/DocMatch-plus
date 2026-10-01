import { answerSessionQuestion, createRoutingSession } from '../session.ts';
import type { RecordedAnswer, RoutingSession } from '../types.ts';
import { materializeDemonstrationComplaint } from '../data/materialize.ts';
import { R2B_DEMONSTRATION_KNOWLEDGE } from '../data/demonstration/knowledge.ts';
import { DEMONSTRATION_ENGINE_CONFIG } from '../data/demonstration/policy.ts';
import type { AnswerSnapshot, MaterializedComplaint } from '../data/types.ts';
import { appendSafetyAuditEvent, createSafetyInterruptionAuditEvent, createSafetyScreeningAuditEvent } from './audit.ts';
import { recordSafetyAnswer } from './answers.ts';
import { evaluateSafetyController } from './controller.ts';
import { R3_SAFETY_KNOWLEDGE } from './knowledge.ts';
import type {
  SafetyAnswer,
  SafetyAuditEvent,
  SafetyControllerResult,
  SafetyRegressionDecision,
  SafetyRegressionResult,
} from './types.ts';

interface SafetyRegressionScenario {
  id: string;
  title: string;
  complaintId: string;
  answerPlan: Readonly<Record<string, string>>;
  expectedFinalStatus: 'interrupted' | 'result';
  expectedRuleIds: readonly string[];
}

const SCENARIOS: readonly SafetyRegressionScenario[] = [
  {
    id: 'r3-a-upper-abdominal-emergency-interruption',
    title: 'Upper abdominal discomfort with exertional worsening and unexpected sweating',
    complaintId: 'upper-abdominal-pain',
    answerPlan: {
      'upper-abdominal-pain-exertional': 'yes',
      'upper-abdominal-pain-sweating': 'yes',
    },
    expectedFinalStatus: 'interrupted',
    expectedRuleIds: ['upper-abdominal-exertional-associated-warning'],
  },
  {
    id: 'r3-b-severe-breathing-emergency-interruption',
    title: 'Shortness of breath with severe difficulty speaking',
    complaintId: 'shortness-of-breath',
    answerPlan: {
      'safety-shortness-of-breath-severe': 'yes',
    },
    expectedFinalStatus: 'interrupted',
    expectedRuleIds: ['breathing-severe-inability-to-speak'],
  },
  {
    id: 'r3-c-headache-neurological-emergency-interruption',
    title: 'Headache with new one-sided weakness after a negative sudden-onset screen',
    complaintId: 'headache',
    answerPlan: {
      'safety-headache-sudden-extremely-painful': 'no',
      'safety-headache-new-one-sided-weakness': 'yes',
    },
    expectedFinalStatus: 'interrupted',
    expectedRuleIds: ['headache-new-one-sided-weakness'],
  },
  {
    id: 'r3-d-negative-safety-screens-return-to-routing',
    title: 'Joint or muscle pain with negative safety screens and ordinary orthopedics routing',
    complaintId: 'joint-musculoskeletal-pain',
    answerPlan: {
      'joint-musculoskeletal-pain-injury': 'no',
      'safety-joint-sudden-hot-swollen': 'no',
      'joint-musculoskeletal-pain-activity-related': 'yes',
      'joint-musculoskeletal-pain-morning-stiffness': 'yes',
      'joint-musculoskeletal-pain-spasm': 'yes',
      'joint-musculoskeletal-pain-swelling-bruising': 'yes',
      'joint-musculoskeletal-pain-use-weight': 'yes',
    },
    expectedFinalStatus: 'result',
    expectedRuleIds: [],
  },
];

function timestamp(step: number): string {
  return `2026-09-10T00:00:${String(step).padStart(2, '0')}.000Z`;
}

function snapshots(answers: readonly RecordedAnswer[]): AnswerSnapshot[] {
  return answers.map((answer) => ({ questionId: answer.questionId, optionId: answer.optionId }));
}

function materialize(session: Readonly<RoutingSession>): MaterializedComplaint {
  return materializeDemonstrationComplaint(
    R2B_DEMONSTRATION_KNOWLEDGE,
    session.presentingComplaintId,
    snapshots(session.answers),
  );
}

function createSession(complaintId: string): RoutingSession {
  const complaint = materializeDemonstrationComplaint(R2B_DEMONSTRATION_KNOWLEDGE, complaintId, []);
  return createRoutingSession(complaintId, complaint.prior, timestamp(0));
}

function controllerResult(session: Readonly<RoutingSession>, safetyAnswers: readonly SafetyAnswer[]): SafetyControllerResult {
  return evaluateSafetyController({
    session,
    complaint: materialize(session),
    safetyAnswers,
    safetyKnowledge: R3_SAFETY_KNOWLEDGE,
    engineConfig: DEMONSTRATION_ENGINE_CONFIG,
  });
}

function traceDecision(
  result: SafetyControllerResult,
  session: Readonly<RoutingSession>,
): SafetyRegressionDecision {
  const selectedQuestionId =
    result.status === 'safety-screening'
      ? result.question.id
      : result.status === 'question'
        ? result.selection.questionId
        : null;
  return {
    status: result.status,
    currentAnswers: [
      ...session.answers.map((answer) => ({ questionId: answer.questionId, optionId: answer.optionId })),
      ...result.safetyState.retainedSafetyAnswers.map((answer) => ({ questionId: answer.questionId, optionId: answer.optionId })),
    ].toSorted((left, right) => left.questionId.localeCompare(right.questionId)),
    liveQuestionIds: [...result.safetyState.liveQuestionIds],
    firedRuleIds: [...result.safetyState.firedRuleIds],
    selectedQuestionId,
    informationGain: result.status === 'question' ? result.selection.informationGain : null,
    informationGainBypassed: result.status === 'safety-screening' || result.status === 'interrupted',
    payloadId: result.status === 'interrupted' ? result.payload.id : null,
    continuationPolicy: result.status === 'interrupted' ? result.continuationPolicy : null,
    routingBelief: { ...session.belief },
    routingAskedQuestionIds: [...session.askedQuestionIds],
    provenanceIds: [...result.audit.provenanceIds],
  };
}

function answerSelectedQuestion(
  result: Extract<SafetyControllerResult, { status: 'safety-screening' | 'question' }>,
  optionId: string,
  step: number,
  session: Readonly<RoutingSession>,
  safetyAnswers: readonly SafetyAnswer[],
): { session: RoutingSession; safetyAnswers: SafetyAnswer[] } {
  const question = result.status === 'safety-screening'
    ? result.question
    : {
        id: result.selection.question.id,
        text: result.selection.question.text,
        options: result.selection.question.options.map((option) => ({ id: option.id, label: option.label })),
        answerTarget: 'routing_session' as const,
        provenanceIds: [] as readonly string[],
      };
  const answer = { questionId: question.id, optionId, answeredAt: timestamp(step) };
  if (question.answerTarget === 'safety_state') {
    return { session: structuredClone(session), safetyAnswers: recordSafetyAnswer(safetyAnswers, question, answer) };
  }
  return {
    session: answerSessionQuestion(session, answer, materialize(session).questions, DEMONSTRATION_ENGINE_CONFIG.posteriorFloor),
    safetyAnswers: safetyAnswers.map((candidate) => ({ ...candidate })),
  };
}

function runScenario(scenario: SafetyRegressionScenario): SafetyRegressionResult {
  let session = createSession(scenario.complaintId);
  let safetyAnswers: SafetyAnswer[] = [];
  let auditHistory: SafetyAuditEvent[] = [];
  const decisions: SafetyRegressionDecision[] = [];
  let final: SafetyControllerResult | null = null;

  for (let step = 1; step <= 30; step += 1) {
    const result = controllerResult(session, safetyAnswers);
    decisions.push(traceDecision(result, session));
    if (result.status === 'interrupted') {
      auditHistory = appendSafetyAuditEvent(
        auditHistory,
        createSafetyInterruptionAuditEvent(result, {
          eventId: `${scenario.id}-interruption`,
          timestamp: timestamp(step),
          sessionReference: scenario.id,
        }),
      );
      final = result;
      break;
    }
    if (result.status === 'result') {
      final = result;
      break;
    }
    if (result.status === 'safety-screening') {
      auditHistory = appendSafetyAuditEvent(
        auditHistory,
        createSafetyScreeningAuditEvent(result, {
          eventId: `${scenario.id}-screen-${step}`,
          timestamp: timestamp(step),
          sessionReference: scenario.id,
        }),
      );
    }
    const questionId = result.status === 'safety-screening' ? result.question.id : result.selection.questionId;
    const optionId = scenario.answerPlan[questionId];
    if (!optionId) throw new TypeError(`Scenario ${scenario.id} has no answer for selected question ${questionId}.`);
    ({ session, safetyAnswers } = answerSelectedQuestion(result, optionId, step, session, safetyAnswers));
  }

  if (!final) throw new Error(`Scenario ${scenario.id} did not terminate.`);
  if (final.status !== scenario.expectedFinalStatus) {
    throw new Error(`Scenario ${scenario.id} expected ${scenario.expectedFinalStatus} but received ${final.status}.`);
  }
  const firedRuleIds = final.status === 'interrupted' ? final.firedRuleIds : [];
  if (JSON.stringify(firedRuleIds) !== JSON.stringify(scenario.expectedRuleIds)) {
    throw new Error(`Scenario ${scenario.id} fired unexpected rules: ${firedRuleIds.join(', ')}.`);
  }

  return {
    scenarioId: scenario.id,
    title: scenario.title,
    complaintId: scenario.complaintId,
    decisions,
    finalStatus: final.status,
    finalRoutingSpecialty: final.status === 'result' ? final.routingOutcome.specialtyId : null,
    firedRuleIds,
    auditHistory,
    engineVersion: final.audit.engineVersion,
    knowledgeVersion: final.audit.knowledgeVersion,
    safetyVersion: final.audit.safetyVersion,
  };
}

export function runReplaySafetyRegression(): SafetyRegressionResult {
  const scenarioId = 'r3-e-answer-change-clears-current-safety-state';
  let session = createSession('upper-abdominal-pain');
  let safetyAnswers: SafetyAnswer[] = [];
  let auditHistory: SafetyAuditEvent[] = [];
  const decisions: SafetyRegressionDecision[] = [];

  const first = controllerResult(session, safetyAnswers);
  if (first.status !== 'safety-screening' || first.question.id !== 'upper-abdominal-pain-exertional') {
    throw new Error('Replay scenario expected the exertional safety screen first.');
  }
  decisions.push(traceDecision(first, session));
  auditHistory = appendSafetyAuditEvent(
    auditHistory,
    createSafetyScreeningAuditEvent(first, { eventId: `${scenarioId}-screen-1`, timestamp: timestamp(1), sessionReference: scenarioId }),
  );
  ({ session, safetyAnswers } = answerSelectedQuestion(first, 'yes', 1, session, safetyAnswers));

  const second = controllerResult(session, safetyAnswers);
  if (second.status !== 'safety-screening' || second.question.id !== 'upper-abdominal-pain-sweating') {
    throw new Error('Replay scenario expected the sweating safety screen after exertional worsening.');
  }
  decisions.push(traceDecision(second, session));
  auditHistory = appendSafetyAuditEvent(
    auditHistory,
    createSafetyScreeningAuditEvent(second, { eventId: `${scenarioId}-screen-2`, timestamp: timestamp(2), sessionReference: scenarioId }),
  );
  ({ session, safetyAnswers } = answerSelectedQuestion(second, 'no', 2, session, safetyAnswers));

  const third = controllerResult(session, safetyAnswers);
  if (third.status !== 'safety-screening' || third.question.id !== 'upper-abdominal-pain-breathlessness') {
    throw new Error('Replay scenario expected the breathlessness safety screen after a negative sweating answer.');
  }
  decisions.push(traceDecision(third, session));
  auditHistory = appendSafetyAuditEvent(
    auditHistory,
    createSafetyScreeningAuditEvent(third, { eventId: `${scenarioId}-screen-3`, timestamp: timestamp(3), sessionReference: scenarioId }),
  );
  ({ session, safetyAnswers } = answerSelectedQuestion(third, 'no', 3, session, safetyAnswers));

  const replacement: RecordedAnswer = {
    questionId: 'upper-abdominal-pain-exertional',
    optionId: 'no',
    answeredAt: timestamp(4),
  };
  const proposedAnswers = session.answers.map((answer) =>
    answer.questionId === replacement.questionId ? replacement : { ...answer },
  );
  const replayKnowledge = materializeDemonstrationComplaint(
    R2B_DEMONSTRATION_KNOWLEDGE,
    session.presentingComplaintId,
    snapshots(proposedAnswers),
  );
  session = answerSessionQuestion(
    session,
    replacement,
    replayKnowledge.questions,
    DEMONSTRATION_ENGINE_CONFIG.posteriorFloor,
  );

  const final = controllerResult(session, safetyAnswers);
  decisions.push(traceDecision(final, session));
  if (final.status !== 'question') throw new Error(`Replay scenario expected ordinary routing but received ${final.status}.`);
  if (final.safetyState.firedRuleIds.length > 0 || final.safetyState.unscreenedQuestionIds.length > 0) {
    throw new Error('Replay scenario retained stale current safety state.');
  }
  if (auditHistory.length !== 3) throw new Error('Replay scenario lost historical screening audit events.');

  return {
    scenarioId,
    title: 'Changing exertional worsening to no clears the dependent current safety state',
    complaintId: 'upper-abdominal-pain',
    decisions,
    finalStatus: final.status,
    finalRoutingSpecialty: null,
    firedRuleIds: [],
    auditHistory,
    engineVersion: final.audit.engineVersion,
    knowledgeVersion: final.audit.knowledgeVersion,
    safetyVersion: final.audit.safetyVersion,
  };
}

export function runAllSafetyRegressions(): SafetyRegressionResult[] {
  return [...SCENARIOS.map(runScenario), runReplaySafetyRegression()];
}

function formatAnswers(answers: SafetyRegressionDecision['currentAnswers']): string {
  return answers.length === 0 ? 'none' : answers.map((answer) => `${answer.questionId}=${answer.optionId}`).join(', ');
}

export function formatSafetyRegression(result: SafetyRegressionResult): string {
  const lines = [
    'EVIDENCE-GROUNDED DEMONSTRATION — NOT CLINICALLY VALIDATED',
    `SCENARIO ${result.scenarioId}`,
    `complaint=${result.complaintId}`,
    `engineVersion=${result.engineVersion}`,
    `knowledgeVersion=${result.knowledgeVersion}`,
    `safetyVersion=${result.safetyVersion}`,
  ];
  result.decisions.forEach((decision, index) => {
    lines.push(
      `decision=${index + 1}`,
      `currentAnswers=${formatAnswers(decision.currentAnswers)}`,
      `liveSafetyQuestions=${decision.liveQuestionIds.join(',') || 'none'}`,
      `firedRules=${decision.firedRuleIds.join(',') || 'none'}`,
      `controllerStatus=${decision.status}`,
      `selectedQuestion=${decision.selectedQuestionId ?? 'none'}`,
      `informationGain=${decision.informationGain === null ? 'bypassed-or-not-applicable' : decision.informationGain.toFixed(6)}`,
      `informationGainBypassed=${decision.informationGainBypassed}`,
      `payload=${decision.payloadId ?? 'none'}`,
      `continuationPolicy=${decision.continuationPolicy ?? 'none'}`,
      `routingAsked=${decision.routingAskedQuestionIds.join(',') || 'none'}`,
      `provenanceIds=${decision.provenanceIds.join(',')}`,
    );
  });
  lines.push(
    `finalStatus=${result.finalStatus}`,
    `finalRoutingSpecialty=${result.finalRoutingSpecialty ?? 'none'}`,
    `finalFiredRules=${result.firedRuleIds.join(',') || 'none'}`,
    `auditEventCount=${result.auditHistory.length}`,
  );
  return lines.join('\n');
}
