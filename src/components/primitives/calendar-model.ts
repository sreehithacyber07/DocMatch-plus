/**
 * Calendar arithmetic for the date picker, kept pure so it can be tested.
 *
 * Days are plain { year, month, day } values with month 1 to 12, never Date
 * objects held in state, so a time zone can never move a date by one.
 */

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function compareDates(a: CalendarDate, b: CalendarDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

export function sameDate(a: CalendarDate | null | undefined, b: CalendarDate | null | undefined): boolean {
  return Boolean(a && b && compareDates(a, b) === 0);
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  const moved = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

/** Moves by whole months, keeping the day where the target month allows it. */
export function addMonths(date: CalendarDate, months: number): CalendarDate {
  const index = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { year, month, day: Math.min(date.day, daysIn(year, month)) };
}

/** Clamps a date into [min, max]. */
export function clampDate(date: CalendarDate, min: CalendarDate, max: CalendarDate): CalendarDate {
  if (compareDates(date, min) < 0) return min;
  if (compareDates(date, max) > 0) return max;
  return date;
}

/** The years a calendar offers, newest first, from max down to min. */
export function yearOptions(min: CalendarDate, max: CalendarDate): number[] {
  const years: number[] = [];
  for (let year = max.year; year >= min.year; year -= 1) years.push(year);
  return years;
}

/** Whether any day of the month falls inside [min, max]. */
export function monthAvailable(year: number, month: number, min: CalendarDate, max: CalendarDate): boolean {
  const index = year * 12 + month;
  return index >= min.year * 12 + min.month && index <= max.year * 12 + max.month;
}

/**
 * Where a key moves focus in a chooser laid out as a grid of `columns` over
 * `count` items. Returns null for keys the chooser does not handle.
 */
export function chooserKeyTarget(index: number, key: string, columns: number, count: number, page: number): number | null {
  const clamp = (value: number) => Math.max(0, Math.min(count - 1, value));
  switch (key) {
    case 'ArrowLeft': return clamp(index - 1);
    case 'ArrowRight': return clamp(index + 1);
    case 'ArrowUp': return clamp(index - columns);
    case 'ArrowDown': return clamp(index + columns);
    case 'PageUp': return clamp(index - page);
    case 'PageDown': return clamp(index + page);
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return null;
  }
}

/** Weeks of the month, Sunday first; days outside the month are null. */
export function monthGrid(year: number, month: number): (number | null)[][] {
  const lead = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const total = daysIn(year, month);
  const cells: (number | null)[] = [...Array<null>(lead).fill(null)];
  for (let day = 1; day <= total; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

/** The date a grid key moves focus to, following the shadcn/react-day-picker keys. */
export function keyTarget(date: CalendarDate, key: string, shift: boolean): CalendarDate | null {
  switch (key) {
    case 'ArrowLeft': return addDays(date, -1);
    case 'ArrowRight': return addDays(date, 1);
    case 'ArrowUp': return addDays(date, -7);
    case 'ArrowDown': return addDays(date, 7);
    case 'PageUp': return shift ? addMonths(date, -12) : addMonths(date, -1);
    case 'PageDown': return shift ? addMonths(date, 12) : addMonths(date, 1);
    case 'Home': {
      const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
      return addDays(date, -weekday);
    }
    case 'End': {
      const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
      return addDays(date, 6 - weekday);
    }
    default: return null;
  }
}

export function formatLong(date: CalendarDate): string {
  const weekday = WEEKDAY_NAMES[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()];
  return `${weekday}, ${date.day} ${MONTH_NAMES[date.month - 1]} ${date.year}`;
}

/** A date as the three text fields a person types. */
export interface DateParts {
  day: string;
  month: string;
  year: string;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** The typed parts as a real calendar date, when they are one. */
export function dateFromParts(value: DateParts): CalendarDate | null {
  if (!/^\d{1,2}$/.test(value.day) || !/^\d{1,2}$/.test(value.month) || !/^\d{4}$/.test(value.year)) return null;
  const [day, month, year] = [Number(value.day), Number(value.month), Number(value.year)];
  if (month < 1 || month > 12 || day < 1 || day > daysIn(year, month)) return null;
  return { year, month, day };
}

/** A calendar date written back into the typed parts. */
export function partsFromDate(date: CalendarDate): DateParts {
  return { day: pad(date.day), month: pad(date.month), year: String(date.year) };
}

export function parsePastedDate(text: string, min: CalendarDate, max: CalendarDate): DateParts | null {
  const match = /^\s*(\d{1,2})[\s/-]+(\d{1,2})[\s/-]+(\d{4})\s*$/.exec(text);
  if (!match) return null;
  const date = dateFromParts({ day: match[1], month: match[2], year: match[3] });
  return date && compareDates(date, min) >= 0 && compareDates(date, max) <= 0 ? partsFromDate(date) : null;
}
