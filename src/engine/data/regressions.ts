import { ENGINE_VERSION } from '../config.ts';
import type { BlockedRegressionScenario } from './types.ts';
import { KNOWLEDGE_VERSION } from './version.ts';

const PARAMETER_BLOCKERS = [
  'Reviewed complaint-specific routing prior is missing.',
  'Reviewed P(answer | specialty) values are missing.',
] as const;

export const R2_REGRESSION_SCENARIOS: readonly BlockedRegressionScenario[] = [
  {
    id: 'upper-abdominal-pain-cardiology-direction',
    title: 'Upper abdominal pain: exertional worsening and sweating',
    complaintId: 'upper-abdominal-pain',
    answerPath: [
      { questionId: 'upper-abdominal-pain-exertional', optionId: 'yes' },
      { questionId: 'upper-abdominal-pain-sweating', optionId: 'yes' },
    ],
    expectedRoutingDirection: 'cardiology',
    expectedBehaviorSource: 'Founder-supplied R2 routing regression requirement; not clinical evidence.',
    status: 'blocked_clinical_parameterization_required',
    blockers: PARAMETER_BLOCKERS,
  },
  {
    id: 'upper-abdominal-pain-gastroenterology-direction',
    title: 'Upper abdominal pain: no exertional worsening and meal relation',
    complaintId: 'upper-abdominal-pain',
    answerPath: [
      { questionId: 'upper-abdominal-pain-exertional', optionId: 'no' },
      { questionId: 'upper-abdominal-pain-meal-relation', optionId: 'yes' },
    ],
    expectedRoutingDirection: 'gastroenterology',
    expectedBehaviorSource: 'Founder-supplied R2 routing regression requirement; not clinical evidence.',
    status: 'blocked_clinical_parameterization_required',
    blockers: PARAMETER_BLOCKERS,
  },
  {
    id: 'candidate-shortness-of-breath-route',
    title: 'Candidate complaint: shortness of breath',
    complaintId: 'shortness-of-breath',
    answerPath: [],
    expectedRoutingDirection: null,
    expectedBehaviorSource: 'Candidate only; complaint scope requires founder and clinical approval.',
    status: 'blocked_clinical_parameterization_required',
    blockers: ['Complaint selection, questions, prior, likelihoods, and provenance are required.'],
  },
  {
    id: 'candidate-headache-route',
    title: 'Candidate complaint: headache',
    complaintId: 'headache',
    answerPath: [],
    expectedRoutingDirection: null,
    expectedBehaviorSource: 'Candidate only; complaint scope requires founder and clinical approval.',
    status: 'blocked_clinical_parameterization_required',
    blockers: ['Complaint selection, questions, prior, likelihoods, and provenance are required.'],
  },
];

export function formatRegressionScenarios(scenarios = R2_REGRESSION_SCENARIOS): string {
  return scenarios
    .map((scenario) => {
      const answerPath =
        scenario.answerPath.length === 0
          ? 'BLOCKED: no approved question path'
          : scenario.answerPath.map((answer) => `${answer.questionId}=${answer.optionId}`).join(' -> ');
      return [
        `RUN ${scenario.id}`,
        `title=${scenario.title}`,
        `complaint=${scenario.complaintId}`,
        `engineVersion=${ENGINE_VERSION}`,
        `knowledgeVersion=${KNOWLEDGE_VERSION}`,
        'startingPrior=BLOCKED: clinical parameterization required',
        'selectedQuestions=BLOCKED: information-gain selection cannot run without parameters',
        `scenarioAnswerPath=${answerPath}`,
        'informationGain=BLOCKED',
        'posterior=BLOCKED',
        'entropy=BLOCKED',
        'stoppingDecision=BLOCKED',
        `expectedRoutingDirection=${scenario.expectedRoutingDirection ?? 'BLOCKED: not approved'}`,
        'finalRoutingOutcome=BLOCKED: no engine result was fabricated',
        `provenanceState=${scenario.expectedBehaviorSource}`,
        `status=${scenario.status}`,
        `blockers=${scenario.blockers.join(' | ')}`,
      ].join('\n');
    })
    .join('\n\n');
}
