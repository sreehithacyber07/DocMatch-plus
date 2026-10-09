/**
 * Research-prototype demonstration mode.
 *
 * DocMatch+ is published as a demonstration, not as clinical software. The
 * safeguard is in code: a demonstration build never persists and never opens
 * the clinical workspace, even with valid database variables. Demonstration is
 * the build default, so only a deliberate VITE_DEMO_MODE=off can turn
 * persistence back on. The banner is a notice, not the safeguard.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { isDemoBuild, resolvePersistenceConfig } from '../persistence/config.ts';
import { resolveStaffConfig } from '../staff/config.ts';
import { DEMO_BANNER_TITLE } from '../../components/demo/demo-copy.ts';

const URL = 'https://example.supabase.co';
const KEY = 'sb_publishable_example';

test('a demonstration build refuses persistence in every deployment mode, even with valid variables', () => {
  for (const deploymentMode of ['web/self-service', 'staffed-tablet', 'hospital-kiosk'] as const) {
    for (const buildTarget of ['production', 'preview', '']) {
      const config = resolvePersistenceConfig({ url: URL, publishableKey: KEY, deploymentMode, buildTarget, demoMode: 'research-prototype' });
      assert.deepEqual(config, { enabled: false, reason: 'demo-mode', deploymentMode }, `${deploymentMode} ${buildTarget}`);
    }
  }
});

test('a demonstration build has no clinical workspace', () => {
  assert.deepEqual(resolveStaffConfig({ url: URL, publishableKey: KEY, buildTarget: 'production', demoMode: 'research-prototype' }), { enabled: false, reason: 'demo-mode' });
});

test('only an explicit off ends demonstration mode', () => {
  for (const value of ['research-prototype', 'on', 'yes', ' Research-Prototype ']) assert.equal(isDemoBuild(value), true, value);
  for (const value of ['off', 'OFF', ' off ', '', undefined, null, 1]) assert.equal(isDemoBuild(value), false, String(value));
  const real = resolvePersistenceConfig({ url: URL, publishableKey: KEY, deploymentMode: 'web/self-service', buildTarget: 'production', demoMode: 'off' });
  assert.equal(real.enabled, true);
});

test('every build is a demonstration unless VITE_DEMO_MODE=off, and both clients read the flag', () => {
  const vite = fs.readFileSync('vite.config.ts', 'utf8');
  assert.match(vite, /'import\.meta\.env\.VITE_DEMO_MODE':\s*JSON\.stringify\(process\.env\.VITE_DEMO_MODE \?\? 'research-prototype'\)/);
  for (const file of ['src/features/persistence/runtime.ts', 'src/features/staff/StaffScreen.tsx']) {
    assert.match(fs.readFileSync(file, 'utf8'), /demoMode: import\.meta\.env\.VITE_DEMO_MODE/, file);
  }
});

test('the research-prototype notice is outside the router, so every route shows it', () => {
  const main = fs.readFileSync('src/main.tsx', 'utf8');
  assert.match(main, /isDemoBuild\(import\.meta\.env\.VITE_DEMO_MODE\) \? <DemoBanner \/> : null\}\s*<RouterProvider/);
  assert.equal(DEMO_BANNER_TITLE, 'Research Prototype — Demonstration Only. Not for medical decisions.');
});
