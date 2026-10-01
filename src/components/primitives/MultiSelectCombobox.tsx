import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn, describedBy } from './cn.ts';
import { FieldError } from './Field.tsx';

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface MultiSelectComboboxProps {
  label: string;
  options: readonly ComboboxOption[];
  values: readonly string[];
  onToggle: (value: string) => void;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  emptyMessage?: string;
  id?: string;
  /** Called when focus leaves the field, for touched state. */
  onLeave?: () => void;
  /** If it returns true for a value, the list closes when that value is toggled. */
  closeOnSelect?: (value: string) => boolean;
}

/** Matches the max-height in primitives.css for .dm-combobox__list. */
const LIST_MAX_HEIGHT = 280;

/**
 * Searchable multi-select, on the ARIA 1.2 combobox pattern that the shadcn
 * combobox (Popover plus Command) implements.
 *
 * The text input owns focus throughout. Arrow keys move the active option,
 * Enter toggles it, Escape closes the list, and Backspace in an empty input
 * removes the last chip. Chosen values appear as chips, each with its own
 * remove button. The list scrolls inside itself, so it never lengthens the
 * page.
 *
 * Like the shadcn popover, the list is rendered in a portal and positioned
 * against the field, so a scrolling container around the field can never clip
 * it. It opens above the field when there is more room there.
 */
export function MultiSelectCombobox({
  label,
  options,
  values,
  onToggle,
  hint,
  error,
  optional,
  emptyMessage = 'No match.',
  id,
  onLeave,
  closeOnSelect,
}: MultiSelectComboboxProps) {
  const generated = useId();
  const baseId = id ?? generated;
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;
  const chipsId = `${baseId}-chips`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const frame = frameRef.current?.getBoundingClientRect();
      if (!frame) return;
      const gap = 5;
      const margin = 15;
      const below = window.innerHeight - frame.bottom - gap - margin;
      const above = frame.top - gap - margin;
      const openAbove = below < LIST_MAX_HEIGHT && above > below;
      const maxHeight = Math.max(120, Math.min(LIST_MAX_HEIGHT, openAbove ? above : below));
      setPlacement({
        position: 'fixed',
        left: frame.left,
        width: frame.width,
        maxHeight,
        ...(openAbove ? { bottom: window.innerHeight - frame.top + gap } : { top: frame.bottom + gap }),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, values.length]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;
  }, [options, query]);

  const activeIndex = Math.min(active, Math.max(filtered.length - 1, 0));
  const activeOption = open ? filtered[activeIndex] : undefined;
  const optionId = (value: string) => `${baseId}-option-${value}`;
  const labelFor = (value: string) => options.find((option) => option.value === value)?.label ?? value;

  const toggle = (value: string) => {
    onToggle(value);
    setQuery('');
    if (closeOnSelect?.(value)) {
      setOpen(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      else setActive((activeIndex + 1) % Math.max(filtered.length, 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) setOpen(true);
      else setActive((activeIndex - 1 + filtered.length) % Math.max(filtered.length, 1));
    } else if (event.key === 'Enter') {
      if (open && activeOption) {
        event.preventDefault();
        toggle(activeOption.value);
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
    } else if (event.key === 'Backspace' && !query && values.length > 0) {
      onToggle(values[values.length - 1]);
    }
  };

  return (
    <div
      className="dm-field dm-combobox"
      data-invalid={error ? true : undefined}
      data-open={open || undefined}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
          onLeave?.();
        }
      }}
    >
      <label className="dm-field__label" htmlFor={inputId}>
        <span>{label}</span>
        {optional ? <span className="dm-field__optional">Optional</span> : null}
      </label>
      {hint ? (
        <p className="dm-field__helper" id={hintId}>
          {hint}
        </p>
      ) : null}

      <div className="dm-field__frame dm-combobox__frame" ref={frameRef}>
        <span className="dm-field__mark" aria-hidden="true">
          <svg viewBox="0 0 20 20" focusable="false">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="m12.6 12.6 4.4 4.4" />
          </svg>
        </span>
        <input
          ref={inputRef}
          id={inputId}
          className="dm-field__input"
          role="combobox"
          type="text"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeOption ? optionId(activeOption.value) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(hint && hintId, values.length > 0 && chipsId, error && errorId)}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <button
          className="dm-combobox__toggle"
          type="button"
          tabIndex={-1}
          aria-label={open ? `Close ${label} list` : `Open ${label} list`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setOpen((current) => !current);
            inputRef.current?.focus();
          }}
        >
          <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
            <path d="M5 8l5 5 5-5" />
          </svg>
        </button>
      </div>

      {createPortal(
      <ul
        className="dm-combobox__list"
        id={listId}
        role="listbox"
        aria-multiselectable="true"
        aria-label={label}
        hidden={!open}
        style={placement ?? undefined}
      >
        {filtered.length === 0 ? (
          <li className="dm-combobox__empty" role="presentation">
            {emptyMessage}
          </li>
        ) : (
          filtered.map((option, index) => {
            const selected = values.includes(option.value);
            return (
              <li
                key={option.value}
                id={optionId(option.value)}
                role="option"
                aria-selected={selected}
                className={cn('dm-combobox__option', index === activeIndex && 'dm-combobox__option--active')}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(index)}
                onClick={() => {
                  toggle(option.value);
                  inputRef.current?.focus();
                }}
              >
                <span className="dm-choice__mark dm-choice__mark--check" aria-hidden="true" data-checked={selected || undefined}>
                  <svg viewBox="0 0 16 16" focusable="false">
                    <path d="M3.5 8.4 6.6 11.4 12.5 4.8" />
                  </svg>
                </span>
                <span>{option.label}</span>
              </li>
            );
          })
        )}
      </ul>,
      document.body,
      )}

      {values.length > 0 ? (
        <ul className="dm-chips" id={chipsId} aria-label={`Chosen: ${values.map(labelFor).join(', ')}`}>
          {values.map((value) => (
            <li key={value} className="dm-chip">
              <span>{labelFor(value)}</span>
              <button
                className="dm-chip__remove"
                type="button"
                aria-label={`Remove ${labelFor(value)}`}
                onClick={() => {
                  onToggle(value);
                  inputRef.current?.focus();
                }}
              >
                <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
                  <path d="M6 6 14 14M14 6 6 14" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}
