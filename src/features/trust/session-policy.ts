export interface KioskIdlePolicy {
  warningAfterMs: number;
  resetAfterMs: number;
}

export const DEFAULT_KIOSK_IDLE_POLICY: KioskIdlePolicy = {
  warningAfterMs: 4 * 60 * 1000,
  resetAfterMs: 5 * 60 * 1000,
};

const MINIMUM_WARNING_MS = 30_000;
const MINIMUM_GRACE_MS = 15_000;

function configuredMilliseconds(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= MINIMUM_WARNING_MS ? parsed : null;
}

/** Invalid or incomplete environment values resolve to the documented safe default. */
export function resolveKioskIdlePolicy(warningValue: unknown, resetValue: unknown): KioskIdlePolicy {
  const warningAfterMs = configuredMilliseconds(warningValue) ?? DEFAULT_KIOSK_IDLE_POLICY.warningAfterMs;
  const resetAfterMs = configuredMilliseconds(resetValue) ?? DEFAULT_KIOSK_IDLE_POLICY.resetAfterMs;
  if (resetAfterMs < warningAfterMs + MINIMUM_GRACE_MS) return DEFAULT_KIOSK_IDLE_POLICY;
  return { warningAfterMs, resetAfterMs };
}

export type PatientResetReason = 'manual' | 'inactivity' | 'history-return';

export interface PatientSessionBoundary<TPatient> {
  epoch: number;
  patient: TPatient | null;
  lastResetReason: PatientResetReason | null;
}

export function createPatientSessionBoundary<TPatient>(): PatientSessionBoundary<TPatient> {
  return { epoch: 0, patient: null, lastResetReason: null };
}

export function confirmPatientSession<TPatient>(
  state: PatientSessionBoundary<TPatient>,
  patient: TPatient,
): PatientSessionBoundary<TPatient> {
  return { ...state, patient, lastResetReason: null };
}

/** Incrementing the epoch forces every patient-state owner below it to remount. */
export function resetPatientSession<TPatient>(
  state: PatientSessionBoundary<TPatient>,
  reason: PatientResetReason,
): PatientSessionBoundary<TPatient> {
  return { epoch: state.epoch + 1, patient: null, lastResetReason: reason };
}
