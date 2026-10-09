import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AssessmentPersistence, PersistenceSnapshot } from './assessment-persistence.ts';
import type { AssessmentStart } from './events.ts';

interface Slot {
  get: () => AssessmentPersistence | null;
  set: (next: AssessmentPersistence | null) => void;
  subscribe: (listener: () => void) => () => void;
}

function createSlot(): Slot {
  let current: AssessmentPersistence | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(next) {
      if (next === current) return;
      current = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Optional hand-off of a live session across a remount of the same patient.
 * `take` returns a session kept earlier for this patient, if any; `release`
 * receives the session when the hook lets go of it and decides whether to keep
 * it (see trust/patient-memory.ts) or dispose it.
 */
export interface PersistenceRetention {
  take: () => AssessmentPersistence | null;
  release: (persistence: AssessmentPersistence) => void;
}

/**
 * One persistence session per confirmed patient concern.
 *
 * The session is created after the confirmation commits and disposed when
 * `start` changes or the screen unmounts, which is exactly the patient reset
 * boundary. Starting is deferred by a microtask so a development double-mount
 * disposes the first session before it signs anyone in.
 *
 * With `retention`, an unmount hands the session over instead of disposing it,
 * and a remount for the same patient takes the same session back, so the
 * assessment continues rather than being ended and started again. A reset
 * still ends it: the retention disposes anything handed over for a patient who
 * is no longer current.
 */
export function usePatientPersistence(
  start: AssessmentStart | null,
  create: () => AssessmentPersistence,
  retention: PersistenceRetention | null = null,
): AssessmentPersistence | null {
  const [slot] = useState(createSlot);
  const current = useSyncExternalStore(slot.subscribe, slot.get, slot.get);

  useEffect(() => {
    if (!start) return undefined;
    const kept = retention?.take() ?? null;
    const persistence = kept ?? create();
    slot.set(persistence);
    if (!kept) queueMicrotask(() => persistence.begin(start));
    return () => {
      if (slot.get() === persistence) slot.set(null);
      if (retention) retention.release(persistence);
      else void persistence.dispose();
    };
  }, [start, create, slot, retention]);

  return current;
}

const IDLE_SNAPSHOT: PersistenceSnapshot = {
  state: 'idle',
  disabledReason: null,
  pending: 0,
  failed: 0,
  lastErrorKind: null,
};
const noSubscription = () => () => undefined;

export function usePersistenceSnapshot(persistence: AssessmentPersistence | null): PersistenceSnapshot {
  return useSyncExternalStore(
    persistence ? persistence.subscribe : noSubscription,
    persistence ? persistence.getSnapshot : () => IDLE_SNAPSHOT,
    persistence ? persistence.getSnapshot : () => IDLE_SNAPSHOT,
  );
}
