import { validateEngineConfig } from './config.ts';
import { SPECIALTY_IDS } from './specialties.ts';
import type { EngineConfig, ReadonlyBelief, StopReason, StoppingDecision } from './types.ts';
import { validateBelief } from './validation.ts';

export function shouldStop(
  belief: ReadonlyBelief,
  askedCount: number,
  config: Readonly<EngineConfig>,
): StoppingDecision {
  validateBelief(belief);
  validateEngineConfig(config);
  if (!Number.isInteger(askedCount) || askedCount < 0) throw new RangeError('askedCount must be a non-negative integer.');

  const ranked = SPECIALTY_IDS
    .map((specialtyId) => ({ specialtyId, probability: belief[specialtyId] }))
    .toSorted((left, right) => right.probability - left.probability || left.specialtyId.localeCompare(right.specialtyId));
  const top = ranked[0];
  const second = ranked[1];
  const margin = top.probability - second.probability;
  const triggeredConditions: StopReason[] = [];

  if (top.probability >= config.topProbabilityThreshold) triggeredConditions.push('top_probability');
  if (margin >= config.marginThreshold) triggeredConditions.push('margin');
  if (askedCount >= config.maxQuestions) triggeredConditions.push('max_questions');

  return {
    shouldStop: triggeredConditions.length > 0,
    reason: triggeredConditions[0] ?? null,
    triggeredConditions,
    topSpecialtyId: top.specialtyId,
    topProbability: top.probability,
    secondSpecialtyId: second.specialtyId,
    secondProbability: second.probability,
    margin,
    askedCount,
  };
}
