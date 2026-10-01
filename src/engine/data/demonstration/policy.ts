import { SPECIALTY_IDS, type SpecialtyId } from '../../specialties.ts';
import type { Belief, EngineConfig } from '../../types.ts';
import type { ApplicabilityRule, KnowledgeAnswerOption, KnowledgeQuestion, PriorParameter } from '../types.ts';
import { KNOWLEDGE_VERSION } from '../version.ts';
import { DEMONSTRATION_POLICY_SOURCE_ID } from './sources.ts';

export type RelationshipStrength = 'strong' | 'moderate' | 'mild' | 'neutral';
export type PriorTier = 'primary' | 'secondary' | 'baseline';

export const DEMONSTRATION_YES_PROBABILITY: Readonly<Record<RelationshipStrength, number>> = {
  strong: 0.72,
  moderate: 0.62,
  mild: 0.56,
  neutral: 0.5,
};

export const DEMONSTRATION_PRIOR_WEIGHT: Readonly<Record<PriorTier, number>> = {
  primary: 2,
  secondary: 1.5,
  baseline: 1,
};

export const DEMONSTRATION_ENGINE_CONFIG: EngineConfig = {
  posteriorFloor: 0.02,
  topProbabilityThreshold: 0.72,
  marginThreshold: 0.35,
  maxQuestions: 5,
};

function beliefFromValues(values: Readonly<Record<SpecialtyId, number>>): Belief {
  return Object.fromEntries(SPECIALTY_IDS.map((specialtyId) => [specialtyId, values[specialtyId]])) as Belief;
}

export function directionalStrengths(overrides: Partial<Record<SpecialtyId, RelationshipStrength>>): Record<SpecialtyId, RelationshipStrength> {
  return Object.fromEntries(SPECIALTY_IDS.map((specialtyId) => [specialtyId, overrides[specialtyId] ?? 'neutral'])) as Record<
    SpecialtyId,
    RelationshipStrength
  >;
}

export function demonstrationPrior(
  tiers: Partial<Record<SpecialtyId, PriorTier>>,
  evidenceIds: readonly string[] = [],
): PriorParameter {
  const weights = Object.fromEntries(
    SPECIALTY_IDS.map((specialtyId) => [specialtyId, DEMONSTRATION_PRIOR_WEIGHT[tiers[specialtyId] ?? 'baseline']]),
  ) as Record<SpecialtyId, number>;
  const total = SPECIALTY_IDS.reduce((sum, specialtyId) => sum + weights[specialtyId], 0);
  return {
    status: 'ready',
    value: beliefFromValues(
      Object.fromEntries(SPECIALTY_IDS.map((specialtyId) => [specialtyId, weights[specialtyId] / total])) as Record<SpecialtyId, number>,
    ),
    provenanceIds: [...evidenceIds, DEMONSTRATION_POLICY_SOURCE_ID],
    parameterStatus: 'demonstration_only',
  };
}

interface BinaryQuestionDefinition {
  id: string;
  text: string;
  evidenceIds: readonly string[];
  yesStrengths: Readonly<Record<SpecialtyId, RelationshipStrength>>;
  noStrengths?: Readonly<Record<SpecialtyId, RelationshipStrength>>;
  applicability?: ApplicabilityRule;
}

export function demonstrationBinaryQuestion(definition: BinaryQuestionDefinition): KnowledgeQuestion {
  const yesLikelihoods = beliefFromValues(
    Object.fromEntries(
      SPECIALTY_IDS.map((specialtyId) => [specialtyId, DEMONSTRATION_YES_PROBABILITY[definition.yesStrengths[specialtyId]]]),
    ) as Record<SpecialtyId, number>,
  );

  const noLikelihoods = beliefFromValues(
    Object.fromEntries(
      SPECIALTY_IDS.map((specialtyId) => {
        if (definition.noStrengths && definition.noStrengths[specialtyId]) {
          return [specialtyId, DEMONSTRATION_YES_PROBABILITY[definition.noStrengths[specialtyId]]];
        }
        return [specialtyId, 1 - yesLikelihoods[specialtyId]];
      })
    ) as Record<SpecialtyId, number>,
  );

  const likelihoodProvenanceIds = [...definition.evidenceIds, DEMONSTRATION_POLICY_SOURCE_ID];
  const option = (id: 'yes' | 'no', label: 'Yes' | 'No', likelihoods: Belief): KnowledgeAnswerOption => ({
    id,
    label,
    likelihoods: {
      status: 'ready',
      value: likelihoods,
      provenanceIds: likelihoodProvenanceIds,
      parameterStatus: 'demonstration_only',
    },
    provenanceIds: definition.evidenceIds,
  });

  return {
    id: definition.id,
    text: definition.text,
    options: [option('yes', 'Yes', yesLikelihoods), option('no', 'No', noLikelihoods)],
    applicability: definition.applicability ?? { kind: 'always' },
    provenanceIds: definition.evidenceIds,
    knowledgeVersion: KNOWLEDGE_VERSION,
  };
}
