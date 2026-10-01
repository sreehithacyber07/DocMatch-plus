import { DEFAULT_POSTERIOR_FLOOR, validatePosteriorFloor } from './config.ts';
import { SPECIALTY_IDS } from './specialties.ts';
import type { AnswerOption, Belief, ReadonlyBelief } from './types.ts';
import { validateAnswerOption, validateBelief } from './validation.ts';

export function cloneBelief(belief: ReadonlyBelief): Belief {
  return Object.fromEntries(SPECIALTY_IDS.map((specialtyId) => [specialtyId, belief[specialtyId]])) as Belief;
}

export function normalizeWeights(weights: Readonly<Record<string, number>>): Record<string, number> {
  const entries = Object.entries(weights);
  if (entries.length === 0) throw new RangeError('Cannot normalize an empty collection of weights.');

  let total = 0;
  for (const [key, value] of entries) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`Weight for ${key} must be finite and non-negative.`);
    total += value;
  }
  if (!Number.isFinite(total) || total <= 0) throw new RangeError('Cannot normalize weights whose total is not positive and finite.');

  return Object.fromEntries(entries.map(([key, value]) => [key, value / total]));
}

function applyProbabilityFloor(belief: ReadonlyBelief, posteriorFloor: number): Belief {
  validatePosteriorFloor(posteriorFloor);
  if (posteriorFloor === 0) return cloneBelief(belief);

  const result = {} as Belief;
  let remainingIds = [...SPECIALTY_IDS];
  let remainingMass = 1;

  while (remainingIds.length > 0) {
    const remainingWeight = remainingIds.reduce((sum, specialtyId) => sum + belief[specialtyId], 0);
    if (remainingWeight <= 0) {
      const share = remainingMass / remainingIds.length;
      for (const specialtyId of remainingIds) result[specialtyId] = share;
      break;
    }

    const belowFloor = remainingIds.filter(
      (specialtyId) => (belief[specialtyId] / remainingWeight) * remainingMass < posteriorFloor,
    );

    if (belowFloor.length === 0) {
      for (const specialtyId of remainingIds) {
        result[specialtyId] = (belief[specialtyId] / remainingWeight) * remainingMass;
      }
      break;
    }

    for (const specialtyId of belowFloor) result[specialtyId] = posteriorFloor;
    remainingMass -= belowFloor.length * posteriorFloor;
    const flooredIds = new Set(belowFloor);
    remainingIds = remainingIds.filter((specialtyId) => !flooredIds.has(specialtyId));
  }

  return result;
}

export function probabilityOfAnswer(belief: ReadonlyBelief, option: Readonly<AnswerOption>): number {
  validateBelief(belief);
  validateAnswerOption(option);
  return SPECIALTY_IDS.reduce(
    (probability, specialtyId) => probability + belief[specialtyId] * option.likelihoods[specialtyId],
    0,
  );
}

export function updateBelief(
  belief: ReadonlyBelief,
  option: Readonly<AnswerOption>,
  posteriorFloor = DEFAULT_POSTERIOR_FLOOR,
): Belief {
  validateBelief(belief);
  validateAnswerOption(option);
  validatePosteriorFloor(posteriorFloor);

  const weighted = Object.fromEntries(
    SPECIALTY_IDS.map((specialtyId) => [specialtyId, belief[specialtyId] * option.likelihoods[specialtyId]]),
  );
  const normalized = normalizeWeights(weighted) as Belief;
  return applyProbabilityFloor(normalized, posteriorFloor);
}
