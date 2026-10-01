import type { ResolvedSafetyQuestion, SafetyAnswer } from './types.ts';

function validateTimestamp(timestamp: string): void {
  if (timestamp.trim().length === 0 || !Number.isFinite(Date.parse(timestamp))) {
    throw new TypeError('Safety answer answeredAt must be a valid timestamp.');
  }
}

export function recordSafetyAnswer(
  current: readonly SafetyAnswer[],
  question: Readonly<ResolvedSafetyQuestion>,
  answer: Readonly<SafetyAnswer>,
): SafetyAnswer[] {
  if (new Set(current.map((candidate) => candidate.questionId)).size !== current.length) {
    throw new TypeError('Current safety answers contain duplicate question ids.');
  }
  if (question.answerTarget !== 'safety_state') {
    throw new TypeError(`Question ${question.id} must be answered through the routing session.`);
  }
  if (answer.questionId !== question.id) throw new TypeError('Safety answer question id does not match the selected question.');
  if (!question.options.some((option) => option.id === answer.optionId)) {
    throw new TypeError(`Unknown option ${answer.optionId} for safety question ${question.id}.`);
  }
  validateTimestamp(answer.answeredAt);
  const replacement = { questionId: answer.questionId, optionId: answer.optionId, answeredAt: answer.answeredAt };
  const existingIndex = current.findIndex((candidate) => candidate.questionId === answer.questionId);
  if (existingIndex < 0) return [...current.map((candidate) => ({ ...candidate })), replacement];
  return current.map((candidate, index) => (index === existingIndex ? replacement : { ...candidate }));
}
