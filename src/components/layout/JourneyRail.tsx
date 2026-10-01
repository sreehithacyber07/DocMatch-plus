import { motion, useReducedMotion } from 'framer-motion';
import { Pictogram, type PictogramName } from '../pictograms';

export interface JourneyStage {
  id: string;
  name: string;
  pictogram: PictogramName;
}

const JOURNEY_STAGES: readonly JourneyStage[] = [
  { id: 'locate', name: 'Locate', pictogram: 'body' },
  { id: 'clarify', name: 'Clarify', pictogram: 'question' },
  { id: 'check', name: 'Check', pictogram: 'alert' },
  { id: 'route', name: 'Route', pictogram: 'routing' },
];

export interface JourneyRailProps {
  /** Index of the stage currently in progress. */
  activeIndex: number;
  /** Draws the active stage in the safety register. */
  critical?: boolean;
}

/**
 * The journey spine.
 *
 * Marks and a lit path, nothing else. It carries no identity, because the
 * product identity belongs to the application header and showing it twice on
 * one screen reads as a mistake; and it carries no rotated stage name, because
 * text turned on its side is harder to read than the mark it was labelling.
 * Names reach assistive technology and hover through the accessible label.
 */
export function JourneyRail({ activeIndex, critical = false }: JourneyRailProps) {
  const reduceMotion = useReducedMotion();

  return (
    <nav className="journey" aria-label="Assessment progress">
      <ol className="journey__stages">
        {JOURNEY_STAGES.map((stage, index) => {
          const state = index === activeIndex ? 'active' : index < activeIndex ? 'complete' : 'ahead';
          const isCritical = critical && state === 'active';
          return (
            <li className="journey__stage" key={stage.id} data-state={state}>
              {index > 0 ? <span className="journey__link" aria-hidden="true" /> : null}
              <span
                className="journey__node"
                role="img"
                title={stage.name}
                aria-label={`${stage.name}, ${state === 'active' ? 'in progress' : state === 'complete' ? 'complete' : 'not started'}`}
                aria-current={state === 'active' ? 'step' : undefined}
              >
                {state === 'active' ? (
                  <motion.span
                    className="journey__lit"
                    layoutId={reduceMotion ? undefined : 'journey-active'}
                    data-register={isCritical ? 'critical' : undefined}
                    transition={{ duration: 0.32, ease: [0.2, 0, 0, 1] }}
                    aria-hidden="true"
                  />
                ) : null}
                <Pictogram
                  name={stage.pictogram}
                  size={20}
                  state={
                    isCritical
                      ? 'critical'
                      : state === 'active'
                        ? 'active'
                        : state === 'complete'
                          ? 'completed'
                          : 'default'
                  }
                />
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
