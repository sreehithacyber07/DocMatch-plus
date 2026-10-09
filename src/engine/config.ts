import { SPECIALTY_COUNT } from './specialties.ts';
import type { EngineConfig } from './types.ts';

export const ENGINE_VERSION = '1.0.0-r1';
export const DEFAULT_POSTERIOR_FLOOR = 0.02;
export const NORMALIZATION_TOLERANCE = 1e-9;

export function validatePosteriorFloor(posteriorFloor: number): void {
  if (!Number.isFinite(posteriorFloor) || posteriorFloor < 0) {
    throw new RangeError('posteriorFloor must be a finite number greater than or equal to 0.');
  }
  if (posteriorFloor * SPECIALTY_COUNT > 1) {
    throw new RangeError(`posteriorFloor cannot exceed ${1 / SPECIALTY_COUNT} for ${SPECIALTY_COUNT} specialties.`);
  }
}

export function validateEngineConfig(config: Readonly<EngineConfig>): void {
  validatePosteriorFloor(config.posteriorFloor);
  if (!Number.isFinite(config.topProbabilityThreshold) || config.topProbabilityThreshold < 0 || config.topProbabilityThreshold > 1) {
    throw new RangeError('topProbabilityThreshold must be a finite number from 0 to 1.');
  }
  if (!Number.isFinite(config.marginThreshold) || config.marginThreshold < 0 || config.marginThreshold > 1) {
    throw new RangeError('marginThreshold must be a finite number from 0 to 1.');
  }
  if (!Number.isInteger(config.maxQuestions) || config.maxQuestions < 1) {
    throw new RangeError('maxQuestions must be a positive integer.');
  }
  const rules = config.sufficiency;
  if (rules) {
    if (typeof rules.requireAllConditions !== 'boolean') throw new TypeError('sufficiency.requireAllConditions must be a boolean.');
    for (const key of ['minimumSupportingFindings', 'minimumIndependentDimensions'] as const) {
      if (!Number.isInteger(rules[key]) || rules[key] < 0) throw new RangeError(`sufficiency.${key} must be a non-negative integer.`);
    }
    if (rules.minimumIndependentDimensions > rules.minimumSupportingFindings) {
      throw new RangeError('sufficiency.minimumIndependentDimensions cannot exceed minimumSupportingFindings.');
    }
  }
}
