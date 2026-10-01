import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from './cn.ts';
import {
  MONTH_NAMES,
  WEEKDAY_NAMES,
  addMonths,
  clampDate,
  compareDates,
  formatLong,
  keyTarget,
  monthGrid,
  sameDate,
  type CalendarDate,
} from './calendar-model.ts';

export interface CalendarProps {
  /** The highlighted (pending) date, or null when none is chosen. */
  selected: CalendarDate | null;
  onSelect: (date: CalendarDate) => void;
  min: CalendarDate;
  max: CalendarDate;
  /** Marked as today; never selected automatically. */
  today: CalendarDate;
  /** Month shown first when nothing is selected. */
  defaultMonth?: CalendarDate;
  /** Moves focus into the day grid on first render, as a popover opens. */
  autoFocus?: boolean;
}

/**
 * A month calendar, rebuilt locally on the shadcn Calendar model
 * (react-day-picker with captionLayout="dropdown"), which cannot be installed
 * alongside the pinned Drei and Fiber versions.
 *
 * Same interaction: month and year dropdowns for fast travel across decades,
 * previous and next month buttons, and a role="grid" of day buttons with one
 * Tab stop. Arrow keys move by day and week, Page Up and Page Down by month
 * (with Shift, by year), Home and End to the week's ends, Enter or Space to
 * choose. Days after max are disabled and cannot be chosen.
 */
export function Calendar({ selected, onSelect, min, max, today, defaultMonth, autoFocus }: CalendarProps) {
  const captionId = useId();
  const start = clampDate(selected ?? defaultMonth ?? max, min, max);
  const [view, setView] = useState({ year: start.year, month: start.month });
  const [focused, setFocused] = useState<CalendarDate>(start);
  const gridRef = useRef<HTMLTableElement>(null);
  const shouldFocus = useRef(Boolean(autoFocus));

  // Focus is retried on each render until it lands: a popover can render the
  // calendar hidden for one frame while it measures where to place it.
  useEffect(() => {
    if (!shouldFocus.current) return;
    const target = gridRef.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]');
    target?.focus();
    shouldFocus.current = document.activeElement !== target;
  });

  const moveTo = (date: CalendarDate) => {
    const next = clampDate(date, min, max);
    setFocused(next);
    setView({ year: next.year, month: next.month });
    shouldFocus.current = true;
  };

  const showMonth = (year: number, month: number) => {
    const clampedMonth = year === max.year ? Math.min(month, max.month) : year === min.year ? Math.max(month, min.month) : month;
    setView({ year, month: clampedMonth });
    setFocused((current) => clampDate({ year, month: clampedMonth, day: Math.min(current.day, 28) }, min, max));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: CalendarDate) => {
    const target = keyTarget(date, event.key, event.shiftKey);
    if (!target) return;
    event.preventDefault();
    moveTo(target);
  };

  const years: number[] = [];
  for (let year = max.year; year >= min.year; year -= 1) years.push(year);
  const previous = addMonths({ ...view, day: 1 }, -1);
  const next = addMonths({ ...view, day: 1 }, 1);
  const canGoBack = previous.year > min.year || (previous.year === min.year && previous.month >= min.month);
  const canGoForward = compareDates(next, max) <= 0;
  const focusIsInView = focused.year === view.year && focused.month === view.month;

  return (
    <div className="dm-calendar">
      <div className="dm-calendar__caption">
        <span className="sr-only" id={captionId} aria-live="polite">
          {MONTH_NAMES[view.month - 1]} {view.year}
        </span>
        <button
          type="button"
          className="dm-calendar__nav"
          aria-label="Previous month"
          disabled={!canGoBack}
          onClick={() => showMonth(previous.year, previous.month)}
        >
          <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
            <path d="M12.5 5 7.5 10l5 5" />
          </svg>
        </button>
        <label className="sr-only" htmlFor={`${captionId}-month`}>
          Month
        </label>
        <select
          id={`${captionId}-month`}
          className="dm-calendar__select"
          value={view.month}
          onChange={(event) => showMonth(view.year, Number(event.target.value))}
        >
          {MONTH_NAMES.map((name, index) => (
            <option key={name} value={index + 1} disabled={view.year === max.year && index + 1 > max.month}>
              {name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor={`${captionId}-year`}>
          Year
        </label>
        <select
          id={`${captionId}-year`}
          className="dm-calendar__select dm-calendar__select--year"
          value={view.year}
          onChange={(event) => showMonth(Number(event.target.value), view.month)}
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="dm-calendar__nav"
          aria-label="Next month"
          disabled={!canGoForward}
          onClick={() => showMonth(next.year, next.month)}
        >
          <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
            <path d="M7.5 5 12.5 10l-5 5" />
          </svg>
        </button>
      </div>

      <table className="dm-calendar__grid" role="grid" aria-labelledby={captionId} ref={gridRef}>
        <thead>
          <tr>
            {WEEKDAY_NAMES.map((name) => (
              <th key={name} scope="col" abbr={name}>
                <span aria-hidden="true">{name.slice(0, 2)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthGrid(view.year, view.month).map((week, row) => (
            <tr key={row}>
              {week.map((day, column) => {
                if (day === null) return <td key={column} role="gridcell" />;
                const date = { year: view.year, month: view.month, day };
                const disabled = compareDates(date, max) > 0 || compareDates(date, min) < 0;
                const isSelected = sameDate(date, selected);
                const tabbable = focusIsInView ? sameDate(date, focused) : day === 1;
                return (
                  <td key={column} role="gridcell" aria-selected={isSelected || undefined}>
                    <button
                      type="button"
                      className={cn('dm-calendar__day', sameDate(date, today) && 'dm-calendar__day--today')}
                      data-selected={isSelected || undefined}
                      data-date={`${date.year}-${date.month}-${date.day}`}
                      tabIndex={tabbable ? 0 : -1}
                      disabled={disabled}
                      aria-label={`${formatLong(date)}${sameDate(date, today) ? ', today' : ''}${disabled ? ', not available' : ''}`}
                      aria-pressed={isSelected}
                      onFocus={() => setFocused(date)}
                      onKeyDown={(event) => onKeyDown(event, date)}
                      onClick={() => onSelect(date)}
                    >
                      {day}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
