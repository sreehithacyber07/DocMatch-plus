import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createAssessmentPersistence, type LocalRoutingResult } from '../persistence/assessment-persistence.ts';
import { resolvePersistenceConfig, STAFF_ADMITTED_MODES, SELF_ADMITTED_MODES } from '../persistence/config.ts';
import type { GatewayResult, PersistenceGateway, TrustedOperation } from '../persistence/gateway.ts';
import { createSupabaseGateway } from '../persistence/gateway.ts';
import type { AdmissionResponse } from '../persistence/staffed-admission.ts';
import type { EvidenceInsert } from '../persistence/records.ts';
import type { PatientSupabaseClient } from '../persistence/supabase-client.ts';
import {
  LOCAL_ONLY_SESSION_NOTICE,
  PERSISTED_SESSION_NOTICE,
  PERSISTED_STAFFED_SESSION_NOTICE,
  sessionNoticeFor,
} from '../trust/copy.ts';
import { answer, controllerFor, currentStep, startInterview, type DriverState } from './interview-driver.ts';
import { hasPresentableRoute } from '../routing-flow/handoff-presentation.ts';
import { GENERAL_MEDICINE, specialtyForEngineId } from '../routing-flow/specialty-registry.ts';

const ROOT = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const OWNER = 'aaaaaaaa-1111-4111-8111-111111111111';
const ADMITTED = 'bbbbbbbb-2222-4222-8222-222222222222';
const RESULT = 'cccccccc-3333-4333-8333-333333333333';

function ids() {
  let next = 0;
  return () => `dddddddd-4444-4444-8444-${String(++next).padStart(12, '0')}`;
}

function localResult(state: DriverState): LocalRoutingResult {
  const controller = controllerFor(state);
  if (controller.status !== 'result') throw new Error('not a result');
  const top = controller.routingOutcome.specialtyId;
  return {
    engineTopSpecialtyId: top,
    selectedSpecialtyRegistryId: hasPresentableRoute(controller.stoppingDecision, top)
      ? specialtyForEngineId(top).id : GENERAL_MEDICINE.id,
    stopReason: controller.routingOutcome.stopReason,
    belief: { ...state.session.belief },
    answers: state.session.answers.map(({ questionId, optionId }) => ({ questionId, optionId })),
  };
}

interface HarnessOptions {
  admission?: (attempt: number) => GatewayResult<AdmissionResponse>;
  hangEnd?: boolean;
}

/** A tablet session whose admission is injected, the way runtime.ts does it. */
function tabletHarness(options: HarnessOptions = {}) {
  const nextId = ids();
  const rows: Array<{ id: string; event: EvidenceInsert }> = [];
  const calls: Array<{ operation: string; key?: string; assessmentId?: string }> = [];
  const admissionKeys: string[] = [];
  let route: LocalRoutingResult | null = null;
  let closed = 0;
  const gateway: PersistenceGateway = {
    signInAnonymously: async () => ({ ok: true, value: { userId: OWNER } }),
    findOwnAssessment: async () => ({ ok: true, value: null }),
    insertAssessment: async () => {
      calls.push({ operation: 'self-insert' });
      return { ok: true, value: 'self-admitted-should-never-happen' };
    },
    insertEvidence: async (event) => {
      const id = nextId();
      rows.push({ id, event });
      calls.push({ operation: 'evidence', assessmentId: event.row.assessment_id as string });
      return { ok: true, value: id };
    },
    findEvidenceByClientEvent: async () => ({ ok: true, value: null }),
    admitPatient: async (request) => {
      admissionKeys.push(request.clientEventId);
      calls.push({ operation: 'admission', key: request.clientEventId });
      // The admission request carries no facility, profile, owner or mode.
      assert.deepEqual(Object.keys(request).sort(), ['clientEventId', 'complaintId', 'complaintSource']);
      return options.admission?.(admissionKeys.length)
        ?? { ok: true, value: { outcome: 'applied', status: 'in_progress', assessmentId: ADMITTED } };
    },
    invokeTrusted: async (operation: TrustedOperation, body, invoke) => {
      calls.push({ operation, key: body.clientEventId, assessmentId: body.assessmentId });
      if (operation === 'assessment-end') {
        if (options.hangEnd) {
          await new Promise<void>((resolve) => invoke?.signal?.addEventListener('abort', () => resolve(), { once: true }));
          return { ok: false, error: { kind: 'aborted', code: 'ABORT_ERR', status: null } };
        }
        return { ok: true, value: { outcome: 'applied', status: 'cancelled' } };
      }
      if (operation === 'routing-finalize') {
        return { ok: true, value: { outcome: 'applied', status: 'routing_complete', routingResultId: RESULT } };
      }
      if (operation === 'safety-evaluate') {
        return { ok: true, value: { outcome: 'applied', status: 'priority_escalated', safetyEventId: RESULT } };
      }
      if (operation === 'soap-prepare') {
        return { ok: true, value: { outcome: 'applied', status: 'handoff_prepared', soapHandoffId: RESULT } };
      }
      return { ok: false, error: { kind: 'rejected', code: 'UNSUPPORTED_DEPLOYMENT', status: 403 } };
    },
    readEvidenceIds: async () => ({ ok: true, value: { intake: [], routing: [], safety: [] } }),
    readRoutingResult: async () => {
      if (!route) throw new Error('route missing');
      const support = route.answers.map((item) => rows.findLast((entry) =>
        entry.event.table === 'routing_answers' && entry.event.row.question_id === item.questionId)?.id ?? 'missing');
      return { ok: true, value: {
        id: RESULT,
        selected_specialty_registry_id: route.selectedSpecialtyRegistryId,
        engine_top_specialty_id: route.engineTopSpecialtyId,
        stop_reason: route.stopReason,
        belief: route.belief,
        supportingAnswerIds: support,
      } };
    },
    close: async () => { closed += 1; },
  };
  const persistence = createAssessmentPersistence({
    createGateway: () => gateway,
    newId: nextId,
    trustedOperations: true,
    admissionPath: 'trusted',
    endOnDispose: true,
    endTimeoutMs: 25,
    retryDelaysMs: [0, 0],
    sleep: async () => undefined,
  });
  return {
    persistence,
    calls,
    admissionKeys,
    rows,
    closed: () => closed,
    setRoute: (value: LocalRoutingResult) => { route = value; },
  };
}

function drive(harness: ReturnType<typeof tabletHarness>, complaintId: string, choose: (id: string) => string | undefined) {
  harness.persistence.begin({ complaintId, complaintSource: 'bridge-resolved', location: null });
  let state = startInterview(complaintId);
  for (let index = 0; index < 60; index += 1) {
    const step = currentStep(state);
    if (step.kind === 'result' || step.kind === 'interrupted') break;
    state = answer(state, choose(step.question.id) ?? (step.kind === 'intake' ? step.question.options[0].id : 'no'));
    harness.persistence.observeAnswers('intake', state.intakeAnswers);
    harness.persistence.observeAnswers('routing', state.session.answers);
    harness.persistence.observeAnswers('safety', state.safetyAnswers);
  }
  return state;
}

/* --- 1. Configuration ------------------------------------------------------------ */

test('staffed tablet persists only through staff admission; hospital kiosk stays local-only', () => {
  const url = 'https://example.supabase.co';
  const publishableKey = 'sb_publishable_example';
  const web = resolvePersistenceConfig({ url, publishableKey, deploymentMode: 'web/self-service' });
  const tablet = resolvePersistenceConfig({ url, publishableKey, deploymentMode: 'staffed-tablet' });
  const kiosk = resolvePersistenceConfig({ url, publishableKey, deploymentMode: 'hospital-kiosk' });
  assert.ok(web.enabled && web.admission === 'self');
  assert.ok(tablet.enabled && tablet.admission === 'staff');
  assert.deepEqual(kiosk, { enabled: false, reason: 'requires-trusted-admission', deploymentMode: 'hospital-kiosk' });
  assert.deepEqual(SELF_ADMITTED_MODES, ['web/self-service']);
  assert.deepEqual(STAFF_ADMITTED_MODES, ['staffed-tablet']);
  // A tablet with no backend, or an unsafe key, stays local-only exactly as before.
  assert.equal(resolvePersistenceConfig({ url: undefined, publishableKey, deploymentMode: 'staffed-tablet' }).enabled, false);
  assert.equal(resolvePersistenceConfig({ url, publishableKey: 'sb_secret_x', deploymentMode: 'staffed-tablet' }).enabled, false);
});

test('no kiosk device credential, facility secret or device identity exists in browser code', () => {
  const files = [
    'src/features/persistence/config.ts',
    'src/features/persistence/runtime.ts',
    'src/features/persistence/staffed-admission.ts',
    'src/features/persistence/gateway.ts',
    'src/features/persistence/assessment-persistence.ts',
    'src/screens/route/RouteScreen.tsx',
    'src/screens/route/CareTeamGate.tsx',
  ].map((file) => stripComments(source(file))).join('\n');
  assert.doesNotMatch(files, /kiosk_device_id|kioskDeviceId|facilityId|facility_id|staffProfileId|VITE_[A-Z_]*(?:KIOSK|DEVICE|FACILITY|SECRET)/);
  assert.doesNotMatch(source('.env.example'), /KIOSK_(?:KEY|SECRET|TOKEN)|DEVICE_(?:KEY|SECRET|TOKEN)|FACILITY_(?:ID|KEY|SECRET)/);
});

/* --- 2. Dual-identity admission ------------------------------------------------- */

test('a tablet patient is admitted by the trusted operation, never self-inserted', async () => {
  const harness = tabletHarness();
  const state = drive(harness, 'joint-musculoskeletal-pain', () => undefined);
  harness.persistence.requestRoutingFinalization(localResult(state));
  harness.setRoute(localResult(state));
  await harness.persistence.whenIdle();
  const operations = harness.calls.map((call) => call.operation);
  assert.equal(operations[0], 'admission', 'admission is the first write after identity');
  assert.ok(!operations.includes('self-insert'), 'no R9C self-insert on a staffed tablet');
  assert.ok(!operations.includes('assessment-start'), 'admission already recorded the confirmed complaint');
  for (const call of harness.calls.filter((entry) => entry.operation === 'evidence')) {
    assert.equal(call.assessmentId, ADMITTED, 'evidence goes to the server-admitted assessment');
  }
  assert.ok(operations.includes('routing-finalize') && operations.includes('soap-prepare'));
  assert.equal(harness.persistence.getSnapshot().state, 'saved');
  assert.equal(harness.persistence.identifiers().assessmentId, ADMITTED);
});

test('a lost admission response is retried with the same operation key', async () => {
  const harness = tabletHarness({
    admission: (attempt) => attempt === 1
      ? { ok: false, error: { kind: 'transient', code: 'network', status: 0 } }
      : { ok: true, value: { outcome: 'replayed', status: 'in_progress', assessmentId: ADMITTED } },
  });
  drive(harness, 'headache', () => undefined);
  await harness.persistence.whenIdle();
  assert.equal(harness.admissionKeys.length, 2);
  assert.equal(harness.admissionKeys[0], harness.admissionKeys[1], 'the retry reuses the key; it never mints a second');
  assert.equal(harness.persistence.identifiers().assessmentId, ADMITTED);
});

test('a refused admission writes nothing and never falls back to self-service', async () => {
  const harness = tabletHarness({
    admission: () => ({ ok: false, error: { kind: 'rls-denied', code: 'STAFF_REQUIRED', status: 403 } }),
  });
  const state = drive(harness, 'joint-musculoskeletal-pain', () => undefined);
  harness.persistence.requestRoutingFinalization(localResult(state));
  await harness.persistence.whenIdle();
  const operations = harness.calls.map((call) => call.operation);
  assert.deepEqual(operations, ['admission'], 'one refused admission and no other write or trusted call');
  assert.equal(harness.persistence.getSnapshot().state, 'failed');
  assert.equal(harness.persistence.identifiers().assessmentId, null);
});

test('the patient gateway sends its own in-memory token to the injected admission', async () => {
  const sent: Array<{ token: string; body: Record<string, unknown> }> = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'patient.jwt.token', user: { is_anonymous: true } } } }),
    },
  } as unknown as PatientSupabaseClient;
  const gateway = createSupabaseGateway(client, new AbortController().signal, {
    admission: async (token, request) => {
      sent.push({ token, body: { ...request } });
      return { ok: true, value: { outcome: 'applied', status: 'in_progress', assessmentId: ADMITTED } };
    },
  });
  const result = await gateway.admitPatient!({ clientEventId: 'k', complaintId: 'headache', complaintSource: 'bridge-resolved' });
  assert.ok(result.ok);
  assert.equal(sent[0].token, 'patient.jwt.token');
  assert.deepEqual(Object.keys(sent[0].body).sort(), ['clientEventId', 'complaintId', 'complaintSource']);

  // A permanent (non-anonymous) session is never offered as the patient.
  const permanent = createSupabaseGateway({
    auth: { getSession: async () => ({ data: { session: { access_token: 'x.y.z', user: { is_anonymous: false } } } }) },
  } as unknown as PatientSupabaseClient, new AbortController().signal, { admission: async () => { throw new Error('must not call'); } });
  const refused = await permanent.admitPatient!({ clientEventId: 'k', complaintId: 'headache', complaintSource: 'bridge-resolved' });
  assert.ok('error' in refused && refused.error.kind === 'auth');

  // Web and kiosk gateways have no admission at all.
  assert.equal(createSupabaseGateway(client, new AbortController().signal).admitPatient, undefined);
});

test('the admission request carries the staff bearer and only four body fields', () => {
  const admission = stripComments(source('src/features/persistence/staffed-admission.ts'));
  assert.match(admission, /functions\.invoke<[^>]*>\('assessment-admit'/);
  assert.match(admission, /body: \{ patientAccessToken, \.\.\.request \}/);
  assert.doesNotMatch(admission, /signIn|signOut|console\.|localStorage|sessionStorage|indexedDB/);
});

/* --- 3. Session boundary ------------------------------------------------------- */

test('New Patient ends the old assessment, then signs out only the patient client', async () => {
  const harness = tabletHarness();
  drive(harness, 'headache', () => undefined);
  await harness.persistence.whenIdle();
  await harness.persistence.dispose();
  const end = harness.calls.find((call) => call.operation === 'assessment-end');
  assert.ok(end, 'the lifecycle end was reported');
  assert.equal(end.assessmentId, ADMITTED);
  assert.equal(harness.closed(), 1, 'the patient client is closed after the end call');
  assert.equal(harness.persistence.identifiers().assessmentId, null);
  // The session never references the care-team session at all.
  assert.doesNotMatch(source('src/features/persistence/assessment-persistence.ts'), /staff/i);
});

test('a hanging end call is bounded and never keeps the patient signed in', async () => {
  const harness = tabletHarness({ hangEnd: true });
  drive(harness, 'headache', () => undefined);
  await harness.persistence.whenIdle();
  const started = Date.now();
  await harness.persistence.dispose();
  assert.ok(Date.now() - started < 2000, 'disposal is bounded by the injected timeout');
  assert.equal(harness.closed(), 1);
});

test('no end call is made when no assessment was admitted', async () => {
  const harness = tabletHarness({
    admission: () => ({ ok: false, error: { kind: 'rls-denied', code: 'STAFF_REQUIRED', status: 403 } }),
  });
  drive(harness, 'headache', () => undefined);
  await harness.persistence.whenIdle();
  await harness.persistence.dispose();
  assert.ok(!harness.calls.some((call) => call.operation === 'assessment-end'));
  assert.equal(harness.closed(), 1);
});

test('two consecutive tablet patients get separate identities, admissions and assessments', async () => {
  const first = tabletHarness();
  drive(first, 'headache', () => undefined);
  await first.persistence.whenIdle();
  await first.persistence.dispose();
  const second = tabletHarness({
    admission: () => ({ ok: true, value: { outcome: 'applied', status: 'in_progress', assessmentId: RESULT } }),
  });
  drive(second, 'headache', () => undefined);
  await second.persistence.whenIdle();
  assert.notEqual(second.persistence.identifiers().assessmentId, ADMITTED);
  assert.equal(second.calls.filter((call) => call.operation === 'evidence' && call.assessmentId === ADMITTED).length, 0);
});

test('the staff session module is loaded only by staffed-tablet persistence', () => {
  const runtime = source('src/features/persistence/runtime.ts');
  assert.match(runtime, /trustedAdmission \? import\('\.\/staffed-admission\.ts'\) : Promise\.resolve\(null\)/);
  assert.match(runtime, /await import\('\.\/staffed-admission\.ts'\)/);
  assert.doesNotMatch(runtime, /^import [^;]*staffed-admission/m, 'never a static import');
  const gateway = source('src/features/persistence/gateway.ts');
  assert.match(gateway, /^import type \{[^}]*\} from '\.\/staffed-admission\.ts';$/m, 'type-only import, erased at build');
  for (const file of ['src/screens/route/RouteScreen.tsx', 'src/screens/entry/EntryScreen.tsx', 'src/features/routing-flow/RoutingFlow.tsx']) {
    assert.doesNotMatch(source(file), /features\/staff|staffed-admission|StaffScreen|staffAuthOptions/, file);
  }
  // The care-team session is read, never signed in or out, by the patient side.
  assert.doesNotMatch(stripComments(source('src/features/persistence/staffed-admission.ts')), /signInStaff|signOutStaff|signOut\(/);
});

/* --- 4. Copy ------------------------------------------------------------------- */

test('the staffed-tablet notice is truthful and makes no delivery or compliance claim', () => {
  assert.equal(sessionNoticeFor(true, 'staffed-tablet').notice, PERSISTED_STAFFED_SESSION_NOTICE);
  assert.equal(sessionNoticeFor(true, 'web/self-service').notice, PERSISTED_SESSION_NOTICE);
  assert.equal(sessionNoticeFor(true).notice, PERSISTED_SESSION_NOTICE);
  assert.equal(sessionNoticeFor(false, 'staffed-tablet').notice, LOCAL_ONLY_SESSION_NOTICE);
  assert.match(PERSISTED_STAFFED_SESSION_NOTICE, /Clinical staff at this facility can view/);
  const copy = `${PERSISTED_STAFFED_SESSION_NOTICE}\n${source('src/screens/route/CareTeamGate.tsx')}`;
  assert.doesNotMatch(copy, /notified|alerted|sent to (?:a|the) doctor|will review|reviewed by|HIPAA|GDPR|DPDP|FDA|certified|compliant|end-to-end|encrypted|diagnos/i);
  assert.doesNotMatch(copy, /—/, 'no em dashes');
  assert.doesNotMatch(stripComments(source('src/screens/route/CareTeamGate.tsx')),
    /facility|clinical_staff|facility_admin|email|password|token|session_id/i);
});

/* --- 5. Retention ------------------------------------------------------------- */

test('no retention duration is invented anywhere', () => {
  const roots = ['src/features', 'src/screens', 'supabase/functions/_shared'];
  const text: string[] = [];
  const visit = (entry: string) => {
    const full = path.join(ROOT, entry);
    if (fs.statSync(full).isDirectory()) {
      for (const name of fs.readdirSync(full)) visit(path.join(entry, name));
      return;
    }
    if (/\.(?:ts|tsx)$/.test(entry) && !entry.includes(`${path.sep}tests${path.sep}`)) text.push(stripComments(source(entry)));
  };
  roots.forEach(visit);
  const code = text.join('\n');
  assert.doesNotMatch(code, /RETENTION_(?:DAYS|HOURS|MS|PERIOD|DURATION)\s*=|retentionDays|cleanupAfter|expireAfter/i);
  const migration = source('supabase/migrations/20260918151500_r9g_b_admission_lifecycle.sql');
  assert.match(migration, /RETENTION_POLICY_DURATION_NOT_YET_APPROVED/);
  assert.doesNotMatch(migration, /p_cutoff timestamptz default|interval '\d|cron\.schedule/i);
});
