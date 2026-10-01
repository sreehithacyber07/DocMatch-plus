import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadQueue, runHandoffTransition, WorkspaceError, type WorkspaceFailure } from '../staff/workspace.ts';
import type { StaffClient } from '../staff/session.ts';

const ROOT = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

/** The CSS block for one selector, without nested rules. */
function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} not found`);
  return css.slice(start, css.indexOf('}', start));
}

/* --- Touch targets ------------------------------------------------------------ */

test('the privacy disclosure and nearby-region controls meet the product touch target', () => {
  const components = source('src/styles/components.css');
  assert.match(rule(components, '.session-note__trigger'), /min-height: var\(--control-target-minimum\)/);
  assert.match(rule(components, '.nearby__option'), /min-height: var\(--control-target-minimum\)/);
  assert.doesNotMatch(components, /min-height: 35px/);
  assert.match(source('src/styles/tokens.css'), /--control-target-minimum: 48px/);
});

/* --- Staff session failures ---------------------------------------------------- */

function failingClient(code: string): StaffClient {
  const query = {
    select: () => query,
    not: () => query,
    order: () => query,
    limit: () => Promise.resolve({ data: null, error: { code } }),
  };
  return { from: () => query } as unknown as StaffClient;
}

async function failureOf(run: () => Promise<unknown>): Promise<WorkspaceFailure | null> {
  try {
    await run();
    return null;
  } catch (error) {
    return error instanceof WorkspaceError ? error.failure : null;
  }
}

test('an expired session and revoked access are reported as different facts', async () => {
  assert.equal(await failureOf(() => loadQueue(failingClient('PGRST301'))), 'expired');
  assert.equal(await failureOf(() => loadQueue(failingClient('PGRST303'))), 'expired');
  assert.equal(await failureOf(() => loadQueue(failingClient('42501'))), 'unauthorized');
  assert.equal(await failureOf(() => loadQueue(failingClient('PGRST000'))), 'unavailable');

  const transition = (status: number) => ({
    functions: {
      invoke: async () => ({ data: null, error: { context: new Response('{}', { status }) } }),
    },
  }) as unknown as StaffClient;
  assert.equal(await failureOf(() => runHandoffTransition(transition(401), 'handoff-open', 'h', 'k')), 'expired');
  assert.equal(await failureOf(() => runHandoffTransition(transition(403), 'handoff-open', 'h', 'k')), 'unauthorized');
  assert.equal(await failureOf(() => runHandoffTransition(transition(503), 'handoff-open', 'h', 'k')), 'unavailable');

  const screen = source('src/features/staff/StaffScreen.tsx');
  assert.match(screen, /error\.failure === 'unauthorized'\) return 'not-authorized'/);
  assert.match(screen, /error\.failure === 'expired'\) return 'session-expired'/);
  // Every failure path clears the session through the same mapping.
  assert.equal(screen.split('sessionEndFor(error)').length - 1, 3);
});

test('the worklist warning-sign flag is readable on the dark row, selected or not', () => {
  const css = source('src/features/staff/staff.css');
  const flag = rule(css, '.staff-row__priority');
  assert.match(flag, /color: var\(--color-status-error\)/);
  // The on-critical-strong token is for text ON the orange surface only.
  assert.doesNotMatch(flag, /on-surface-critical-strong/);
  const tokens = source('src/styles/tokens.css');
  const hex = (name: string) => new RegExp(`--${name}: (#[0-9a-f]{6})`, 'i').exec(tokens)?.[1] ?? '';
  const luminance = (value: string) => {
    const [r, g, b] = [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16) / 255)
      .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
  };
  for (const surface of ['color-surface-plane', 'color-surface-selected']) {
    assert.ok(contrast(hex('color-status-error'), hex(surface)) >= 4.5, surface);
  }
});

test('a long facility name cannot widen the staff workspace', () => {
  const css = source('src/features/staff/staff.css');
  assert.match(rule(css, '.staff-workspace'), /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(rule(css, '.staff-bar__facility'), /text-overflow: ellipsis/);
});

/* --- Routing ----------------------------------------------------------------- */

test('unknown paths get a plain way back and the staff workspace loads on demand', () => {
  const main = source('src/main.tsx');
  // Every non-entrance route is lazy; the entrance bundle carries none of them.
  assert.match(main, /\{ path: '\*', errorElement, lazy: async \(\) => \{[\s\S]*?import\('\.\/screens\/not-found\/NotFoundScreen\.tsx'\)[\s\S]*?Component: NotFoundScreen/);
  assert.match(main, /\{ path: '\/staff', errorElement, lazy: async \(\) => \{[\s\S]*?import\('\.\/features\/staff\/StaffRoute\.tsx'\)[\s\S]*?Component: StaffRoute/);
  assert.match(main, /\{ path: '\/route', errorElement, lazy: \(\) => loadRouteScreen\(\)/);
  assert.match(main, /\{ path: '\/', element: <EntryScreen \/>, errorElement \}/);
  // Every route recovers from a failed chunk or render error on a product screen.
  assert.equal((main.match(/, errorElement \}|errorElement, lazy/g) ?? []).length, 4);
  assert.match(main, /const errorElement = <RouteErrorScreen \/>;/);
  const routeError = source('src/screens/not-found/RouteErrorScreen.tsx');
  assert.match(routeError, /window\.location\.reload\(\)/);
  assert.match(routeError, /href="\/"/);
  assert.match(routeError, /call 112/);
  assert.doesNotMatch(routeError, /useRouteError|error\.message|stack/);
  assert.doesNotMatch(routeError, /not-found\.css/);
  assert.doesNotMatch(main, /^import \{ (RouteScreen|StaffRoute|NotFoundScreen) \}/m);
  assert.doesNotMatch(main, /StaffScreen/);
  const staffRoute = source('src/features/staff/StaffRoute.tsx');
  assert.match(staffRoute, /lazy\(\(\) => import\('\.\/StaffScreen\.tsx'\)/);
  assert.doesNotMatch(staffRoute, /^import \{ StaffScreen \}/m);
  const notFound = source('src/screens/not-found/NotFoundScreen.tsx');
  assert.match(notFound, /href="\/"/);
  assert.match(notFound, /<main /);
  assert.match(notFound, /<h1 /);
  // Rendered copy only: no status codes or developer error wording.
  assert.doesNotMatch(notFound.replace(/\/\*[\s\S]*?\*\//g, ''), /404|error|Unexpected/i);
});

/* --- Keyboard and the entrance ----------------------------------------------- */

test('the skip link is drawn above the route surface when focused', () => {
  const css = source('src/features/body-explorer/body-explorer.css');
  const focused = rule(css, '.route-skip:focus-visible');
  assert.match(focused, /z-index: 60/);
  assert.match(focused, /top: var\(--spacing-2\)/);
  assert.match(focused, /outline: var\(--focus-ring-width\) solid var\(--color-focus-ring\)/);
});

test('the landing scroll story remains accessible and Enter opens the real route', () => {
  const screen = source('src/screens/entry/EntryScreen.tsx');
  assert.match(screen, /<LandingStory \/>/);
  assert.match(screen, /navigate\('\/route'\)/);
  assert.match(screen, /Clinical boundaries/);
  assert.doesNotMatch(screen, /entry--hero|overflow: hidden/);
});

test('controls whose text is hidden on phones keep an accessible name', () => {
  // The visible "Start new patient" label is hidden at phone width; the button
  // must still be named for assistive technology.
  assert.match(source('src/features/body-explorer/Chrome.tsx'), /className="topbar__new-patient type-caption" type="button" aria-label="Start new patient"/);
  assert.match(source('src/features/routing-flow/RoutingFlow.tsx'), /className="assessment-header__new-patient type-caption" type="button" aria-label="Start new patient"/);
  // aria-label is only valid on an element with a role; the rail nodes are images of a step.
  const rail = source('src/components/layout/JourneyRail.tsx');
  assert.match(rail, /className="journey__node"\s+role="img"/);
});

test('a failed save is told to the patient without touching the interview, safety screen or result', () => {
  const flow = source('src/features/routing-flow/RoutingFlow.tsx');
  // Driven only by the sticky failed count, so it cannot flicker while new writes queue.
  assert.match(flow, /const saveFailed = usePersistenceSnapshot\(persistence\)\.failed > 0;/);
  assert.match(flow, /'Your assessment could not be saved\. You can still continue, but this session may not be available to staff\.'/);
  // One always-mounted polite live region per screen; text only when failed.
  assert.match(flow, /className="assessment-save-notice" role="status" aria-live="polite"/);
  assert.match(flow, /\{failed \? <p className="assessment-save-notice__text type-body-small">\{SAVE_FAILURE_NOTICE\}<\/p> : null\}/);
  // Priority screen: after the emergency guidance; elsewhere: before the content.
  assert.match(flow, /\{critical \? null : <SaveFailureNotice failed=\{saveFailed\} \/>\}\s*\{children\}\s*\{critical \? <SaveFailureNotice failed=\{saveFailed\} \/> : null\}/);
  assert.equal((flow.match(/saveFailed=\{saveFailed\}/g) ?? []).length, 3);
  // No modal, no blocking, no claim of success.
  assert.doesNotMatch(flow, /assessment could not be saved[^']*(sent|delivered|received)/i);
  assert.doesNotMatch(flow, /SaveFailureNotice[\s\S]{0,400}(dialog|modal)/i);
});
