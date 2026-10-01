import { motion, useReducedMotion } from 'framer-motion';
import { useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { Pictogram } from '../../components/pictograms';
import { shapeBounds } from './artwork/hitmap-geometry.ts';
import { bodyFocusTarget, clampFocusPan, panForTarget } from './focusRegionMap.ts';
import type { BodyExplorerState } from './useBodyExplorer.ts';

const MIN_ZOOM = 1.0;

export function FocusView({ selection, orderedRegions, selectedRegion, artwork }: BodyExplorerState) {
  const reduced = Boolean(useReducedMotion());
  const frameRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const lastPinch = useRef<number | null>(null);
  const region = orderedRegions.find((candidate) => candidate.regionId === selection.selectedRegionId);
  const bounds = region ? shapeBounds(region.shape) : null;
  const bodyRatio = artwork.entry.intrinsicWidth / artwork.entry.intrinsicHeight;
  const initialTarget = bodyFocusTarget(selection.selectedRegionId, bounds);
  const [zoom, setZoom] = useState(initialTarget.zoom);
  const [pan, setPan] = useState(() => panForTarget(initialTarget, bodyRatio));
  const [isInteracting, setIsInteracting] = useState(false);
  const changeZoom = (delta: number) => {
    setZoom((current) => {
      const next = Math.max(MIN_ZOOM, Math.min(5, current + delta));
      setPan((position) => clampFocusPan(next, position.x, position.y));
      return next;
    });
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    setIsInteracting(true);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    lastPointer.current = { x: event.clientX, y: event.clientY };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      lastPinch.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastPinch.current) changeZoom((distance - lastPinch.current) / 90);
      lastPinch.current = distance;
    } else if (lastPointer.current && frameRef.current) {
      const previous = lastPointer.current;
      const rect = frameRef.current.getBoundingClientRect();
      setPan((position) => clampFocusPan(zoom, position.x + (event.clientX - previous.x) / rect.width, position.y + (event.clientY - previous.y) / rect.height));
    }
    lastPointer.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) setIsInteracting(false);
    lastPointer.current = null;
    lastPinch.current = null;
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    changeZoom(event.deltaY < 0 ? 0.25 : -0.25);
  };

  const transform = `translate(${pan.x * 100}%, ${pan.y * 100}%) scale(${zoom})`;

  return (
    <section className="panel panel--lens" aria-label="Focus view">
      <div className="panel__head">
        <span className="panel__mark" aria-hidden="true"><Pictogram name="structure" size={20} /></span>
        <h2 className="type-label panel__title">Focus view</h2>
        <span className="type-data lens__value" aria-live="polite">{zoom.toFixed(1)}x</span>
      </div>
      <div className="lens">
        <div className="lens__frame" ref={frameRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}>
          <motion.div className="lens__camera" animate={{ transform }} transition={reduced || isInteracting ? { duration: 0 } : { duration: 0.38, ease: [0.2, 0, 0, 1] }}>
            <img className="lens__art" src={artwork.entry.assetRef} alt="" draggable={false} />
          </motion.div>
          <span className="lens__reticle" aria-hidden="true" />
        </div>
      </div>
      <div className="lens__controls">
        <button className="icon-control icon-control--tight" type="button" aria-label="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => changeZoom(-0.4)}><span className="type-control">Less</span></button>
        <span className="lens__scale" aria-hidden="true">{[1.5, 2.5, 3.5, 4.5].map((step) => <span key={step} data-state={zoom >= step ? 'on' : 'off'} />)}</span>
        <button className="icon-control icon-control--tight" type="button" aria-label="Zoom in" disabled={zoom >= 5} onClick={() => changeZoom(0.4)}><span className="type-control">More</span></button>
      </div>
      <p className="type-caption lens__note">{selectedRegion ? `Centred on ${selectedRegion.label.toLowerCase()}.` : 'Select an area to focus it.'}</p>
    </section>
  );
}
