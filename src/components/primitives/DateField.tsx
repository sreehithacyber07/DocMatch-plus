import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Calendar } from './Calendar.tsx';
import { cn, describedBy } from './cn.ts';
import { FieldError } from './Field.tsx';
import { dateFromParts, formatLong, parsePastedDate, partsFromDate, type CalendarDate } from './calendar-model.ts';

export type { DateParts as DateFieldValue } from './calendar-model.ts';
import type { DateParts as DateFieldValue } from './calendar-model.ts';

export interface DateFieldProps {
  legend: string;
  value: DateFieldValue;
  date?: string | null;
  onValueChange: (value: DateFieldValue) => void;
  error?: string;
  /** Which part the error is about; 'date' marks all three. */
  invalidPart?: keyof DateFieldValue | 'date';
  /** Secondary metadata beside the legend, such as the derived age. */
  meta?: ReactNode;
  hint?: ReactNode;
  id?: string;
  /** The latest date the calendar allows (for a date of birth, today). */
  max: CalendarDate;
  min: CalendarDate;
  /** Called when focus leaves the field and its calendar, for touched state. */
  onLeave?: () => void;
}

const PARTS: readonly { key: keyof DateFieldValue; label: string; length: number; placeholder: string }[] = [
  { key: 'day', label: 'Day', length: 2, placeholder: 'DD' },
  { key: 'month', label: 'Month', length: 2, placeholder: 'MM' },
  { key: 'year', label: 'Year', length: 4, placeholder: 'YYYY' },
];

/**
 * A date entered by typing or chosen from a calendar, kept in step both ways.
 */
export function DateField({ legend, value, date, onValueChange, error, invalidPart, meta, hint, id, max, min, onLeave }: DateFieldProps) {
  const generated = useId();
  const groupId = id ?? generated;
  const hintId = `${groupId}-hint`;
  const errorId = `${groupId}-error`;
  const metaId = `${groupId}-meta`;
  const popoverId = `${groupId}-calendar`;
  const fieldRef = useRef<HTMLFieldSetElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<Record<keyof DateFieldValue, HTMLInputElement | null>>({ day: null, month: null, year: null });
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<CSSProperties | null>(null);

  const currentTextDate = dateFromParts(value);
  const canonicalDate = date
    ? { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)), day: Number(date.slice(8, 10)) }
    : null;

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const openCalendar = () => {
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const frame = frameRef.current?.getBoundingClientRect();
      if (!frame) return;
      const width = Math.min(340, window.innerWidth - 30);
      const height = popoverRef.current?.offsetHeight ?? 420;
      const below = window.innerHeight - frame.bottom - 10;
      const above = frame.top - 10;
      const openAbove = below < height && above > below;
      const left = Math.max(15, Math.min(frame.right - width, window.innerWidth - width - 15));
      // Clamped so the whole calendar, with its actions, stays in the window.
      const preferred = openAbove ? frame.top - 5 - height : frame.bottom + 5;
      const top = Math.max(10, Math.min(preferred, window.innerHeight - height - 10));
      setPlacement({ position: 'fixed', left, width, top });
    };
    place();
    const frame = window.requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const leaving = (related: EventTarget | null) => {
    const node = related as Node | null;
    if (node && (fieldRef.current?.contains(node) || popoverRef.current?.contains(node))) return;
    onLeave?.();
  };

  return (
    <fieldset
      ref={fieldRef}
      className="dm-date"
      id={groupId}
      data-invalid={error ? true : undefined}
      aria-describedby={describedBy(hint && hintId, meta && metaId, error && errorId)}
      tabIndex={-1}
      onBlur={(event) => leaving(event.relatedTarget)}
    >
      <legend className="dm-date__legend">{legend}</legend>
      <span className="dm-date__meta" id={metaId} aria-live="polite">
        {meta}
      </span>
      <div className={cn('dm-field__frame', 'dm-date__frame')} ref={frameRef} data-invalid={error ? true : undefined}>
        {PARTS.map((part, index) => {
          const inputId = `${groupId}-${part.key}`;
          const invalid = Boolean(error) && (invalidPart === 'date' || invalidPart === part.key);
          return (
            <span className={cn('dm-date__part', `dm-date__part--${part.key}`)} key={part.key}>
              {index > 0 ? (
                <span className="dm-date__separator" aria-hidden="true">
                  /
                </span>
              ) : null}
              <label className="sr-only" htmlFor={inputId}>
                {part.label}
              </label>
              <input
                ref={(node) => { inputRefs.current[part.key] = node; }}
                id={inputId}
                className="dm-date__input"
                inputMode="numeric"
                autoComplete="off"
                placeholder={part.placeholder}
                maxLength={part.length}
                value={value[part.key]}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy(hint && hintId, error && errorId)}
                onChange={(event) => {
                  const raw = event.target.value;
                  const digits = raw.replace(/\D/g, '').slice(0, part.length);
                  onValueChange({ ...value, [part.key]: digits });
                  if (index < 2 && (digits.length === part.length || (raw.includes('/') && digits))) {
                    inputRefs.current[PARTS[index + 1].key]?.focus();
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === '/' && index < 2) {
                    event.preventDefault();
                    inputRefs.current[PARTS[index + 1].key]?.focus();
                  } else if (event.key === 'Backspace' && !value[part.key] && index > 0) {
                    event.preventDefault();
                    inputRefs.current[PARTS[index - 1].key]?.focus();
                  }
                }}
                onPaste={(event) => {
                  const parts = parsePastedDate(event.clipboardData.getData('text'), min, max);
                  if (!parts) return;
                  event.preventDefault();
                  onValueChange(parts);
                  inputRefs.current.year?.focus();
                }}
              />
            </span>
          );
        })}
        <button
          ref={triggerRef}
          type="button"
          className="dm-date__trigger"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          aria-label={canonicalDate ? `Choose ${legend.toLowerCase()} from a calendar, currently ${formatLong(canonicalDate)}` : `Choose ${legend.toLowerCase()} from a calendar`}
          onClick={() => (open ? close(false) : openCalendar())}
        >
          <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
            <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
            <path d="M3 8.5h14M7 3v3M13 3v3" />
          </svg>
        </button>
      </div>
      {hint ? (
        <p className="dm-date__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      <FieldError id={errorId}>{error}</FieldError>

      {open
        ? createPortal(
            <div
              ref={popoverRef}
              id={popoverId}
              className="dm-date__popover"
              role="dialog"
              aria-label={`Choose ${legend.toLowerCase()}`}
              style={placement ?? { position: 'fixed', visibility: 'hidden' }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  close(true);
                }
              }}
              onBlur={(event) => {
                const node = event.relatedTarget as Node | null;
                if (node && (popoverRef.current?.contains(node) || fieldRef.current?.contains(node))) return;
                if (node) close(false);
                leaving(node);
              }}
            >
              <Calendar
                selected={canonicalDate}
                onSelect={(date) => {
                  onValueChange(partsFromDate(date));
                  close(true);
                }}
                min={min}
                max={max}
                today={max}
                defaultMonth={currentTextDate ?? canonicalDate ?? undefined}
                autoFocus
              />
            </div>,
            document.body,
          )
        : null}
    </fieldset>
  );
}
