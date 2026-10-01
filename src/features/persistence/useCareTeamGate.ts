import { useCallback, useEffect, useState } from 'react';

export type CareTeamGateState = 'not-required' | 'checking' | 'authorized' | 'sign-in-required' | 'unavailable';

type Check = () => Promise<{ state: 'authorized' | 'sign-in-required' | 'unavailable' }>;

/**
 * R9G-B staffed tablet: before each patient begins, confirm that an authorized
 * care-team member is signed in on this tablet. The check reruns at every
 * patient boundary (`epoch`) and on request. It only reads the care-team
 * session; it never signs anyone in or out.
 */
export function useCareTeamGate(required: boolean, epoch: number, check: Check) {
  const [attempt, setAttempt] = useState(0);
  const key = `${epoch}:${attempt}`;
  const [result, setResult] = useState<{ key: string; state: CareTeamGateState } | null>(null);

  useEffect(() => {
    if (!required) return undefined;
    let live = true;
    check().then(
      (outcome) => { if (live) setResult({ key, state: outcome.state }); },
      () => { if (live) setResult({ key, state: 'unavailable' }); },
    );
    return () => {
      live = false;
    };
  }, [required, key, check]);

  const recheck = useCallback(() => setAttempt((value) => value + 1), []);
  const state: CareTeamGateState = !required ? 'not-required' : result?.key === key ? result.state : 'checking';
  return { state, recheck };
}
