import { Fragment, useEffect, useRef, useState } from 'react';
import { PainExpression, type PainExpressionLevel } from '../../features/routing-flow/PainExpression.tsx';
import { OnboardingVisual, type OnboardingStageId } from '../onboarding/OnboardingVisual.tsx';
import { SpecialtyLandscape } from './SpecialtyLandscape.tsx';
import '../onboarding/onboarding.css';

type Chapter = {
  id: string;
  number: string;
  name: string;
  headline: string;
  accent: string;
  body: string;
  points: readonly string[];
};

const CHAPTERS: readonly Chapter[] = [
  {
    id: 'locate', number: '01', name: 'Locate',
    headline: 'Start with where it feels wrong.', accent: 'The body is the first signal.',
    body: 'The patient begins by showing where the concern is located, without needing to know the medical name for it.',
    points: ['General area or exact point', 'Front and back body views', 'Location informs the intake, not the diagnosis'],
  },
  {
    id: 'refine', number: '02', name: 'Refine',
    headline: 'Location starts the story. Context sharpens it.', accent: 'From place to pattern.',
    body: 'DocMatch+ narrows the concern using what the patient reports about the experience, such as how it feels, when it started and how it has changed.',
    points: ['Character', 'Intensity', 'Duration', 'Onset', 'Pattern'],
  },
  {
    id: 'clarify', number: '03', name: 'Clarify',
    headline: 'Ask what matters next.', accent: 'Not every question belongs in every story.',
    body: 'Follow-up questions adapt to the information already provided, so the intake can focus on what is relevant to the current concern.',
    points: ['Relevant follow-up', 'One response informs the next', 'Patient-reported evidence stays visible'],
  },
  {
    id: 'check', number: '04', name: 'Check',
    headline: 'Safety does not wait until the end.', accent: 'Urgent signals take priority.',
    body: 'DocMatch+ continuously checks for warning signs that may need immediate attention before normal specialty routing continues.',
    points: ['Safety checks run throughout the intake', 'Urgent concerns interrupt the normal flow', 'In a hospital setting, staff assistance comes first'],
  },
  {
    id: 'route', number: '05', name: 'Route',
    headline: 'Turn the story into a direction.', accent: 'A specialty direction, not a diagnosis.',
    body: 'The information gathered during the intake is organized into a recommended specialty direction based on the supported routing logic.',
    points: ['Specialty direction', 'Supporting patient responses', 'General Medicine fallback when the picture remains unclear'],
  },
  {
    id: 'handoff', number: '06', name: 'Handoff',
    headline: 'Carry the context forward.', accent: 'The patient should not have to start the story again.',
    body: 'DocMatch+ prepares the reported information as a structured clinical handoff so the care team can see what was reported, what was captured, the routing assessment and the recommended next point of care.',
    points: [],
  },
];

const SOAP = [
  ['S', 'What the patient reported'],
  ['O', 'What the intake captured'],
  ['A', 'Routing assessment, not diagnosis'],
  ['P', 'Specialty direction and prepared handoff'],
] as const;

const REFINEMENT_FIELDS = ['Character', 'Duration', 'Onset', 'Pattern'] as const;

function RefineVisual() {
  return (
    <div className="dm-refine-visual">
      <p className="dm-refine-visual__kicker">Patient-reported details</p>
      <div className="dm-refine-visual__intensity">
        <span>Intensity</span>
        <div className="dm-refine-visual__scale">
          {([1, 2, 3, 4, 5] as const).map((level: PainExpressionLevel) => (
            <div className="dm-refine-visual__stop" key={level} data-level={level}>
              <PainExpression level={level} />
              <span>{level}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="dm-refine-visual__fields">
        {REFINEMENT_FIELDS.map((field) => <div key={field}><span>{field}</span><i aria-hidden="true" /></div>)}
      </div>
    </div>
  );
}

function ChapterVisual({ chapter }: { chapter: Chapter }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '100px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="dm-chapter__visual" aria-hidden="true">
      {visible || typeof IntersectionObserver === 'undefined' ? (
        chapter.id === 'refine' ? <RefineVisual /> : (
          <OnboardingVisual
            stage={chapter.id as OnboardingStageId}
            layerIndex={0}
            handoffPreparedOnly={chapter.id === 'handoff'}
          />
        )
      ) : null}
    </div>
  );
}

export function LandingStory() {
  return (
    <div className="dm-story" id="the-flow">
      {CHAPTERS.map((chapter, index) => (
        <Fragment key={chapter.id}>
        <section
          className="dm-chapter"
          data-dna-anchor
          data-dna-x={index % 2 === 0 ? '0.24' : '0.76'}
          id={chapter.id}
          aria-labelledby={`${chapter.id}-title`}
        >
          <div className="dm-chapter__frame">
            <div className="dm-chapter__copy">
              <p className="dm-stage-label">{chapter.number} / {chapter.name}</p>
              <h2 id={`${chapter.id}-title`}>{chapter.headline}</h2>
              <p className="dm-chapter__accent">{chapter.accent}</p>
              <p className="dm-chapter__body">{chapter.body}</p>
              {chapter.id === 'handoff' ? (
                <div className="dm-chapter__soap">
                  {SOAP.map(([letter, label]) => (
                    <div className="dm-chapter__soap-line" key={letter}>
                      <span>{letter}</span><p>{label}</p>
                    </div>
                  ))}
                  <p className="dm-chapter__status">Prepared for clinical handoff</p>
                </div>
              ) : (
                <ul className="dm-chapter__points">
                  {chapter.points.map((point) => <li key={point}>{point}</li>)}
                </ul>
              )}
            </div>
            <ChapterVisual chapter={chapter} />
          </div>
        </section>
        {chapter.id === 'check' ? <SpecialtyLandscape /> : null}
        </Fragment>
      ))}
    </div>
  );
}
