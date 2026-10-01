/**
 * The patient assessment persistence session.
 *
 * One instance per patient. It owns the temporary anonymous identity, the
 * assessment ID, the in-memory write queue and the write status, and nothing
 * clinical. The interview never waits on it.
 *
 * ORDERING AND SAFETY
 *
 *   begin() and observeAnswers() only enqueue and return synchronously. The
 *   caller invokes them after React has committed the answer, by which point
 *   R3 has already evaluated and any priority interruption is already on
 *   screen. A slow, failing or absent backend therefore cannot delay R3.
 *
 * QUEUE
 *
 *   Writes run one at a time, in the order the patient acted. That order is
 *   required: a correction must reference the database ID of the event it
 *   supersedes, which exists only after that event's insert returns. Pending
 *   work lives in JavaScript memory only. There is no durable offline queue.
 *
 * RETRY AND IDEMPOTENCY
 *
 *   Each event carries a clientEventId minted once. A transient failure is
 *   retried a bounded number of times with the SAME ID. A unique-key conflict
 *   is resolved by reading the stored row: the same payload is success (an
 *   earlier attempt landed but its response was lost), a different payload
 *   under the same key is an idempotency conflict. RLS denials, auth failures
 *   and rejections are never retried.
 *
 * FAILURE ISOLATION
 *
 *   A failure marks the event (and anything that depends on it) as failed and
 *   moves on. It never throws into React and never touches clinical state.
 */
import type { PersistenceError, PersistenceErrorKind } from './errors.ts';
import { isRetryable } from './errors.ts';
import { createStreamTracker, diffAnswers, type StreamTracker } from './answer-diff.ts';
import {
  randomId,
  type AnswerEvent,
  type AnswerStream,
  type AssessmentStart,
  type BodySelectionEvent,
  type IdSource,
  type ObservedAnswer,
  type PersistenceEvent,
} from './events.ts';
import type { GatewayResult, PersistenceGateway } from './gateway.ts';
import {
  ASSESSMENT_CONTRACT_VERSION,
  storedRowMatches,
  toAnswerInsert,
  toAssessmentInsert,
  toBodySelectionInsert,
  toClinicalContextInsert,
  type EvidenceInsert,
} from './records.ts';
import { validateAnswerEvent, validateAssessmentStart, validateBodySelection } from './validation.ts';
import type { PersistenceDisabledReason } from './config.ts';
import { routingResultAgrees, type ResultExpectation } from './trusted-result.ts';
import { replayClinicalEvidence, type CanonicalClinicalOutcome } from '../routing-flow/clinical-replay.ts';

export interface LocalRoutingResult extends Omit<ResultExpectation, 'supportingAnswerRecordIds'> {
  answers: readonly { questionId: string; optionId: string }[];
}

export type PersistenceState = 'disabled' | 'idle' | 'pending' | 'saved' | 'failed';

export interface PersistenceSnapshot {
  state: PersistenceState;
  disabledReason: PersistenceDisabledReason | null;
  pending: number;
  failed: number;
  lastErrorKind: PersistenceErrorKind | null;
}

export interface PersistenceOutcome {
  clientEventId: string;
  kind:
    | PersistenceEvent['kind']
    | 'identity'
    | 'assessment'
    | 'clinical-context'
    | 'admission'
    | 'assessment-start'
    | 'safety-evaluate'
    | 'routing-finalize'
    | 'soap-prepare'
    | 'assessment-end';
  status: 'saved' | 'failed' | 'discarded';
  error: PersistenceErrorKind | null;
  attempts: number;
}

export interface AssessmentPersistence {
  /** Starts the assessment: temporary identity, assessment row, body selection. */
  begin(start: AssessmentStart): void;
  /** Diffs a committed answer projection into append-only events. */
  observeAnswers(stream: AnswerStream, answers: readonly ObservedAnswer[]): void;
  /** Called after a committed local R3 interruption, never from an answer handler. */
  requestSafetyEvaluation(): void;
  /** Called after a committed presentable local result and all answer observations. */
  requestRoutingFinalization(result: LocalRoutingResult): void;
  getSnapshot(): PersistenceSnapshot;
  subscribe(listener: () => void): () => void;
  /** Resolves once the queue is empty. Diagnostics and tests only. */
  whenIdle(): Promise<void>;
  /** Outcomes so far, in completion order. Diagnostics and tests only. */
  outcomes(): readonly PersistenceOutcome[];
  /** Assessment and owner IDs once known. Never logged by the app. */
  identifiers(): { assessmentId: string | null; ownerAuthUserId: string | null };
  /** Ends this patient's persistence boundary. Safe to call more than once. */
  dispose(): Promise<void>;
}

export interface PersistenceOptions {
  /**
   * Creates the backend gateway when the identity step runs. May load the
   * backend client on demand, so builds that never persist never load it.
   */
  createGateway: (signal: AbortSignal) => PersistenceGateway | Promise<PersistenceGateway>;
  newId?: IdSource;
  now?: () => string;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** Delay before each retry; its length bounds the retries. Default two retries. */
  retryDelaysMs?: readonly number[];
  contractVersion?: string;
  /** R9E trusted operations are enabled only in persisting runtimes. */
  trustedOperations?: boolean;
  /**
   * R9G-B. 'self' (default): the patient inserts its own unassociated
   * assessment and starts it, as in R9D/R9E. 'trusted': the gateway's
   * `admitPatient` creates and starts a facility-bound assessment through a
   * trusted operation; this session never names the facility.
   */
  admissionPath?: 'self' | 'trusted';
  /**
   * R9G-B. At disposal, report the local session's end so the server can move
   * the assessment to cancelled or closed. Best effort, bounded, and never
   * delays the next patient.
   */
  endOnDispose?: boolean;
  /** Upper bound on that wait. Defaults to END_ON_DISPOSE_TIMEOUT_MS. */
  endTimeoutMs?: number;
}

/** How long disposal waits for the lifecycle end before signing out anyway. */
export const END_ON_DISPOSE_TIMEOUT_MS = 4000;

export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [400, 1200];

type Job =
  | { type: 'identity'; clientEventId: string }
  | { type: 'assessment'; clientEventId: string }
  | { type: 'clinical-context'; clientEventId: string }
  | { type: 'admission'; clientEventId: string }
  | { type: 'evidence'; event: PersistenceEvent }
  | { type: 'assessment-start'; clientEventId: string }
  | { type: 'safety-evaluate'; clientEventId: string }
  | { type: 'soap-prepare'; clientEventId: string }
  | { type: 'routing-finalize'; clientEventId: string; local: LocalRoutingResult };
type TrustedJob = Extract<Job, { type: 'assessment-start' | 'safety-evaluate' | 'routing-finalize' | 'soap-prepare' }>;

const defaultSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });

function snapshotEquals(left: PersistenceSnapshot, right: PersistenceSnapshot): boolean {
  return (
    left.state === right.state &&
    left.pending === right.pending &&
    left.failed === right.failed &&
    left.lastErrorKind === right.lastErrorKind &&
    left.disabledReason === right.disabledReason
  );
}

/** A persistence session that never writes, for builds where persistence is off. */
export function createDisabledPersistence(reason: PersistenceDisabledReason): AssessmentPersistence {
  const snapshot: PersistenceSnapshot = { state: 'disabled', disabledReason: reason, pending: 0, failed: 0, lastErrorKind: null };
  return {
    begin: () => undefined,
    observeAnswers: () => undefined,
    requestSafetyEvaluation: () => undefined,
    requestRoutingFinalization: () => undefined,
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    whenIdle: () => Promise.resolve(),
    outcomes: () => [],
    identifiers: () => ({ assessmentId: null, ownerAuthUserId: null }),
    dispose: () => Promise.resolve(),
  };
}

export function createAssessmentPersistence(options: PersistenceOptions): AssessmentPersistence {
  const newId = options.newId ?? randomId;
  const now = options.now ?? (() => new Date().toISOString());
  const sleep = options.sleep ?? defaultSleep;
  const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const contractVersion = options.contractVersion ?? ASSESSMENT_CONTRACT_VERSION;
  const trustedOperations = options.trustedOperations ?? false;
  const admissionPath = options.admissionPath ?? 'self';
  const endOnDispose = options.endOnDispose ?? false;
  const endTimeoutMs = options.endTimeoutMs ?? END_ON_DISPOSE_TIMEOUT_MS;
  const abort = new AbortController();

  const queue: Job[] = [];
  const trackers: Record<AnswerStream, StreamTracker> = {
    intake: createStreamTracker('intake'),
    routing: createStreamTracker('routing'),
    safety: createStreamTracker('safety'),
  };
  const recordIds = new Map<string, string>();
  const streamRecordIds: Record<AnswerStream, string[]> = { intake: [], routing: [], safety: [] };
  const results: PersistenceOutcome[] = [];
  const listeners = new Set<() => void>();
  const idleWaiters: Array<() => void> = [];

  let gateway: PersistenceGateway | null = null;
  let complaintId: string | null = null;
  let complaintSource: AssessmentStart['complaintSource'] | null = null;
  let clinicalContext: AssessmentStart['clinicalContext'];
  let ownerAuthUserId: string | null = null;
  let assessmentId: string | null = null;
  let started = false;
  let disposed = false;
  let running = false;
  let failedCount = 0;
  let trustedStarted = false;
  let safetyRequested = false;
  let routingRequested = false;
  let routeRevision: LocalRoutingResult | null = null;
  let lastErrorKind: PersistenceErrorKind | null = null;
  let snapshot: PersistenceSnapshot = { state: 'idle', disabledReason: null, pending: 0, failed: 0, lastErrorKind: null };

  function computeSnapshot(): PersistenceSnapshot {
    const pending = queue.length + (running ? 1 : 0);
    const state: PersistenceState = !started
      ? 'idle'
      : pending > 0
        ? 'pending'
        : failedCount > 0
          ? 'failed'
          : 'saved';
    return { state, disabledReason: null, pending, failed: failedCount, lastErrorKind };
  }

  function publish() {
    const next = computeSnapshot();
    if (!snapshotEquals(next, snapshot)) {
      snapshot = next;
      for (const listener of [...listeners]) listener();
    }
    if (next.pending === 0) for (const resolve of idleWaiters.splice(0)) resolve();
  }

  function record(outcome: PersistenceOutcome) {
    results.push(outcome);
    if (outcome.status === 'failed') {
      failedCount += 1;
      lastErrorKind = outcome.error;
    }
  }

  function enqueue(job: Job) {
    if (disposed) return;
    queue.push(job);
    publish();
    void pump();
  }

  async function withRetry<T>(operation: () => Promise<GatewayResult<T>>): Promise<{ result: GatewayResult<T>; attempts: number }> {
    let attempts = 0;
    for (;;) {
      attempts += 1;
      const result = await operation();
      if (!('error' in result) || !isRetryable(result.error) || attempts > retryDelays.length || disposed) {
        return { result, attempts };
      }
      await sleep(retryDelays[attempts - 1], abort.signal);
      if (disposed) return { result: { ok: false, error: { kind: 'aborted', code: 'disposed', status: null } }, attempts };
    }
  }

  async function runIdentity(job: Extract<Job, { type: 'identity' }>) {
    let created: PersistenceGateway;
    try {
      created = await options.createGateway(abort.signal);
    } catch {
      // The backend client could not be loaded, for example offline.
      if (!disposed) record({ clientEventId: job.clientEventId, kind: 'identity', status: 'failed', error: 'transient', attempts: 0 });
      return;
    }
    if (disposed) {
      await created.close();
      return;
    }
    gateway = created;
    // One attempt only: a retried sign-in whose first response was lost would
    // mint a second, orphaned anonymous identity.
    const result = await gateway.signInAnonymously();
    if (disposed) return;
    if ('value' in result) {
      ownerAuthUserId = result.value.userId;
      record({ clientEventId: job.clientEventId, kind: 'identity', status: 'saved', error: null, attempts: 1 });
    } else {
      record({ clientEventId: job.clientEventId, kind: 'identity', status: 'failed', error: result.error.kind, attempts: 1 });
    }
  }

  async function runAssessment(job: Extract<Job, { type: 'assessment' }>) {
    if (!gateway || !ownerAuthUserId) {
      record({ clientEventId: job.clientEventId, kind: 'assessment', status: 'failed', error: 'dependency-failed', attempts: 0 });
      return;
    }
    const activeGateway = gateway;
    const owner = ownerAuthUserId;
    let firstAttempt = true;
    const { result, attempts } = await withRetry(async () => {
      // A fresh identity owns only what this session created, so on a retry
      // an existing row is the earlier attempt whose response was lost.
      if (!firstAttempt) {
        const existing = await activeGateway.findOwnAssessment(owner, contractVersion);
        if ('value' in existing && existing.value) return { ok: true, value: existing.value };
      }
      firstAttempt = false;
      return activeGateway.insertAssessment(toAssessmentInsert(owner, contractVersion));
    });
    if (disposed) return;
    if ('value' in result) {
      assessmentId = result.value;
      record({ clientEventId: job.clientEventId, kind: 'assessment', status: 'saved', error: null, attempts });
    } else {
      record({ clientEventId: job.clientEventId, kind: 'assessment', status: 'failed', error: result.error.kind, attempts });
    }
  }

  async function runAdmission(job: Extract<Job, { type: 'admission' }>) {
    if (!gateway?.admitPatient || !ownerAuthUserId || !complaintId || !complaintSource) {
      record({ clientEventId: job.clientEventId, kind: 'admission', status: 'failed', error: 'dependency-failed', attempts: 0 });
      return;
    }
    const activeGateway = gateway;
    const request = { clientEventId: job.clientEventId, complaintId, complaintSource };
    // The same operation key on every retry: a lost response replays the
    // original admission instead of binding a second assessment.
    const { result, attempts } = await withRetry(() => activeGateway.admitPatient!(request));
    if (disposed) return;
    if ('value' in result && result.value.status === 'in_progress') {
      assessmentId = result.value.assessmentId;
      trustedStarted = true;
      record({ clientEventId: job.clientEventId, kind: 'admission', status: 'saved', error: null, attempts });
    } else {
      record({
        clientEventId: job.clientEventId,
        kind: 'admission',
        status: 'failed',
        error: 'error' in result ? result.error.kind : 'rejected',
        attempts,
      });
    }
  }

  function prepareEvidence(event: PersistenceEvent): { insert: EvidenceInsert } | { error: PersistenceError } {
    if (!assessmentId || !complaintId) return { error: { kind: 'dependency-failed', code: 'no-assessment', status: null } };
    if (event.kind === 'body') {
      const valid = validateBodySelection(event);
      if ('issues' in valid) return { error: { kind: 'validation', code: valid.issues[0] ?? 'invalid', status: null } };
      return { insert: toBodySelectionInsert(assessmentId, valid.value, null) };
    }
    let supersedesRecordId: string | null = null;
    if (event.supersedesClientEventId) {
      supersedesRecordId = recordIds.get(event.supersedesClientEventId) ?? null;
      if (!supersedesRecordId) return { error: { kind: 'dependency-failed', code: 'superseded-event-not-saved', status: null } };
    }
    const valid = validateAnswerEvent(event, complaintId, clinicalContext);
    if ('issues' in valid) return { error: { kind: 'validation', code: valid.issues[0] ?? 'invalid', status: null } };
    return { insert: toAnswerInsert(assessmentId, valid.value, supersedesRecordId) };
  }

  async function runEvidence(event: PersistenceEvent) {
    const prepared = prepareEvidence(event);
    if ('error' in prepared) {
      record({ clientEventId: event.clientEventId, kind: event.kind, status: 'failed', error: prepared.error.kind, attempts: 0 });
      return;
    }
    const activeGateway = gateway;
    const currentAssessment = assessmentId;
    if (!activeGateway || !currentAssessment) return;
    const { insert } = prepared;

    const { result, attempts } = await withRetry<string>(async () => {
      const inserted = await activeGateway.insertEvidence(insert);
      if (!('error' in inserted) || inserted.error.kind !== 'duplicate') return inserted;
      const stored = await activeGateway.findEvidenceByClientEvent(insert.table, currentAssessment, event.clientEventId);
      if ('error' in stored) return { ok: false, error: stored.error };
      if (!stored.value) {
        // The unique key that fired was not this event's own identity: a
        // sequence or correction-chain collision, which a retry cannot fix.
        return { ok: false, error: { kind: 'lineage-conflict', code: '23505', status: inserted.error.status } };
      }
      if (storedRowMatches(stored.value.row, insert)) return { ok: true, value: stored.value.id };
      return { ok: false, error: { kind: 'idempotency-conflict', code: '23505', status: inserted.error.status } };
    });
    if (disposed) return;
    if ('value' in result) {
      recordIds.set(event.clientEventId, result.value);
      if (event.kind === 'answer') streamRecordIds[event.stream].push(result.value);
      record({ clientEventId: event.clientEventId, kind: event.kind, status: 'saved', error: null, attempts });
    } else {
      record({ clientEventId: event.clientEventId, kind: event.kind, status: 'failed', error: result.error.kind, attempts });
    }
  }

  async function runClinicalContext(job: Extract<Job, { type: 'clinical-context' }>) {
    if (!gateway?.insertClinicalContext || !assessmentId || !clinicalContext) {
      record({ clientEventId: job.clientEventId, kind: 'clinical-context', status: 'failed', error: 'dependency-failed', attempts: 0 });
      return;
    }
    const row = toClinicalContextInsert(assessmentId, job.clientEventId, clinicalContext);
    const { result, attempts } = await withRetry(() => gateway!.insertClinicalContext!(row));
    if (disposed) return;
    record({ clientEventId: job.clientEventId, kind: 'clinical-context',
      status: 'value' in result ? 'saved' : 'failed',
      error: 'error' in result ? result.error.kind : null, attempts });
  }

  function failedTrusted(job: Extract<Job, { clientEventId: string }>, kind: PersistenceErrorKind, attempts = 0) {
    record({ clientEventId: job.clientEventId, kind: job.type, status: 'failed', error: kind, attempts });
  }

  async function invokeTrusted(job: TrustedJob) {
    if (!gateway?.invokeTrusted || !assessmentId || !trustedStarted && job.type !== 'assessment-start') {
      return { result: { ok: false as const, error: { kind: 'dependency-failed' as const, code: 'trusted-start-required', status: null } }, attempts: 0 };
    }
    const activeGateway = gateway;
    const id = assessmentId;
    const request = () => activeGateway.invokeTrusted!(job.type, {
      assessmentId: id,
      clientEventId: job.clientEventId,
      ...(job.type === 'assessment-start' ? { complaintId: complaintId!, complaintSource: complaintSource! } : {}),
    });
    let totalAttempts = 0;
    for (let staleRetry = 0; staleRetry <= 2; staleRetry += 1) {
      const { result, attempts } = await withRetry(request);
      totalAttempts += attempts;
      if (disposed || !('error' in result) || result.error.code !== 'STALE_EVIDENCE' || staleRetry === 2) {
        return { result, attempts: totalAttempts };
      }
      // Reconcile the server's accepted event identities with this session's
      // in-memory queue. A foreign or changed revision must not be finalized.
      if (!activeGateway.readEvidenceIds) return { result, attempts: totalAttempts };
      const remote = await activeGateway.readEvidenceIds(id);
      if ('error' in remote || (['intake', 'routing', 'safety'] as const).some((stream) =>
        remote.value[stream].length !== streamRecordIds[stream].length ||
        remote.value[stream].some((rowId, index) => rowId !== streamRecordIds[stream][index]))) {
        return { result, attempts: totalAttempts };
      }
      await sleep(retryDelays[0] ?? 400, abort.signal);
    }
    throw new Error('unreachable');
  }

  function localRevisionMatches(local: LocalRoutingResult): boolean {
    const active = trackers.routing.active;
    return local.answers.length === active.size && local.answers.every((answer) =>
      active.get(answer.questionId)?.optionId === answer.optionId);
  }

  function canonicalString(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalString).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalString(item)}`).join(',')}}`;
    return JSON.stringify(value) ?? 'undefined';
  }

  function localClinicalOutcome(): CanonicalClinicalOutcome | null {
    if (!clinicalContext) return null;
    try {
      const answers = (['intake', 'safety', 'routing'] as const).flatMap((stream) =>
        [...trackers[stream].active.entries()].map(([questionId, { optionId }]) => ({ questionId, optionId })));
      return replayClinicalEvidence(clinicalContext, answers).outcome;
    } catch {
      return null;
    }
  }

  async function runTrusted(job: TrustedJob) {
    if (!trustedOperations) return;
    if (job.type !== 'assessment-start' && failedCount > 0) {
      failedTrusted(job, 'dependency-failed');
      return;
    }
    if (job.type === 'routing-finalize' && !localRevisionMatches(job.local)) {
      failedTrusted(job, 'validation');
      return;
    }
    if (job.type === 'soap-prepare' && (!routeRevision || !localRevisionMatches(routeRevision))) {
      failedTrusted(job, 'validation');
      return;
    }
    const { result, attempts } = await invokeTrusted(job);
    if (disposed) return;
    if ('error' in result) {
      failedTrusted(job, result.error.kind, attempts);
      return;
    }
    if (job.type === 'assessment-start') {
      trustedStarted = result.value.status === 'in_progress';
      if (!trustedStarted) failedTrusted(job, 'rejected', attempts);
      else record({ clientEventId: job.clientEventId, kind: job.type, status: 'saved', error: null, attempts });
      return;
    }
    if (job.type === 'safety-evaluate') {
      if (!result.value.safetyEventId || result.value.status !== 'priority_escalated') {
        failedTrusted(job, 'rejected', attempts);
      } else if (gateway?.readCanonicalOutcome && assessmentId) {
        const stored = await gateway.readCanonicalOutcome(assessmentId, result.value.safetyEventId);
        const expected = localClinicalOutcome();
        if ('error' in stored || !stored.value || !expected || expected.status !== 'hard-stop'
          || stored.value.soapSections !== null
          || canonicalString(stored.value.outcome) !== canonicalString(expected)
          || canonicalString(result.value.trusted) !== canonicalString(expected)) {
          failedTrusted(job, 'validation', attempts);
        } else record({ clientEventId: job.clientEventId, kind: job.type, status: 'saved', error: null, attempts });
      } else record({ clientEventId: job.clientEventId, kind: job.type, status: 'saved', error: null, attempts });
      return;
    }
    if (job.type === 'soap-prepare') {
      if (!result.value.soapHandoffId || result.value.status !== 'handoff_prepared') failedTrusted(job, 'rejected', attempts);
      else record({ clientEventId: job.clientEventId, kind: job.type, status: 'saved', error: null, attempts });
      return;
    }
    const activeGateway = gateway;
    const currentAssessment = assessmentId;
    if (activeGateway?.readCanonicalOutcome && currentAssessment) {
      if (!result.value.routingResultId || result.value.soapHandoffId !== result.value.routingResultId
        || result.value.status !== 'handoff_prepared') {
        failedTrusted(job, 'rejected', attempts);
        return;
      }
      const stored = await activeGateway.readCanonicalOutcome(currentAssessment, result.value.routingResultId);
      if (disposed) return;
      const expected = localClinicalOutcome();
      const sections = 'value' in stored ? stored.value?.soapSections : null;
      if ('error' in stored || !stored.value || !expected || expected.status !== 'route'
        || !sections || !(['S', 'O', 'A', 'P'] as const).every((key) => Array.isArray(sections[key]))
        || !localRevisionMatches(job.local)
        || canonicalString(stored.value.outcome) !== canonicalString(expected)
        || canonicalString(result.value.trusted) !== canonicalString(expected)) {
        failedTrusted(job, 'validation', attempts);
        return;
      }
      record({ clientEventId: job.clientEventId, kind: job.type, status: 'saved', error: null, attempts });
      return;
    }
    if (!activeGateway?.readRoutingResult || !currentAssessment || !result.value.routingResultId) {
      failedTrusted(job, 'dependency-failed', attempts);
      return;
    }
    const stored = await activeGateway.readRoutingResult(currentAssessment, result.value.routingResultId);
    if (disposed) return;
    if ('error' in stored || !stored.value || !localRevisionMatches(job.local)) {
      failedTrusted(job, 'rejected', attempts);
      return;
    }
    const support = job.local.answers.map((answer) => {
      const eventId = trackers.routing.active.get(answer.questionId)?.clientEventId;
      return eventId ? recordIds.get(eventId) : undefined;
    });
    if (support.some((id) => !id) || !routingResultAgrees(stored.value, {
      ...job.local, supportingAnswerRecordIds: support as string[],
    })) {
      failedTrusted(job, 'validation', attempts);
      return;
    }
    record({ clientEventId: job.clientEventId, kind: job.type, status: 'saved', error: null, attempts });
    routeRevision = job.local;
    enqueue({ type: 'soap-prepare', clientEventId: newId() });
  }

  async function pump() {
    if (running || disposed) return;
    running = true;
    try {
      while (!disposed && queue.length > 0) {
        const job = queue.shift() as Job;
        publish();
        if (job.type === 'identity') await runIdentity(job);
        else if (job.type === 'assessment') await runAssessment(job);
        else if (job.type === 'admission') await runAdmission(job);
        else if (job.type === 'clinical-context') await runClinicalContext(job);
        else if (job.type === 'evidence') await runEvidence(job.event);
        else await runTrusted(job);
      }
    } catch {
      // Defensive: no persistence failure may escape into the interview.
      failedCount += 1;
      lastErrorKind = 'rejected';
    } finally {
      running = false;
      publish();
    }
  }

  return {
    begin(start) {
      if (started || disposed) return;
      started = true;
      const valid = validateAssessmentStart(start);
      if ('issues' in valid) {
        // Malformed input never creates an identity or an assessment.
        record({ clientEventId: newId(), kind: 'assessment', status: 'failed', error: 'validation', attempts: 0 });
        publish();
        return;
      }
      complaintId = start.complaintId;
      complaintSource = start.complaintSource;
      clinicalContext = start.clinicalContext;
      enqueue({ type: 'identity', clientEventId: newId() });
      if (admissionPath === 'trusted') {
        enqueue({ type: 'admission', clientEventId: newId() });
      } else {
        enqueue({ type: 'assessment', clientEventId: newId() });
        if (trustedOperations) enqueue({ type: 'assessment-start', clientEventId: newId() });
      }
      if (clinicalContext) enqueue({ type: 'clinical-context', clientEventId: newId() });
      if (start.location) {
        const body: BodySelectionEvent = { kind: 'body', clientEventId: newId(), ...start.location };
        enqueue({ type: 'evidence', event: body });
      }
    },

    observeAnswers(stream, answers) {
      if (!started || disposed || !complaintId) return;
      const events: AnswerEvent[] = diffAnswers(trackers[stream], answers, newId, now);
      for (const event of events) enqueue({ type: 'evidence', event });
    },

    requestSafetyEvaluation() {
      if (!trustedOperations || !started || disposed || safetyRequested) return;
      safetyRequested = true;
      enqueue({ type: 'safety-evaluate', clientEventId: newId() });
    },

    requestRoutingFinalization(result) {
      if (!trustedOperations || !started || disposed || routingRequested || safetyRequested) return;
      routingRequested = true;
      enqueue({ type: 'routing-finalize', clientEventId: newId(), local: result });
    },

    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    whenIdle() {
      // A disposed session has nothing left to finish, even if a request it
      // abandoned has not settled yet.
      if (disposed || (queue.length === 0 && !running)) return Promise.resolve();
      return new Promise<void>((resolve) => idleWaiters.push(resolve));
    },

    outcomes: () => results,

    identifiers: () => ({ assessmentId, ownerAuthUserId }),

    async dispose() {
      if (disposed) return;
      disposed = true;
      for (const job of queue.splice(0)) {
        const clientEventId = job.type === 'evidence' ? job.event.clientEventId : job.clientEventId;
        const kind = job.type === 'evidence' ? job.event.kind : job.type;
        results.push({ clientEventId, kind, status: 'discarded', error: null, attempts: 0 });
      }
      abort.abort();
      recordIds.clear();
      for (const stream of Object.values(streamRecordIds)) stream.length = 0;
      for (const tracker of Object.values(trackers)) {
        tracker.active.clear();
        tracker.latest.clear();
      }
      listeners.clear();
      for (const resolve of idleWaiters.splice(0)) resolve();
      const closing = gateway;
      const ending = assessmentId;
      gateway = null;
      complaintId = null;
      complaintSource = null;
      routeRevision = null;
      ownerAuthUserId = null;
      assessmentId = null;
      if (closing && ending && endOnDispose && trustedOperations && closing.invokeTrusted) {
        // A separate, short-lived signal: the session signal is already
        // aborted. The patient credential is still in memory until close().
        const endAbort = new AbortController();
        const timer = setTimeout(() => endAbort.abort(), endTimeoutMs);
        const clientEventId = newId();
        try {
          const ended = await closing.invokeTrusted(
            'assessment-end',
            { assessmentId: ending, clientEventId },
            { signal: endAbort.signal, timeoutMs: endTimeoutMs },
          );
          results.push({
            clientEventId,
            kind: 'assessment-end',
            status: 'value' in ended ? 'saved' : 'failed',
            error: 'error' in ended ? ended.error.kind : null,
            attempts: 1,
          });
        } catch {
          results.push({ clientEventId, kind: 'assessment-end', status: 'failed', error: 'transient', attempts: 1 });
        } finally {
          clearTimeout(timer);
        }
      }
      if (closing) await closing.close();
    },
  };
}
