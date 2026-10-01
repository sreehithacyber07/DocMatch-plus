import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Pictogram } from '../../components/pictograms';
import type { KioskIdlePolicy, PatientResetReason } from './session-policy.ts';
import './trust.css';

export interface KioskPrivacyBoundaryProps {
  children: ReactNode;
  enabled: boolean;
  policy: KioskIdlePolicy;
  onReset: (reason: PatientResetReason) => void;
}

export function KioskPrivacyBoundary({
  children,
  enabled,
  policy,
  onReset,
}: KioskPrivacyBoundaryProps) {
  const [warningOpen, setWarningOpen] = useState(false);
  const [timerCycle, setTimerCycle] = useState(0);
  const warningOpenRef = useRef(false);
  const onResetRef = useRef(onReset);
  const continueRef = useRef<HTMLButtonElement>(null);
  const clearRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    onResetRef.current = onReset;
  }, [onReset]);

  useEffect(() => {
    if (!enabled) return;
    let warningTimer = 0;
    let resetTimer = 0;

    const clearTimers = () => {
      window.clearTimeout(warningTimer);
      window.clearTimeout(resetTimer);
    };

    const armTimers = () => {
      clearTimers();
      warningTimer = window.setTimeout(() => {
        warningOpenRef.current = true;
        setWarningOpen(true);
        resetTimer = window.setTimeout(() => {
          warningOpenRef.current = false;
          setWarningOpen(false);
          onResetRef.current('inactivity');
          setTimerCycle((current) => current + 1);
        }, policy.resetAfterMs - policy.warningAfterMs);
      }, policy.warningAfterMs);
    };

    const recordActivity = () => {
      if (!warningOpenRef.current) armTimers();
    };

    armTimers();
    window.addEventListener('pointerdown', recordActivity, { passive: true });
    window.addEventListener('keydown', recordActivity);
    window.addEventListener('touchstart', recordActivity, { passive: true });
    return () => {
      clearTimers();
      window.removeEventListener('pointerdown', recordActivity);
      window.removeEventListener('keydown', recordActivity);
      window.removeEventListener('touchstart', recordActivity);
    };
  }, [enabled, policy.resetAfterMs, policy.warningAfterMs, timerCycle]);

  useEffect(() => {
    if (warningOpen) continueRef.current?.focus();
  }, [warningOpen]);

  function continueAssessment() {
    warningOpenRef.current = false;
    setWarningOpen(false);
    setTimerCycle((current) => current + 1);
  }

  function clearPatientNow() {
    warningOpenRef.current = false;
    setWarningOpen(false);
    onResetRef.current('manual');
    setTimerCycle((current) => current + 1);
  }

  function keepFocusInDialog(event: KeyboardEvent<HTMLDivElement>) {
    // Escape takes the non-destructive path. Clearing a patient always needs an
    // explicit choice or the timeout; a stray key press must never do it.
    if (event.key === 'Escape') {
      event.preventDefault();
      continueAssessment();
      return;
    }
    if (event.key !== 'Tab') return;
    if (event.shiftKey && document.activeElement === continueRef.current) {
      event.preventDefault();
      clearRef.current?.focus();
    } else if (!event.shiftKey && document.activeElement === clearRef.current) {
      event.preventDefault();
      continueRef.current?.focus();
    }
  }

  return (
    <div className="privacy-boundary">
      <div inert={warningOpen ? true : undefined} aria-hidden={warningOpen ? true : undefined}>
        {children}
      </div>

      {warningOpen ? (
        <div className="idle-warning" role="presentation">
          <div
            className="idle-warning__dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="idle-warning-title"
            aria-describedby="idle-warning-copy"
            onKeyDown={keepFocusInDialog}
          >
            <span className="idle-warning__mark" aria-hidden="true">
              <Pictogram name="history" size={30} />
            </span>
            <p className="type-label idle-warning__eyebrow">Kiosk privacy</p>
            <h2 className="type-heading-2" id="idle-warning-title">Still using this assessment?</h2>
            <p className="type-body" id="idle-warning-copy">
              This kiosk has been inactive. Continue now, or the patient session will be cleared automatically.
            </p>
            <div className="idle-warning__actions">
              <button ref={continueRef} className="cta" type="button" onClick={continueAssessment}>
                <span className="type-control">Continue assessment</span>
              </button>
              <button ref={clearRef} className="ghost-button" type="button" onClick={clearPatientNow}>
                <span className="type-control">Clear patient session</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
