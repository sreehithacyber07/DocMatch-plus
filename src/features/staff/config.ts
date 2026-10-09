/**
 * Clinical workspace configuration.
 *
 * The workspace uses the same browser-safe project URL and publishable key as
 * the patient flow. It is deliberately independent of the deployment mode: the
 * mode describes how a PATIENT is admitted, and R9F adds no patient path.
 *
 * A secret or service-role key is refused here exactly as it is for the patient
 * client, so a misconfigured build fails closed instead of shipping a
 * privileged credential to a browser.
 */
import { isBrowserSafeKey, isDemoBuild, isPreviewBuild } from '../persistence/config.ts';

export type StaffWorkspaceDisabledReason = 'not-configured' | 'unsafe-key' | 'preview-isolated' | 'demo-mode';

export type StaffConfig =
  | { enabled: true; url: string; publishableKey: string }
  | { enabled: false; reason: StaffWorkspaceDisabledReason };

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttpsOrLocalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function resolveStaffConfig(input: { url: unknown; publishableKey: unknown; buildTarget?: unknown; demoMode?: unknown }): StaffConfig {
  // The public demonstration has no clinical workspace at all.
  if (isDemoBuild(input.demoMode)) return { enabled: false, reason: 'demo-mode' };
  // A preview build never connects the clinical workspace to the production database.
  if (isPreviewBuild(input.buildTarget)) return { enabled: false, reason: 'preview-isolated' };
  if (!isNonEmpty(input.url) || !isNonEmpty(input.publishableKey) || !isHttpsOrLocalUrl(input.url)) {
    return { enabled: false, reason: 'not-configured' };
  }
  if (!isBrowserSafeKey(input.publishableKey.trim())) return { enabled: false, reason: 'unsafe-key' };
  return { enabled: true, url: input.url.trim(), publishableKey: input.publishableKey.trim() };
}
