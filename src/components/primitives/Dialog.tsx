import { useReducedMotion } from 'framer-motion';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from './cn.ts';
import { moveSpecularEdge } from './specular.ts';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
  className?: string;
  exitMs?: number;
  preventBackdropClose?: boolean;
}

/**
 * Modal dialog on the native <dialog> element, following the shadcn dialog
 * structure (title, description, body, footer, close).
 *
 * showModal() gives what the pattern requires without a runtime dependency:
 * the rest of the page becomes inert, Tab stays inside the dialog, Escape
 * closes it, and it sits in the top layer above every stacking context. Focus
 * returns to the element that opened it. On narrow screens CSS lays the same
 * dialog out as a full-height sheet.
 *
 * MECHANICAL REASON for the motion: the dialog rises 8px as it fades in and
 * sinks as it fades out, with the backdrop fading with it, so opening and
 * closing read as one surface arriving over the page and leaving it. A native
 * dialog closes instantly, so a close first plays that exit and then closes;
 * Escape is routed through the same path. With reduced motion it closes at once.
 */
const EXIT_MS = 180;

export function Dialog({ open, onOpenChange, title, description, children, footer, closeLabel = 'Close', className, exitMs = EXIT_MS, preventBackdropClose }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const reduced = Boolean(useReducedMotion());

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      dialog.querySelector<HTMLElement>('.dm-dialog__title')?.focus();
    } else if (!open && dialog.open) {
      if (reduced) {
        dialog.close();
        return;
      }
      dialog.dataset.state = 'closing';
      const timer = window.setTimeout(() => {
        delete dialog.dataset.state;
        dialog.close();
      }, exitMs);
      return () => window.clearTimeout(timer);
    }
  }, [open, reduced, exitMs]);


  return (
    <dialog
      ref={ref}
      className={cn('dm-dialog', className)}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClose={() => {
        onOpenChange(false);
        returnFocus.current?.focus();
        returnFocus.current = null;
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget && !preventBackdropClose) onOpenChange(false);
      }}
      onKeyDown={(event) => {
        // A modal dialog makes the page inert, but Tab from its last control
        // would still leave for the browser's own interface. Wrap it instead.
        if (event.key !== 'Tab') return;
        const focusable = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
        ).filter((element) => !element.hasAttribute('disabled') && element.getClientRects().length > 0);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !event.currentTarget.contains(active) || active === event.currentTarget.querySelector('.dm-dialog__title'))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      {/* Always rendered: a closed dialog is display: none and out of the
          accessibility tree, and the content must stay for the exit motion. */}
      <div className="dm-dialog__frame">
        <header className="dm-dialog__head">
          <h2 id={titleId} className="dm-dialog__title" tabIndex={-1}>
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="dm-dialog__description">
              {description}
            </p>
          ) : null}
        </header>
        <div className="dm-dialog__body">{children}</div>
        {footer ? <footer className="dm-dialog__footer">{footer}</footer> : null}
        <button className="dm-dialog__close dm-specular" type="button" aria-label={closeLabel} onPointerMove={moveSpecularEdge} onClick={() => onOpenChange(false)}>
          <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
            <path d="M5 5 15 15M15 5 5 15" />
          </svg>
        </button>
      </div>
    </dialog>
  );
}
