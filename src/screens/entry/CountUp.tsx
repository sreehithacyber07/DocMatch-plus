import { animate, useMotionValue } from 'framer-motion';
import { useEffect, useRef } from 'react';

interface CountUpProps {
  from: number;
  to: number;
  duration: number;
  startWhen: boolean;
  reducedMotion: boolean;
}

/** Adapted from React Bits CountUp: the section observer owns the one-time start. */
export function CountUp({ from, to, duration, startWhen, reducedMotion }: CountUpProps) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const startedRef = useRef(false);
  const value = useMotionValue(from);
  useEffect(() => {
    const unsubscribe = value.on('change', (latest) => {
      if (spanRef.current) spanRef.current.textContent = String(Math.round(latest));
    });
    return unsubscribe;
  }, [value]);

  useEffect(() => {
    if (reducedMotion) {
      if (spanRef.current) spanRef.current.textContent = String(to);
      return;
    }
    if (!startWhen || startedRef.current) return;
    startedRef.current = true;
    const controls = animate(value, to, {
      duration,
      ease: [0.2, 0, 0, 1],
      onComplete: () => {
        if (spanRef.current) spanRef.current.textContent = String(to);
      },
    });
    return () => controls.stop();
  }, [duration, reducedMotion, startWhen, to, value]);

  return <span ref={spanRef} className="dm-landscape__number-value">{reducedMotion ? to : from}</span>;
}
