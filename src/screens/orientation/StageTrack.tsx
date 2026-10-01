import { useRef, type KeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Pictogram } from '../../components/pictograms';
import type { Stage } from './stages';

export interface StageTrackProps {
  stages: Stage[];
  activeIndex: number;
  onSelect: (index: number) => void;
  panelId: string;
  tabId: (id: string) => string;
}

/**
 * The control tray docked to the base of the well. It reads as the instrument
 * that drives the volume above it, which is the arrangement the body view will
 * inherit.
 */
export function StageTrack({
  stages,
  activeIndex,
  onSelect,
  panelId,
  tabId,
}: StageTrackProps) {
  const reduceMotion = useReducedMotion();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function focusIndex(next: number) {
    const clamped = (next + stages.length) % stages.length;
    onSelect(clamped);
    refs.current[clamped]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        focusIndex(index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        focusIndex(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusIndex(0);
        break;
      case 'End':
        event.preventDefault();
        focusIndex(stages.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div className="track" role="tablist" aria-label="Route stages" aria-orientation="horizontal">
      {stages.map((stage, index) => {
        const active = index === activeIndex;
        const complete = index < activeIndex;

        return (
          <button
            className="track__node"
            key={stage.id}
            id={tabId(stage.id)}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            tabIndex={active ? 0 : -1}
            data-state={active ? 'active' : complete ? 'complete' : 'upcoming'}
            data-register={stage.register}
            onClick={() => onSelect(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {active && (
              <motion.span
                className="track__node-lit"
                layoutId={reduceMotion ? undefined : 'track-active'}
                data-register={stage.register}
                transition={{ duration: 0.32, ease: [0.2, 0, 0, 1] }}
                aria-hidden="true"
              />
            )}
            <span className="track__node-body">
              <Pictogram
                name={stage.pictogram}
                size={20}
                state={
                  active
                    ? stage.register === 'critical'
                      ? 'critical'
                      : 'active'
                    : complete
                      ? 'completed'
                      : 'default'
                }
              />
              <span className="track__node-name type-control">{stage.name}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
