import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  createAssessmentPersistence,
  createDisabledPersistence,
  DEFAULT_RETRY_DELAYS_MS,
  type AssessmentPersistence,
} from '../persistence/assessment-persistence.ts';
import { createStreamTracker, diffAnswers } from '../persistence/answer-diff.ts';
import { isBrowserSafeKey, resolvePersistenceConfig } from '../persistence/config.ts';
import { classifyAuthError, classifyBackendError, type PersistenceError } from '../persistence/errors.ts';
import type { AnswerEvent, AssessmentStart, BodySelectionEvent } from '../persistence/events.ts';
import { createSupabaseGateway, type GatewayResult, type PersistenceGateway, type StoredEvidenceRow } from '../persistence/gateway.ts';
import {
  ASSESSMENT_CONTRACT_VERSION,
  storedRowMatches,
  toAnswerInsert,
  toAssessmentInsert,
  toBodySelectionInsert,
  type ClinicalContextInsert,
  type AssessmentInsert,
  type EvidenceInsert,
  type EvidenceTable,
} from '../persistence/records.ts';
import { createPatientClient, disposePatientClient, patientAuthOptions } from '../persistence/supabase-client.ts';
import { validateAnswerEvent, validateAssessmentStart, validateBodySelection } from '../persistence/validation.ts';
import { trustedClinicalContext } from '../routing-flow/clinical-replay.ts';
import { INTAKE_QUESTION_IDS } from '../routing-flow/intake-questions.ts';
import { BODY_DOMAIN_VERSION } from '../../body/index.ts';
import { ENGINE_VERSION } from '../../engine/index.ts';
import { KNOWLEDGE_VERSION } from '../../engine/data/version.ts';
import { SAFETY_VERSION } from '../../engine/safety/index.ts';
import { answer, controllerFor, currentStep, runInterview, startInterview, type DriverState } from './interview-driver.ts';

const ROOT = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

/* --- fixtures ---------------------------------------------------------------- */

function idSource(prefix = '0') {
  let next = 0;
  return () => {
    next += 1;
    return `${prefix.repeat(8)}-0000-4000-8000-${String(next).padStart(12, '0')}`;
  };
}

const OWNER = 'aaaaaaaa-0000-4000-8000-000000000001';
const T0 = '2026-09-17T10:00:00.000Z';

const HEADACHE_START: AssessmentStart = {
  complaintId: 'headache',
  complaintSource: 'bridge-resolved',
  location: { regionId: 'head', view: 'front', precision: 'exact-point', point: { x: 0.5, y: 0.08 }, capturedAt: T0 },
};

const transient: PersistenceError = { kind: 'transient', code: '', status: 0 };
const rlsDenied: PersistenceError = { kind: 'rls-denied', code: '42501', status: 403 };
const duplicate: PersistenceError = { kind: 'duplicate', code: '23505', status: 409 };

type EvidenceBehaviour = (
  insert: EvidenceInsert,
  attempt: number,
  store: () => GatewayResult<string>,
) => Promise<GatewayResult<string>> | GatewayResult<string>;

interface FakeOptions {
  signIn?: () => Promise<GatewayResult<{ userId: string }>>;
  insertAssessment?: (row: AssessmentInsert, attempt: number, store: () => GatewayResult<string>) => Promise<GatewayResult<string>> | GatewayResult<string>;
  evidence?: EvidenceBehaviour;
  find?: (table: EvidenceTable, clientEventId: string, stored: StoredEvidenceRow | null) => GatewayResult<StoredEvidenceRow | null>;
}

function fakeBackend(options: FakeOptions = {}) {
  const ids = idSource('b');
  const assessments: Array<{ id: string; row: AssessmentInsert }> = [];
  const rows: Array<{ table: EvidenceTable; id: string; row: EvidenceInsert['row'] }> = [];
  const calls = { signIn: 0, assessmentAttempts: 0, evidenceAttempts: [] as EvidenceInsert[], closed: 0, gateways: 0 };
  const attemptsByEvent = new Map<string, number>();

  const storeEvidence = (insert: EvidenceInsert): GatewayResult<string> => {
    const existing = rows.find((entry) => entry.table === insert.table && entry.row.client_event_id === insert.row.client_event_id);
    if (existing) return { ok: false, error: duplicate };
    const id = ids();
    rows.push({ table: insert.table, id, row: insert.row });
    return { ok: true, value: id };
  };

  const gateway: PersistenceGateway = {
    async signInAnonymously() {
      calls.signIn += 1;
      return options.signIn ? options.signIn() : { ok: true, value: { userId: OWNER } };
    },
    async findOwnAssessment(owner, contractVersion) {
      const found = assessments.find((entry) => entry.row.owner_auth_user_id === owner && entry.row.contract_version === contractVersion);
      return { ok: true, value: found?.id ?? null };
    },
    async insertAssessment(row) {
      calls.assessmentAttempts += 1;
      const store = (): GatewayResult<string> => {
        const id = ids();
        assessments.push({ id, row });
        return { ok: true, value: id };
      };
      return options.insertAssessment ? options.insertAssessment(row, calls.assessmentAttempts, store) : store();
    },
    async insertEvidence(insert) {
      calls.evidenceAttempts.push(insert);
      const key = insert.row.client_event_id;
      const attempt = (attemptsByEvent.get(key) ?? 0) + 1;
      attemptsByEvent.set(key, attempt);
      return options.evidence ? options.evidence(insert, attempt, () => storeEvidence(insert)) : storeEvidence(insert);
    },
    async findEvidenceByClientEvent(table, assessmentId, clientEventId) {
      const entry = rows.find(
        (candidate) => candidate.table === table && candidate.row.assessment_id === assessmentId && candidate.row.client_event_id === clientEventId,
      );
      const stored = entry ? { id: entry.id, row: { ...entry.row, id: entry.id } } : null;
      return options.find ? options.find(table, clientEventId, stored) : { ok: true, value: stored };
    },
    async close() {
      calls.closed += 1;
    },
  };

  return { gateway, calls, rows, assessments };
}

function persistenceWith(backend: ReturnType<typeof fakeBackend>, delays: number[] = []) {
  const persistence = createAssessmentPersistence({
    createGateway: () => {
      backend.calls.gateways += 1;
      return backend.gateway;
    },
    newId: idSource('c'),
    now: () => T0,
    sleep: async (ms) => {
      delays.push(ms);
    },
  });
  return persistence;
}

function tableRows(backend: ReturnType<typeof fakeBackend>, table: EvidenceTable): Array<Readonly<Record<string, unknown>>> {
  return backend.rows.filter((entry) => entry.table === table).map((entry) => entry.row);
}

/** Replays an interview while persistence observes each committed state. */
function observe(persistence: AssessmentPersistence, state: DriverState) {
  persistence.observeAnswers('intake', state.intakeAnswers);
  persistence.observeAnswers('routing', state.session.answers);
  persistence.observeAnswers('safety', state.safetyAnswers);
}

/* --- 1. configuration and memory-only Auth --------------------------------- */

test('persistence is enabled only for web/self-service with a browser-safe key', () => {
  const url = 'https://example.supabase.co';
  const publishableKey = 'sb_publishable_example';
  assert.equal(resolvePersistenceConfig({ url, publishableKey, deploymentMode: 'web/self-service' }).enabled, true);
  // R9G-B admits staffed-tablet patients through a trusted care-team session
  // (see r9g-b-admission.test.ts). Hospital-kiosk still has no trusted
  // admission and stays local-only.
  const kiosk = resolvePersistenceConfig({ url, publishableKey, deploymentMode: 'hospital-kiosk' });
  assert.deepEqual(kiosk, { enabled: false, reason: 'requires-trusted-admission', deploymentMode: 'hospital-kiosk' });
  assert.equal(
    resolvePersistenceConfig({ url: undefined, publishableKey, deploymentMode: 'web/self-service' }).enabled,
    false,
  );
  assert.equal(
    resolvePersistenceConfig({ url: 'http://example.com', publishableKey, deploymentMode: 'web/self-service' }).enabled,
    false,
  );
  const secret = resolvePersistenceConfig({ url, publishableKey: 'sb_secret_example', deploymentMode: 'web/self-service' });
  assert.equal('reason' in secret && secret.reason, 'unsafe-key');

  const jwt = (role: string) =>
    ['e30', Buffer.from(JSON.stringify({ role })).toString('base64url'), 'sig'].join('.');
  assert.equal(isBrowserSafeKey(jwt('anon')), true);
  assert.equal(isBrowserSafeKey(jwt('service_role')), false);
  assert.equal(isBrowserSafeKey('not-a-key'), false);
});

test('the patient client keeps Auth in memory only, with a unique storage key per patient', () => {
  const options = patientAuthOptions('one');
  assert.equal(options.persistSession, false);
  assert.equal(options.detectSessionInUrl, false);
  assert.notEqual(options.storageKey, patientAuthOptions('two').storageKey);
  const clientSource = source('src/features/persistence/supabase-client.ts');
  assert.match(clientSource, /persistSession: false/);
  assert.doesNotMatch(clientSource, /\bstorage:\s/, 'no custom storage adapter is supplied');
  // The runtime reads only the two browser-safe variables.
  const runtime = source('src/features/persistence/runtime.ts');
  assert.deepEqual(runtime.match(/VITE_[A-Z_]+/g), ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']);
});

class SpyStorage {
  writes: string[] = [];
  reads: string[] = [];
  private values = new Map<string, string>();
  getItem(key: string) {
    this.reads.push(key);
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.writes.push(key);
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  seed(key: string, value: string) {
    this.values.set(key, value);
  }
}

function withSpyStorage<T>(run: (local: SpyStorage, session: SpyStorage) => Promise<T>): Promise<T> {
  const target = globalThis as { localStorage?: unknown; sessionStorage?: unknown };
  const saved = {
    local: Object.getOwnPropertyDescriptor(target, 'localStorage'),
    session: Object.getOwnPropertyDescriptor(target, 'sessionStorage'),
  };
  const local = new SpyStorage();
  const session = new SpyStorage();
  Object.defineProperty(target, 'localStorage', { value: local, configurable: true, writable: true });
  Object.defineProperty(target, 'sessionStorage', { value: session, configurable: true, writable: true });
  return run(local, session).finally(() => {
    if (saved.local) Object.defineProperty(target, 'localStorage', saved.local);
    else delete target.localStorage;
    if (saved.session) Object.defineProperty(target, 'sessionStorage', saved.session);
    else delete target.sessionStorage;
  });
}

function fakeAuthFetch(requests: string[]): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push(`${init?.method ?? 'GET'} ${new URL(url).pathname}`);
    if (url.includes('/auth/v1/signup')) {
      const now = Math.floor(Date.now() / 1000);
      return new Response(
        JSON.stringify({
          access_token: 'header.payload.signature',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: now + 3600,
          refresh_token: 'refresh-placeholder',
          user: { id: OWNER, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: T0 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(null, { status: 204 });
  };
}

test('anonymous sign-in goes through the gateway and writes nothing to browser storage', async () => {
  await withSpyStorage(async (local, session) => {
    const requests: string[] = [];
    const client = createPatientClient('https://example.supabase.co', 'sb_publishable_example', 'spy', fakeAuthFetch(requests));
    const gateway = createSupabaseGateway(client, new AbortController().signal);
    const result = await gateway.signInAnonymously();
    assert.deepEqual(result, { ok: true, value: { userId: OWNER } });
    assert.ok(requests.includes('POST /auth/v1/signup'));
    assert.equal((await client.auth.getSession()).data.session?.user.id, OWNER, 'session lives in memory');
    assert.deepEqual(local.writes, []);
    assert.deepEqual(session.writes, []);

    await gateway.close();
    assert.equal((await client.auth.getSession()).data.session, null, 'close ends the in-memory session');
    assert.deepEqual(local.writes, []);
    assert.deepEqual(session.writes, []);
  });
});

test('a refreshed page restores no earlier patient, even if a session is sitting in storage', async () => {
  await withSpyStorage(async (local) => {
    const planted = JSON.stringify({ access_token: 'planted', refresh_token: 'planted', user: { id: OWNER } });
    local.seed(patientAuthOptions('reloaded').storageKey, planted);
    local.seed('sb-example-auth-token', planted);
    const requests: string[] = [];
    const client = createPatientClient('https://example.supabase.co', 'sb_publishable_example', 'reloaded', fakeAuthFetch(requests));
    assert.equal((await client.auth.getSession()).data.session, null);
    assert.deepEqual(local.reads, [], 'browser storage is never consulted');
    assert.deepEqual(requests, []);
    await disposePatientClient(client);
  });
});

test('an anonymous sign-in that is not anonymous, or fails, is a typed failure', async () => {
  assert.equal(classifyAuthError({ name: 'AuthRetryableFetchError', status: 0 }).kind, 'transient');
  assert.equal(classifyAuthError({ name: 'AuthApiError', status: 422, code: 'anonymous_provider_disabled' }).kind, 'auth');

  const backend = fakeBackend({ signIn: async () => ({ ok: false, error: transient }) });
  const delays: number[] = [];
  const persistence = persistenceWith(backend, delays);
  persistence.begin(HEADACHE_START);
  await persistence.whenIdle();
  assert.equal(backend.calls.signIn, 1, 'sign-in is attempted once, never retried into orphan identities');
  assert.equal(backend.calls.assessmentAttempts, 0);
  assert.deepEqual(delays, []);
  assert.equal(persistence.getSnapshot().state, 'failed');
  assert.deepEqual(
    persistence.outcomes().map((outcome) => [outcome.kind, outcome.status, outcome.error]),
    [
      ['identity', 'failed', 'transient'],
      ['assessment', 'failed', 'dependency-failed'],
      ['body', 'failed', 'dependency-failed'],
    ],
  );
});

/* --- 2. mappings -------------------------------------------------------------- */

test('assessment payload carries only R9C-granted columns and the frozen versions', () => {
  const row = toAssessmentInsert(OWNER);
  assert.deepEqual(row, {
    contract_version: ASSESSMENT_CONTRACT_VERSION,
    owner_auth_user_id: OWNER,
    deployment_mode: 'web/self-service',
    engine_version: ENGINE_VERSION,
    knowledge_version: KNOWLEDGE_VERSION,
    safety_version: SAFETY_VERSION,
  });
  for (const forbidden of ['status', 'facility_id', 'device_id', 'complaint_id', 'staff_profile_id', 'id']) {
    assert.equal(forbidden in row, false, forbidden);
  }
});

test('body selection keeps region, view, precision and normalized point exactly', () => {
  const exact: BodySelectionEvent = { kind: 'body', clientEventId: idSource()(), ...HEADACHE_START.location! };
  const insert = toBodySelectionInsert('assessment-1', exact, null);
  assert.equal(insert.table, 'body_selections');
  assert.deepEqual(insert.row, {
    assessment_id: 'assessment-1',
    region_id: 'head',
    view: 'front',
    precision: 'exact-point',
    point_x: 0.5,
    point_y: 0.08,
    body_domain_version: BODY_DOMAIN_VERSION,
    captured_at: T0,
    client_event_id: exact.clientEventId,
    supersedes_record_id: null,
  });

  const general: BodySelectionEvent = { ...exact, regionId: 'left-knee', precision: 'general-area', point: null };
  const generalRow = toBodySelectionInsert('assessment-1', general, null).row;
  assert.equal(generalRow.region_id, 'left-knee', 'laterality stays in the stable region ID');
  assert.equal(generalRow.point_x, null);
  assert.equal(generalRow.point_y, null);
  assert.ok(!('specialty' in generalRow) && !('system_id' in generalRow), 'no anatomy or specialty inference');
});

function answerEvent(stream: AnswerEvent['stream'], questionId: string, optionId: string | null, extra: Partial<AnswerEvent> = {}): AnswerEvent {
  return {
    kind: 'answer',
    stream,
    clientEventId: idSource('d')(),
    questionId,
    optionId,
    operation: optionId === null ? 'cleared' : 'selected',
    sequence: 1,
    answeredAt: T0,
    supersedesClientEventId: null,
    ...extra,
  };
}

test('contextual intake evidence uses the confirmed replay context and rejects a changed complaint', () => {
  const clinicalContext = { bodyRegionId: 'head', faceSubregionId: null, concernId: 'pain',
    age: 34, sexForAssessment: 'male', reporter: null };
  assert.equal(trustedClinicalContext(clinicalContext).complaintId, 'headache');
  const entry = answerEvent('intake', INTAKE_QUESTION_IDS.complaintEntry, 'pain');
  const accepted = validateAnswerEvent(entry, 'headache', clinicalContext);
  assert.ok('value' in accepted);
  assert.equal(accepted.value.intakeCategory, 'context');
  assert.ok('issues' in validateAnswerEvent(entry, 'headache'), 'the old context-free plan cannot validate this evidence');
  assert.ok('issues' in validateAnswerEvent(entry, 'shortness-of-breath', clinicalContext));
  assert.ok('issues' in validateAssessmentStart({ ...HEADACHE_START, clinicalContext: { ...clinicalContext, age: -1 } }));
});

test('the persistence queue stores minimal replay context before contextual answers', async () => {
  const backend = fakeBackend();
  let stored: ClinicalContextInsert | null = null;
  backend.gateway.insertClinicalContext = async (row) => {
    stored = row;
    return { ok: true, value: row.assessment_id };
  };
  const persistence = persistenceWith(backend);
  const clinicalContext = { bodyRegionId: 'head', faceSubregionId: null, concernId: 'pain',
    age: 34, sexForAssessment: 'male', reporter: null };
  persistence.begin({ ...HEADACHE_START, clinicalContext });
  persistence.observeAnswers('intake', [{ questionId: INTAKE_QUESTION_IDS.complaintEntry,
    optionId: 'pain', answeredAt: T0 }]);
  await persistence.whenIdle();
  assert.equal(stored?.body_region_id, 'head');
  assert.equal(stored?.age_years, 34);
  assert.deepEqual(tableRows(backend, 'intake_answers')
    .map((row) => row.question_id), [INTAKE_QUESTION_IDS.complaintEntry]);
  assert.equal(persistence.getSnapshot().state, 'saved');
  assert.equal(JSON.stringify(stored).match(/name|phone|date.of.birth|dob/i), null);
});

test('intake, routing and safety answers map to three separate tables with stable IDs only', () => {
  const intake = validateAnswerEvent(answerEvent('intake', 'intake-headache-intensity', '5'), 'headache');
  assert.ok('value' in intake);
  const intakeInsert = toAnswerInsert('assessment-1', intake.value, null);
  assert.equal(intakeInsert.table, 'intake_answers');
  assert.equal('category' in intakeInsert.row && intakeInsert.row.category, 'intensity');
  assert.equal('knowledge_version' in intakeInsert.row, false, 'intake is not routing evidence');

  const { state } = runInterview('headache', {}, 'no');
  const routingAnswer = state.session.answers[0];
  const routing = validateAnswerEvent(answerEvent('routing', routingAnswer.questionId, routingAnswer.optionId), 'headache');
  assert.ok('value' in routing);
  const routingInsert = toAnswerInsert('assessment-1', routing.value, null);
  assert.equal(routingInsert.table, 'routing_answers');
  assert.equal('knowledge_version' in routingInsert.row && routingInsert.row.knowledge_version, KNOWLEDGE_VERSION);

  const safety = validateAnswerEvent(answerEvent('safety', 'safety-headache-sudden-extremely-painful', 'yes'), 'headache');
  assert.ok('value' in safety);
  const safetyInsert = toAnswerInsert('assessment-1', safety.value, null);
  assert.equal(safetyInsert.table, 'safety_answers');
  assert.equal('safety_version' in safetyInsert.row && safetyInsert.row.safety_version, SAFETY_VERSION);

  for (const insert of [intakeInsert, routingInsert, safetyInsert]) {
    for (const value of Object.values(insert.row)) {
      assert.ok(typeof value !== 'string' || !/\s{1}[a-z]+\s/i.test(value), `no visible text stored: ${value}`);
    }
  }

  // Streams do not cross: a safety question is not a routing answer, and vice versa.
  assert.ok('issues' in validateAnswerEvent(answerEvent('routing', 'safety-headache-sudden-extremely-painful', 'yes'), 'headache'));
  assert.ok('issues' in validateAnswerEvent(answerEvent('safety', routingAnswer.questionId, routingAnswer.optionId), 'headache'));
  assert.ok('issues' in validateAnswerEvent(answerEvent('intake', routingAnswer.questionId, routingAnswer.optionId), 'headache'));
});

/* --- 3. event identity -------------------------------------------------------- */

test('answer projections become append-only events with stable client event IDs', () => {
  const tracker = createStreamTracker('intake');
  const newId = idSource('e');
  const first = diffAnswers(tracker, [{ questionId: 'q1', optionId: 'a', answeredAt: T0 }], newId, () => T0);
  assert.equal(first.length, 1);
  assert.equal(first[0].operation, 'selected');
  assert.equal(first[0].sequence, 1);

  assert.deepEqual(diffAnswers(tracker, [{ questionId: 'q1', optionId: 'a', answeredAt: T0 }], newId, () => T0), [], 'same answer, no event');

  const changed = diffAnswers(tracker, [{ questionId: 'q1', optionId: 'b', answeredAt: T0 }], newId, () => T0);
  assert.equal(changed[0].supersedesClientEventId, first[0].clientEventId);
  assert.equal(changed[0].sequence, 2);

  const cleared = diffAnswers(tracker, [], newId, () => T0);
  assert.equal(cleared[0].operation, 'cleared');
  assert.equal(cleared[0].optionId, null);
  assert.equal(cleared[0].supersedesClientEventId, changed[0].clientEventId);

  const returned = diffAnswers(tracker, [{ questionId: 'q1', optionId: 'a', answeredAt: T0 }], newId, () => T0);
  assert.equal(returned[0].supersedesClientEventId, cleared[0].clientEventId);
  assert.equal(new Set([first, changed, cleared, returned].flat().map((event) => event.clientEventId)).size, 4);
});

test('a full interview persists every stream, with corrections chained by record ID', async () => {
  const backend = fakeBackend();
  const persistence = persistenceWith(backend);
  persistence.begin(HEADACHE_START);
  let state = startInterview('headache');
  observe(persistence, state);
  for (let guard = 0; guard < 60; guard += 1) {
    const step = currentStep(state);
    if (step.kind === 'interrupted' || step.kind === 'result') break;
    state = answer(state, step.kind === 'intake' ? step.question.options[0].id : 'no');
    observe(persistence, state);
  }
  await persistence.whenIdle();

  assert.equal(persistence.getSnapshot().state, 'saved');
  assert.equal(backend.assessments.length, 1);
  assert.equal(tableRows(backend, 'body_selections').length, 1);
  assert.equal(tableRows(backend, 'intake_answers').length, state.intakeAnswers.length);
  assert.equal(tableRows(backend, 'routing_answers').length, state.session.answers.length);
  assert.equal(tableRows(backend, 'safety_answers').length, state.safetyAnswers.length);
  assert.deepEqual(
    tableRows(backend, 'routing_answers').map((row) => [row.question_id, row.option_id]),
    state.session.answers.map((entry) => [entry.questionId, entry.optionId]),
  );
  const { assessmentId, ownerAuthUserId } = persistence.identifiers();
  assert.equal(ownerAuthUserId, OWNER);
  assert.ok(backend.rows.every((entry) => entry.row.assessment_id === assessmentId));

  // A correction supersedes the stored record, not the client event.
  const first = state.intakeAnswers[0];
  persistence.observeAnswers('intake', state.intakeAnswers.filter((entry) => entry.questionId !== first.questionId));
  await persistence.whenIdle();
  const intakeRows = backend.rows
    .filter((entry) => entry.table === 'intake_answers')
    .map((entry) => ({ id: entry.id, row: entry.row as Readonly<Record<string, unknown>> }));
  const clear = intakeRows.at(-1)!;
  assert.equal(clear.row.operation, 'cleared');
  assert.equal(clear.row.supersedes_record_id, intakeRows.find((entry) => entry.row.question_id === first.questionId)!.id);
  await persistence.dispose();
});

/* --- 4. idempotency and retries ---------------------------------------------- */

test('a transient failure is retried with the same client event ID, within the bound', async () => {
  const backend = fakeBackend({
    evidence: (_insert, attempt, store) => (attempt < 3 ? { ok: false, error: transient } : store()),
  });
  const delays: number[] = [];
  const persistence = persistenceWith(backend, delays);
  persistence.begin(HEADACHE_START);
  await persistence.whenIdle();
  const body = persistence.outcomes().find((outcome) => outcome.kind === 'body')!;
  assert.deepEqual([body.status, body.attempts], ['saved', 3]);
  assert.deepEqual(delays, [...DEFAULT_RETRY_DELAYS_MS]);
  assert.equal(new Set(backend.calls.evidenceAttempts.map((insert) => insert.row.client_event_id)).size, 1);
});

test('retries stop at the bound and report failure', async () => {
  const backend = fakeBackend({ evidence: () => ({ ok: false, error: transient }) });
  const delays: number[] = [];
  const persistence = persistenceWith(backend, delays);
  persistence.begin(HEADACHE_START);
  await persistence.whenIdle();
  assert.equal(backend.calls.evidenceAttempts.length, DEFAULT_RETRY_DELAYS_MS.length + 1);
  assert.equal(delays.length, DEFAULT_RETRY_DELAYS_MS.length);
  const snapshot = persistence.getSnapshot();
  assert.deepEqual([snapshot.state, snapshot.lastErrorKind, snapshot.pending], ['failed', 'transient', 0]);
});

test('a lost response followed by a duplicate is success when the stored payload matches', async () => {
  const backend = fakeBackend({
    evidence: (_insert, attempt, store) => {
      const result = store();
      return attempt === 1 ? { ok: false, error: transient } : result;
    },
  });
  const persistence = persistenceWith(backend);
  persistence.begin(HEADACHE_START);
  await persistence.whenIdle();
  const body = persistence.outcomes().find((outcome) => outcome.kind === 'body')!;
  assert.deepEqual([body.status, body.attempts], ['saved', 2]);
  assert.equal(tableRows(backend, 'body_selections').length, 1, 'no duplicate row');
});

test('an assessment insert whose response was lost is recovered, not duplicated', async () => {
  const backend = fakeBackend({
    insertAssessment: (_row, attempt, store) => {
      const result = store();
      return attempt === 1 ? { ok: false, error: transient } : result;
    },
  });
  const persistence = persistenceWith(backend);
  persistence.begin(HEADACHE_START);
  await persistence.whenIdle();
  assert.equal(backend.assessments.length, 1);
  assert.equal(backend.calls.assessmentAttempts, 1, 'the retry found the landed row instead of inserting again');
  assert.equal(persistence.getSnapshot().state, 'saved');
});

test('reusing an idempotency key with different data is a conflict, not success', async () => {
  const backend = fakeBackend({
    evidence: () => ({ ok: false, error: duplicate }),
    find: (_table, clientEventId) => ({
      ok: true,
      value: { id: 'stored-1', row: { client_event_id: clientEventId, region_id: 'chest', view: 'front' } },
    }),
  });
  const delays: number[] = [];
  const persistence = persistenceWith(backend, delays);
  persistence.begin(HEADACHE_START);
  await persistence.whenIdle();
  const body = persistence.outcomes().find((outcome) => outcome.kind === 'body')!;
  assert.deepEqual([body.status, body.error, body.attempts], ['failed', 'idempotency-conflict', 1]);
  assert.deepEqual(delays, [], 'a conflict is never retried');

  assert.equal(storedRowMatches({ region_id: 'head' }, toBodySelectionInsert('a', { kind: 'body', clientEventId: 'x', ...HEADACHE_START.location! }, null)), false);
});

test('a unique conflict on a different key (sequence or chain) is a lineage conflict', async () => {
  const backend = fakeBackend({ evidence: () => ({ ok: false, error: duplicate }), find: () => ({ ok: true, value: null }) });
  const persistence = persistenceWith(backend);
  persistence.begin(HEADACHE_START);
  await persistence.whenIdle();
  assert.equal(persistence.outcomes().find((outcome) => outcome.kind === 'body')!.error, 'lineage-conflict');
});

test('backend errors are classified and only transient ones are retryable', () => {
  assert.equal(classifyBackendError({ code: '42501', status: 403 }).kind, 'rls-denied');
  assert.equal(classifyBackendError({ code: '23505', status: 409 }).kind, 'duplicate');
  assert.equal(classifyBackendError({ code: '23514', status: 400 }).kind, 'rejected');
  assert.equal(classifyBackendError({ code: 'PGRST301', status: 401 }).kind, 'auth');
  assert.equal(classifyBackendError({ code: '', status: 0, message: 'TypeError: fetch failed' }).kind, 'transient');
  assert.equal(classifyBackendError({ code: '', status: 503 }).kind, 'transient');
  assert.equal(classifyBackendError({ code: '', status: 0, message: 'AbortError: aborted' }).kind, 'aborted');
});

test('an RLS denial is reported once and never retried or worked around', async () => {
  const backend = fakeBackend({ evidence: () => ({ ok: false, error: rlsDenied }) });
  const delays: number[] = [];
  const persistence = persistenceWith(backend, delays);
  persistence.begin(HEADACHE_START);
  await persistence.whenIdle();
  const body = persistence.outcomes().find((outcome) => outcome.kind === 'body')!;
  assert.deepEqual([body.status, body.error, body.attempts], ['failed', 'rls-denied', 1]);
  assert.deepEqual(delays, []);
  assert.equal(backend.calls.signIn, 1, 'no second identity is minted to get around the denial');
  const gatewaySource = source('src/features/persistence/gateway.ts');
  assert.doesNotMatch(gatewaySource, /service_role|sb_secret_|\.rpc\(/);
  assert.doesNotMatch(gatewaySource, /from\('(safety_events|routing_results|soap_handoffs)'\)\s*\.insert\(/);
});

/* --- 5. validation ------------------------------------------------------------ */

test('malformed input is rejected before any write', async () => {
  const uuid = idSource('f')();
  const body = (patch: Partial<BodySelectionEvent>): BodySelectionEvent => ({ kind: 'body', clientEventId: uuid, ...HEADACHE_START.location!, ...patch });
  assert.ok('issues' in validateBodySelection(body({ point: { x: 1.2, y: 0.5 } })));
  assert.ok('issues' in validateBodySelection(body({ point: { x: Number.NaN, y: 0.5 } })));
  assert.ok('issues' in validateBodySelection(body({ point: null })), 'exact point needs x and y');
  assert.ok('issues' in validateBodySelection(body({ precision: 'general-area' })), 'general area carries no point');
  assert.ok('issues' in validateBodySelection(body({ regionId: 'spleen' as never })));
  assert.ok('issues' in validateBodySelection(body({ regionId: 'upper-back', view: 'front' })));
  assert.ok('issues' in validateBodySelection(body({ clientEventId: 'not-a-uuid' })));
  assert.ok('issues' in validateBodySelection(body({ capturedAt: 'yesterday' })));
  assert.ok('value' in validateBodySelection(body({})));

  assert.ok('issues' in validateAnswerEvent(answerEvent('intake', 'intake-headache-intensity', 'eleven'), 'headache'));
  assert.ok('issues' in validateAnswerEvent(answerEvent('intake', 'intake-headache-intensity', '5'), 'joint-pain'));
  assert.ok('issues' in validateAnswerEvent(answerEvent('intake', 'Severe headache', '5'), 'headache'), 'visible text is not an ID');
  assert.ok('issues' in validateAnswerEvent(answerEvent('intake', 'intake-headache-intensity', '5', { clientEventId: '1' }), 'headache'));
  assert.ok('issues' in validateAnswerEvent(answerEvent('intake', 'intake-headache-intensity', '5', { sequence: 0 }), 'headache'));
  assert.ok(
    'issues' in validateAnswerEvent(answerEvent('intake', 'intake-headache-intensity', '5', { operation: 'cleared', supersedesClientEventId: uuid }), 'headache'),
    'a clear carries no option',
  );
  assert.ok('issues' in validateAnswerEvent(answerEvent('intake', 'intake-headache-intensity', null), 'headache'), 'a clear supersedes something');

  assert.ok('issues' in validateAssessmentStart({ ...HEADACHE_START, complaintId: 'toothache' }));
  const backend = fakeBackend();
  const persistence = persistenceWith(backend);
  persistence.begin({ ...HEADACHE_START, complaintId: 'toothache' });
  await persistence.whenIdle();
  assert.equal(backend.calls.signIn, 0, 'no identity for an illegal assessment');
  assert.equal(backend.calls.gateways, 0);
  assert.equal(persistence.getSnapshot().state, 'failed');
});

test('an event that depends on an unsaved event fails instead of breaking the chain', async () => {
  const backend = fakeBackend({
    evidence: (insert, _attempt, store) =>
      insert.table === 'intake_answers' && insert.row.operation === 'selected' ? { ok: false, error: rlsDenied } : store(),
  });
  const persistence = persistenceWith(backend);
  persistence.begin(HEADACHE_START);
  const answered = [{ questionId: 'intake-headache-intensity', optionId: '5', answeredAt: T0 }];
  persistence.observeAnswers('intake', answered);
  persistence.observeAnswers('intake', []);
  await persistence.whenIdle();
  const intake = persistence.outcomes().filter((outcome) => outcome.kind === 'answer');
  assert.deepEqual(intake.map((outcome) => outcome.error), ['rls-denied', 'dependency-failed']);
  assert.equal(tableRows(backend, 'intake_answers').length, 0);
});

/* --- 6. R3 local-first -------------------------------------------------------- */

function hangingBackend() {
  const pending = new Promise<never>(() => undefined);
  return fakeBackend({
    signIn: () => pending,
    insertAssessment: () => pending,
    evidence: () => pending,
  });
}

function reachHeadacheRedFlag() {
  let state = startInterview('headache');
  state = answer(state, 'throbbing');
  state = answer(state, '5');
  const screen = currentStep(state);
  assert.equal(screen.kind === 'engine' && screen.question.id, 'safety-headache-sudden-extremely-painful');
  return state;
}

test('CRITICAL: a red flag interrupts immediately while Supabase hangs or fails', async () => {
  for (const backend of [hangingBackend(), fakeBackend({ signIn: async () => ({ ok: false, error: transient }) }), fakeBackend({ evidence: () => ({ ok: false, error: transient }) })]) {
    const persistence = persistenceWith(backend);
    persistence.begin(HEADACHE_START);
    let state = reachHeadacheRedFlag();
    observe(persistence, state);

    // PATIENT ANSWER -> LOCAL R3 EVALUATION -> PRIORITY INTERRUPTION ...
    state = answer(state, 'yes');
    const controller = controllerFor(state);
    const step = currentStep(state);
    assert.equal(controller.status, 'interrupted');
    assert.equal(step.kind, 'interrupted');
    if (controller.status === 'interrupted') {
      assert.ok(controller.firedRuleIds.some((ruleId) => ruleId.startsWith('headache')), controller.firedRuleIds.join());
    }

    // ... -> ASYNC PERSISTENCE, which returns without waiting on the backend.
    const started = performance.now();
    const returned = persistence.observeAnswers('safety', state.safetyAnswers);
    assert.equal(returned, undefined, 'observation is synchronous and returns nothing to await');
    assert.ok(performance.now() - started < 20, 'observation does not block');
    assert.notEqual(persistence.getSnapshot().state, 'saved', 'nothing claims to be saved');

    // The interruption is unchanged by whatever persistence does next.
    assert.equal(currentStep(state).kind, 'interrupted');
    await persistence.dispose();
  }
});

test('RoutingFlow evaluates R3 in render and persists only from post-commit effects', () => {
  const flow = source('src/features/routing-flow/RoutingFlow.tsx');
  const controllerAt = flow.indexOf('evaluateSafetyController({');
  const firstPersist = flow.indexOf('persistence?.observeAnswers');
  assert.ok(controllerAt > 0 && firstPersist > controllerAt);
  const persistCalls = flow.match(/persistence\?\.observeAnswers\('(intake|routing|safety)'/g) ?? [];
  assert.equal(persistCalls.length, 3);
  for (const call of persistCalls) {
    const at = flow.indexOf(call);
    assert.match(flow.slice(flow.lastIndexOf('useEffect(', at), at), /^useEffect\(\(\) => \{\s*$/);
  }
  assert.doesNotMatch(flow, /await\s+persistence|persistence\??\.[a-zA-Z]+\([^)]*\)\.then/);
  // Answer handlers never touch persistence.
  const handlers = flow.slice(flow.indexOf('const answerEngineQuestion'), flow.indexOf('const removeAnswer') + 800);
  assert.doesNotMatch(handlers, /persistence/);
});

/* --- 7. failure isolation, reset, offline ------------------------------------ */

test('persistence failure changes nothing in R1, R2, R3 or the interview path', async () => {
  const answers = { 'safety-headache-sudden-extremely-painful': 'no' };
  const baseline = runInterview('headache', answers, 'no');

  const backend = fakeBackend({ evidence: () => ({ ok: false, error: rlsDenied }) });
  const persistence = persistenceWith(backend);
  persistence.begin(HEADACHE_START);
  let state = startInterview('headache');
  for (let guard = 0; guard < 60; guard += 1) {
    const step = currentStep(state);
    if (step.kind === 'interrupted' || step.kind === 'result') break;
    const optionId = answers[step.question.id as keyof typeof answers] ?? (step.kind === 'intake' ? step.question.options[0].id : 'no');
    state = answer(state, optionId);
    observe(persistence, state);
    await Promise.resolve();
  }
  await persistence.whenIdle();
  assert.equal(persistence.getSnapshot().state, 'failed');
  assert.deepEqual(state.session, baseline.state.session);
  assert.deepEqual(state.safetyAnswers, baseline.state.safetyAnswers);
  assert.deepEqual(state.intakeAnswers, baseline.state.intakeAnswers);
  assert.deepEqual(controllerFor(state), baseline.controller);
});

test('New Patient disposes the session: queue dropped, Auth closed, identity cleared', async () => {
  const backend = hangingBackend();
  const persistence = persistenceWith(backend);
  persistence.begin(HEADACHE_START);
  persistence.observeAnswers('intake', [{ questionId: 'intake-headache-intensity', optionId: '5', answeredAt: T0 }]);
  assert.equal(persistence.getSnapshot().state, 'pending');

  let notified = 0;
  persistence.subscribe(() => {
    notified += 1;
  });
  await persistence.dispose();
  await persistence.dispose();
  assert.equal(backend.calls.closed, 1, 'client signed out and disposed once');
  assert.deepEqual(persistence.identifiers(), { assessmentId: null, ownerAuthUserId: null });
  assert.ok(persistence.outcomes().some((outcome) => outcome.status === 'discarded'));
  assert.ok(persistence.outcomes().every((outcome) => outcome.status !== 'saved'));
  persistence.observeAnswers('intake', []);
  persistence.begin(HEADACHE_START);
  assert.equal(notified, 0, 'a disposed session is inert');
  await persistence.whenIdle();

  // The next patient gets a new session, a new client and a new identity.
  const next = fakeBackend();
  const second = persistenceWith(next);
  second.begin(HEADACHE_START);
  await second.whenIdle();
  assert.equal(next.calls.signIn, 1);
  assert.equal(next.assessments.length, 1);
  await second.dispose();

  const route = source('src/screens/route/RouteScreen.tsx');
  assert.match(route, /usePatientPersistence\(assessmentStart, createRuntimePersistence\)/);
  const hook = source('src/features/persistence/usePatientPersistence.ts');
  assert.match(hook, /return \(\) => \{[\s\S]*persistence\.dispose\(\)/);
  assert.match(hook, /queueMicrotask\(\(\) => persistence\.begin\(start\)\)/);
});

test('disabled builds never write and never claim to be saved', async () => {
  const persistence = createDisabledPersistence('requires-trusted-admission');
  persistence.begin(HEADACHE_START);
  persistence.observeAnswers('safety', [{ questionId: 'safety-headache-sudden-extremely-painful', optionId: 'yes', answeredAt: T0 }]);
  await persistence.whenIdle();
  assert.deepEqual(persistence.getSnapshot(), {
    state: 'disabled',
    disabledReason: 'requires-trusted-admission',
    pending: 0,
    failed: 0,
    lastErrorKind: null,
  });
  assert.deepEqual(persistence.outcomes(), []);
});

function persistenceSources(): string {
  const dir = path.join(ROOT, 'src/features/persistence');
  return fs.readdirSync(dir).map((name) => fs.readFileSync(path.join(dir, name), 'utf8')).join('\n');
}

test('there is no durable offline queue and no browser persistence of pending writes', () => {
  const code = persistenceSources();
  assert.doesNotMatch(code, /\b(?:localStorage|sessionStorage|indexedDB|document\.cookie|caches\.open|serviceWorker)\b/);
  assert.doesNotMatch(code, /navigator\.onLine|addEventListener\('online'/, 'no replay on reconnect');
});

test('no staff, notification or delivery state is claimed anywhere in the patient runtime', () => {
  const code = persistenceSources() + source('src/features/routing-flow/RoutingFlow.tsx') + source('src/screens/route/RouteScreen.tsx');
  assert.doesNotMatch(
    code,
    /Doctor notified|Nurse notified|Sent to (?:the )?clinician|Queue token|Room assigned|Wait time|Clinician acknowledged|Handoff delivered|Synced|Prepared for (?:the )?doctor/i,
  );
  assert.doesNotMatch(code, /acknowledged_at|reviewed_by|staff_profile_id|facility_id|device_id/);
  assert.doesNotMatch(code, /from\('(?:safety_events|routing_results|routing_result_supporting_answers|soap_handoffs|staff_profiles)'\)\s*\.insert\(/);
});

test('raw Supabase access stays inside the persistence gateway', () => {
  const roots = ['src/screens', 'src/features', 'src/components'];
  const offenders: string[] = [];
  const visit = (entry: string) => {
    const absolute = path.join(ROOT, entry);
    if (fs.statSync(absolute).isDirectory()) {
      for (const name of fs.readdirSync(absolute)) visit(path.join(entry, name));
      return;
    }
    if (!/\.(?:ts|tsx)$/.test(entry) || entry.includes(`${path.sep}tests${path.sep}`)) return;
    const text = source(entry);
    // The patient path keeps every raw call in its gateway. R9F adds the
    // separate care-team client, which is allowed only in these two files.
    const allowed = entry.endsWith(path.join('persistence', 'gateway.ts'))
      || entry.endsWith(path.join('persistence', 'supabase-client.ts'))
      || entry.endsWith(path.join('staff', 'session.ts'))
      || entry.endsWith(path.join('staff', 'workspace.ts'));
    if (!allowed && (/\.from\('/.test(text) && /supabase/i.test(text) || /@supabase\/supabase-js/.test(text))) offenders.push(entry);
  };
  roots.forEach(visit);
  assert.deepEqual(offenders, []);
});

test('the persisted privacy notice makes no compliance or encryption claim', () => {
  const copy = source('src/features/trust/copy.ts');
  assert.doesNotMatch(copy, /HIPAA|GDPR|DPDP|FDA|certified|end-to-end|encrypted|compliant/i);
});

test('the Supabase client is loaded only when a persisting assessment begins', () => {
  const runtime = source('src/features/persistence/runtime.ts');
  assert.doesNotMatch(runtime, /^import .*(?:supabase-client|gateway|@supabase)/m, 'no static import of the backend client');
  assert.match(runtime, /import\('\.\/supabase-client\.ts'\)/);
  assert.match(runtime, /import\('\.\/gateway\.ts'\)/);
  const staticImporters = ['src/features/persistence/assessment-persistence.ts', 'src/features/persistence/usePatientPersistence.ts', 'src/screens/route/RouteScreen.tsx', 'src/features/routing-flow/RoutingFlow.tsx']
    .filter((file) => /^import (?!type).*(?:supabase-client|\/gateway|@supabase)/m.test(source(file)));
  assert.deepEqual(staticImporters, []);
});

test('the production CSP admits exactly the project origin for backend calls', () => {
  const vercel = JSON.parse(source('vercel.json')) as { headers: Array<{ headers: Array<{ key: string; value: string }> }> };
  const policy = vercel.headers[0].headers.find((header) => header.key === 'Content-Security-Policy')!.value;
  const connect = policy.split(';').map((part) => part.trim()).find((part) => part.startsWith('connect-src'))!;
  assert.deepEqual(connect.split(/\s+/).slice(1), ["'self'", 'https://iclhzaumzplvyxolnthz.supabase.co']);
  assert.doesNotMatch(policy, /\*|wss:|http:/);
});

test('a gateway that cannot be loaded fails the identity step without throwing', async () => {
  const persistence = createAssessmentPersistence({
    createGateway: async () => {
      throw new TypeError('Failed to fetch dynamically imported module');
    },
    newId: idSource('a'),
  });
  persistence.begin(HEADACHE_START);
  await persistence.whenIdle();
  assert.deepEqual(
    persistence.outcomes().map((outcome) => [outcome.kind, outcome.error]),
    [['identity', 'transient'], ['assessment', 'dependency-failed'], ['body', 'dependency-failed']],
  );
});
