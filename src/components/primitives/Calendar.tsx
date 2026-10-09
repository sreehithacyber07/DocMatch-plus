import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from './cn.ts';
import {
  MONTH_NAMES,
  WEEKDAY_NAMES,
  addMonths,
  chooserKeyTarget,
  clampDate,
  compareDates,
  formatLong,
  keyTarget,
  monthAvailable,
  monthGrid,
  sameDate,
  yearOptions,
  type CalendarDate,
} from './calendar-model.ts';

export type CalendarPanel = 'days' | 'months' | 'years';

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
  /** Which panel shows first. The day grid unless stated. */
  initialPanel?: CalendarPanel;
}

/** Columns a chooser shows when the layout cannot be read (tests, first frame). */
const YEAR_COLUMNS = 4;
const MONTH_COLUMNS = 3;

/** The chooser's rendered column count, so arrow keys follow what is on screen at any width or zoom. */
function renderedColumns(element: HTMLElement | null, fallback: number): number {
  if (!element || typeof getComputedStyle !== 'function') return fallback;
  const columns = getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length;
  return columns > 0 ? columns : fallback;
}

type FocusTarget = 'grid' | 'month-trigger' | 'year-trigger' | 'chooser' | null;

/**
 * A month calendar, rebuilt locally on the shadcn Calendar model
 * (react-day-picker with captionLayout="dropdown"), which cannot be installed
 * alongside the pinned Drei and Fiber versions.
 *
 * Previous and next month buttons, a month chooser and a year chooser for fast
 * travel across decades, and a role="grid" of day buttons with one Tab stop.
 * Arrow keys move by day and week, Page Up and Page Down by month (with Shift,
 * by year), Home and End to the week's ends, Enter or Space to choose. Days
 * after max are disabled and cannot be chosen.
 *
 * The month and year choosers are DocMatch+ listboxes drawn inside the
 * calendar, not native selects. A native select opens a browser- or OS-drawn
 * list that CSS cannot reliably theme, so on several platforms the year list
 * appeared as a white menu over the navy interface. Each chooser takes the day
 * grid's place at exactly its size, so the popover never grows, moves or runs
 * off a small screen. In a chooser, arrow keys, Home, End, Page Up and Page
 * Down move between options, Enter or Space chooses, and Escape returns to the
 * days without closing the calendar.
 */
export function Calendar({ selected, onSelect, min, max, today, defaultMonth, autoFocus, initialPanel = 'days' }: CalendarProps) {
  const captionId = useId();
  const monthsId = `${captionId}-months`;
  const yearsId = `${captionId}-years`;
  const start = clampDate(selected ?? defaultMonth ?? max, min, max);
  const [view, setView] = useState({ year: start.year, month: start.month });
  const [focused, setFocused] = useState<CalendarDate>(start);
  const [panel, setPanel] = useState<CalendarPanel>(initialPanel);
  const [chooserIndex, setChooserIndex] = useState(0);
  const gridRef = useRef<HTMLTableElement>(null);
  const chooserRef = useRef<HTMLDivElement>(null);
  const monthTriggerRef = useRef<HTMLButtonElement>(null);
  const yearTriggerRef = useRef<HTMLButtonElement>(null);
  const focusTarget = useRef<FocusTarget>(autoFocus ? (initialPanel === 'days' ? 'grid' : 'chooser') : null);
  const scrollChooser = useRef(initialPanel !== 'days');

  const years = yearOptions(min, max);

  // Focus is retried on each render until it lands: a popover can render the
  // calendar hidden for one frame while it measures where to place it.
  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    let element: HTMLElement | null | undefined;
    if (target === 'grid') element = gridRef.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]');
    else if (target === 'month-trigger') element = monthTriggerRef.current;
    else if (target === 'year-trigger') element = yearTriggerRef.current;
    else element = chooserRef.current?.querySelector<HTMLButtonElement>('[role="option"][tabindex="0"]');
    element?.focus({ preventScroll: true });
    if (target === 'chooser' && element && scrollChooser.current) {
      // Centre the chosen year in the list once, when the chooser opens.
      element.scrollIntoView({ block: 'center', inline: 'nearest' });
      scrollChooser.current = false;
    } else if (target === 'chooser' && element) {
      element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    if (document.activeElement === element) focusTarget.current = null;
  });

  const moveTo = (date: CalendarDate) => {
    const next = clampDate(date, min, max);
    setFocused(next);
    setView({ year: next.year, month: next.month });
    focusTarget.current = 'grid';
  };

  const showMonth = (year: number, month: number) => {
    const clampedMonth = year === max.year ? Math.min(month, max.month) : year === min.year ? Math.max(month, min.month) : month;
    setView({ year, month: clampedMonth });
    setFocused((current) => clampDate({ year, month: clampedMonth, day: Math.min(current.day, 28) }, min, max));
  };

  const openChooser = (next: 'months' | 'years') => {
    if (panel === next) {
      closeChooser(next);
      return;
    }
    // Safari does not focus a button on click, so focus may still be on a day
    // the chooser is about to cover. It moves to the trigger first, so it never
    // drops to the page (which the date field would read as leaving it).
    (next === 'years' ? yearTriggerRef : monthTriggerRef).current?.focus({ preventScroll: true });
    setPanel(next);
    setChooserIndex(next === 'years' ? Math.max(0, years.indexOf(view.year)) : view.month - 1);
    scrollChooser.current = true;
    focusTarget.current = 'chooser';
  };

  /** Returns to the days, focus on the trigger that opened the chooser. */
  const closeChooser = (from: 'months' | 'years') => {
    // Focus moves before the chooser unmounts, so it never drops to the page
    // (which the date field would read as leaving the calendar).
    (from === 'years' ? yearTriggerRef : monthTriggerRef).current?.focus({ preventScroll: true });
    setPanel('days');
    focusTarget.current = from === 'years' ? 'year-trigger' : 'month-trigger';
  };

  const chooseYear = (year: number) => {
    yearTriggerRef.current?.focus({ preventScroll: true });
    showMonth(year, view.month);
    setPanel('days');
    focusTarget.current = 'grid';
  };

  const chooseMonth = (month: number) => {
    monthTriggerRef.current?.focus({ preventScroll: true });
    showMonth(view.year, month);
    setPanel('days');
    focusTarget.current = 'grid';
  };

  const onDayKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: CalendarDate) => {
    const target = keyTarget(date, event.key, event.shiftKey);
    if (!target) return;
    event.preventDefault();
    moveTo(target);
  };

  const onChooserKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (panel === 'days') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeChooser(panel);
      return;
    }
    const isYears = panel === 'years';
    const count = isYears ? years.length : 12;
    const columns = renderedColumns(chooserRef.current, isYears ? YEAR_COLUMNS : MONTH_COLUMNS);
    const next = chooserKeyTarget(chooserIndex, event.key, columns, count, columns * 3);
    if (next === null) return;
    event.preventDefault();
    setChooserIndex(next);
    // Focus moves here, in the key handler, rather than in the next render's
    // effect: an unrelated render in between (the popover re-measuring as the
    // list scrolls) could otherwise satisfy a pending focus with the old option
    // and leave focus behind, which WebKit showed intermittently.
    const option = chooserRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[next];
    option?.focus({ preventScroll: true });
    option?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const previous = addMonths({ ...view, day: 1 }, -1);
  const next = addMonths({ ...view, day: 1 }, 1);
  const canGoBack = previous.year > min.year || (previous.year === min.year && previous.month >= min.month);
  const canGoForward = compareDates(next, max) <= 0;
  const focusIsInView = focused.year === view.year && focused.month === view.month;
  const choosing = panel !== 'days';

  return (
    <div
      className="dm-calendar"
      data-panel={panel}
      // Safari does not focus a button when it is pressed; it drops focus to the
      // page instead, which the date field reads as leaving the calendar and
      // which marked the date as unanswered mid-choice. Pressing a calendar
      // button keeps focus where it is; every handler moves focus itself.
      onMouseDown={(event) => {
        if ((event.target as Element).closest('button')) event.preventDefault();
      }}
    >
      <div className="dm-calendar__caption">
        <span className="sr-only" id={captionId} aria-live="polite">
          {MONTH_NAMES[view.month - 1]} {view.year}
        </span>
        <button
          type="button"
          className="dm-calendar__nav"
          aria-label="Previous month"
          disabled={!canGoBack || choosing}
          onClick={() => showMonth(previous.year, previous.month)}
        >
          <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
            <path d="M12.5 5 7.5 10l5 5" />
          </svg>
        </button>
        <button
          ref={monthTriggerRef}
          type="button"
          className="dm-calendar__pick"
          aria-haspopup="listbox"
          aria-expanded={panel === 'months'}
          aria-controls={panel === 'months' ? monthsId : undefined}
          aria-label={`Month, ${MONTH_NAMES[view.month - 1]}. Choose a month`}
          onClick={() => openChooser('months')}
        >
          <span>{MONTH_NAMES[view.month - 1]}</span>
          <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
            <path d="m4 6 4 4 4-4" />
          </svg>
        </button>
        <button
          ref={yearTriggerRef}
          type="button"
          className="dm-calendar__pick dm-calendar__pick--year"
          aria-haspopup="listbox"
          aria-expanded={panel === 'years'}
          aria-controls={panel === 'years' ? yearsId : undefined}
          aria-label={`Year, ${view.year}. Choose a year`}
          onClick={() => openChooser('years')}
        >
          <span>{view.year}</span>
          <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
            <path d="m4 6 4 4 4-4" />
          </svg>
        </button>
        <button
          type="button"
          className="dm-calendar__nav"
          aria-label="Next month"
          disabled={!canGoForward || choosing}
          onClick={() => showMonth(next.year, next.month)}
        >
          <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
            <path d="M7.5 5 12.5 10l-5 5" />
          </svg>
        </button>
      </div>

      <div className="dm-calendar__body">
        <table
          className="dm-calendar__grid"
          role="grid"
          aria-labelledby={captionId}
          ref={gridRef}
          aria-hidden={choosing || undefined}
          data-covered={choosing || undefined}
        >
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
                  const tabbable = !choosing && (focusIsInView ? sameDate(date, focused) : day === 1);
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
                        onKeyDown={(event) => onDayKeyDown(event, date)}
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

        {panel === 'years' ? (
          <div
            ref={chooserRef}
            id={yearsId}
            className="dm-calendar__chooser dm-calendar__chooser--years"
            role="listbox"
            aria-label="Choose a year"
            onKeyDown={onChooserKeyDown}
          >
            {years.map((year, index) => (
              <button
                key={year}
                type="button"
                role="option"
                className="dm-calendar__option"
                aria-selected={year === view.year}
                data-current={year === today.year || undefined}
                tabIndex={index === chooserIndex ? 0 : -1}
                onFocus={() => setChooserIndex(index)}
                onClick={() => chooseYear(year)}
              >
                {year}
              </button>
            ))}
          </div>
        ) : null}

        {panel === 'months' ? (
          <div
            ref={chooserRef}
            id={monthsId}
            className="dm-calendar__chooser dm-calendar__chooser--months"
            role="listbox"
            aria-label={`Choose a month in ${view.year}`}
            onKeyDown={onChooserKeyDown}
          >
            {MONTH_NAMES.map((name, index) => {
              const month = index + 1;
              const available = monthAvailable(view.year, month, min, max);
              return (
                <button
                  key={name}
                  type="button"
                  role="option"
                  className="dm-calendar__option"
                  aria-selected={month === view.month}
                  aria-disabled={!available || undefined}
                  aria-label={available ? name : `${name}, not available`}
                  tabIndex={index === chooserIndex ? 0 : -1}
                  onFocus={() => setChooserIndex(index)}
                  onClick={() => {
                    if (available) chooseMonth(month);
                  }}
                >
                  {name.slice(0, 3)}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
