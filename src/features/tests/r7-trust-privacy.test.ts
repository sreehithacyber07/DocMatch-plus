import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  DEPLOYMENT_MODES,
  priorityPresentationFor,
  resolveDeploymentMode,
} from '../trust/deployment.ts';
import {
  DEFAULT_KIOSK_IDLE_POLICY,
  confirmPatientSession,
  createPatientSessionBoundary,
  resetPatientSession,
  resolveKioskIdlePolicy,
} from '../trust/session-policy.ts';
import {
  CLINICAL_BOUNDARY,
  LOCAL_ONLY_SESSION_NOTICE,
  PERSISTED_SESSION_NOTICE,
  sessionNoticeFor,
} from '../trust/copy.ts';

const ROOT = process.cwd();

function source(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function runtimeSource(): string {
  // Staff Auth has a dedicated persistent credential slot; this assertion is
  // about patient-session code, which must not write medical data to storage.
  const roots = ['src/main.tsx', 'src/screens', 'src/features', 'src/components', 'src/styles'];
  const files: string[] = [];
  const visit = (entry: string) => {
    const absolute = path.join(ROOT, entry);
    const stat = fs.statSync(absolute);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute)) visit(path.join(entry, name));
      return;
    }
    if (/\.(?:ts|tsx|css)$/.test(entry)
      && !entry.includes(`${path.sep}tests${path.sep}`)
      && !entry.includes(`${path.sep}staff${path.sep}`)) files.push(entry);
  };
  roots.forEach(visit);
  return files.map(source).join('\n');
}

test('the three deployment modes are explicit and legacy aliases remain compatible', () => {
  assert.deepEqual(DEPLOYMENT_MODES, ['hospital-kiosk', 'staffed-tablet', 'web/self-service']);
  assert.equal(resolveDeploymentMode('hospital-kiosk'), 'hospital-kiosk');
  assert.equal(resolveDeploymentMode('staffed-tablet'), 'staffed-tablet');
  assert.equal(resolveDeploymentMode('web/self-service'), 'web/self-service');
  assert.equal(resolveDeploymentMode('tablet'), 'staffed-tablet');
  assert.equal(resolveDeploymentMode('web'), 'web/self-service');
  assert.equal(resolveDeploymentMode('unexpected'), 'hospital-kiosk');
});

test('the same R3 payload receives mode-specific presentation without changing its content', () => {
  const payload = {
    actionLabel: 'Call 112 in an emergency',
    secondaryLabel: 'Seek urgent medical assessment',
    headline: 'Get emergency medical help now',
    guidance: 'Use the emergency guidance provided by R3.',
  };
  const kiosk = priorityPresentationFor('hospital-kiosk', payload);
  const tablet = priorityPresentationFor('staffed-tablet', payload);
  const web = priorityPresentationFor('web/self-service', payload);

  assert.equal(kiosk.primaryLabel, 'Request clinical assistance');
  assert.equal(tablet.primaryLabel, 'Begin clinical review');
  assert.equal(web.primaryLabel, payload.actionLabel);
  assert.equal(web.primaryKind, 'telephone');
  assert.match(kiosk.confirmation ?? '', /does not notify staff automatically/i);
  assert.match(tablet.confirmation ?? '', /No external alert was sent/i);
});

test('new patient invalidates the entire mounted patient subtree', () => {
  const initial = createPatientSessionBoundary<{ complaintId: string; bodyRegion: string }>();
  const dirty = confirmPatientSession(initial, { complaintId: 'headache', bodyRegion: 'head' });
  const cleared = resetPatientSession(dirty, 'manual');
  assert.equal(cleared.patient, null);
  assert.equal(cleared.epoch, dirty.epoch + 1);
  assert.equal(cleared.lastResetReason, 'manual');

  const route = source('src/screens/route/RouteScreen.tsx');
  assert.match(route, /key={`body-\$\{patientSession\.epoch\}`}/);
  assert.match(route, /key={`routing-\$\{patientSession\.epoch\}`}/);
  assert.match(route, /onNewPatient=\{\(\) => clearPatientSession\('manual'\)\}/);
});

test('routing, safety, intake, belief history and SOAP all live below the reset key', () => {
  const flow = source('src/features/routing-flow/RoutingFlow.tsx');
  assert.match(flow, /useState<RoutingSession>/);
  assert.match(flow, /useState<readonly SafetyAnswer\[]>/);
  assert.match(flow, /useState<readonly IntakeAnswer\[]>/);
  assert.match(flow, /replayBelief\(/);
  assert.match(flow, /<RoutingResult/);
  assert.doesNotMatch(flow, /persist\s*\(/);
});

test('medical session data is neither persisted nor placed in a URL', () => {
  const runtime = runtimeSource();
  assert.doesNotMatch(runtime, /\b(?:localStorage|sessionStorage|indexedDB)\b/);
  assert.doesNotMatch(runtime, /document\.cookie|URLSearchParams|searchParams|location\.(?:search|hash)/);
  assert.doesNotMatch(runtime, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/);
  assert.match(source('src/main.tsx'), /path: '\/route'/);
});

test('refresh and bfcache behavior intentionally clear the in-memory session', () => {
  const route = source('src/screens/route/RouteScreen.tsx');
  assert.doesNotMatch(route, /hydrate\s*\(|rehydrate\s*\(|persist\s*\(/);
  assert.match(route, /pageshow/);
  assert.match(route, /event\.persisted/);
  assert.match(route, /clearPatientSession\('history-return'\)/);
});

test('hospital kiosk idle timing is documented, configurable and safely bounded', () => {
  assert.deepEqual(resolveKioskIdlePolicy(undefined, undefined), DEFAULT_KIOSK_IDLE_POLICY);
  assert.deepEqual(resolveKioskIdlePolicy('120000', '180000'), {
    warningAfterMs: 120000,
    resetAfterMs: 180000,
  });
  assert.deepEqual(resolveKioskIdlePolicy('5000', '6000'), DEFAULT_KIOSK_IDLE_POLICY);
  assert.deepEqual(resolveKioskIdlePolicy('120000', '125000'), DEFAULT_KIOSK_IDLE_POLICY);
  assert.match(source('.env.example'), /VITE_KIOSK_IDLE_WARNING_MS=240000/);
  assert.match(source('.env.example'), /VITE_KIOSK_IDLE_RESET_MS=300000/);
});

test('privacy and clinical-boundary copy stays precise and avoids absolute claims', () => {
  const renderedCopy = `${CLINICAL_BOUNDARY}\n${LOCAL_ONLY_SESSION_NOTICE}\n${PERSISTED_SESSION_NOTICE}\n${runtimeSource()}`;
  assert.match(CLINICAL_BOUNDARY, /final clinical judgment remain with the care team/);
  // Local-only builds keep the R7 statement, which is still true for them.
  assert.equal(sessionNoticeFor(false).notice, LOCAL_ONLY_SESSION_NOTICE);
  assert.match(LOCAL_ONLY_SESSION_NOTICE, /page memory/);
  assert.match(LOCAL_ONLY_SESSION_NOTICE, /does not write these responses to browser storage/);
  // Persisting builds must never claim responses stay off a server.
  assert.equal(sessionNoticeFor(true).notice, PERSISTED_SESSION_NOTICE);
  assert.match(PERSISTED_SESSION_NOTICE, /sent to the DocMatch\+ backend/);
  assert.doesNotMatch(PERSISTED_SESSION_NOTICE, /not (?:send|sent)|to a server|page memory for the current assessment/i);
  assert.doesNotMatch(sessionNoticeFor(true).label, /session only/i);
  // Screens read the notice chosen at runtime, never a fixed constant.
  const screens = `${source('src/screens/onboarding/OnboardingScreen.tsx')}\n${source('src/features/body-explorer/ContextPanels.tsx')}`;
  assert.doesNotMatch(screens, /LOCAL_ONLY_SESSION_NOTICE|PERSISTED_SESSION_NOTICE/);
  // R9G-B also passes the deployment mode, so a staffed tablet names its facility staff.
  assert.match(source('src/features/persistence/runtime.ts'),
    /sessionNoticeFor\(PERSISTENCE_ENABLED(?:, PERSISTENCE_CONFIG\.deploymentMode)?\)/);
  assert.doesNotMatch(renderedCopy, /nothing (?:is )?stored|nothing (?:is )?sent|100% private/i);
});

test('unsupported regulatory and efficacy claims are absent from visible runtime copy', () => {
  assert.doesNotMatch(
    runtimeSource(),
    /FDA approved|HIPAA compliant|medical-grade AI|guaranteed routing|diagnostic accuracy|100% private/i,
  );
});

test('priority and consent dialogs expose non-color semantics and focus targets', () => {
  const priority = source('src/features/routing-flow/PriorityEscalation.tsx');
  // R8.1 moved consent from the onboarding modal to the intake threshold on
  // /route: a checkbox with its own invalid state, and the full terms in a
  // native modal dialog (showModal makes the page inert and traps focus).
  const consent = source('src/features/intake/IntakeThreshold.tsx');
  const checkbox = source('src/components/primitives/Checkbox.tsx');
  const dialog = source('src/components/primitives/Dialog.tsx');
  const idle = source('src/features/trust/KioskPrivacyBoundary.tsx');
  assert.match(priority, /role="alertdialog"/);
  assert.match(priority, /aria-describedby="priority-guidance priority-indicator"/);
  assert.match(priority, /Warning sign identified/);
  assert.match(checkbox, /role="checkbox"/);
  assert.match(checkbox, /aria-checked=\{checked\}/);
  assert.match(consent, /aria-invalid=\{invalid && !accepted \? true : undefined\}/);
  assert.match(consent, /aria-describedby=\{invalid && !accepted \? 'terms-accept-error' : undefined\}/);
  assert.match(consent, /id="before-begin-title" tabIndex=\{-1\}/);
  assert.match(dialog, /<dialog/);
  assert.match(dialog, /showModal\(\)/);
  assert.match(dialog, /aria-labelledby=\{titleId\}/);
  assert.match(idle, /role="alertdialog"/);
  assert.match(idle, /Continue assessment/);
  assert.match(idle, /Clear patient session/);
});
