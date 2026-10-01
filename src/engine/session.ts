import { cloneBelief } from './belief.ts';
import { DEFAULT_POSTERIOR_FLOOR, ENGINE_VERSION } from './config.ts';
import { changeRecordedAnswer, removeRecordedAnswer, replayBelief } from './replay.ts';
import type { Question, ReadonlyBelief, RecordedAnswer, RoutingSession } from './types.ts';
import { validateBelief } from './validation.ts';

function validateTimestamp(timestamp: string, subject: string): void {
  if (timestamp.trim().length === 0 || !Number.isFinite(Date.parse(timestamp))) {
    throw new TypeError(`${subject} must be a valid timestamp string.`);
  }
}

export function createRoutingSession(
  presentingComplaintId: string,
  initialBelief: ReadonlyBelief,
  createdAt: string,
): RoutingSession {
  if (presentingComplaintId.trim().length === 0) throw new TypeError('presentingComplaintId must be a non-empty string.');
  validateBelief(initialBelief);
  validateTimestamp(createdAt, 'createdAt');
  const belief = cloneBelief(initialBelief);

  return {
    engineVersion: ENGINE_VERSION,
    presentingComplaintId,
    createdAt,
    updatedAt: createdAt,
    initialBelief: cloneBelief(belief),
    answers: [],
    belief,
    askedQuestionIds: [],
    redFlagState: { status: 'not_evaluated', triggeredRuleIds: [] },
    outcome: { status: 'in_progress' },
  };
}

export function replaySession(
  session: Readonly<RoutingSession>,
  questionBank: readonly Question[],
  updatedAt: string,
  posteriorFloor = DEFAULT_POSTERIOR_FLOOR,
): RoutingSession {
  validateTimestamp(updatedAt, 'updatedAt');
  const replay = replayBelief(session.initialBelief, session.answers, questionBank, posteriorFloor);
  return {
    ...session,
    engineVersion: ENGINE_VERSION,
    updatedAt,
    answers: replay.retainedAnswers,
    belief: replay.belief,
    askedQuestionIds: replay.askedQuestionIds,
    redFlagState: { status: 'not_evaluated', triggeredRuleIds: [] },
    outcome: { status: 'in_progress' },
  };
}

export function answerSessionQuestion(
  session: Readonly<RoutingSession>,
  answer: Readonly<RecordedAnswer>,
  questionBank: readonly Question[],
  posteriorFloor = DEFAULT_POSTERIOR_FLOOR,
): RoutingSession {
  const alreadyAnswered = session.answers.some((candidate) => candidate.questionId === answer.questionId);
  const answers = alreadyAnswered
    ? changeRecordedAnswer(session.answers, answer)
    : [...session.answers.map((candidate) => ({ ...candidate })), { ...answer }];
  return replaySession({ ...session, answers }, questionBank, answer.answeredAt, posteriorFloor);
}

export function removeSessionAnswer(
  session: Readonly<RoutingSession>,
  questionId: string,
  questionBank: readonly Question[],
  updatedAt: string,
  posteriorFloor = DEFAULT_POSTERIOR_FLOOR,
): RoutingSession {
  const answers = removeRecordedAnswer(session.answers, questionId);
  return replaySession({ ...session, answers }, questionBank, updatedAt, posteriorFloor);
}
