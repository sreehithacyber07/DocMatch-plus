import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react';

interface SpecialtyWheelProps {
  items: readonly string[];
  active: boolean;
}

const SLOT_RADIUS = 6;
const AUTOPLAY_MS = 900;
const RESUME_MS = 2000;

function wrap(index: number, count: number) {
  return ((index % count) + count) % count;
}

/** A virtualized, silent adaptation of React Bits OptionWheel's curved geometry. */
export function SpecialtyWheel({ items, active }: SpecialtyWheelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const positionRef = useRef(0);
  const targetRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const rowHeightRef = useRef(76);
  const pauseUntilRef = useRef(0);
  const hoverRef = useRef(false);
  const focusRef = useRef(false);
  const dragRef = useRef<{ pointerId: number; startY: number; startTarget: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const activeRef = useRef(active);

  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const layout = () => {
      const position = positionRef.current;
      const center = Math.round(position);
      const rowHeight = rowHeightRef.current;
      const tilt = 5 * Math.PI / 180;
      const radius = rowHeight / tilt;

      for (let slot = -SLOT_RADIUS; slot <= SLOT_RADIUS; slot += 1) {
        const element = itemRefs.current[slot + SLOT_RADIUS];
        if (!element) continue;
        const index = wrap(center + slot, items.length);
        if (element.dataset.itemIndex !== String(index)) {
          element.textContent = items[index];
          element.dataset.itemIndex = String(index);
        }
        const distance = center + slot - position;
        const angle = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, distance * tilt));
        const x = -radius * (1 - Math.cos(angle)) * 0.7;
        const y = radius * Math.sin(angle);
        const depth = Math.abs(distance);
        element.style.transform = `translate3d(${x.toFixed(2)}px, calc(${y.toFixed(2)}px - 50%), 0) rotate(${(angle * 180 / Math.PI).toFixed(2)}deg) scale(${Math.max(0.72, 1 - depth * 0.055).toFixed(3)})`;
        element.style.opacity = String(Math.max(0, 1 - depth * 0.2));
        element.style.filter = `blur(${(depth * 1.15).toFixed(2)}px)`;
        element.style.setProperty('--wheel-proximity', String(Math.max(0, 1 - Math.min(depth, 1))));
      }
      root.dataset.activeIndex = String(wrap(center, items.length));
    };

    const frame = (now: number) => {
      const delta = Math.min((now - lastRef.current) / 1000, 0.05);
      lastRef.current = now;
      const ease = 1 - Math.exp(-delta / 0.3);
      const next = positionRef.current + (targetRef.current - positionRef.current) * ease;
      positionRef.current = Math.abs(targetRef.current - next) < 0.001 ? targetRef.current : next;
      layout();
      frameRef.current = activeRef.current && positionRef.current !== targetRef.current
        ? requestAnimationFrame(frame)
        : null;
    };

    const startFrame = () => {
      if (frameRef.current !== null || !activeRef.current) return;
      lastRef.current = performance.now();
      frameRef.current = requestAnimationFrame(frame);
    };

    const measure = () => {
      rowHeightRef.current = Math.max(60, Math.min(90, root.clientHeight / 6.6));
      layout();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    measure();
    root.addEventListener('specialty-wheel-target', startFrame);
    return () => {
      observer.disconnect();
      root.removeEventListener('specialty-wheel-target', startFrame);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [items]);

  useEffect(() => {
    if (!active) {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      return;
    }
    const timer = window.setInterval(() => {
      if (document.hidden || hoverRef.current || focusRef.current || dragRef.current || performance.now() < pauseUntilRef.current) return;
      targetRef.current = Math.round(targetRef.current) + 1;
      rootRef.current?.dispatchEvent(new Event('specialty-wheel-target'));
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [active]);

  const pause = () => { pauseUntilRef.current = performance.now() + RESUME_MS; };
  const move = (delta: number) => {
    targetRef.current = Math.round(targetRef.current) + delta;
    rootRef.current?.dispatchEvent(new Event('specialty-wheel-target'));
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(distance) > 5) {
      drag.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (drag.moved) {
      targetRef.current = drag.startTarget - distance / rowHeightRef.current;
      rootRef.current?.dispatchEvent(new Event('specialty-wheel-target'));
    }
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    targetRef.current = Math.round(targetRef.current);
    dragRef.current = null;
    setDragging(false);
    pause();
    rootRef.current?.dispatchEvent(new Event('specialty-wheel-target'));
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!active || Math.abs(event.deltaY) < 2) return;
    pause();
    move(event.deltaY > 0 ? 1 : -1);
    // The browser still scrolls the page; this editorial wheel never traps it.
  };

  return (
    <div
      ref={rootRef}
      className="dm-landscape-wheel"
      data-dragging={dragging || undefined}
      role="group"
      tabIndex={0}
      aria-label="Reference specialty wheel. Use arrow keys to browse examples. This does not affect clinical routing."
      aria-live="off"
      onPointerEnter={() => { hoverRef.current = true; }}
      onPointerLeave={() => { hoverRef.current = false; pause(); }}
      onFocus={() => { focusRef.current = true; }}
      onBlur={() => { focusRef.current = false; pause(); }}
      onPointerDown={(event) => {
        dragRef.current = { pointerId: event.pointerId, startY: event.clientY, startTarget: targetRef.current, moved: false };
        setDragging(true);
        pause();
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={onWheel}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        pause();
        move(event.key === 'ArrowDown' ? 1 : -1);
      }}
    >
      <div className="dm-landscape-wheel__labels" aria-hidden="true">
        {Array.from({ length: SLOT_RADIUS * 2 + 1 }, (_, index) => (
          <div
            key={index}
            className="dm-landscape-wheel__item"
            ref={(element) => { itemRefs.current[index] = element; }}
          />
        ))}
      </div>
    </div>
  );
}
