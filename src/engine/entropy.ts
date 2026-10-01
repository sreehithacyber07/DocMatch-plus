import { SPECIALTY_IDS } from './specialties.ts';
import type { ReadonlyBelief } from './types.ts';
import { validateBelief } from './validation.ts';

/** Shannon entropy in bits: H(p) = -sum(p_i * log2(p_i)). */
export function entropy(belief: ReadonlyBelief): number {
  validateBelief(belief);
  return SPECIALTY_IDS.reduce((total, specialtyId) => {
    const probability = belief[specialtyId];
    return probability === 0 ? total : total - probability * Math.log2(probability);
  }, 0);
}
