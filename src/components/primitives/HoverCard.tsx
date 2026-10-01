import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from './cn.ts';

export interface HoverCardProps {
  /** The interactive trigger. It receives the describedby link to the card. */
  trigger: (props: { 'aria-describedby': string }) => ReactNode;
  children: ReactNode;
  className?: string;
  openDelay?: number;
  closeDelay?: number;
}

/**
 * A preview shown while the trigger is hovered or keyboard-focused, following
 * the shadcn hover card pattern.
 *
 * The preview is supplementary. Everything it says is also reachable by
 * activating the trigger, because touch screens never hover. The card stays in
 * the DOM while hidden so the trigger's describedby link reads its summary to
 * screen readers on focus. Escape dismisses it without moving focus.
 */
export function HoverCard({ trigger, children, className, openDelay = 250, closeDelay = 150 }: HoverCardProps) {
  const cardId = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const schedule = (next: boolean, delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(next), delay);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', dismiss);
    return () => window.removeEventListener('keydown', dismiss);
  }, [open]);

  return (
    <span
      className="dm-hover-card__anchor"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') schedule(true, openDelay);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') schedule(false, closeDelay);
      }}
      onFocus={(event) => {
        if ((event.target as HTMLElement).matches(':focus-visible')) schedule(true, 0);
      }}
      onBlur={() => schedule(false, 0)}
    >
      {trigger({ 'aria-describedby': cardId })}
      <span id={cardId} className={cn('dm-hover-card', className)} data-state={open ? 'open' : 'closed'} hidden={!open}>
        {children}
      </span>
    </span>
  );
}
