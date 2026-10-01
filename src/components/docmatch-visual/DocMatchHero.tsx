import { ChevronDownMark, ClinicalIntakeMark, DnaMark } from './marks.tsx';
import { SlideToEnter } from './SlideToEnter.tsx';
import { moveSpecularEdge } from '../primitives/specular.ts';

export interface DocMatchHeroProps {
  /** Opens the existing /route product flow. */
  onEnter: () => void;
}

/**
 * The landing hero, in the Manus structure and copy.
 *
 * Enter opens the real product flow. Explore the flow only scrolls within the page. The DNA and the
 * signal field behind it come from the page environment, not from the hero.
 */
export function DocMatchHero({ onEnter }: DocMatchHeroProps) {
  return (
    <section id="top" className="dm-hero" data-dna-anchor data-dna-x="0.78" aria-labelledby="dm-hero-title">
      <div className="dm-hero__grid" aria-hidden="true" />
      <div className="dm-hero__meta">
        <span className="dm-hero__meta-rule" aria-hidden="true" />
        <span>DocMatch+ / 01</span>
      </div>
      <div className="dm-hero__content">
        <p className="dm-eyebrow">
          <span className="dm-hero__eyebrow-mark" aria-hidden="true">
            <DnaMark />
          </span>
          Symptom → specialist
        </p>
        <h1 className="dm-hero__title" id="dm-hero-title">
          Where symptoms begin,
          <br />
          care finds its direction.
        </h1>
        <p className="dm-hero__accent">From signal<br />to specialty.</p>
        <p className="dm-hero__description">
          DocMatch+ turns what a patient reports into a structured intake, guiding the next specialty direction while
          preparing a clearer handoff for the care team.
        </p>
        <div className="dm-hero__actions">
          <SlideToEnter onEnter={onEnter} />
          <a className="dm-landing-button dm-landing-button--ghost dm-specular" href="#locate" onPointerMove={moveSpecularEdge}>
            Explore the flow
            <ChevronDownMark />
          </a>
        </div>
        <p className="dm-hero__sequence">Locate. Refine. Clarify. Check. Route. Handoff.</p>
      </div>
      <div className="dm-hero__signal" aria-label="From patient report to specialty direction">
        <p>Patient-reported context</p>
        <span>Location / Context / Safety</span>
        <strong>Specialty direction</strong>
      </div>
      <p className="dm-hero__caption" aria-hidden="true">
        <span className="dm-hero__caption-line" />
        <span>
          A guided intake,
          <br />
          not a diagnosis
        </span>
        <ClinicalIntakeMark />
      </p>
      <p className="dm-hero__cue" aria-hidden="true">
        <span>Scroll to explore</span>
        <span className="dm-hero__cue-line" />
      </p>
    </section>
  );
}
