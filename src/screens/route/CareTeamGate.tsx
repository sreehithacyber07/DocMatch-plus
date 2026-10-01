import type { CareTeamGateState } from '../../features/persistence/useCareTeamGate.ts';
import './care-team-gate.css';

interface CareTeamGateProps {
  state: Exclude<CareTeamGateState, 'not-required' | 'authorized'>;
  onRecheck: () => void;
}

/**
 * Staffed tablet, before a patient begins. A patient is admitted through the
 * care-team session signed in on this tablet, so without one no assessment is
 * started. Nothing here reveals account, role or facility detail.
 */
export function CareTeamGate({ state, onRecheck }: CareTeamGateProps) {
  if (state === 'checking') {
    return (
      <main className="care-team-gate" id="main-content" tabIndex={-1} aria-busy="true">
        <section className="care-team-gate__panel">
          <p className="type-body care-team-gate__lead" role="status">Checking the care-team sign-in on this tablet.</p>
        </section>
      </main>
    );
  }

  const unavailable = state === 'unavailable';
  return (
    <main className="care-team-gate" id="main-content" tabIndex={-1}>
      <section className="care-team-gate__panel" aria-labelledby="care-team-gate-title">
        <p className="type-label care-team-gate__eyebrow">Staffed tablet</p>
        <h1 className="type-heading-1 care-team-gate__title" id="care-team-gate-title">
          {unavailable ? 'Care-team service unavailable' : 'Care-team sign-in needed'}
        </h1>
        <p className="type-body care-team-gate__lead">
          {unavailable
            ? 'The care-team sign-in could not be checked. Try again shortly.'
            : 'A care-team member signs in on this tablet before each patient begins. No responses are collected until then.'}
        </p>
        <div className="care-team-gate__actions">
          <a className="cta" href="/staff">
            <span className="type-body">Go to care-team sign-in</span>
          </a>
          <button type="button" className="ghost-button" onClick={onRecheck}>
            <span className="type-body">Check again</span>
          </button>
        </div>
      </section>
    </main>
  );
}
