import { updateBelief } from '../../belief.ts';
import { entropy } from '../../entropy.ts';
import { selectNextQuestion } from '../../questions.ts';
import { SPECIALTY_IDS, type SpecialtyId } from '../../specialties.ts';
import { shouldStop } from '../../stopping.ts';
import type { Belief } from '../../types.ts';
import { createDemonstrationAuditEnvelope, materializeDemonstrationComplaint } from '../materialize.ts';
import type {
  AnswerSnapshot,
  DemonstrationRegressionResult,
  DemonstrationRegressionScenario,
} from '../types.ts';
import { R2B_DEMONSTRATION_KNOWLEDGE } from './knowledge.ts';
import { DEMONSTRATION_ENGINE_CONFIG } from './policy.ts';

export const R2B_REGRESSION_SCENARIOS: readonly DemonstrationRegressionScenario[] = [
  {
    id: 'upper-abdominal-pain-cardiology-direction',
    title: 'Upper abdominal pain with exertional worsening and unexpected sweating',
    complaintId: 'upper-abdominal-pain',
    answerPlan: {
      'upper-abdominal-pain-exertional': 'yes',
      'upper-abdominal-pain-sweating': 'yes',
      'upper-abdominal-pain-breathlessness': 'yes',
      'upper-abdominal-pain-burning': 'no',
      'upper-abdominal-pain-nausea-vomiting': 'no',
    },
    requiredAnswers: [
      { questionId: 'upper-abdominal-pain-exertional', optionId: 'yes' },
      { questionId: 'upper-abdominal-pain-sweating', optionId: 'yes' },
    ],
    expectedRoutingDirection: 'cardiology',
  },
  {
    id: 'upper-abdominal-pain-gastroenterology-direction',
    title: 'Upper abdominal pain without exertional worsening and with meal relation',
    complaintId: 'upper-abdominal-pain',
    answerPlan: {
      'upper-abdominal-pain-exertional': 'no',
      'upper-abdominal-pain-meal-relation': 'yes',
      'upper-abdominal-pain-breathlessness': 'no',
      'upper-abdominal-pain-burning': 'yes',
      'upper-abdominal-pain-nausea-vomiting': 'yes',
    },
    requiredAnswers: [
      { questionId: 'upper-abdominal-pain-exertional', optionId: 'no' },
      { questionId: 'upper-abdominal-pain-meal-relation', optionId: 'yes' },
    ],
    expectedRoutingDirection: 'gastroenterology',
  },
  {
    id: 'shortness-of-breath-pulmonology-direction',
    title: 'Shortness of breath with respiratory-pattern answers',
    complaintId: 'shortness-of-breath',
    answerPlan: {
      'shortness-of-breath-ankle-swelling': 'no',
      'shortness-of-breath-cough': 'yes',
      'shortness-of-breath-night-variation': 'yes',
      'shortness-of-breath-palpitations': 'no',
      'shortness-of-breath-lying-flat': 'no',
      'shortness-of-breath-wheeze': 'yes',
    },
    requiredAnswers: [
      { questionId: 'shortness-of-breath-wheeze', optionId: 'yes' },
      { questionId: 'shortness-of-breath-lying-flat', optionId: 'no' },
    ],
    expectedRoutingDirection: 'pulmonology',
  },
  {
    id: 'joint-musculoskeletal-pain-orthopedics-direction',
    title: 'Joint or muscle pain with activity and injury-pattern answers',
    complaintId: 'joint-musculoskeletal-pain',
    answerPlan: {
      'joint-musculoskeletal-pain-activity-related': 'yes',
      'joint-musculoskeletal-pain-injury': 'yes',
      'joint-musculoskeletal-pain-morning-stiffness': 'yes',
      'joint-musculoskeletal-pain-spasm': 'yes',
      'joint-musculoskeletal-pain-swelling-bruising': 'yes',
      'joint-musculoskeletal-pain-use-weight': 'yes',
    },
    requiredAnswers: [
      { questionId: 'joint-musculoskeletal-pain-injury', optionId: 'yes' },
      { questionId: 'joint-musculoskeletal-pain-use-weight', optionId: 'yes' },
    ],
    expectedRoutingDirection: 'orthopedics',
  },
];

function leadingSpecialty(belief: Belief): SpecialtyId {
  return SPECIALTY_IDS
    .map((specialtyId) => ({ specialtyId, probability: belief[specialtyId] }))
    .toSorted((left, right) => right.probability - left.probability || left.specialtyId.localeCompare(right.specialtyId))[0]
    .specialtyId;
}

export function runDemonstrationRegression(
  scenario: DemonstrationRegressionScenario,
): DemonstrationRegressionResult {
  const initial = materializeDemonstrationComplaint(R2B_DEMONSTRATION_KNOWLEDGE, scenario.complaintId, []);
  let belief = { ...initial.prior };
  const answers: AnswerSnapshot[] = [];
  const askedQuestionIds: string[] = [];
  const steps: DemonstrationRegressionResult['steps'] = [];

  while (true) {
    const materialized = materializeDemonstrationComplaint(
      R2B_DEMONSTRATION_KNOWLEDGE,
      scenario.complaintId,
      answers,
    );
    const selection = selectNextQuestion(
      belief,
      askedQuestionIds,
      materialized.questions,
      DEMONSTRATION_ENGINE_CONFIG.posteriorFloor,
    );
    if (!selection) break;
    const answerId = scenario.answerPlan[selection.questionId];
    if (!answerId) throw new TypeError(`Scenario ${scenario.id} has no answer for selected question ${selection.questionId}.`);
    const option = selection.question.options.find((candidate) => candidate.id === answerId);
    if (!option) throw new TypeError(`Scenario ${scenario.id} references invalid answer ${answerId} for ${selection.questionId}.`);

    const priorBelief = { ...belief };
    belief = updateBelief(belief, option, DEMONSTRATION_ENGINE_CONFIG.posteriorFloor);
    answers.push({ questionId: selection.questionId, optionId: answerId });
    askedQuestionIds.push(selection.questionId);
    const stoppingDecision = shouldStop(belief, askedQuestionIds.length, DEMONSTRATION_ENGINE_CONFIG);
    steps.push({
      questionId: selection.questionId,
      questionText: selection.question.text,
      answerId,
      answerLabel: option.label,
      informationGain: selection.informationGain,
      priorBelief,
      posteriorBelief: { ...belief },
      entropy: entropy(belief),
      leadingSpecialty: leadingSpecialty(belief),
      stoppingDecision,
    });
    if (stoppingDecision.shouldStop) break;
  }

  for (const required of scenario.requiredAnswers) {
    if (!answers.some((answer) => answer.questionId === required.questionId && answer.optionId === required.optionId)) {
      throw new Error(`Scenario ${scenario.id} did not reach required answer ${required.questionId}=${required.optionId}.`);
    }
  }

  const finalRoutingDirection = leadingSpecialty(belief);
  return {
    scenarioId: scenario.id,
    title: scenario.title,
    complaintId: scenario.complaintId,
    audit: createDemonstrationAuditEnvelope(R2B_DEMONSTRATION_KNOWLEDGE, scenario.complaintId),
    initialBelief: { ...initial.prior },
    steps,
    finalRoutingDirection,
    expectedRoutingDirection: scenario.expectedRoutingDirection,
    expectationMet: finalRoutingDirection === scenario.expectedRoutingDirection,
  };
}

function formatNumber(value: number): string {
  return value.toFixed(6);
}

function formatBelief(belief: Belief): string {
  return SPECIALTY_IDS.map((specialtyId) => `${specialtyId}:${formatNumber(belief[specialtyId])}`).join(', ');
}

export function formatDemonstrationRegression(result: DemonstrationRegressionResult): string {
  const lines = [
    'FOR DEMONSTRATION ONLY — NOT CLINICALLY VALIDATED',
    `RUN ${result.scenarioId}`,
    `complaint=${result.complaintId}`,
    `parameterizationStatus=${result.audit.parameterizationStatus}`,
    `evidenceStatus=${result.audit.evidenceStatus}`,
    `engineVersion=${result.audit.engineVersion}`,
    `knowledgeVersion=${result.audit.knowledgeVersion}`,
    `initialBelief=${formatBelief(result.initialBelief)}`,
  ];
  result.steps.forEach((step, index) => {
    lines.push(
      `step=${index + 1}`,
      `question=${step.questionId}`,
      `informationGain=${formatNumber(step.informationGain)}`,
      `answer=${step.answerId}`,
      `posterior=${formatBelief(step.posteriorBelief)}`,
      `entropy=${formatNumber(step.entropy)}`,
      `leadingSpecialty=${step.leadingSpecialty}`,
      `stoppingDecision=${step.stoppingDecision.shouldStop} reason=${step.stoppingDecision.reason ?? 'none'}`,
    );
  });
  lines.push(
    `finalRoutingDirection=${result.finalRoutingDirection}`,
    `expectedRoutingDirection=${result.expectedRoutingDirection}`,
    `expectationMet=${result.expectationMet}`,
  );
  return lines.join('\n');
}

export function runAllDemonstrationRegressions(): DemonstrationRegressionResult[] {
  return R2B_REGRESSION_SCENARIOS.map(runDemonstrationRegression);
}
