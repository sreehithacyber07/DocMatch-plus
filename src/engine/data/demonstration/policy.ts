import { SPECIALTY_IDS, type SpecialtyId } from '../../specialties.ts';
import type { Belief, EngineConfig } from '../../types.ts';
import type { ApplicabilityRule, EvidenceDimension, KnowledgeAnswerOption, KnowledgeQuestion, PriorParameter } from '../types.ts';
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

/*
  The thresholds are unchanged. What changed is when they may end the
  interview (PENDING CLINICAL REVIEW, see docs/clinical-expansion):

    - Both thresholds must hold. A margin alone stopped runs whose leader was
      still under the probability threshold.
    - The lead must rest on at least three answered findings that are
      characteristic of it, across at least two clinical dimensions. Two
      correlated answers (a meal-related and a burning pain) used to end an
      interview after two questions; published diagnostic criteria combine
      several features across dimensions (ICHD-3 migraine criteria, for
      example, need pain characteristics and an associated symptom).
    - The question limit is the whole approved six-question set, so no
      approved discriminator is cut off by a count. A lead that never becomes
      sufficient ends without a convergence and goes to the source-backed
      criteria and, failing those, a guarded parent service.
*/
export const DEMONSTRATION_ENGINE_CONFIG: EngineConfig = {
  posteriorFloor: 0.02,
  topProbabilityThreshold: 0.72,
  marginThreshold: 0.35,
  maxQuestions: 6,
  sufficiency: {
    requireAllConditions: true,
    minimumSupportingFindings: 3,
    minimumIndependentDimensions: 2,
  },
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
  evidenceDimension?: EvidenceDimension;
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
    ...(definition.evidenceDimension ? { evidenceDimension: definition.evidenceDimension } : {}),
  };
}
