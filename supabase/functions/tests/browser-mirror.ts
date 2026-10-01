/**
 * Test support: the browser interview, event by event.
 *
 * Mirrors RoutingFlow's three state transitions (answer an engine question,
 * answer an intake question, remove an answer) using the interview driver for
 * answers and RoutingFlow's own removal code, then records every committed
 * projection with R9D's `diffAnswers`, exactly as the persistence effects do.
 * The resulting rows are what the database holds for that interview.
 */
import {
  answerSessionQuestion,
  createRoutingSession,
} from '../../../src/engine/index.ts';
import {
  DEMONSTRATION_ENGINE_CONFIG,
  materializeDemonstrationComplaint,
  R2B_DEMONSTRATION_KNOWLEDGE,
} from '../../../src/engine/data/index.ts';
import { R3_SAFETY_KNOWLEDGE, reconcileSafetyAnswers } from '../../../src/engine/safety/index.ts';
import { KNOWLEDGE_VERSION } from '../../../src/engine/data/version.ts';
import { SAFETY_VERSION } from '../../../src/engine/safety/version.ts';
import { intakeQuestionById } from '../../../src/features/routing-flow/intake-questions.ts';
import { createStreamTracker, diffAnswers, type StreamTracker } from '../../../src/features/persistence/answer-diff.ts';
import type { AnswerEvent, AnswerStream } from '../../../src/features/persistence/events.ts';
import { answer, currentStep, startInterview, type DriverState } from '../../../src/features/tests/interview-driver.ts';
import type { IntakeAnswerRow, RoutingAnswerRow, SafetyAnswerRow } from '../_shared/trusted/evidence.ts';

/** RoutingFlow.removeAnswer, verbatim in behaviour. */
export function browserRemove(state: DriverState, questionId: string): DriverState {
  if (questionId.startsWith('intake-')) {
    return { ...state, intakeAnswers: state.intakeAnswers.filter((entry) => entry.questionId !== questionId) };
  }
  const complaint = materializeDemonstrationComplaint(
    R2B_DEMONSTRATION_KNOWLEDGE,
    state.complaintId,
    state.session.answers.map((entry) => ({ questionId: entry.questionId, optionId: entry.optionId })),
  );
  const answers = state.session.answers.filter((entry) => entry.questionId !== questionId);
  const rebuilt = createRoutingSession(state.complaintId, state.session.initialBelief, state.session.createdAt);
  const session = answers.reduce(
    (accumulated, entry) =>
      answerSessionQuestion(accumulated, entry, complaint.questions, DEMONSTRATION_ENGINE_CONFIG.posteriorFloor),
    rebuilt,
  );
  const safetyAnswers = reconcileSafetyAnswers(
    { complaintId: state.complaintId, routingAnswers: session.answers, safetyAnswers: state.safetyAnswers },
    R3_SAFETY_KNOWLEDGE,
  ).retained;
  return { ...state, session, safetyAnswers };
}

export interface RecordedStreams {
  routing: RoutingAnswerRow[];
  safety: SafetyAnswerRow[];
  intake: IntakeAnswerRow[];
  /** clientEventId -> record id, as the database assigned them. */
  recordIds: Map<string, string>;
}

/** R9D's observer, turning committed projections into database rows. */
export class PersistenceRecorder {
  private readonly trackers: Record<AnswerStream, StreamTracker> = {
    intake: createStreamTracker('intake'),
    routing: createStreamTracker('routing'),
    safety: createStreamTracker('safety'),
  };
  private nextId = 0;
  private clock = 0;
  readonly streams: RecordedStreams = { routing: [], safety: [], intake: [], recordIds: new Map() };

  private readonly complaintId: string;
  private readonly prefix: string;

  constructor(complaintId: string, prefix = 'r') {
    this.complaintId = complaintId;
    this.prefix = prefix;
  }

  private newId = () => {
    this.nextId += 1;
    return `${this.prefix}-event-${this.nextId}`;
  };

  private now = () => {
    this.clock += 1;
    return new Date(Date.UTC(2026, 0, 1) + this.clock).toISOString();
  };

  private toRow(event: AnswerEvent) {
    const id = `${this.prefix}-record-${event.clientEventId}`;
    this.streams.recordIds.set(event.clientEventId, id);
    return {
      id,
      question_id: event.questionId,
      option_id: event.optionId,
      operation: event.operation,
      sequence: event.sequence,
      answered_at: event.answeredAt,
      supersedes_record_id: event.supersedesClientEventId
        ? (this.streams.recordIds.get(event.supersedesClientEventId) ?? null)
        : null,
    };
  }

  observe(state: DriverState): void {
    for (const event of diffAnswers(this.trackers.intake, state.intakeAnswers, this.newId, this.now)) {
      const category = intakeQuestionById(this.complaintId, event.questionId)?.category ?? 'unknown';
      this.streams.intake.push({ ...this.toRow(event), category });
    }
    for (const event of diffAnswers(this.trackers.routing, state.session.answers, this.newId, this.now)) {
      this.streams.routing.push({ ...this.toRow(event), knowledge_version: KNOWLEDGE_VERSION });
    }
    for (const event of diffAnswers(this.trackers.safety, state.safetyAnswers, this.newId, this.now)) {
      this.streams.safety.push({ ...this.toRow(event), safety_version: SAFETY_VERSION });
    }
  }
}

/** Small deterministic PRNG so every walk is reproducible from its seed. */
export function seededRandom(seed: number): () => number {
  let value = seed >>> 0 || 1;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

export interface Walk {
  state: DriverState;
  recorder: PersistenceRecorder;
  removals: number;
}

/**
 * A random interview with corrections: at each commit the patient either
 * answers what is on screen (random option) or removes an earlier answer.
 */
export function randomWalk(complaintId: string, seed: number, options: { removeProbability?: number; maxCommits?: number } = {}): Walk {
  const random = seededRandom(seed);
  const removeProbability = options.removeProbability ?? 0.18;
  const maxCommits = options.maxCommits ?? 40;
  let state = startInterview(complaintId);
  const recorder = new PersistenceRecorder(complaintId, `s${seed}`);
  recorder.observe(state);
  let removals = 0;

  for (let commit = 0; commit < maxCommits; commit += 1) {
    const step = currentStep(state);
    const removable = [
      ...state.intakeAnswers.map((entry) => entry.questionId),
      ...state.session.answers.map((entry) => entry.questionId),
    ];
    if (removable.length > 0 && step.kind !== 'interrupted' && random() < removeProbability) {
      state = browserRemove(state, removable[Math.floor(random() * removable.length)]);
      removals += 1;
    } else if (step.kind === 'intake' || step.kind === 'engine') {
      const choices = step.question.options;
      state = answer(state, choices[Math.floor(random() * choices.length)].id);
    } else {
      break;
    }
    recorder.observe(state);
  }
  return { state, recorder, removals };
}
