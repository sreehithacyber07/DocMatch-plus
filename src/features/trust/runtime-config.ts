import { DEPLOYMENT_PROFILES, resolveDeploymentMode } from './deployment.ts';
import { resolveKioskIdlePolicy } from './session-policy.ts';

export const DEPLOYMENT_MODE = resolveDeploymentMode(import.meta.env.VITE_DEPLOYMENT_MODE);
export const DEPLOYMENT_PROFILE = DEPLOYMENT_PROFILES[DEPLOYMENT_MODE];
export const KIOSK_IDLE_POLICY = resolveKioskIdlePolicy(
  import.meta.env.VITE_KIOSK_IDLE_WARNING_MS,
  import.meta.env.VITE_KIOSK_IDLE_RESET_MS,
);
