/**
 * Preview isolation (phase 3). A Vercel preview build must never persist to
 * the production patient database, even if database variables reach it. The
 * guard is in code, independent of the preview environment's variables and of
 * Edge Function CORS (REST writes do not pass through CORS).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { isPreviewBuild, resolvePersistenceConfig } from '../persistence/config.ts';
import { resolveStaffConfig } from '../staff/config.ts';

const URL = 'https://example.supabase.co';
const KEY = 'sb_publishable_example';

test('a preview build refuses persistence even with valid database variables', () => {
  const preview = resolvePersistenceConfig({ url: URL, publishableKey: KEY, deploymentMode: 'web/self-service', buildTarget: 'preview' });
  assert.deepEqual(preview, { enabled: false, reason: 'preview-isolated', deploymentMode: 'web/self-service' });
  const staffed = resolvePersistenceConfig({ url: URL, publishableKey: KEY, deploymentMode: 'staffed-tablet', buildTarget: 'Preview' });
  assert.equal(staffed.enabled, false);
});

test('production and local builds are unchanged', () => {
  for (const buildTarget of ['production', '', undefined]) {
    const config = resolvePersistenceConfig({ url: URL, publishableKey: KEY, deploymentMode: 'web/self-service', buildTarget });
    assert.equal(config.enabled, true, String(buildTarget));
  }
});

test('the clinical workspace is isolated the same way', () => {
  assert.deepEqual(resolveStaffConfig({ url: URL, publishableKey: KEY, buildTarget: 'preview' }), { enabled: false, reason: 'preview-isolated' });
  assert.equal(resolveStaffConfig({ url: URL, publishableKey: KEY, buildTarget: 'production' }).enabled, true);
  assert.equal(isPreviewBuild('development'), false);
});

test('the build target is wired from VERCEL_ENV into both clients', () => {
  const vite = fs.readFileSync('vite.config.ts', 'utf8');
  assert.match(vite, /VITE_BUILD_TARGET['"]?\s*:\s*JSON\.stringify\(process\.env\.VERCEL_ENV/);
  for (const file of ['src/features/persistence/runtime.ts', 'src/features/staff/StaffScreen.tsx']) {
    assert.match(fs.readFileSync(file, 'utf8'), /buildTarget: import\.meta\.env\.VITE_BUILD_TARGET/, file);
  }
});
