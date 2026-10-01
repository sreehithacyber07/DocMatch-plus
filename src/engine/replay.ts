import { cloneBelief, updateBelief } from './belief.ts';
import { DEFAULT_POSTERIOR_FLOOR } from './config.ts';
import type { BeliefHistoryEntry, Question, ReadonlyBelief, RecordedAnswer, ReplayResult } from './types.ts';
import { validateBelief, validateQuestionBank } from './validation.ts';

function validateRecordedAnswer(answer: Readonly<RecordedAnswer>): void {
  if (answer.questionId.trim().length === 0) throw new TypeError('Recorded answer questionId must be a non-empty string.');
  if (answer.optionId.trim().length === 0) throw new TypeError('Recorded answer optionId must be a non-empty string.');
  if (answer.answeredAt.trim().length === 0 || !Number.isFinite(Date.parse(answer.answeredAt))) {
    throw new TypeError(`Recorded answer ${answer.questionId} must contain a valid timestamp string.`);
  }
}

export function replayBelief(
  initialBelief: ReadonlyBelief,
  answers: readonly RecordedAnswer[],
  questionBank: readonly Question[],
  posteriorFloor = DEFAULT_POSTERIOR_FLOOR,
): ReplayResult {
  validateBelief(initialBelief);
  validateQuestionBank(questionBank);
  const questionsById = new Map(questionBank.map((question) => [question.id, question]));
  const retainedAnswers: RecordedAnswer[] = [];
  const removedAnswers: RecordedAnswer[] = [];
  const askedQuestionIds: string[] = [];
  const seenQuestionIds = new Set<string>();
  const history: BeliefHistoryEntry[] = [];
  let belief = cloneBelief(initialBelief);

  for (const answer of answers) {
    validateRecordedAnswer(answer);
    if (seenQuestionIds.has(answer.questionId)) {
      throw new TypeError(`Answer history contains duplicate question id ${answer.questionId}.`);
    }
    seenQuestionIds.add(answer.questionId);

    const question = questionsById.get(answer.questionId);
    if (!question) throw new TypeError(`Answer history references unknown question id ${answer.questionId}.`);
    const option = question.options.find((candidate) => candidate.id === answer.optionId);
    if (!option) throw new TypeError(`Answer history references unknown option ${answer.optionId} for question ${question.id}.`);

    if (!(question.appliesWhen?.(belief, askedQuestionIds) ?? true)) {
      removedAnswers.push({ ...answer });
      continue;
    }

    const priorBelief = cloneBelief(belief);
    belief = updateBelief(belief, option, posteriorFloor);
    const retainedAnswer = { ...answer };
    retainedAnswers.push(retainedAnswer);
    askedQuestionIds.push(question.id);
    history.push({ ...retainedAnswer, priorBelief, posteriorBelief: cloneBelief(belief) });
  }

  return { belief, history, retainedAnswers, removedAnswers, askedQuestionIds };
}

export function changeRecordedAnswer(
  answers: readonly RecordedAnswer[],
  replacement: Readonly<RecordedAnswer>,
): RecordedAnswer[] {
  validateRecordedAnswer(replacement);
  const index = answers.findIndex((answer) => answer.questionId === replacement.questionId);
  if (index < 0) throw new TypeError(`Cannot change unanswered question ${replacement.questionId}.`);
  return answers.map((answer, answerIndex) => (answerIndex === index ? { ...replacement } : { ...answer }));
}

export function removeRecordedAnswer(
  answers: readonly RecordedAnswer[],
  questionId: string,
): RecordedAnswer[] {
  if (!answers.some((answer) => answer.questionId === questionId)) {
    throw new TypeError(`Cannot remove unanswered question ${questionId}.`);
  }
  return answers.filter((answer) => answer.questionId !== questionId).map((answer) => ({ ...answer }));
}
