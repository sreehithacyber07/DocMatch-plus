import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  ASSESSMENT_STATUSES,
  SERVER_VERSIONS,
  TRUSTED_ASSESSMENT_CONTRACT_VERSION,
  TrustedError,
  type TrustedErrorCode,
} from '../_shared/trusted/contract.ts';
import { MAX_PATIENT_TOKEN_LENGTH, parseStaffedAdmission } from '../_shared/trusted/request.ts';
import {
  R9G_B_TRANSITIONS,
  handleStaffedAdmission,
  type AdmissionStore,
  type AdmitArgs,
} from '../_shared/trusted/admission-operations.ts';
import {
  checkAdmission,
  handleAssessmentEnd,
  handleAssessmentStart,
  type AssessmentRow,
  type StoreOutcome,
  type TrustedStore,
  type VerifiedCaller,
} from '../_shared/trusted/operations.ts';

const ROOT = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const MIGRATION = 'supabase/migrations/20260918151500_r9g_b_admission_lifecycle.sql';

const STAFF: VerifiedCaller = { userId: 'aaaaaaaa-1111-4111-8111-111111111111', isAnonymous: false };
const PATIENT: VerifiedCaller = { userId: 'bbbbbbbb-2222-4222-8222-222222222222', isAnonymous: true };
const KEY = 'cccccccc-3333-4333-8333-333333333333';
const ASSESSMENT = 'dddddddd-4444-4444-8444-444444444444';
const TOKEN = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl';

async function expectRejects(run: () => Promise<unknown>, code: TrustedErrorCode) {
  await assert.rejects(run, (error: unknown) => error instanceof TrustedError && error.code === code);
}

function expectCode(run: () => unknown, code: TrustedErrorCode) {
  assert.throws(run, (error: unknown) => error instanceof TrustedError && error.code === code);
}

const REQUEST = { patientAccessToken: TOKEN, clientEventId: KEY, complaintId: 'headache', complaintSource: 'bridge-resolved' };

function admissionStore(options: {
  staff?: boolean;
  principal?: VerifiedCaller | null;
  outcome?: StoreOutcome;
} = {}) {
  const calls: Array<{ operation: string; args?: AdmitArgs | string }> = [];
  const store: AdmissionStore = {
    async isClinicalStaff(authUserId) {
      calls.push({ operation: 'staff', args: authUserId });
      return options.staff ?? true;
    },
    async verifyPrincipal(token) {
      calls.push({ operation: 'verify', args: token });
      return options.principal === undefined ? PATIENT : options.principal;
    },
    async admitStaffed(args) {
      calls.push({ operation: 'admit', args });
      return options.outcome ?? { ok: true, outcome: 'applied', status: 'in_progress', recordId: ASSESSMENT };
    },
  };
  return { store, calls };
}

function row(overrides: Partial<AssessmentRow> = {}): AssessmentRow {
  return {
    id: ASSESSMENT,
    owner_auth_user_id: PATIENT.userId,
    contract_version: TRUSTED_ASSESSMENT_CONTRACT_VERSION,
    deployment_mode: 'staffed-tablet',
    status: 'in_progress',
    complaint_id: 'headache',
    complaint_source: 'bridge-resolved',
    facility_id: 'eeeeeeee-5555-4555-8555-555555555555',
    kiosk_device_id: null,
    initiated_by_staff_profile_id: 'ffffffff-6666-4666-8666-666666666666',
    engine_version: SERVER_VERSIONS.engineVersion,
    knowledge_version: SERVER_VERSIONS.knowledgeVersion,
    safety_version: SERVER_VERSIONS.safetyVersion,
    created_at: '2026-09-18T00:00:00.000Z',
    ...overrides,
  };
}

/* --- Request shape ---------------------------------------------------------- */

test('admission accepts exactly four fields and refuses every forged authority field', () => {
  assert.deepEqual(parseStaffedAdmission(REQUEST), REQUEST);
  for (const forged of [
    'facilityId', 'facility_id', 'staffProfileId', 'initiatedByStaffProfileId', 'ownerAuthUserId',
    'patientUserId', 'deploymentMode', 'status', 'role', 'kioskDeviceId', 'specialty', 'emergency', 'soap',
  ]) {
    expectCode(() => parseStaffedAdmission({ ...REQUEST, [forged]: 'x' }), 'INVALID_REQUEST');
  }
  expectCode(() => parseStaffedAdmission({ ...REQUEST, patientAccessToken: PATIENT.userId }), 'INVALID_REQUEST');
  expectCode(() => parseStaffedAdmission({ ...REQUEST, patientAccessToken: `${TOKEN} ` }), 'INVALID_REQUEST');
  expectCode(() => parseStaffedAdmission({ ...REQUEST, patientAccessToken: `a.b.${'c'.repeat(MAX_PATIENT_TOKEN_LENGTH)}` }), 'INVALID_REQUEST');
  expectCode(() => parseStaffedAdmission({ ...REQUEST, complaintSource: 'staff-entered' }), 'INVALID_REQUEST');
  expectCode(() => parseStaffedAdmission({ ...REQUEST, clientEventId: 'retry-1' }), 'INVALID_REQUEST');
  const { patientAccessToken: _omitted, ...withoutToken } = REQUEST;
  void _omitted;
  expectCode(() => parseStaffedAdmission(withoutToken), 'INVALID_REQUEST');
});

/* --- Staff trust root and dual identity -------------------------------------- */

test('the staff bearer is checked before the patient token is ever verified', async () => {
  const anonymous = admissionStore();
  await expectRejects(() => handleStaffedAdmission(anonymous.store, PATIENT, parseStaffedAdmission(REQUEST)), 'STAFF_REQUIRED');
  assert.equal(anonymous.calls.length, 0);

  const nonStaff = admissionStore({ staff: false });
  await expectRejects(() => handleStaffedAdmission(nonStaff.store, STAFF, parseStaffedAdmission(REQUEST)), 'STAFF_REQUIRED');
  assert.deepEqual(nonStaff.calls.map((call) => call.operation), ['staff'], 'no patient-token oracle for non-staff');
});

test('the patient principal must verify independently and be anonymous', async () => {
  for (const principal of [null, { userId: 'permanent', isAnonymous: false }, { userId: STAFF.userId, isAnonymous: true }]) {
    const { store, calls } = admissionStore({ principal });
    await expectRejects(() => handleStaffedAdmission(store, STAFF, parseStaffedAdmission(REQUEST)), 'PATIENT_REQUIRED');
    assert.ok(!calls.some((call) => call.operation === 'admit'));
  }
  const unapproved = admissionStore();
  await expectRejects(() => handleStaffedAdmission(unapproved.store, STAFF,
    parseStaffedAdmission({ ...REQUEST, complaintId: 'skin-concern' })), 'COMPLAINT_NOT_SUPPORTED');
});

test('facility, profile, mode and versions are server-derived; only verified ids reach the database', async () => {
  const { store, calls } = admissionStore();
  const result = await handleStaffedAdmission(store, STAFF, parseStaffedAdmission(REQUEST));
  assert.deepEqual(result, { outcome: 'applied', status: 'in_progress', assessmentId: ASSESSMENT, deploymentMode: 'staffed-tablet' });
  const admit = calls.find((call) => call.operation === 'admit')?.args as AdmitArgs;
  assert.deepEqual(admit, {
    staffAuthUserId: STAFF.userId,
    patientAuthUserId: PATIENT.userId,
    clientEventId: KEY,
    contractVersion: TRUSTED_ASSESSMENT_CONTRACT_VERSION,
    engineVersion: SERVER_VERSIONS.engineVersion,
    knowledgeVersion: SERVER_VERSIONS.knowledgeVersion,
    safetyVersion: SERVER_VERSIONS.safetyVersion,
    complaintId: 'headache',
    complaintSource: 'bridge-resolved',
  });
  assert.ok(!('facilityId' in admit) && !('staffProfileId' in admit), 'the database resolves facility and profile');
  assert.ok(!JSON.stringify(result).includes(TOKEN), 'the patient token is never echoed');
});

test('database refusals pass through as their own codes', async () => {
  for (const code of ['STAFF_REQUIRED', 'PATIENT_REQUIRED', 'INVALID_STATE', 'IDEMPOTENCY_CONFLICT', 'COMPLAINT_NOT_SUPPORTED'] as const) {
    const { store } = admissionStore({ outcome: { ok: false, code } });
    await expectRejects(() => handleStaffedAdmission(store, STAFF, parseStaffedAdmission(REQUEST)), code);
  }
});

/* --- Admitted shape and patient operations ---------------------------------- */

test('patient operations accept exactly the web and staff-admitted shapes', () => {
  checkAdmission(row());
  checkAdmission(row({ deployment_mode: 'web/self-service', facility_id: null, initiated_by_staff_profile_id: null }));
  for (const bad of [
    row({ deployment_mode: 'hospital-kiosk' }),
    row({ deployment_mode: 'hospital-kiosk', kiosk_device_id: 'x', initiated_by_staff_profile_id: null }),
    row({ initiated_by_staff_profile_id: null }),
    row({ facility_id: null }),
    row({ kiosk_device_id: 'eeeeeeee-7777-4777-8777-777777777777' }),
    row({ deployment_mode: 'web/self-service' }),
  ]) {
    expectCode(() => checkAdmission(bad), 'UNSUPPORTED_DEPLOYMENT');
  }
});

function patientStore(assessment: AssessmentRow | null, outcome: StoreOutcome = { ok: true, outcome: 'applied', status: 'cancelled', recordId: null }) {
  const calls: string[] = [];
  const store = {
    loadOwnedAssessment: async () => assessment,
    endAssessment: async () => { calls.push('end'); return outcome; },
    startAssessment: async () => { calls.push('start'); return { ok: true, outcome: 'applied', status: 'in_progress', recordId: null } as StoreOutcome; },
  } as unknown as TrustedStore;
  return { store, calls };
}

test('a staff-admitted assessment cannot be started a second time by the patient', async () => {
  const { store, calls } = patientStore(row({ status: 'created' }));
  await expectRejects(() => handleAssessmentStart(store, PATIENT,
    { assessmentId: ASSESSMENT, clientEventId: KEY, complaintId: 'headache', complaintSource: 'bridge-resolved' }), 'UNSUPPORTED_DEPLOYMENT');
  assert.deepEqual(calls, []);
});

test('the session end is patient-only, owner-scoped and refuses kiosk rows', async () => {
  const request = { assessmentId: ASSESSMENT, clientEventId: KEY };
  await expectRejects(() => handleAssessmentEnd(patientStore(row()).store, STAFF, request), 'PATIENT_REQUIRED');
  await expectRejects(() => handleAssessmentEnd(patientStore(null).store, PATIENT, request), 'ASSESSMENT_NOT_FOUND');
  await expectRejects(() => handleAssessmentEnd(patientStore(row({ owner_auth_user_id: 'someone-else' })).store, PATIENT, request),
    'ASSESSMENT_NOT_FOUND');
  await expectRejects(() => handleAssessmentEnd(patientStore(row({ deployment_mode: 'hospital-kiosk' })).store, PATIENT, request),
    'UNSUPPORTED_DEPLOYMENT');
  const ok = patientStore(row());
  assert.deepEqual(await handleAssessmentEnd(ok.store, PATIENT, request), { outcome: 'applied', status: 'cancelled' });
  await expectRejects(() => handleAssessmentEnd(patientStore(row({ status: 'routing_complete' }), { ok: false, code: 'INVALID_STATE' }).store,
    PATIENT, request), 'INVALID_STATE');
});

test('the lifecycle vocabulary is R9A only, with no R3 continuation', () => {
  for (const transition of R9G_B_TRANSITIONS) {
    assert.ok((ASSESSMENT_STATUSES as readonly string[]).includes(transition.from));
    assert.ok((ASSESSMENT_STATUSES as readonly string[]).includes(transition.to));
  }
  const pairs = R9G_B_TRANSITIONS.map((transition) => `${transition.from as string}->${transition.to as string}`);
  assert.ok(!pairs.includes('priority_escalated->in_progress'), 'no R3 continuation');
  assert.ok(!pairs.some((pair) => pair.startsWith('routing_complete->')));
  assert.ok(!pairs.some((pair) => /^(?:closed|expired|cancelled)->/.test(pair)), 'terminal states stay terminal');
});

/* --- Migration and code boundaries ------------------------------------------ */

test('R9G-B is one new migration and no applied migration was rewritten', () => {
  const migrations = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter((name) => name.endsWith('.sql'));
  assert.equal(migrations.filter((name) => /r9g_b/.test(name)).length, 1);
  const changed = execFileSync('git', ['diff', '--name-only', 'HEAD', '--', 'supabase/migrations'], { encoding: 'utf8' }).trim();
  assert.equal(changed, '', 'applied migrations are unchanged');
});

test('new privileged functions follow the established grant pattern', () => {
  const sql = source(MIGRATION);
  for (const signature of [
    'public.trusted_admission_shape_ok(uuid)',
    'public.trusted_is_anonymous_principal(uuid)',
    'public.trusted_end_assessment(uuid, uuid, uuid)',
  ]) {
    const escaped = signature.replace(/[.()]/g, '\\$&');
    assert.match(sql, new RegExp(`revoke all on function ${escaped} from public, anon, authenticated;`), signature);
    assert.match(sql, new RegExp(`grant execute on function ${escaped} to service_role;`), signature);
  }
  assert.match(sql, /trusted_admit_staffed_assessment\(\s*uuid, uuid, uuid, text, text, text, text, text, text\s*\) from public, anon, authenticated;/);
  // Cleanup is operator-only: not even the Edge service role may run it.
  assert.match(sql, /private\.expire_stale_assessments\(timestamptz, boolean, integer\)\s*from public, anon, authenticated, service_role;/);
  assert.match(sql, /private\.cleanup_orphan_anonymous_users\(timestamptz, boolean, integer\)\s*from public, anon, authenticated, service_role;/);
  // Exactly two security definer helpers, both documented auth.users readers.
  assert.equal((sql.match(/security definer/g) ?? []).length, 2);
  assert.equal((sql.match(/set search_path = ''/g) ?? []).length, (sql.match(/^create (?:or replace )?function/gm) ?? []).length);
  // The only new browser-role grant is the evidence append-window helper.
  assert.doesNotMatch(sql.replace(/grant execute on function private\.patient_can_append_evidence\(uuid\) to authenticated;/, ''),
    /to authenticated;|to anon;/);
  assert.doesNotMatch(sql, /cron\.|pg_cron|notify|http_post|net\.http/i);
});

test('no notification, device secret or patient token logging is introduced', () => {
  const files = [
    'supabase/functions/_shared/trusted/admission-operations.ts',
    'supabase/functions/_shared/store.ts',
    'supabase/functions/_shared/auth.ts',
    'supabase/functions/assessment-admit/index.ts',
    'supabase/functions/assessment-end/index.ts',
  ].map(source).join('\n');
  assert.doesNotMatch(files, /sendgrid|twilio|whatsapp|resend\.com|fcm|web-push|nodemailer|webhook/i);
  assert.doesNotMatch(files, /console\.(?:log|info|warn|debug)|console\.error\([^)]*(?:token|patient)/i);
  assert.doesNotMatch(files, /kiosk.?(?:secret|key|token)|device.?(?:secret|key|token)/i);
});
