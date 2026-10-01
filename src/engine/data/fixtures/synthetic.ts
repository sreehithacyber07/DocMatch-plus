import { ENGINE_VERSION } from '../../config.ts';
import { SPECIALTY_IDS } from '../../specialties.ts';
import type { Belief } from '../../types.ts';
import type { KnowledgeAnswerOption, KnowledgeBase, ProvenanceSource } from '../types.ts';

const SYNTHETIC_KNOWLEDGE_VERSION = 'synthetic-r2-fixture-v1';
const SYNTHETIC_SOURCE_ID = 'synthetic-r2-test-source';

function belief(values: readonly [number, number, number, number, number, number]): Belief {
  return Object.fromEntries(SPECIALTY_IDS.map((specialtyId, index) => [specialtyId, values[index]])) as Belief;
}

function option(id: string, label: string, likelihoods: Belief): KnowledgeAnswerOption {
  return {
    id,
    label,
    likelihoods: {
      status: 'ready',
      value: likelihoods,
      provenanceIds: [SYNTHETIC_SOURCE_ID],
      parameterStatus: 'synthetic_only',
    },
    provenanceIds: [SYNTHETIC_SOURCE_ID],
  };
}

const source: ProvenanceSource = {
  id: SYNTHETIC_SOURCE_ID,
  organization: 'DocMatch+ engineering',
  title: 'Synthetic R2 validation fixture',
  sourceType: 'synthetic_fixture',
  reference: 'Local deterministic test fixture',
  scope: 'Mathematical and control-flow tests only; contains no clinical evidence.',
  reviewStatus: 'reviewed',
  evidenceStatus: 'synthetic_only',
  version: '1',
};

export const SYNTHETIC_R2_KNOWLEDGE: KnowledgeBase = {
  mode: 'synthetic',
  knowledgeVersion: SYNTHETIC_KNOWLEDGE_VERSION,
  compatibleEngineVersion: ENGINE_VERSION,
  sources: [source],
  complaints: [
    {
      id: 'synthetic-r2-complaint',
      label: 'Synthetic routing input',
      prior: {
        status: 'ready',
        value: belief([1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6]),
        provenanceIds: [SYNTHETIC_SOURCE_ID],
        parameterStatus: 'synthetic_only',
      },
      questionIds: ['synthetic-r2-entry-signal', 'synthetic-r2-follow-up-signal'],
      provenanceIds: [SYNTHETIC_SOURCE_ID],
      knowledgeVersion: SYNTHETIC_KNOWLEDGE_VERSION,
    },
  ],
  questions: [
    {
      id: 'synthetic-r2-entry-signal',
      text: 'Synthetic entry signal?',
      options: [
        option('pattern-alpha', 'Synthetic pattern alpha', belief([0.7, 0.6, 0.55, 0.45, 0.4, 0.3])),
        option('pattern-beta', 'Synthetic pattern beta', belief([0.3, 0.4, 0.45, 0.55, 0.6, 0.7])),
      ],
      applicability: { kind: 'always' },
      provenanceIds: [SYNTHETIC_SOURCE_ID],
      knowledgeVersion: SYNTHETIC_KNOWLEDGE_VERSION,
    },
    {
      id: 'synthetic-r2-follow-up-signal',
      text: 'Synthetic follow-up signal?',
      options: [
        option('follow-up-alpha', 'Synthetic follow-up alpha', belief([0.65, 0.55, 0.5, 0.5, 0.45, 0.35])),
        option('follow-up-beta', 'Synthetic follow-up beta', belief([0.35, 0.45, 0.5, 0.5, 0.55, 0.65])),
      ],
      applicability: {
        kind: 'answer_equals',
        questionId: 'synthetic-r2-entry-signal',
        optionId: 'pattern-alpha',
      },
      provenanceIds: [SYNTHETIC_SOURCE_ID],
      knowledgeVersion: SYNTHETIC_KNOWLEDGE_VERSION,
    },
  ],
};
