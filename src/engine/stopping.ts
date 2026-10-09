import { validateEngineConfig } from './config.ts';
import { SPECIALTY_IDS } from './specialties.ts';
import { evidenceSupport } from './sufficiency.ts';
import type { EngineConfig, EvidenceSupport, Question, ReadonlyBelief, RecordedAnswer, StopReason, StoppingDecision } from './types.ts';
import { validateBelief } from './validation.ts';

/** The answers and questions sufficiency is judged on. Optional, so callers without them keep the original rule. */
export interface StoppingEvidence {
  answers: readonly RecordedAnswer[];
  questions: readonly Question[];
}

/**
 * Whether the routing interview may stop.
 *
 * Without `config.sufficiency` this is the original rule: stop when the top
 * probability or the margin reaches its threshold, or at the question limit.
 *
 * With it, a numerical lead stops the interview only when it is also
 * supported: both thresholds hold (if `requireAllConditions`), and the leader
 * rests on enough positively supporting findings spanning enough independent
 * clinical dimensions (see sufficiency.ts). A lead that is not yet supported
 * lets the interview continue to the next most informative question; the
 * question limit and an exhausted question bank still end it, without a
 * convergence, so no direction is manufactured from an insufficient lead.
 */
export function shouldStop(
  belief: ReadonlyBelief,
  askedCount: number,
  config: Readonly<EngineConfig>,
  evidence?: StoppingEvidence,
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

  const topMet = top.probability >= config.topProbabilityThreshold;
  const marginMet = margin >= config.marginThreshold;
  const rules = config.sufficiency;
  const converged = rules?.requireAllConditions ? topMet && marginMet : topMet || marginMet;

  let support: EvidenceSupport | undefined;
  let sufficient = converged;
  if (converged && rules && evidence) {
    support = evidenceSupport(evidence.answers, evidence.questions, top.specialtyId, second.specialtyId);
    sufficient =
      support.supportingFindings >= rules.minimumSupportingFindings &&
      support.independentDimensions >= rules.minimumIndependentDimensions;
  }

  const triggeredConditions: StopReason[] = [];
  if (sufficient && topMet) triggeredConditions.push('top_probability');
  if (sufficient && marginMet) triggeredConditions.push('margin');
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
    ...(support ? { evidence: support } : {}),
    ...(converged && !sufficient ? { convergedWithoutSufficientEvidence: true } : {}),
  };
}
