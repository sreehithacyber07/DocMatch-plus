import { SPECIALTY_IDS } from '../specialties.ts';
import type { Belief, EngineConfig, Question } from '../types.ts';

type SixValues = readonly [number, number, number, number, number, number];

export function syntheticBelief(values: SixValues): Belief {
  return Object.fromEntries(SPECIALTY_IDS.map((specialtyId, index) => [specialtyId, values[index]])) as Belief;
}

export const SYNTHETIC_COMPLAINT_ID = 'synthetic-routing-demo';
export const SYNTHETIC_INITIAL_BELIEF = syntheticBelief([1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6]);

export const SYNTHETIC_ENGINE_CONFIG: EngineConfig = {
  posteriorFloor: 0.02,
  topProbabilityThreshold: 0.85,
  marginThreshold: 0.55,
  maxQuestions: 4,
};

export const SYNTHETIC_QUESTION_BANK: Question[] = [
  {
    id: 'synthetic-orientation-signal',
    text: 'Synthetic signal A',
    appliesWhen: (_belief, asked) => asked.length === 0,
    options: [
      { id: 'signal-north', label: 'Synthetic pattern north', likelihoods: syntheticBelief([0.7, 0.6, 0.55, 0.35, 0.3, 0.2]) },
      { id: 'signal-south', label: 'Synthetic pattern south', likelihoods: syntheticBelief([0.3, 0.4, 0.45, 0.65, 0.7, 0.8]) },
    ],
  },
  {
    id: 'synthetic-texture-signal',
    text: 'Synthetic signal B',
    appliesWhen: (_belief, asked) => asked.includes('synthetic-orientation-signal'),
    options: [
      { id: 'texture-a', label: 'Synthetic texture A', likelihoods: syntheticBelief([0.65, 0.3, 0.6, 0.4, 0.55, 0.25]) },
      { id: 'texture-b', label: 'Synthetic texture B', likelihoods: syntheticBelief([0.35, 0.7, 0.4, 0.6, 0.45, 0.75]) },
    ],
  },
  {
    id: 'synthetic-tempo-signal',
    text: 'Synthetic signal C',
    appliesWhen: (_belief, asked) => asked.includes('synthetic-texture-signal'),
    options: [
      { id: 'tempo-steady', label: 'Synthetic tempo steady', likelihoods: syntheticBelief([0.45, 0.65, 0.3, 0.7, 0.4, 0.55]) },
      { id: 'tempo-variable', label: 'Synthetic tempo variable', likelihoods: syntheticBelief([0.55, 0.35, 0.7, 0.3, 0.6, 0.45]) },
    ],
  },
];

export const SYNTHETIC_BRANCH_QUESTION: Question = {
  id: 'synthetic-positive-branch',
  text: 'Synthetic branch-only signal',
  appliesWhen: (belief, asked) =>
    asked.includes('synthetic-orientation-signal') && belief[SPECIALTY_IDS[0]] > belief[SPECIALTY_IDS[5]],
  options: [
    { id: 'branch-open', label: 'Synthetic branch open', likelihoods: syntheticBelief([0.8, 0.5, 0.5, 0.5, 0.5, 0.2]) },
    { id: 'branch-closed', label: 'Synthetic branch closed', likelihoods: syntheticBelief([0.2, 0.5, 0.5, 0.5, 0.5, 0.8]) },
  ],
};
