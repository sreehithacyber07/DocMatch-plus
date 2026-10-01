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
 * One persistence session per confirmed patient concern.
 *
 * The session is created after the confirmation commits and disposed when
 * `start` changes or the screen unmounts, which is exactly the patient reset
 * boundary. Starting is deferred by a microtask so a development double-mount
 * disposes the first session before it signs anyone in.
 */
export function usePatientPersistence(
  start: AssessmentStart | null,
  create: () => AssessmentPersistence,
): AssessmentPersistence | null {
  const [slot] = useState(createSlot);
  const current = useSyncExternalStore(slot.subscribe, slot.get, slot.get);

  useEffect(() => {
    if (!start) return undefined;
    const persistence = create();
    slot.set(persistence);
    queueMicrotask(() => persistence.begin(start));
    return () => {
      if (slot.get() === persistence) slot.set(null);
      void persistence.dispose();
    };
  }, [start, create, slot]);

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
