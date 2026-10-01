import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ERROR_STATUS, TrustedError, type TrustedErrorCode } from '../_shared/trusted/contract.ts';
import { parseHandoffOperation, parseNoFields } from '../_shared/trusted/request.ts';
import {
  HANDOFF_STATUSES,
  HANDOFF_TRANSITIONS,
  handleHandoffAcknowledge,
  handleHandoffOpen,
  handleStaffWorkspace,
  handoffTransitionFor,
  isLegalHandoffTransition,
  type StaffStore,
} from '../_shared/trusted/staff-operations.ts';
import type { StoreOutcome, VerifiedCaller } from '../_shared/trusted/operations.ts';

const ROOT = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const MIGRATION = 'supabase/migrations/20260917180700_r9f_staff_handoff.sql';

const HANDOFF = 'aaaaaaaa-1111-4111-8111-111111111111';
const KEY = 'bbbbbbbb-2222-4222-8222-222222222222';
const STAFF: VerifiedCaller = { userId: 'cccccccc-3333-4333-8333-333333333333', isAnonymous: false };
const PATIENT: VerifiedCaller = { userId: 'dddddddd-4444-4444-8444-444444444444', isAnonymous: true };

function expectCode(run: () => unknown, code: TrustedErrorCode) {
  assert.throws(run, (error: unknown) => error instanceof TrustedError && error.code === code);
}

async function expectRejects(run: () => Promise<unknown>, code: TrustedErrorCode) {
  await assert.rejects(run, (error: unknown) => error instanceof TrustedError && error.code === code);
}

interface FakeOptions {
  workspace?: { facilityName: string; role: string } | null;
  outcome?: StoreOutcome;
}

function fakeStore(options: FakeOptions = {}) {
  const calls: Array<{ operation: string; args: Record<string, string> }> = [];
  const outcome: StoreOutcome = options.outcome ?? { ok: true, outcome: 'applied', status: 'opened', recordId: HANDOFF };
  const store: StaffStore = {
    async staffWorkspace(authUserId) {
      calls.push({ operation: 'workspace', args: { authUserId } });
      return options.workspace === undefined ? { facilityName: 'North Wing', role: 'clinical_staff' } : options.workspace;
    },
    async openHandoff(args) {
      calls.push({ operation: 'open', args: { ...args } });
      return outcome;
    },
    async acknowledgeHandoff(args) {
      calls.push({ operation: 'acknowledge', args: { ...args } });
      return outcome;
    },
  };
  return { store, calls };
}

/* --- 1. Request shape ---------------------------------------------------------- */

test('a staff request carries only a handoff and an operation key', () => {
  assert.deepEqual(parseHandoffOperation({ handoffId: HANDOFF, clientEventId: KEY }), {
    handoffId: HANDOFF,
    clientEventId: KEY,
  });
  for (const forged of [
    { staffProfileId: HANDOFF },
    { staff_profile_id: HANDOFF },
    { facilityId: HANDOFF },
    { facility_id: HANDOFF },
    { role: 'clinical_staff' },
    { actorAuthUserId: HANDOFF },
    { reviewerId: HANDOFF },
    { acknowledgedBy: HANDOFF },
    { acknowledgedAt: '2026-01-01T00:00:00Z' },
    { status: 'acknowledged' },
    { assessmentId: HANDOFF },
  ]) {
    expectCode(() => parseHandoffOperation({ handoffId: HANDOFF, clientEventId: KEY, ...forged }), 'INVALID_REQUEST');
  }
  for (const bad of [null, [], 'x', { handoffId: HANDOFF }, { handoffId: 'not-a-uuid', clientEventId: KEY }]) {
    expectCode(() => parseHandoffOperation(bad), 'INVALID_REQUEST');
  }
  assert.deepEqual(parseNoFields({}), {});
  expectCode(() => parseNoFields({ facilityId: HANDOFF }), 'INVALID_REQUEST');
});

/* --- 2. Transition model -------------------------------------------------------- */

test('only the two R9F transitions exist, and opening is never acknowledgement', () => {
  assert.deepEqual(HANDOFF_TRANSITIONS.map((transition) => transition.operation), ['handoff-open', 'handoff-acknowledge']);
  for (const transition of HANDOFF_TRANSITIONS) {
    assert.ok((HANDOFF_STATUSES as readonly string[]).includes(transition.to));
    for (const from of transition.from) assert.ok((HANDOFF_STATUSES as readonly string[]).includes(from));
  }
  assert.equal(isLegalHandoffTransition('handoff-open', 'prepared'), true);
  assert.equal(isLegalHandoffTransition('handoff-open', 'available_for_review'), true);
  assert.equal(isLegalHandoffTransition('handoff-acknowledge', 'opened'), true);
  // Acknowledgement requires an explicit open first, and nothing reopens or closes.
  for (const [operation, from] of [
    ['handoff-acknowledge', 'prepared'],
    ['handoff-acknowledge', 'available_for_review'],
    ['handoff-acknowledge', 'acknowledged'],
    ['handoff-open', 'acknowledged'],
    ['handoff-open', 'closed'],
    ['handoff-open', 'cancelled'],
    ['handoff-acknowledge', 'closed'],
  ] as const) {
    assert.equal(isLegalHandoffTransition(operation, from), false, `${operation} from ${from}`);
  }
  assert.equal(handoffTransitionFor('handoff-open').reasonCode, 'handoff_opened');
  assert.equal(handoffTransitionFor('handoff-acknowledge').reasonCode, 'handoff_acknowledged');
});

/* --- 3. Authorization ------------------------------------------------------------ */

test('an anonymous patient token is never staff, on any staff operation', async () => {
  const { store, calls } = fakeStore();
  await expectRejects(() => handleStaffWorkspace(store, PATIENT), 'STAFF_REQUIRED');
  await expectRejects(() => handleHandoffOpen(store, PATIENT, { handoffId: HANDOFF, clientEventId: KEY }), 'STAFF_REQUIRED');
  await expectRejects(() => handleHandoffAcknowledge(store, PATIENT, { handoffId: HANDOFF, clientEventId: KEY }), 'STAFF_REQUIRED');
  assert.deepEqual(calls, [], 'no store call is attempted for a patient');
});

test('a permanent account without an approved profile gets one neutral refusal', async () => {
  for (const workspace of [null, { facilityName: 'North Wing', role: 'facility_admin' }]) {
    const { store } = fakeStore({ workspace });
    await expectRejects(() => handleStaffWorkspace(store, STAFF), 'STAFF_REQUIRED');
  }
  const { store, calls } = fakeStore();
  assert.deepEqual(await handleStaffWorkspace(store, STAFF), {
    authorized: true,
    facilityName: 'North Wing',
    role: 'clinical_staff',
  });
  assert.deepEqual(calls, [{ operation: 'workspace', args: { authUserId: STAFF.userId } }]);
});

test('the store receives only the handoff, the key and the verified caller', async () => {
  const { store, calls } = fakeStore();
  const result = await handleHandoffOpen(store, STAFF, { handoffId: HANDOFF, clientEventId: KEY });
  assert.deepEqual(result, { outcome: 'applied', status: 'opened', handoffId: HANDOFF });
  assert.deepEqual(calls, [{
    operation: 'open',
    args: { handoffId: HANDOFF, actorAuthUserId: STAFF.userId, clientEventId: KEY },
  }]);

  const acknowledged = fakeStore({ outcome: { ok: true, outcome: 'applied', status: 'acknowledged', recordId: HANDOFF } });
  assert.deepEqual(await handleHandoffAcknowledge(acknowledged.store, STAFF, { handoffId: HANDOFF, clientEventId: KEY }), {
    outcome: 'applied',
    status: 'acknowledged',
    handoffId: HANDOFF,
  });
  assert.equal(acknowledged.calls[0].args.actorAuthUserId, STAFF.userId);
});

test('database refusals surface as stable codes, unknown codes as INTERNAL', async () => {
  for (const code of ['STAFF_REQUIRED', 'HANDOFF_NOT_FOUND', 'INVALID_STATE', 'IDEMPOTENCY_CONFLICT'] as const) {
    const { store } = fakeStore({ outcome: { ok: false, code } });
    await expectRejects(() => handleHandoffOpen(store, STAFF, { handoffId: HANDOFF, clientEventId: KEY }), code);
    await expectRejects(() => handleHandoffAcknowledge(store, STAFF, { handoffId: HANDOFF, clientEventId: KEY }), code);
  }
  const { store } = fakeStore({ outcome: { ok: false, code: 'relation "x" does not exist' } });
  await expectRejects(() => handleHandoffOpen(store, STAFF, { handoffId: HANDOFF, clientEventId: KEY }), 'INTERNAL');
  assert.equal(ERROR_STATUS.STAFF_REQUIRED, 403);
  assert.equal(ERROR_STATUS.HANDOFF_NOT_FOUND, 404);
});

/* --- 4. Migration properties ------------------------------------------------------ */

test('the R9F migration changes no policy or grant and stays service-role only', () => {
  const code = source(MIGRATION).replace(/--.*$/gm, '');
  assert.doesNotMatch(code, /\b(create|alter|drop)\s+(policy|table)\b/i);
  assert.doesNotMatch(code, /grant[^;]*\bto\s+(anon|authenticated|public)\b/i);
  assert.doesNotMatch(code, /disable\s+row\s+level\s+security/i);
  const functions = [...code.matchAll(/create function (public\.\w+)/g)].map((match) => match[1]);
  assert.deepEqual(functions, [
    'public.trusted_staff_identity',
    'public.trusted_transition_handoff',
    'public.trusted_open_handoff',
    'public.trusted_acknowledge_handoff',
    'public.trusted_staff_workspace',
  ]);
  for (const name of functions) {
    const escaped = name.replace('.', '\\.');
    assert.match(code, new RegExp(`revoke all on function ${escaped}\\([^;]*\\)\\s*from public, anon, authenticated;`), name);
    assert.match(code, new RegExp(`grant execute on function ${escaped}\\([^;]*\\)\\s*to service_role;`), name);
  }
  assert.equal((code.match(/set search_path = ''/g) ?? []).length, functions.length);
  // Exactly one definer, and only because auth.users is unreadable otherwise.
  assert.equal((code.match(/security definer/gi) ?? []).length, 1);
  assert.match(code, /create function public\.trusted_staff_identity[\s\S]*?security definer/);
  // The two transitions are fixed server-side, never taken from a caller.
  assert.match(code, /p_to_status = 'opened'/);
  assert.match(code, /p_to_status = 'acknowledged'/);
  assert.match(code, /'handoff_opened'/);
  assert.match(code, /'handoff_acknowledged'/);
  assert.match(code, /for update/);
});

test('staff code adds no notification, assignment or clinical mutation', () => {
  // Comments describe what this phase refuses to do, so only code is scanned.
  const stripComments = (text: string) => text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/^\s*--.*$/gm, ' ');
  const files = ['supabase/functions/_shared/trusted/staff-operations.ts', 'supabase/functions/staff-session/index.ts',
    'supabase/functions/handoff-open/index.ts', 'supabase/functions/handoff-acknowledge/index.ts', MIGRATION]
    .map((file) => stripComments(source(file))).join('\n');
  assert.doesNotMatch(files, /sendgrid|twilio|whatsapp|resend\.com|fcm|web-push|nodemailer|notify|sms/i);
  assert.doesNotMatch(files, /doctor assigned|room|queue token|wait time|appointment|prescri|diagnos/i);
  // Review never writes evidence, results or notes.
  assert.doesNotMatch(files, /update public\.(routing_results|soap_handoffs|routing_answers|safety_answers|intake_answers|body_selections)/i);
  assert.doesNotMatch(files, /delete from public\./i);
});
