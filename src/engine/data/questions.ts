import { R2_REQUIREMENT_SOURCE_ID } from './provenance.ts';
import type { BlockedParameter, KnowledgeQuestion } from './types.ts';
import { R2A_ARCHITECTURE_VERSION } from './version.ts';

function blockedLikelihoods(): BlockedParameter {
  return {
    status: 'blocked',
    reason: 'No supported P(answer | specialty) parameterization has been supplied.',
    requiredEvidence: 'Reviewed quantitative evidence for this answer across all six routing specialties.',
    provenanceIds: [R2_REQUIREMENT_SOURCE_ID],
  };
}

function yesNoOptions() {
  return [
    {
      id: 'yes',
      label: 'Yes',
      likelihoods: blockedLikelihoods(),
      provenanceIds: [R2_REQUIREMENT_SOURCE_ID],
    },
    {
      id: 'no',
      label: 'No',
      likelihoods: blockedLikelihoods(),
      provenanceIds: [R2_REQUIREMENT_SOURCE_ID],
    },
  ] as const;
}

export const UPPER_ABDOMINAL_PAIN_QUESTIONS: readonly KnowledgeQuestion[] = [
  {
    id: 'upper-abdominal-pain-exertional',
    text: 'Does the pain get worse with physical activity?',
    options: yesNoOptions(),
    applicability: { kind: 'always' },
    provenanceIds: [R2_REQUIREMENT_SOURCE_ID],
    knowledgeVersion: R2A_ARCHITECTURE_VERSION,
  },
  {
    id: 'upper-abdominal-pain-sweating',
    text: 'Have you also been sweating unexpectedly?',
    options: yesNoOptions(),
    applicability: {
      kind: 'answer_equals',
      questionId: 'upper-abdominal-pain-exertional',
      optionId: 'yes',
    },
    provenanceIds: [R2_REQUIREMENT_SOURCE_ID],
    knowledgeVersion: R2A_ARCHITECTURE_VERSION,
  },
  {
    id: 'upper-abdominal-pain-meal-relation',
    text: 'Does the pain seem related to eating?',
    options: yesNoOptions(),
    applicability: {
      kind: 'answer_equals',
      questionId: 'upper-abdominal-pain-exertional',
      optionId: 'no',
    },
    provenanceIds: [R2_REQUIREMENT_SOURCE_ID],
    knowledgeVersion: R2A_ARCHITECTURE_VERSION,
  },
];
