import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useReducedMotion } from 'framer-motion';

export interface SlideToEnterProps {
  onEnter: () => void;
}

const HANDLE_SIZE = 52;
const INSET = 4;
const COMMIT_THRESHOLD = 0.82;

export function SlideToEnter({ onEnter }: SlideToEnterProps) {
  const reduced = Boolean(useReducedMotion());
  const trackRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; initial: number } | null>(null);
  const [trackWidth, setTrackWidth] = useState(340);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'done' | 'error'>('idle');
  const travel = Math.max(0, trackWidth - HANDLE_SIZE - INSET * 2);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => setTrackWidth(track.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const commit = () => {
    if (phase !== 'idle') return;
    setProgress(1);
    setPhase('done');
    timerRef.current = window.setTimeout(() => {
      try {
        onEnter();
      } catch {
        setPhase('error');
        setProgress(0);
        timerRef.current = window.setTimeout(() => setPhase('idle'), 1400);
      }
    }, reduced ? 0 : 280);
  };

  const dragProgress = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return progress;
    return Math.max(0, Math.min(1, drag.initial + (event.clientX - drag.startX) / Math.max(1, travel)));
  };

  const finish = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    const completed = !cancelled && dragProgress(event) >= COMMIT_THRESHOLD;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (completed) commit();
    else setProgress(0);
  };

  return (
    <div
      ref={trackRef}
      className="dm-slide-commit hero__action--enter"
      data-phase={phase}
      data-dragging={dragging || undefined}
      style={{ '--slide-offset': `${progress * travel}px` } as CSSProperties}
    >
      <span className="dm-slide-commit__fill" aria-hidden="true" />
      <span className="dm-slide-commit__label" aria-live="polite">
        {phase === 'done' ? 'Entering DocMatch+' : phase === 'error' ? 'Try again' : 'Slide to Enter'}
      </span>
      <button
        className="dm-slide-commit__handle"
        type="button"
        aria-label="Slide to Enter. Press Enter or Space to enter with a keyboard"
        disabled={phase === 'done'}
        onPointerDown={(event) => {
          if (phase !== 'idle') return;
          dragRef.current = { pointerId: event.pointerId, startX: event.clientX, initial: progress };
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) setProgress(dragProgress(event));
        }}
        onPointerUp={(event) => finish(event)}
        onPointerCancel={(event) => finish(event, true)}
        onClick={(event) => {
          if (event.detail === 0) commit();
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
          <path d="M4 12h15m-6-6 6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}
