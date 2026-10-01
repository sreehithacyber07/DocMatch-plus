/**
 * Persisted answer events -> the projections the browser held.
 *
 * R9D writes each stream as append-only events: `selected` or `cleared`, with a
 * per-stream sequence and a `supersedes_record_id` chain per question. RLS only
 * proves the rows belong to the caller's assessment, so every chain is checked
 * here before anything is derived from it.
 */
import { TrustedError } from './contract.ts';

export interface AnswerEventRow {
  id: string;
  question_id: string;
  option_id: string | null;
  operation: string;
  sequence: number;
  answered_at: string;
  supersedes_record_id: string | null;
}

export interface RoutingAnswerRow extends AnswerEventRow {
  knowledge_version: string;
}

export interface SafetyAnswerRow extends AnswerEventRow {
  safety_version: string;
}

export interface IntakeAnswerRow extends AnswerEventRow {
  category: string;
}

/** One accepted event, in capture order. */
export interface EvidenceStep {
  recordId: string;
  questionId: string;
  operation: 'selected' | 'cleared';
  optionId: string | null;
  answeredAt: string;
  sequence: number;
}

/** An active answer and the record that established it. */
export interface ActiveAnswer {
  recordId: string;
  questionId: string;
  optionId: string;
  answeredAt: string;
}

/** Bound on events per stream; an honest interview stays far below it. */
export const MAX_EVENTS_PER_STREAM = 200;

/**
 * Orders a stream by sequence and checks it is one consistent history:
 * the first event for a question supersedes nothing and selects; every later
 * event supersedes that question's previous event; a clear only follows a
 * selection. Anything else is INVALID_EVIDENCE.
 */
export function orderedSteps(rows: readonly AnswerEventRow[]): EvidenceStep[] {
  if (rows.length > MAX_EVENTS_PER_STREAM) throw new TrustedError('INVALID_EVIDENCE');
  const ordered = [...rows].sort((left, right) => left.sequence - right.sequence);
  const latest = new Map<string, { recordId: string; operation: 'selected' | 'cleared' }>();
  const seenIds = new Set<string>();
  const steps: EvidenceStep[] = [];
  let previousSequence = 0;

  for (const row of ordered) {
    if (!Number.isInteger(row.sequence) || row.sequence <= previousSequence) throw new TrustedError('INVALID_EVIDENCE');
    previousSequence = row.sequence;
    if (seenIds.has(row.id)) throw new TrustedError('INVALID_EVIDENCE');
    seenIds.add(row.id);
    if (typeof row.answered_at !== 'string' || !Number.isFinite(Date.parse(row.answered_at))) {
      throw new TrustedError('INVALID_EVIDENCE');
    }
    const operation = row.operation;
    if (operation !== 'selected' && operation !== 'cleared') throw new TrustedError('INVALID_EVIDENCE');
    if (operation === 'selected' && (typeof row.option_id !== 'string' || row.option_id.length === 0)) {
      throw new TrustedError('INVALID_EVIDENCE');
    }
    if (operation === 'cleared' && row.option_id !== null) throw new TrustedError('INVALID_EVIDENCE');

    const previous = latest.get(row.question_id);
    if (!previous) {
      if (row.supersedes_record_id !== null || operation !== 'selected') throw new TrustedError('INVALID_EVIDENCE');
    } else {
      if (row.supersedes_record_id !== previous.recordId) throw new TrustedError('INVALID_EVIDENCE');
      if (operation === 'cleared' && previous.operation !== 'selected') throw new TrustedError('INVALID_EVIDENCE');
    }
    latest.set(row.question_id, { recordId: row.id, operation });
    steps.push({
      recordId: row.id,
      questionId: row.question_id,
      operation,
      optionId: row.option_id,
      answeredAt: row.answered_at,
      sequence: row.sequence,
    });
  }
  return steps;
}

/**
 * The projection a browser answer list held after these events, for streams
 * that replace in place (intake and safety): a selection of an active question
 * replaces it where it stands, a new one is appended, a clear removes it.
 */
export function activeProjection(steps: readonly EvidenceStep[]): ActiveAnswer[] {
  const active: ActiveAnswer[] = [];
  for (const step of steps) {
    const index = active.findIndex((answer) => answer.questionId === step.questionId);
    if (step.operation === 'cleared') {
      if (index >= 0) active.splice(index, 1);
      continue;
    }
    const answer = { recordId: step.recordId, questionId: step.questionId, optionId: step.optionId as string, answeredAt: step.answeredAt };
    if (index >= 0) active[index] = answer;
    else active.push(answer);
  }
  return active;
}

/** Highest sequence seen per stream; the write re-checks nothing newer arrived. */
export function highWater(rows: readonly AnswerEventRow[]): number {
  return rows.reduce((max, row) => Math.max(max, row.sequence), 0);
}
