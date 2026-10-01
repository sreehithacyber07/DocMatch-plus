import { useState } from 'react';
import './App.css';
import { Flow, PageShell } from './components/layout';
import { Pictogram, type PictogramName, type PictogramState } from './components/pictograms';

const entryStages: Array<{ label: string; pictogram: PictogramName }> = [
  { label: 'Orient', pictogram: 'location' },
  { label: 'Select', pictogram: 'structure' },
  { label: 'Ready', pictogram: 'routing' },
];

const stageNames = ['Orientation', 'Selection', 'Ready'];
const actionLabels = ['Set starting point', 'Confirm readiness', 'Starting point ready'];
const responseCopy = [
  'The starting point is available.',
  'Starting point selected. Confirm when you are ready.',
  'Orientation complete. Your place remains visible.',
];

function pictogramState(index: number, step: number): PictogramState {
  if (step === entryStages.length - 1 || index < step) return 'completed';
  if (index === step) return 'active';
  return 'default';
}

function App() {
  const [step, setStep] = useState(0);
  const selected = step > 0;
  const completed = step === entryStages.length - 1;

  function advance() {
    setStep((current) => Math.min(current + 1, entryStages.length - 1));
  }

  function clearSelection() {
    if (selected) setStep(0);
  }

  return (
    <PageShell
      stage={stageNames[step]}
      stagePosition={{ current: step + 1, total: entryStages.length }}
      routeAnnouncement="DocMatch+ entry orientation"
    >
      <Flow as="article" gap="section" aria-labelledby="foundation-title" className="foundation-proof">
        <header className="foundation-proof__opening">
          <div className="foundation-proof__coordinate" aria-hidden="true">
            <span className="type-caption">Entry</span>
            <span className="type-stage-number">01</span>
          </div>

          <h1 className="foundation-proof__title" id="foundation-title">
            <span className="type-display">Know where you are.</span>
            <span className="type-question foundation-proof__title-human">See what comes next.</span>
          </h1>

          <div className="foundation-proof__context">
            <p className="type-label">Patient-guided specialty routing</p>
            <p className="type-body-small">
              Orientation stays visible from the moment you begin. No health information is entered on this screen.
            </p>
          </div>
        </header>

        <section className="entry-frame" aria-labelledby="entry-title" data-step={step}>
          <header className="entry-frame__header">
            <p className="type-data">0{step + 1} / 03</p>
            <h2 className="type-control" id="entry-title">Establish your starting point</h2>
            <p className="type-caption">No patient data</p>
          </header>

          <ol className="entry-frame__sequence" aria-label="Entry progress">
            {entryStages.map(({ label, pictogram }, index) => {
              const state = pictogramState(index, step);
              return (
                <li
                  key={label}
                  data-state={state}
                  aria-current={index === step ? 'step' : undefined}
                >
                  <span className="entry-frame__stage-number type-caption">0{index + 1}</span>
                  <Pictogram name={pictogram} size={20} state={state} />
                  <span className="type-control">{label}</span>
                  <span className="entry-frame__stage-line" aria-hidden="true" />
                </li>
              );
            })}
          </ol>

          <div className="entry-frame__body">
            <div className="entry-frame__orientation">
              <div className="entry-frame__marker" data-state={selected ? 'selected' : 'available'}>
                <Pictogram
                  name="location"
                  size={40}
                  state={completed ? 'completed' : selected ? 'active' : 'default'}
                  label={completed ? 'Starting point ready' : selected ? 'Starting point selected' : 'Starting point available'}
                />
              </div>
              <div className="entry-frame__orientation-copy">
                <p className="type-caption">Your place stays visible</p>
                <h2 className="type-question">
                  {selected ? 'Your starting point is held.' : 'Begin from one clear place.'}
                </h2>
                <p className="type-body">
                  {selected
                    ? 'The interface preserves your place while the next response becomes available.'
                    : 'Choose when to begin. The interface responds without moving you away from this frame.'}
                </p>
              </div>
            </div>

            <div className="entry-frame__response" data-state={completed ? 'completed' : selected ? 'selected' : 'available'}>
              <div className="entry-frame__response-index" aria-hidden="true">
                <span className="type-caption">Step</span>
                <span className="type-heading-1">0{step + 1}</span>
              </div>

              <div className="entry-frame__controls">
                <button
                  className="motion-control type-control entry-frame__primary"
                  data-status={completed ? 'completed' : selected ? 'selected' : undefined}
                  type="button"
                  aria-disabled={completed}
                  onClick={advance}
                >
                  {actionLabels[step]}
                </button>
                <button
                  className="entry-frame__secondary type-control"
                  type="button"
                  aria-disabled={!selected}
                  onClick={clearSelection}
                >
                  Clear selection
                </button>
              </div>

              <p className="entry-frame__announcement type-body-small" aria-live="polite">
                {responseCopy[step]}
              </p>
            </div>
          </div>
        </section>
      </Flow>
    </PageShell>
  );
}

export default App;
