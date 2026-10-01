import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DocMatchEnvironment } from '../../components/docmatch-visual/DocMatchEnvironment.tsx';
import { DocMatchHero } from '../../components/docmatch-visual/DocMatchHero.tsx';
import { MenuMark } from '../../components/docmatch-visual/marks.tsx';
import { moveSpecularEdge } from '../../components/primitives/specular.ts';
import { Brandmark } from '../../features/hero/Brandmark.tsx';
import { loadRouteScreen } from '../route/load-route-screen.ts';
import { LandingStory } from './LandingStory.tsx';
import './entry.css';

const NAV = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'For patients', href: '#for-patients' },
  { label: 'For care teams', href: '#for-care-teams' },
  { label: 'Clinical boundaries', href: '#clinical-boundaries' },
] as const;

/**
 * The landing: one page in the Manus visual language.
 *
 * Enter opens the existing product route. The six conceptual chapters explain
 * the flow without simulating patient screens. One DNA canvas travels behind
 * the whole scroll story.
 */
export function EntryScreen() {
  const navigate = useNavigate();
  // Back from the intake threshold returns to the flow, not the top.
  // The flag is a UI position only; it carries no patient data.
  const returning = (useLocation().state as { returnToIntroduction?: boolean } | null)?.returnToIntroduction === true;
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (returning) document.getElementById('the-flow')?.scrollIntoView({ block: 'start' });
  }, [returning]);

  const enter = () => navigate('/route');
  // Fetch the /route chunk on the first sign of intent to enter (touching or
  // focusing the slide control), not at load, so it never competes with the
  // entrance's own first paint and main-thread work.
  const prefetchRoute = (event: { target: EventTarget | null }) => {
    if (event.target instanceof Element && event.target.closest('.dm-slide-commit')) void loadRouteScreen();
  };

  return (
    <DocMatchEnvironment intensity="landing">
      <div className="landing" onPointerOverCapture={prefetchRoute} onPointerDownCapture={prefetchRoute} onFocusCapture={prefetchRoute}>
        <header className="dm-nav">
          <a className="dm-nav__brand" href="#top" aria-label="DocMatch+ home">
            <Brandmark size="compact" />
          </a>
          <nav className="dm-nav__links" data-open={menuOpen || undefined} id="dm-nav-links" aria-label="Primary navigation">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>
                {item.label}
              </a>
            ))}
          </nav>
          <button
            className="dm-nav__toggle dm-specular"
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="dm-nav-links"
            onPointerMove={moveSpecularEdge}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MenuMark open={menuOpen} />
          </button>
        </header>

        <main className="landing__main" id="main-content" tabIndex={-1}>
          <DocMatchHero onEnter={enter} />

          <section id="how-it-works" className="dm-intro" aria-labelledby="dm-intro-title">
            <p className="dm-eyebrow">How DocMatch+ works</p>
            <h2 className="dm-intro__title" id="dm-intro-title">
              From signal
              <br />
              <em className="dm-accent">to specialty.</em>
            </h2>
            <p className="dm-intro__body">
              DocMatch+ helps a patient describe a concern, refine the story, check for warning signs and prepare a
              clearer clinical handoff.
            </p>
          </section>

          <LandingStory />

          <section className="dm-why" aria-labelledby="dm-why-title">
            <p className="dm-eyebrow">Why DocMatch+</p>
            <h2 id="dm-why-title">A clearer patient story<br />before the clinical conversation.</h2>
            <p className="dm-why__accent">Less repetition. More usable context.</p>
            <p className="dm-why__body">DocMatch+ helps organize what the patient reports before the care team takes over. It does not replace clinical assessment. It gives the next conversation a clearer starting point.</p>
            <div className="dm-why__principles">
              <div><span>01 / Patient-led</span><h3>Start with what the patient knows.</h3><p>Location, symptoms and lived experience come first. Medical terminology is not required.</p></div>
              <div><span>02 / Adaptive</span><h3>Ask what is relevant.</h3><p>The intake responds to earlier answers instead of presenting every patient with the same fixed questionnaire.</p></div>
              <div><span>03 / Clinician-bound</span><h3>Keep clinical decisions clinical.</h3><p>Diagnosis, prescribing, treatment and final clinical judgment remain with the care team.</p></div>
            </div>
          </section>

          <section id="for-patients" className="dm-note" aria-labelledby="dm-patients-title">
            <p className="dm-eyebrow">For patients</p>
            <h2 className="dm-note__text" id="dm-patients-title">Describe what you feel.<br />Not what you think it is.</h2>
            <p className="dm-note__accent">No medical vocabulary required.</p>
            <p className="dm-note__body">DocMatch+ begins with the patient's own experience and guides the intake step by step before recommending where that concern may be best seen.</p>
            <ul className="dm-section-list"><li>Show where the concern is</li><li>Describe what has changed</li><li>Answer relevant questions</li><li>See the recommended specialty direction</li></ul>
          </section>
          <section id="for-care-teams" className="dm-note dm-note--right" aria-labelledby="dm-teams-title">
            <p className="dm-eyebrow">For care teams</p>
            <h2 className="dm-note__text" id="dm-teams-title">Receive the story<br />in a more structured form.</h2>
            <p className="dm-note__accent">Context before conclusion.</p>
            <p className="dm-note__body">The handoff organizes the information collected during intake without turning it into a diagnosis.</p>
            <ul className="dm-section-list"><li>Patient-reported history</li><li>Body-location context</li><li>Safety information</li><li>Routing evidence</li><li>Structured SOAP-style handoff</li></ul>
          </section>
          <section className="dm-boundary" id="clinical-boundaries" aria-labelledby="dm-boundary-title">
            <p className="dm-eyebrow">Clinical boundaries</p>
            <h2 className="dm-boundary__text" id="dm-boundary-title">DocMatch+ guides the intake.<br />The care team makes the clinical decisions.</h2>
            <div className="dm-boundary__columns">
              <div><h3>DocMatch+ can</h3><ul className="dm-section-list"><li>Organize patient-reported information</li><li>Ask relevant follow-up questions</li><li>Check defined safety signals</li><li>Recommend a specialty direction</li><li>Prepare a clinical handoff</li></ul></div>
              <div><h3>Care team decides</h3><ul className="dm-section-list"><li>Diagnosis</li><li>Examination</li><li>Investigations</li><li>Medication</li><li>Treatment</li><li>Final clinical judgment</li></ul></div>
            </div>
          </section>
          <section className="dm-final" data-dna-anchor data-dna-x="0.5" aria-labelledby="dm-final-title">
            <p className="dm-eyebrow">Ready when you are</p>
            <h2 id="dm-final-title">Start with the signal.</h2>
            <p className="dm-final__accent">Let context shape the direction.</p>
            <p className="dm-final__body">When you are ready, return to the front door and begin the guided intake.</p>
            <div className="dm-final__actions"><a href="#top">Return to top &uarr;</a></div>
          </section>
        </main>

        <footer className="dm-footer">
          <span>DocMatch+ / Guided intake</span>
          <a href="#top">Return to top ↑</a>
        </footer>
      </div>
    </DocMatchEnvironment>
  );
}
