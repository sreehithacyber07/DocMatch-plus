import { ENGINE_VERSION } from './config.ts';
import { SPECIALTY_IDS } from './specialties.ts';
import type {
  AnswerExplanation,
  Belief,
  BeliefHistoryEntry,
  ExplanationTrace,
  InfluentialAnswerEffect,
  SpecialtyEffect,
} from './types.ts';
import { validateBelief } from './validation.ts';

function compareEffects(left: SpecialtyEffect, right: SpecialtyEffect): number {
  return right.absoluteImpact - left.absoluteImpact || left.specialtyId.localeCompare(right.specialtyId);
}

export function explain(history: readonly BeliefHistoryEntry[]): ExplanationTrace {
  const influentialEffects: InfluentialAnswerEffect[] = [];
  const answers: AnswerExplanation[] = history.map((entry, answerIndex) => {
    validateBelief(entry.priorBelief);
    validateBelief(entry.posteriorBelief);
    const deltas = {} as Belief;
    const rankedEffects = SPECIALTY_IDS.map((specialtyId): SpecialtyEffect => {
      const priorProbability = entry.priorBelief[specialtyId];
      const posteriorProbability = entry.posteriorBelief[specialtyId];
      const delta = posteriorProbability - priorProbability;
      deltas[specialtyId] = delta;
      return { specialtyId, priorProbability, posteriorProbability, delta, absoluteImpact: Math.abs(delta) };
    }).toSorted(compareEffects);

    for (const effect of rankedEffects) {
      influentialEffects.push({
        ...effect,
        answerIndex,
        questionId: entry.questionId,
        optionId: entry.optionId,
        answeredAt: entry.answeredAt,
      });
    }

    return {
      answerIndex,
      questionId: entry.questionId,
      optionId: entry.optionId,
      answeredAt: entry.answeredAt,
      deltas,
      rankedEffects,
    };
  });

  influentialEffects.sort(
    (left, right) =>
      right.absoluteImpact - left.absoluteImpact ||
      left.answerIndex - right.answerIndex ||
      left.specialtyId.localeCompare(right.specialtyId),
  );

  return { engineVersion: ENGINE_VERSION, answers, influentialEffects };
}
