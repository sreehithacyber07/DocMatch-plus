/**
 * Answer projection -> append-only events.
 *
 * The interview keeps each stream as a current projection (one active answer
 * per question). Persistence never edits a stored row, so every change to that
 * projection becomes a new event:
 *
 *   question appears            selected
 *   question's option changes   selected, superseding the question's last event
 *   question disappears         cleared,  superseding the question's last event
 *   question returns later      selected, superseding the earlier clear
 *
 * A disappearance covers both a patient's own "Change" action and an R3
 * reconciliation that drops a safety answer after its prerequisite changed, so
 * the stored history matches what the engine actually held.
 *
 * Re-selecting the same option is not a change and emits nothing.
 */
import type { AnswerEvent, AnswerStream, IdSource, ObservedAnswer } from './events.ts';

export interface StreamTracker {
  stream: AnswerStream;
  /** Active answer per question, with the event that established it. */
  active: Map<string, { optionId: string; clientEventId: string }>;
  /** Most recent event in each question's chain, including clears. */
  latest: Map<string, string>;
  nextSequence: number;
}

export function createStreamTracker(stream: AnswerStream): StreamTracker {
  return { stream, active: new Map(), latest: new Map(), nextSequence: 1 };
}

/**
 * Mutates the tracker to the new projection and returns the events that
 * describe the change, clears first, then selections in answer order.
 */
export function diffAnswers(
  tracker: StreamTracker,
  current: readonly ObservedAnswer[],
  newId: IdSource,
  now: () => string,
): AnswerEvent[] {
  const events: AnswerEvent[] = [];
  const present = new Map(current.map((answer) => [answer.questionId, answer]));

  const emit = (event: Omit<AnswerEvent, 'kind' | 'stream' | 'clientEventId' | 'sequence'>): AnswerEvent => {
    const next: AnswerEvent = {
      kind: 'answer',
      stream: tracker.stream,
      clientEventId: newId(),
      sequence: tracker.nextSequence,
      ...event,
    };
    tracker.nextSequence += 1;
    tracker.latest.set(event.questionId, next.clientEventId);
    events.push(next);
    return next;
  };

  for (const questionId of [...tracker.active.keys()]) {
    if (present.has(questionId)) continue;
    emit({
      questionId,
      optionId: null,
      operation: 'cleared',
      answeredAt: now(),
      supersedesClientEventId: tracker.latest.get(questionId) ?? null,
    });
    tracker.active.delete(questionId);
  }

  const ordered = [...current].sort((left, right) => left.answeredAt.localeCompare(right.answeredAt));
  for (const answer of ordered) {
    const prior = tracker.active.get(answer.questionId);
    if (prior && prior.optionId === answer.optionId) continue;
    const event = emit({
      questionId: answer.questionId,
      optionId: answer.optionId,
      operation: 'selected',
      answeredAt: answer.answeredAt,
      supersedesClientEventId: tracker.latest.get(answer.questionId) ?? null,
    });
    tracker.active.set(answer.questionId, { optionId: answer.optionId, clientEventId: event.clientEventId });
  }

  return events;
}
