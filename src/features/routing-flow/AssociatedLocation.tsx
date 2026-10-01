import { motion, useReducedMotion } from 'framer-motion';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { BODY_DOMAIN, bodyRegionById, type BodyRegionId, type BodyView } from '../../body/index.ts';
import {
  ARTWORK_VIEWBOX_HEIGHT,
  ARTWORK_VIEWBOX_WIDTH,
  hitMapFor,
  type BodyVariantId,
  type HitShape,
} from '../body-explorer/artwork/hitmap-geometry.ts';
import { resolveArtwork } from '../body-explorer/artwork/registry.ts';
import type { IntakeQuestion } from './intake-questions.ts';

const EASE = [0.2, 0, 0, 1] as const;
const NONE = 'none';

function Shape({ shape }: { shape: HitShape }) {
  if (shape.kind === 'ellipse') return <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} />;
  if (shape.kind === 'rect') return <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.cornerRadius} />;
  return <path d={shape.d} />;
}

export interface AssociatedLocationProps {
  question: IntakeQuestion;
  /** The artwork the patient already used on the body map. Presentation only. */
  variantId: BodyVariantId | null;
  primaryRegionId: BodyRegionId;
  onSubmit: (optionId: string) => void;
}

/**
 * Do you feel it anywhere else?
 *
 * A focused step inside the interview, not a return to the Body Explorer: the
 * same hologram artwork the patient already chose, one additional area, and
 * nothing else (no layers, no zoom). The primary area is shown and cannot be
 * chosen again. The answer is evidence about this presentation; it never
 * becomes a second complaint and never selects a service.
 *
 * The artwork is the one already on screen; physiology is never inferred from
 * it. If it is not known, the patient chooses a diagram, as on the body map.
 */
export function AssociatedLocation({ question, variantId, primaryRegionId, onSubmit }: AssociatedLocationProps) {
  const reduceMotion = Boolean(useReducedMotion());
  const [chosenVariant, setChosenVariant] = useState<BodyVariantId | null>(variantId);
  const offered = useMemo(
    () => new Set(question.options.map((option) => option.id).filter((id) => id !== NONE)),
    [question.options],
  );
  const labelFor = (regionId: string) => question.options.find((option) => option.id === regionId)?.label ?? regionId;
  const primary = bodyRegionById(primaryRegionId);
  const primaryView: BodyView = primary?.viewAvailability === 'back' ? 'back' : 'front';
  // Front and back are offered only when an offered area exists only on the other view.
  const needsBack = [...offered].some((id) => bodyRegionById(id as BodyRegionId)?.viewAvailability === 'back');
  const needsFront = [...offered].some((id) => bodyRegionById(id as BodyRegionId)?.viewAvailability === 'front');
  const showViewToggle = needsBack && (needsFront || primaryView === 'front');
  const [view, setView] = useState<BodyView>(primaryView);
  const [selected, setSelected] = useState<string | null>(null);
  const regionRefs = useRef(new Map<string, SVGGElement>());

  if (!chosenVariant) {
    return (
      <div className="assoc assoc--choose">
        <p className="type-body-small assoc__support">Choose a body diagram to mark the area.</p>
        <div className="assoc__actions">
          <button type="button" className="ghost-button" onClick={() => setChosenVariant('female')}>Female diagram</button>
          <button type="button" className="ghost-button" onClick={() => setChosenVariant('male')}>Male diagram</button>
          <button type="button" className="ghost-button" onClick={() => onSubmit(NONE)}>No other area</button>
        </div>
      </div>
    );
  }

  const artwork = resolveArtwork(chosenVariant, view, 'hologram');
  const regions = hitMapFor(chosenVariant, view, 'hologram').regions;
  // Keyboard order follows the body domain, restricted to what this view can offer.
  const order = BODY_DOMAIN.keyboardOrder[view].filter((id) => offered.has(id) && regions.some((region) => region.regionId === id));

  const choose = (regionId: string) => setSelected((current) => (current === regionId ? null : regionId));
  const focusRegion = (regionId: string) => regionRefs.current.get(regionId)?.focus();
  const onKey = (event: KeyboardEvent<SVGGElement>, regionId: string) => {
    const index = order.indexOf(regionId as BodyRegionId);
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(regionId);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      focusRegion(order[(index + 1) % order.length]);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      focusRegion(order[(index - 1 + order.length) % order.length]);
    }
  };
  const tabStop = selected && order.includes(selected as BodyRegionId) ? selected : order[0];

  return (
    <div className="assoc">
      <p className="type-body-small assoc__support">Mark one additional area if the discomfort is also felt somewhere else.</p>
      <div className="assoc__layout">
        <motion.div
          className="assoc__stage"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE }}
        >
          {artwork.entry.assetRef ? (
            <img
              className="assoc__art"
              data-variant={chosenVariant}
              src={artwork.entry.assetRef}
              alt=""
              draggable={false}
            />
          ) : null}
          <svg
            className="assoc__map"
            viewBox={`0 0 ${ARTWORK_VIEWBOX_WIDTH} ${ARTWORK_VIEWBOX_HEIGHT}`}
            role="radiogroup"
            aria-label={`Additional area, ${view} view`}
          >
            {regions.map((region) => {
              if (region.regionId === primaryRegionId) {
                return (
                  <g key={region.regionId} className="assoc__region" data-role="primary" aria-hidden="true">
                    <Shape shape={region.shape} />
                  </g>
                );
              }
              if (!offered.has(region.regionId)) return null;
              const isSelected = selected === region.regionId;
              return (
                <g
                  key={region.regionId}
                  ref={(node) => {
                    if (node) regionRefs.current.set(region.regionId, node);
                    else regionRefs.current.delete(region.regionId);
                  }}
                  className="assoc__region"
                  data-role="option"
                  data-selected={isSelected || undefined}
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={labelFor(region.regionId)}
                  tabIndex={region.regionId === tabStop ? 0 : -1}
                  onClick={() => choose(region.regionId)}
                  onKeyDown={(event) => onKey(event, region.regionId)}
                >
                  <Shape shape={region.shape} />
                </g>
              );
            })}
          </svg>
        </motion.div>

        <div className="assoc__panel">
          <dl className="assoc__summary">
            <div className="assoc__summary-row" data-role="primary">
              <dt className="type-label">Primary area</dt>
              <dd className="type-control">{primary?.label ?? primaryRegionId}</dd>
            </div>
            <div className="assoc__summary-row" data-role="additional" data-empty={selected ? undefined : true}>
              <dt className="type-label">Additional area</dt>
              <dd className="type-control" aria-live="polite">{selected ? labelFor(selected) : 'Not chosen'}</dd>
            </div>
          </dl>

          {showViewToggle ? (
            <div className="assoc__views" role="group" aria-label="Body view">
              {(['front', 'back'] as const).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  className="assoc__view"
                  aria-pressed={view === candidate}
                  onClick={() => setView(candidate)}
                >
                  <span className="type-control">{candidate === 'front' ? 'Front' : 'Back'}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="assoc__actions">
            <button type="button" className="ghost-button assoc__none" onClick={() => onSubmit(NONE)}>
              <span className="type-control">No other area</span>
            </button>
            <button
              type="button"
              className="cta assoc__continue"
              disabled={!selected}
              onClick={() => selected && onSubmit(selected)}
            >
              <span className="type-control">Continue</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
