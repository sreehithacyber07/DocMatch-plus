import type { BodyLayerId, BodyView } from '../../body/index.ts';
import { Pictogram } from '../../components/pictograms';
import { Brandmark } from '../hero/Brandmark.tsx';

const JOURNEY = ['Understand', 'Analyze', 'Match', 'Heal'] as const;

const LAYER_TITLE: Record<BodyLayerId, { title: string; subtitle: string }> = {
  hologram: {
    title: 'Hologram layer',
    subtitle: 'Surface view. Select the area of discomfort.',
  },
  systems: {
    title: 'Systems layer',
    subtitle: 'Body systems view for the selected area.',
  },
  structures: {
    title: 'Organs layer',
    subtitle: 'Internal structure view for the selected area.',
  },
};

export function TopBar({
  view,
  deploymentLabel,
  onNewPatient,
}: {
  view: BodyView;
  deploymentLabel: string;
  onNewPatient: () => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar__identity">
        <Brandmark size="compact" />
      </div>

      <nav className="topbar__journey" aria-label="Journey">
        <ol>
          {JOURNEY.map((step, index) => (
            <li key={step}>
              <span className="type-label topbar__step" aria-current={index === 0 ? 'step' : undefined}>
                {step}
              </span>
              {index < JOURNEY.length - 1 ? <span className="topbar__sep" aria-hidden="true" /> : null}
            </li>
          ))}
        </ol>
      </nav>

      <div className="topbar__status">
        <span className="type-caption topbar__deployment">{deploymentLabel}</span>
        <span className="topbar__chip">
          <span className="type-label">Body explorer</span>
          <span className="topbar__chip-value type-caption">{view === 'front' ? 'Front' : 'Back'}</span>
        </span>
        <button className="topbar__new-patient type-caption" type="button" aria-label="Start new patient" onClick={onNewPatient}>
          <Pictogram name="history" size={20} />
          <span>Start new patient</span>
        </button>
      </div>
    </header>
  );
}

export function StageTitle({ layer, faceMode = false }: { layer: BodyLayerId; faceMode?: boolean }) {
  const copy = faceMode ? { title: 'Face detail', subtitle: 'Choose the exact facial area of concern.' } : LAYER_TITLE[layer];
  return (
    <div className="stage-title">
      <h1 className="type-heading-2">{copy.title}</h1>
      <p className="type-body-small">{copy.subtitle}</p>
    </div>
  );
}

export interface StepperProps {
  hasRegion: boolean;
  hasComplaint?: boolean;
}

/**
 * The real routing journey only.
 *
 * Hologram, Systems and Organs are optional exploration layers reached from the
 * layer selector, so they are deliberately absent here. Visiting them is never
 * required to reach a direction.
 */
const STEPS = [
  { id: 'locate', label: 'Select location', hint: 'Where it affects you' },
  { id: 'concern', label: 'Confirm location', hint: 'Then describe your concern' },
  { id: 'questions', label: 'Answer questions', hint: 'Adaptive and safety' },
  { id: 'direction', label: 'Get direction', hint: 'Specialty routing' },
] as const;

export function Stepper({ hasRegion, hasComplaint = false }: StepperProps) {
  const activeIndex = hasComplaint ? 2 : hasRegion ? 1 : 0;
  return (
    <nav className="stepper" aria-label="Progress">
      <ol>
        {STEPS.map((step, index) => {
          const state = index === activeIndex ? 'active' : index < activeIndex ? 'complete' : 'upcoming';
          return (
            <li className="stepper__item" key={step.id} data-state={state}>
              <span className="stepper__node" aria-hidden="true">
                {state === 'complete' ? <Pictogram name="routing" size={20} state="completed" /> : index + 1}
              </span>
              <span className="stepper__text">
                <span className="type-control">{step.label}</span>
                <span className="type-caption stepper__hint">{step.hint}</span>
              </span>
              {index < STEPS.length - 1 ? <span className="stepper__line" aria-hidden="true" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
