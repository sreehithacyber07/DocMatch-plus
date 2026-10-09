/**
 * Page-memory retention of one patient's in-progress assessment.
 *
 * WHAT IT IS FOR
 *
 * The patient flow lives inside /route. A browser Back gesture, or the intake's
 * own Back to the introduction, used to unmount that screen and discard every
 * answer, so an accidental swipe on a phone cost the patient everything they
 * had entered. This keeps the current patient's screen state in JavaScript
 * memory while they are briefly away, so returning resumes where they left.
 *
 * PRIVACY
 *
 *   - JavaScript memory only. Nothing is written to web storage (local or
 *     session), IndexedDB, cookies, the URL or history state, so a refresh
 *     or closing the tab ends it, exactly as the session notice says.
 *   - Retention across leaving /route is limited to web/self-service builds
 *     (the patient's own device). A hospital kiosk or a staffed tablet is
 *     shared, so there leaving /route discards the patient as before: a
 *     previous patient's answers can never be resurrected for the next one.
 *   - It expires a fixed time after the patient leaves /route.
 *   - Any patient reset (New patient, kiosk inactivity, a page restored from
 *     the back/forward cache) discards it at once, along with the backend
 *     session it may be holding.
 *
 * EPOCHS
 *
 * Parts are written with the patient-session epoch that produced them. A write
 * for an epoch other than the current one is ignored, so a screen that belongs
 * to a patient who was just reset can never write their state back in.
 */

/** How long a web/self-service patient's state is kept after leaving /route. */
export const RESUME_WINDOW_MS = 30 * 60 * 1000;

export interface RetentionPolicy {
  /** Whether state survives leaving /route at all. */
  retainAcrossExit: boolean;
  resumeWindowMs: number;
}

/** Something the memory may hold that must be released when it is discarded. */
export interface Disposable {
  dispose(): unknown;
}

interface Timers {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const browserTimers: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface PatientMemory<Parts extends Record<string, unknown>> {
  /** The epoch the memory currently belongs to. */
  epoch(): number;
  /**
   * Called as /route mounts. Returns the epoch to continue and whether the
   * held state is still valid; expired or disallowed state is discarded here.
   * Has no other side effect, so it is safe in a React state initializer.
   */
  resume(): { epoch: number; resumed: boolean };
  /** /route is on screen: any pending expiry is cancelled. */
  attach(): void;
  /** /route has unmounted: keep (with an expiry) or discard, by policy. */
  leave(): void;
  read<K extends keyof Parts>(epoch: number, key: K): Parts[K] | undefined;
  write<K extends keyof Parts>(epoch: number, key: K, value: Parts[K]): void;
  /** A patient reset: everything for the old epoch is released. */
  reset(nextEpoch: number, carry?: Partial<Parts>): void;
  /**
   * Holds a backend session while /route is away, so returning continues the
   * same assessment instead of ending it and starting another. Disposed on
   * any reset, discard or expiry, and immediately when retention is off or the
   * epoch is stale.
   */
  park(epoch: number, key: string, value: Disposable): void;
  /** Takes back a parked backend session for this epoch and key, if any. */
  unpark<T extends Disposable>(epoch: number, key: string): T | null;
  /** Releases everything. */
  discard(): void;
}

export function createPatientMemory<Parts extends Record<string, unknown>>(
  policy: RetentionPolicy,
  options: { now?: () => number; timers?: Timers } = {},
): PatientMemory<Parts> {
  const now = options.now ?? (() => Date.now());
  const timers = options.timers ?? browserTimers;
  let epoch = 0;
  let parts: Partial<Parts> = {};
  let leftAt: number | null = null;
  let expiry: unknown = null;
  let parked: { epoch: number; key: string; value: Disposable } | null = null;

  const releaseParked = () => {
    const held = parked;
    parked = null;
    if (held) void held.value.dispose();
  };
  const cancelExpiry = () => {
    if (expiry !== null) timers.clear(expiry);
    expiry = null;
  };
  const discard = () => {
    cancelExpiry();
    releaseParked();
    parts = {};
    leftAt = null;
  };
  const expired = () => leftAt !== null && now() - leftAt > policy.resumeWindowMs;

  return {
    epoch: () => epoch,
    resume() {
      if (leftAt !== null && (!policy.retainAcrossExit || expired())) discard();
      return { epoch, resumed: Object.keys(parts).length > 0 };
    },
    attach() {
      cancelExpiry();
      if (expired()) discard();
      leftAt = null;
    },
    leave() {
      if (!policy.retainAcrossExit) {
        discard();
        return;
      }
      leftAt = now();
      cancelExpiry();
      expiry = timers.set(discard, policy.resumeWindowMs);
    },
    read(atEpoch, key) {
      return atEpoch === epoch ? parts[key] : undefined;
    },
    write(atEpoch, key, value) {
      if (atEpoch !== epoch) return;
      parts = { ...parts, [key]: value };
    },
    reset(nextEpoch, carry = {}) {
      releaseParked();
      epoch = nextEpoch;
      parts = { ...carry };
    },
    park(atEpoch, key, value) {
      if (!policy.retainAcrossExit || atEpoch !== epoch) {
        void value.dispose();
        return;
      }
      if (parked && parked.value !== value) releaseParked();
      parked = { epoch: atEpoch, key, value };
    },
    unpark<T extends Disposable>(atEpoch: number, key: string) {
      if (!parked || parked.epoch !== atEpoch || parked.key !== key || atEpoch !== epoch) return null;
      const value = parked.value as T;
      parked = null;
      return value;
    },
    discard,
  };
}
