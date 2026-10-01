export interface AnswerOptionView {
  id: string;
  label: string;
}

/**
 * Presentation kinds for ENGINE questions.
 *
 * These change only how an approved answer set is drawn. Option ids, their
 * order and their meaning come from the knowledge base and are never rewritten,
 * so a control choice can never change what an answer means to the engine.
 *
 * Intake questions do not go through this: they declare their own instrument,
 * because guessing a control from option labels is exactly how a question
 * quietly changes shape when someone edits a word.
 */
export type AnswerPresentation = 'binary' | 'ordinal' | 'choice';

const ORDINAL_RANK: Readonly<Record<string, number>> = {
  never: 0,
  rarely: 1,
  sometimes: 2,
  often: 3,
  always: 4,
};

/**
 * A two-option set always stays binary, which keeps clinically binary questions
 * and every safety question as a plain decision rather than a scale. Anything
 * wider is drawn as a choice set.
 */
export function presentationFor(options: readonly AnswerOptionView[]): AnswerPresentation {
  if (options.length === 2) return 'binary';

  const ranks = options.map((option) => ORDINAL_RANK[option.id]);
  const isOrdinal = ranks.every((rank) => rank !== undefined) && ranks.every((rank, index) => index === 0 || rank > ranks[index - 1]);
  return isOrdinal ? 'ordinal' : 'choice';
}
