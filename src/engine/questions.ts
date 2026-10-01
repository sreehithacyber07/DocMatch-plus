import { probabilityOfAnswer, updateBelief } from './belief.ts';
import { DEFAULT_POSTERIOR_FLOOR } from './config.ts';
import { entropy } from './entropy.ts';
import type { Question, QuestionSelection, ReadonlyBelief } from './types.ts';
import { validateBelief, validateQuestion, validateQuestionBank } from './validation.ts';

export function expectedEntropyAfter(
  belief: ReadonlyBelief,
  question: Readonly<Question>,
  posteriorFloor = DEFAULT_POSTERIOR_FLOOR,
): number {
  validateBelief(belief);
  validateQuestion(question);

  return question.options.reduce((expectedEntropy, option) => {
    const answerProbability = probabilityOfAnswer(belief, option);
    if (answerProbability === 0) return expectedEntropy;
    const posterior = updateBelief(belief, option, posteriorFloor);
    return expectedEntropy + answerProbability * entropy(posterior);
  }, 0);
}

export function informationGain(
  belief: ReadonlyBelief,
  question: Readonly<Question>,
  posteriorFloor = DEFAULT_POSTERIOR_FLOOR,
): number {
  return entropy(belief) - expectedEntropyAfter(belief, question, posteriorFloor);
}

export function selectNextQuestion(
  belief: ReadonlyBelief,
  askedQuestionIds: readonly string[],
  questionBank: readonly Question[],
  posteriorFloor = DEFAULT_POSTERIOR_FLOOR,
): QuestionSelection | null {
  validateBelief(belief);
  validateQuestionBank(questionBank);
  const asked = new Set(askedQuestionIds);
  const currentEntropy = entropy(belief);
  const eligible = questionBank
    .filter((question) => !asked.has(question.id))
    .filter((question) => question.appliesWhen?.(belief, askedQuestionIds) ?? true)
    .toSorted((left, right) => left.id.localeCompare(right.id));

  let selection: QuestionSelection | null = null;
  for (const question of eligible) {
    const expectedEntropy = expectedEntropyAfter(belief, question, posteriorFloor);
    const gain = currentEntropy - expectedEntropy;
    if (selection === null || gain > selection.informationGain) {
      selection = {
        question,
        questionId: question.id,
        informationGain: gain,
        currentEntropy,
        expectedEntropy,
      };
    }
  }

  return selection;
}
