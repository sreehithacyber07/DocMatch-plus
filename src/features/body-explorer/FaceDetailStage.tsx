import { motion, useReducedMotion } from 'framer-motion';
import { useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from 'react';
import type { NormalizedPoint } from '../../body/index.ts';
import { FACE_ASSET_REGISTRATION } from './artwork/faceAssetRegistration.ts';
import { faceArtwork } from './artwork/registry.ts';
import type { BodyVariantId } from './artwork/hitmap-geometry.ts';
import { FaceHitOverlay } from './FaceHitOverlay.tsx';
import { FACE_REGION_BY_ID, type FaceRegionId } from './faceHitMap.ts';
import { clampFocusPan, faceFocusTarget, panForTarget } from './focusRegionMap.ts';

interface FaceDetailStageProps {
  variantId: BodyVariantId;
  selected: FaceRegionId | null;
  hovered: FaceRegionId | null;
  precision: 'general-area' | 'exact-point';
  point: NormalizedPoint | null;
  onSelect: (regionId: FaceRegionId) => void;
  onHover: (regionId: FaceRegionId | null) => void;
  onPoint: (point: NormalizedPoint) => void;
}

const FACE_RATIO = 1000 / 1200;

interface FaceViewState {
  selection: FaceRegionId | null;
  zoom: number;
  pan: { x: number; y: number };
}

function viewForSelection(selection: FaceRegionId | null): FaceViewState {
  if (!selection) return { selection, zoom: 1, pan: { x: 0, y: 0 } };
  const target = faceFocusTarget(selection);
  return {
    selection,
    zoom: target.zoom,
    pan: panForTarget(target, FACE_RATIO, FACE_RATIO),
  };
}

export function FaceDetailStage({ variantId, selected, hovered, precision, point, onSelect, onHover, onPoint }: FaceDetailStageProps) {
  const reduced = Boolean(useReducedMotion());
  const viewport = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const previous = useRef<{ x: number; y: number } | null>(null);
  const pinchDistance = useRef<number | null>(null);
  const [view, setView] = useState<FaceViewState>(() => viewForSelection(selected));
  const [interacting, setInteracting] = useState(false);
  const registration = FACE_ASSET_REGISTRATION[variantId];
  const source = faceArtwork(variantId);
  const maxZoom = selected ? FACE_REGION_BY_ID[selected].focus.maxZoom : 5;
  const activeView = view.selection === selected ? view : viewForSelection(selected);
  const { zoom, pan } = activeView;

  function zoomBy(delta: number) {
    setView((current) => {
      const basis = current.selection === selected ? current : viewForSelection(selected);
      const nextZoom = Math.max(1, Math.min(maxZoom, basis.zoom + delta));
      return {
        selection: selected,
        zoom: nextZoom,
        pan: clampFocusPan(nextZoom, basis.pan.x, basis.pan.y),
      };
    });
  }

  function selectRegion(regionId: FaceRegionId) {
    if (regionId === selected) return;
    onSelect(regionId);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    previous.current = { x: event.clientX, y: event.clientY };
    setInteracting(true);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDistance.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
    const path = (event.target as Element).closest<SVGPathElement>('[data-region]');
    if (precision === 'exact-point' && selected && path?.dataset.region === selected) {
      const overlay = viewport.current?.querySelector('.face-hit-overlay');
      const rect = overlay?.getBoundingClientRect();
      if (rect) onPoint({
        x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
      });
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance.current !== null) zoomBy((distance - pinchDistance.current) / 90);
      pinchDistance.current = distance;
    } else if (previous.current && viewport.current) {
      const anchor = viewport.current.querySelector('.stage__face-anchor')?.getBoundingClientRect();
      if (anchor) {
        const dx = (event.clientX - previous.current.x) / anchor.width;
        const dy = (event.clientY - previous.current.y) / anchor.height;
        setView((current) => {
          const basis = current.selection === selected ? current : viewForSelection(selected);
          return {
            ...basis,
            pan: clampFocusPan(basis.zoom, basis.pan.x + dx, basis.pan.y + dy),
          };
        });
      }
    }
    previous.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) setInteracting(false);
    previous.current = null;
    pinchDistance.current = null;
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 0.25 : -0.25);
  }

  const overlayRegistrationStyle = {
    '--face-offset-x': `${registration.offsetX / 10}%`,
    '--face-offset-y': `${registration.offsetY / 12}%`,
    '--face-scale-x': registration.scaleX,
    '--face-scale-y': registration.scaleY,
  } as CSSProperties;

  return (
    <motion.div
      className="stage__face-viewport"
      ref={viewport}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0.12 : 0.6, ease: 'easeOut' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      aria-label="Detailed face explorer"
    >
      <div className="stage__face-anchor">
        <motion.div
          className="stage__face-frame"
          animate={{ transform: `translate(${pan.x * 100}%, ${pan.y * 100}%) scale(${zoom})` }}
          transition={reduced || interacting ? { duration: 0 } : { duration: 0.36, ease: [0.2, 0, 0, 1] }}
        >
          <img className="stage__face-artwork" src={source ?? undefined} alt="" draggable={false} />
          <FaceHitOverlay selected={selected} hovered={hovered} onSelect={selectRegion} onHover={onHover} style={overlayRegistrationStyle} />
          {point && precision === 'exact-point' ? (
            <svg className="stage__face-point" viewBox="0 0 1000 1200" style={overlayRegistrationStyle} aria-hidden="true">
              <circle cx={point.x * 1000} cy={point.y * 1200} r="14" />
            </svg>
          ) : null}
        </motion.div>
      </div>
      <div className="stage__face-controls" role="group" aria-label="Face zoom controls">
        <button type="button" aria-label="Zoom out face" disabled={zoom <= 1} onClick={() => zoomBy(-0.4)}>Less</button>
        <span aria-live="polite">{zoom.toFixed(1)}x</span>
        <button type="button" aria-label="Zoom in face" disabled={zoom >= maxZoom} onClick={() => zoomBy(0.4)}>More</button>
      </div>
    </motion.div>
  );
}
