import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/primitives/Button.tsx';
import { Checkbox } from '../../components/primitives/Checkbox.tsx';
import { HoverCard } from '../../components/primitives/HoverCard.tsx';
import { CLINICAL_BOUNDARY } from '../trust/copy.ts';
import { TERMS_PREVIEW, TERMS_TITLE, TERMS_VALIDATION_MESSAGE } from './terms-content.ts';
import { PremiumTerms } from './PremiumTerms.tsx';

export interface IntakeThresholdProps {
  deploymentLabel: string;
  sessionNotice: { label: string; notice: string };
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  onBegin: () => void;
  onBack: () => void;
}

/**
 * Before you begin. The patient reads what DocMatch+ does and where it stops,
 * accepts the terms, and begins.
 *
 * Begin assessment is never a dead disabled button. Activating it without the
 * terms accepted keeps the patient here, marks the consent row invalid, says
 * why in words, and moves focus to the checkbox so the next action is obvious
 * to keyboard and screen reader users alike.
 */
export function IntakeThreshold({
  deploymentLabel,
  sessionNotice,
  accepted,
  onAcceptedChange,
  onBegin,
  onBack,
}: IntakeThresholdProps) {
  const [invalid, setInvalid] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const checkboxRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const begin = () => {
    if (!accepted) {
      setInvalid(true);
      checkboxRef.current?.focus();
      return;
    }
    onBegin();
  };

  if (termsOpen) {
    return (
      <PremiumTerms
        deploymentLabel={deploymentLabel}
        sessionNotice={sessionNotice}
        onBack={() => {
          setTermsOpen(false);
          // Wait for DOM to update then focus title
          setTimeout(() => titleRef.current?.focus(), 0);
        }}
        onAgree={() => {
          onAcceptedChange(true);
          onBegin();
        }}
      />
    );
  }

  return (
    <section className="threshold before-begin__dialog" aria-labelledby="before-begin-title">
      <div className="threshold__scroll">
        <div className="threshold__lead">
          <p className="type-caption threshold__eyebrow">Before you begin · {deploymentLabel}</p>
          <h1 className="threshold__title" id="before-begin-title" tabIndex={-1} ref={titleRef}>
            DocMatch+ points you to a specialty. The care team makes the clinical decisions.
          </h1>
          <p className="type-body threshold__boundary">{CLINICAL_BOUNDARY}</p>
        </div>

        <div className="threshold__info">
          <ol className="threshold__steps" aria-label="What happens in this assessment">
            <li>
              <span className="threshold__step-mark" aria-hidden="true">1</span>
              <span>
                <strong>A few details about you.</strong> Kept in this page for this assessment only.
              </span>
            </li>
            <li>
              <span className="threshold__step-mark" aria-hidden="true">2</span>
              <span>
                <strong>Show where it hurts and answer questions.</strong> A safety check runs throughout.
              </span>
            </li>
            <li>
              <span className="threshold__step-mark" aria-hidden="true">3</span>
              <span>
                <strong>A specialty direction and a clinical handoff.</strong> Prepared for the care team to review.
              </span>
            </li>
          </ol>

          <p className="threshold__urgent" role="note">
            <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
              <path d="M10 2.8 18 16.6H2z" />
              <path d="M10 8v3.8M10 14v.2" />
            </svg>
            <span>
              If you feel very unwell now, tell a member of staff. If no staff member is near, call 112.
            </span>
          </p>

          <div className="threshold__notice">
            <p className="type-caption threshold__notice-label">{sessionNotice.label}</p>
            <p className="type-caption threshold__notice-text">{sessionNotice.notice}</p>
          </div>
        </div>
      </div>

      <div className="threshold__commit">
        <div className="terms-consent" data-invalid={invalid && !accepted ? true : undefined}>
          <div className="terms-consent__row">
            <Checkbox
              ref={checkboxRef}
              id="terms-accept"
              checked={accepted}
              aria-labelledby="terms-accept-label"
              aria-invalid={invalid && !accepted ? true : undefined}
              aria-describedby={invalid && !accepted ? 'terms-accept-error' : undefined}
              onCheckedChange={(next) => {
                onAcceptedChange(next);
                if (next) setInvalid(false);
              }}
            />
            <span className="terms-consent__label" id="terms-accept-label">
              <label htmlFor="terms-accept">I agree to the </label>
              <HoverCard
                className="terms-preview"
                trigger={(props) => (
                  <button className="terms-consent__link" type="button" onClick={() => setTermsOpen(true)} {...props}>
                    {TERMS_TITLE}
                  </button>
                )}
              >
                <strong className="terms-preview__title">In short</strong>
                {TERMS_PREVIEW.map((line) => (
                  <span key={line} className="terms-preview__line">
                    {line}
                  </span>
                ))}
                <span className="terms-preview__more">Select Terms & Conditions to read them in full.</span>
              </HoverCard>
            </span>
          </div>
          <div aria-live="assertive">
            {invalid && !accepted ? (
              <p className="dm-field__error terms-consent__error" id="terms-accept-error">
                <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
                  <circle cx="8" cy="8" r="6.5" />
                  <path d="M8 4.6v4.2M8 10.9v.2" />
                </svg>
                <span>{TERMS_VALIDATION_MESSAGE}</span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="threshold__actions before-begin__actions">
          <Button variant="back" className="ghost-button" onClick={onBack}>
            Back
          </Button>
          <Button
            variant="primary"
            className="cta threshold__begin dm-button--forward"
            data-ready={accepted ? true : undefined}
            onClick={begin}
          >
            Begin assessment
          </Button>
        </div>
      </div>
    </section>
  );
}
