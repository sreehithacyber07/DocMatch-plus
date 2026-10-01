import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { resolveStaffConfig } from '../staff/config.ts';
import { STAFF_AUTH_MESSAGE, STAFF_STORAGE_KEY, signInStaff, signOutStaff, staffAuthOptions, type StaffClient } from '../staff/session.ts';
import { activeAnswers, HANDOFF_STATUS_LABEL, WorkspaceError } from '../staff/workspace.ts';
import { patientAuthOptions } from '../persistence/supabase-client.ts';

const ROOT = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function staffFiles(): string[] {
  const dir = path.join(ROOT, 'src/features/staff');
  return fs.readdirSync(dir).map((name) => path.join('src/features/staff', name));
}

/* --- 1. Configuration ------------------------------------------------------------ */

test('the workspace is configured only with a browser-safe key', () => {
  const url = 'https://example.supabase.co';
  assert.deepEqual(resolveStaffConfig({ url, publishableKey: 'sb_publishable_example' }), {
    enabled: true,
    url,
    publishableKey: 'sb_publishable_example',
  });
  assert.deepEqual(resolveStaffConfig({ url: undefined, publishableKey: 'sb_publishable_example' }), {
    enabled: false,
    reason: 'not-configured',
  });
  assert.deepEqual(resolveStaffConfig({ url: 'http://example.com', publishableKey: 'sb_publishable_example' }), {
    enabled: false,
    reason: 'not-configured',
  });
  assert.deepEqual(resolveStaffConfig({ url, publishableKey: 'sb_secret_example' }), {
    enabled: false,
    reason: 'unsafe-key',
  });
  const serviceRoleJwt = ['e30', Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url'), 'sig'].join('.');
  assert.deepEqual(resolveStaffConfig({ url, publishableKey: serviceRoleJwt }), { enabled: false, reason: 'unsafe-key' });
});

/* --- 2. Patient and staff session isolation --------------------------------------- */

test('the staff session is persistent, the patient session stays memory-only, and they never share a key', () => {
  const staff = staffAuthOptions();
  assert.equal(staff.persistSession, true, 'a clinician is not signed out by a page reload');
  assert.equal(staff.autoRefreshToken, true);
  assert.equal(staff.detectSessionInUrl, false);
  assert.equal(staff.storageKey, STAFF_STORAGE_KEY);

  const patient = patientAuthOptions('one');
  assert.equal(patient.persistSession, false, 'R9D patient behaviour is unchanged');
  assert.notEqual(patient.storageKey, staff.storageKey);
  assert.notEqual(patientAuthOptions('two').storageKey, staff.storageKey);
  // Two separate clients, so neither can read, refresh or clear the other.
  assert.match(source('src/features/staff/session.ts'), /createClient<Database>/);
  assert.doesNotMatch(source('src/features/staff/session.ts'), /createPatientClient|persistence\/supabase-client/);
  assert.doesNotMatch(source('src/features/persistence/supabase-client.ts'), /STAFF_STORAGE_KEY|staffAuthOptions/);
});

test('staff sign-in handles a network exception and sign-out ends only this session', async () => {
  const signInFailure = { auth: { signInWithPassword: async () => { throw new Error('network offline'); } } } as unknown as StaffClient;
  assert.equal(await signInStaff(signInFailure, ' clinician@example.invalid ', 'not-logged'), 'unavailable');
  let scope: string | undefined;
  const signOutClient = { auth: { signOut: async (options: { scope: string }) => {
    scope = options.scope;
    return { error: null };
  } } } as unknown as StaffClient;
  assert.deepEqual(await signOutStaff(signOutClient), { remoteRevoked: true, localCleared: true });
  assert.equal(scope, 'local');
  const refused = { auth: { signOut: async () => ({ error: new Error('network offline') }) } } as unknown as StaffClient;
  const saved = new Map([[STAFF_STORAGE_KEY, 'staff session']]);
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    removeItem: (key: string) => { saved.delete(key); },
  };
  assert.deepEqual(await signOutStaff(refused, storage), { remoteRevoked: false, localCleared: true });
  assert.equal(saved.has(STAFF_STORAGE_KEY), false);
  const thrown = { auth: { signOut: async () => { throw new Error('offline'); } } } as unknown as StaffClient;
  saved.set(STAFF_STORAGE_KEY, 'staff session');
  assert.deepEqual(await signOutStaff(thrown, storage), { remoteRevoked: false, localCleared: true });
  assert.equal(saved.has(STAFF_STORAGE_KEY), false);
});

test('the staff client is never constructed from a patient surface', () => {
  const patientSurfaces = [
    'src/screens/route/RouteScreen.tsx',
    'src/screens/entry/EntryScreen.tsx',
    'src/features/routing-flow/RoutingFlow.tsx',
    'src/features/persistence/runtime.ts',
    'src/features/persistence/assessment-persistence.ts',
  ];
  for (const file of patientSurfaces) {
    assert.doesNotMatch(source(file), /features\/staff|StaffScreen|staffAuthOptions/, file);
  }
  // The screen itself loads the session module on demand, so a patient page
  // never even evaluates the persistent Auth client.
  const screen = source('src/features/staff/StaffScreen.tsx');
  assert.match(screen, /import\('\.\/session\.ts'\)/);
  assert.doesNotMatch(screen, /^import \{[^}]*createStaffClient/m);
  // The patient reset path signs out only the patient client.
  assert.doesNotMatch(source('src/features/persistence/assessment-persistence.ts'), /staff/i);
});

/* --- 3. Refusals say nothing internal ---------------------------------------------- */

test('every staff auth message is neutral about profiles, roles and facilities', () => {
  const messages = Object.values(STAFF_AUTH_MESSAGE);
  assert.equal(messages.length, 5);
  for (const message of messages) {
    assert.doesNotMatch(message, /profile|role|facility|disabled|staff_profiles|policy|SQL|supabase/i, message);
  }
  assert.equal(STAFF_AUTH_MESSAGE['not-authorized'], 'This account is not authorized for the clinical workspace.');
});

test('no signup, password reset or role claim exists in the browser', () => {
  for (const file of staffFiles()) {
    const text = source(file);
    assert.doesNotMatch(text, /signUp\(|signInWithOtp|resetPasswordForEmail|updateUser\(/, file);
    assert.doesNotMatch(text, /user_metadata|raw_user_meta_data|app_metadata/, file);
    // Built from parts so this file does not itself look like a credential leak
    // to the R9G-A scan of browser sources.
    const privileged = new RegExp(`service_role|sb_secret_|${['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_')}`);
    assert.doesNotMatch(text, privileged, file);
  }
  const everything = staffFiles().map(source).join('\n');
  assert.doesNotMatch(everything, /create account|register|sign up/i);
  // The password is handed to Supabase Auth and to nothing else.
  assert.equal((everything.match(/signInWithPassword/g) ?? []).length, 1);
  assert.doesNotMatch(everything, /console\.(log|info|warn|error)/);
  assert.doesNotMatch(everything, /\.from\('staff_profiles'\)|\.from\('facilities'\)/);
});

/* --- 4. Worklist behaviour ---------------------------------------------------------- */

test('the display projection follows the append-only answer stream', () => {
  assert.deepEqual(activeAnswers([]), []);
  assert.deepEqual(
    activeAnswers([
      { question_id: 'q1', option_id: 'a', operation: 'selected', sequence: 1 },
      { question_id: 'q2', option_id: 'b', operation: 'selected', sequence: 2 },
      { question_id: 'q1', option_id: 'c', operation: 'selected', sequence: 3 },
      { question_id: 'q2', option_id: null, operation: 'cleared', sequence: 4 },
    ]),
    [{ questionId: 'q1', optionId: 'c' }],
  );
  // Out-of-order rows are ordered by sequence, not by arrival.
  assert.deepEqual(
    activeAnswers([
      { question_id: 'q1', option_id: null, operation: 'cleared', sequence: 2 },
      { question_id: 'q1', option_id: 'a', operation: 'selected', sequence: 1 },
    ]),
    [],
  );
});

test('the worklist shows only recorded facts and every status has a word', () => {
  for (const status of ['prepared', 'available_for_review', 'opened', 'acknowledged', 'closed', 'cancelled'] as const) {
    assert.equal(typeof HANDOFF_STATUS_LABEL[status], 'string');
    assert.ok(HANDOFF_STATUS_LABEL[status].length > 0);
  }
  const ui = ['src/features/staff/StaffScreen.tsx', 'src/features/staff/HandoffDetail.tsx', 'src/features/staff/staff.css']
    .map(source).join('\n');
  // No invented operational or demographic data, and no fake analytics.
  assert.doesNotMatch(ui, /patient name|full name|\bage\b|phone|room|bed|token|wait time|doctor assigned|revenue|throughput/i);
  assert.doesNotMatch(ui, /notified|alert sent|sent to (the )?(doctor|clinician)|delivered/i);
  // Status and priority are never carried by colour alone.
  assert.match(ui, /HANDOFF_STATUS_LABEL\[item\.status\]/);
  assert.match(ui, /Warning sign screened/);
  assert.match(source('src/features/staff/staff.css'), /focus-visible/);
});

test('a workspace failure is typed, so an unauthorized read ends the session', () => {
  assert.equal(new WorkspaceError('unauthorized').failure, 'unauthorized');
  const screen = source('src/features/staff/StaffScreen.tsx');
  assert.match(screen, /error instanceof WorkspaceError && error\.failure === 'unauthorized'/);
  assert.match(screen, /endSession/);
  // Acknowledgement is a separate, explicit action: opening never acknowledges.
  assert.match(screen, /runHandoffTransition\(active, 'handoff-open'/);
  assert.match(screen, /runHandoffTransition\(active, 'handoff-acknowledge'/);
  const opening = screen.slice(screen.indexOf('async function openHandoff'), screen.indexOf('async function acknowledge'));
  assert.doesNotMatch(opening, /handoff-acknowledge/);
});

test('the patient result still says prepared, not sent', () => {
  const result = source('src/features/routing-flow/RoutingResult.tsx');
  assert.doesNotMatch(result, /sent to (the )?doctor|doctor notified|clinician acknowledged|under review/i);
  assert.match(source('src/features/routing-flow/soap-handoff.ts'), /Prepared for clinical handoff/);
});
