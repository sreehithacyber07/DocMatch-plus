/**
 * R9D persistence configuration.
 *
 * Decides, once per build, whether the patient flow may write to the DocMatch+
 * backend at all. The decision is pure so it can be tested without a browser.
 *
 * Persistence is ENABLED only when all of these hold:
 *
 *   - a Supabase URL and a publishable key are configured;
 *   - the key is not a secret or service-role key (those must never reach a
 *     browser, so a misconfigured build fails closed rather than using one);
 *   - the deployment mode has a trusted admission path.
 *
 * WHY THE DEPLOYMENT MODE GATES PERSISTENCE
 *
 * The live R9C insert policy admits an anonymous patient assessment only with
 * `deployment_mode = 'web/self-service'` and no facility or device binding.
 *
 *   web/self-service  the patient admits themselves (R9D).
 *   staffed-tablet    R9G-B: a signed-in clinical staff member on the tablet is
 *                     the trust root, and the trusted `assessment-admit`
 *                     operation binds the patient to that staff member's
 *                     facility. The browser never names the facility.
 *   hospital-kiosk    stays local-only. An unattended kiosk has no trustworthy
 *                     device identity: a device UUID or a secret compiled into
 *                     the bundle is readable by anyone at the screen. Writing a
 *                     kiosk assessment as web/self-service would falsify the
 *                     record, and weakening RLS is not an option.
 */
import { DEPLOYMENT_MODES, type DeploymentMode } from '../trust/deployment.ts';

export type PersistenceDisabledReason =
  | 'not-configured'
  | 'unsafe-key'
  | 'requires-trusted-admission';

/** How a persisting assessment is admitted: by the patient, or by trusted staff. */
export type AdmissionPath = 'self' | 'staff';

export type PersistenceConfig =
  | {
      enabled: true;
      url: string;
      publishableKey: string;
      deploymentMode: 'web/self-service' | 'staffed-tablet';
      admission: AdmissionPath;
    }
  | { enabled: false; reason: PersistenceDisabledReason; deploymentMode: DeploymentMode };

/** Deployment modes whose assessments an anonymous patient may create under R9C. */
export const SELF_ADMITTED_MODES: readonly DeploymentMode[] = ['web/self-service'];

/** R9G-B: modes admitted by a verified clinical staff session. */
export const STAFF_ADMITTED_MODES: readonly DeploymentMode[] = ['staffed-tablet'];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function decodeJwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '='));
    const claims: unknown = JSON.parse(json);
    if (claims && typeof claims === 'object' && 'role' in claims) {
      const role = (claims as { role: unknown }).role;
      return typeof role === 'string' ? role : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * A browser key must be a publishable (or legacy anon) key. Anything that looks
 * like a secret or a service-role JWT disables persistence instead.
 */
export function isBrowserSafeKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return false;
  if (key.startsWith('sb_publishable_')) return true;
  const role = decodeJwtRole(key);
  return role === 'anon';
}

function isHttpsOrLocalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function resolvePersistenceConfig(input: {
  url: unknown;
  publishableKey: unknown;
  deploymentMode: DeploymentMode;
}): PersistenceConfig {
  const { deploymentMode } = input;
  if (!DEPLOYMENT_MODES.includes(deploymentMode)) {
    return { enabled: false, reason: 'requires-trusted-admission', deploymentMode: 'hospital-kiosk' };
  }
  if (!isNonEmptyString(input.url) || !isNonEmptyString(input.publishableKey) || !isHttpsOrLocalUrl(input.url)) {
    return { enabled: false, reason: 'not-configured', deploymentMode };
  }
  if (!isBrowserSafeKey(input.publishableKey.trim())) {
    return { enabled: false, reason: 'unsafe-key', deploymentMode };
  }
  if (deploymentMode !== 'web/self-service' && deploymentMode !== 'staffed-tablet') {
    return { enabled: false, reason: 'requires-trusted-admission', deploymentMode };
  }
  return {
    enabled: true,
    url: input.url.trim(),
    publishableKey: input.publishableKey.trim(),
    deploymentMode,
    admission: deploymentMode === 'staffed-tablet' ? 'staff' : 'self',
  };
}
