import { useEffect, useLayoutEffect, useRef } from 'react';
import { Button } from '../../components/primitives/Button.tsx';
import { CLINICAL_BOUNDARY } from '../trust/copy.ts';
import { TERMS_SECTIONS } from './terms-content.ts';
import './premium-terms.css';

interface PremiumTermsProps {
  deploymentLabel: string;
  sessionNotice: { label: string; notice: string };
  onBack: () => void;
  onAgree: () => void;
}

export function PremiumTerms({ deploymentLabel, sessionNotice, onBack, onAgree }: PremiumTermsProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const readingRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const resetScroll = () => {
      introRef.current?.scrollTo(0, 0);
      readingRef.current?.scrollTo(0, 0);
      window.scrollTo(0, 0);
    };
    resetScroll();
    titleRef.current?.focus({ preventScroll: true });
    const frame = window.requestAnimationFrame(resetScroll);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBack();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  return (
    <section className="premium-terms-page" aria-labelledby="terms-hero-title">
      <div className="premium-terms-layout">
        <div className="premium-terms-intro-panel" ref={introRef} role="region" aria-labelledby="terms-hero-title" tabIndex={0}>
          <p className="premium-terms-eyebrow">Before assessment · {deploymentLabel}</p>
          <h1 id="terms-hero-title" className="premium-terms-title" tabIndex={-1} ref={titleRef}>
            Know what DocMatch+ does, and what it doesn&apos;t.
          </h1>
          <p className="premium-terms-intro">{CLINICAL_BOUNDARY}</p>

          <div className="premium-terms-overview" aria-label="What happens in this assessment">
            <p className="premium-terms-overview__label">The assessment in three steps</p>
            <ol>
              <li><span>01</span><p><strong>A few details about you.</strong> They help set the assessment context.</p></li>
              <li><span>02</span><p><strong>Show where it hurts and answer questions.</strong> A safety check runs throughout.</p></li>
              <li><span>03</span><p><strong>A specialty direction and clinical handoff.</strong> Prepared for the care team to review.</p></li>
            </ol>
          </div>

          <p className="premium-terms-urgent" role="note">
            If you feel very unwell now, tell a member of staff. If no staff member is near, call 112.
          </p>
        </div>

        <div className="premium-terms-content-panel">
          <div className="premium-terms-content-head">
            <p className="premium-terms-content-kicker">Patient agreement</p>
            <h2 id="terms-content-title">Terms &amp; Conditions</h2>
            <p>Please review the information before continuing.</p>
          </div>

          <div className="premium-terms-reading" ref={readingRef} role="region" aria-labelledby="terms-content-title" tabIndex={0}>
            {TERMS_SECTIONS.map((section, index) => (
              <section className="premium-terms-section" key={section.id} aria-labelledby={`terms-section-${section.id}`}>
                <h3 id={`terms-section-${section.id}`}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  {section.title}
                </h3>
                {section.body.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
              </section>
            ))}
            <section className="premium-terms-session" aria-label={sessionNotice.label}>
              <h3>{sessionNotice.label}</h3>
              <p>{sessionNotice.notice}</p>
            </section>
          </div>

          <div className="premium-terms-commit">
            <p className="premium-terms-disclosure" id="premium-terms-disclosure">
              By selecting <strong>Agree &amp; continue</strong>, you confirm that you have reviewed and accepted these terms. DocMatch+ provides a specialty direction, not a diagnosis.
            </p>
            <div className="premium-terms-actions">
              <Button variant="back" onClick={onBack}>Back</Button>
              <Button variant="primary" className="dm-button--forward premium-terms-agree" aria-describedby="premium-terms-disclosure" onClick={onAgree}>
                Agree &amp; continue
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
