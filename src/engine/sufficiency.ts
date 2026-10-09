import type { SpecialtyId } from './specialties.ts';
import type { EvidenceSupport, Question, RecordedAnswer } from './types.ts';

/**
 * How much separate, positive evidence supports the leading specialty.
 *
 * A SUPPORTING FINDING is an answered question whose chosen answer is itself
 * characteristic of the leader: its likelihood under the leader is above
 * chance (0.5) and above its likelihood under the runner-up. A "no" to a
 * question about a competitor is not counted: it lowers the competitor but is
 * not a feature of the leader, and an unanswered question counts for nothing.
 *
 * INDEPENDENT DIMENSIONS are the distinct clinical dimensions those findings
 * come from. Two answers in one dimension (a meal-related pain and a burning
 * pain are both the dyspeptic pattern) are correlated: the naive Bayesian
 * update multiplies them as if independent, so they may move the belief a
 * long way, but they count once here.
 *
 * Nothing here changes the belief or a likelihood. It only decides whether a
 * numerical lead rests on enough evidence to be shown as a direction.
 */
export function evidenceSupport(
  answers: readonly RecordedAnswer[],
  questions: readonly Question[],
  leaderId: SpecialtyId,
  runnerUpId: SpecialtyId,
): EvidenceSupport {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const dimensions = new Set<string>();
  let supportingFindings = 0;
  for (const answer of answers) {
    const question = byId.get(answer.questionId);
    const option = question?.options.find((candidate) => candidate.id === answer.optionId);
    if (!question || !option) continue;
    const leader = option.likelihoods[leaderId];
    const runnerUp = option.likelihoods[runnerUpId];
    if (leader > 0.5 && leader > runnerUp) {
      supportingFindings += 1;
      dimensions.add(question.evidenceDimension ?? question.id);
    }
  }
  return { supportingFindings, independentDimensions: dimensions.size };
}
