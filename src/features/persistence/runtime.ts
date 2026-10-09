/**
 * Build-time persistence wiring.
 *
 * Reads only the two browser-safe Supabase variables. Each patient gets a new
 * Supabase client with memory-only Auth, created when their assessment begins
 * and disposed at their reset boundary.
 *
 * The Supabase client is loaded on demand, when a persisting assessment
 * actually begins. Loading the Auth library probes web storage as a module
 * side effect, so local-only builds (hospital kiosk, or no backend) never load
 * it at all, and web builds do not load it on the landing or onboarding screens.
 *
 * R9G-B: a staffed-tablet build with a backend admits each patient through the
 * trusted `assessment-admit` operation, with the care-team session signed in
 * on the tablet as the trust root. Only that build loads the admission module.
 */
import { sessionNoticeFor } from '../trust/copy.ts';
import { DEPLOYMENT_MODE } from '../trust/runtime-config.ts';
import {
  createAssessmentPersistence,
  createDisabledPersistence,
  type AssessmentPersistence,
} from './assessment-persistence.ts';
import { resolvePersistenceConfig } from './config.ts';
import { randomId } from './events.ts';

export const PERSISTENCE_CONFIG = resolvePersistenceConfig({
  url: import.meta.env.VITE_SUPABASE_URL,
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  deploymentMode: DEPLOYMENT_MODE,
  buildTarget: import.meta.env.VITE_BUILD_TARGET,
  demoMode: import.meta.env.VITE_DEMO_MODE,
});

/** True when this build sends assessment responses to the DocMatch+ backend. */
export const PERSISTENCE_ENABLED = PERSISTENCE_CONFIG.enabled;

/** True when each patient must be admitted through a signed-in care-team session. */
export const CARE_TEAM_ADMISSION_REQUIRED =
  PERSISTENCE_CONFIG.enabled && PERSISTENCE_CONFIG.admission === 'staff';

/** The privacy notice that is true for this build. */
export const SESSION_NOTICE = sessionNoticeFor(PERSISTENCE_ENABLED, PERSISTENCE_CONFIG.deploymentMode);

/** Whether an authorized care-team member is signed in on this tablet right now. */
export async function checkCareTeamOnTablet() {
  const config = PERSISTENCE_CONFIG;
  if (!('admission' in config) || config.admission !== 'staff') return { state: 'unavailable' } as const;
  const { checkTabletStaff } = await import('./staffed-admission.ts');
  return checkTabletStaff(config.url, config.publishableKey);
}

export function createRuntimePersistence(): AssessmentPersistence {
  const config = PERSISTENCE_CONFIG;
  if ('reason' in config) return createDisabledPersistence(config.reason);
  const trustedAdmission = config.admission === 'staff';
  return createAssessmentPersistence({
    trustedOperations: true,
    admissionPath: trustedAdmission ? 'trusted' : 'self',
    endOnDispose: true,
    createGateway: async (signal) => {
      const [{ createPatientClient }, { createSupabaseGateway }, admission] = await Promise.all([
        import('./supabase-client.ts'),
        import('./gateway.ts'),
        trustedAdmission ? import('./staffed-admission.ts') : Promise.resolve(null),
      ]);
      return createSupabaseGateway(
        createPatientClient(config.url, config.publishableKey, randomId()),
        signal,
        admission ? { admission: admission.createStaffAdmission(config.url, config.publishableKey) } : {},
      );
    },
  });
}
