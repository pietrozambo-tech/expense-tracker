import { mineAmount } from '../utils/currency';
import { getLanguage, daysFull, numberLocale } from '../i18n/store';
import { parseLocalDate } from './dates';

// Spending by day of the week: the rhythm view. "Which day does the money
// actually go" is a question about a TYPICAL Monday, not about Mondays in
// total - a window holding five Saturdays and four Tuesdays would crown
// Saturday just for occurring more often. So everything here is an average
// per calendar occurrence of the weekday, and the occurrence count rides
// along so a thin sample cannot over-claim.

// Same structural row the usual-benchmark takes: the Dashboard's own type
// leaves `type` optional, and this needs nothing more.
export interface DowRow {
  date: string;
  type?: 'expense' | 'income';
  amount: number;
  currency?: string;
  baseAmount?: number;
  recurrence?: string;
  /** Set on occurrences a recurring rule materialised. */
  recurrenceOf?: string;
}

/** Is this row the product of a recurring rule? Either marker counts: rule
 *  occurrences carry both, but rows from older builds or imports may hold
 *  only the label. */
export const isRecurringRow = (row: Pick<DowRow, 'recurrence' | 'recurrenceOf'>) =>
  !!row.recurrenceOf || (!!row.recurrence && row.recurrence !== 'Never repeat');

export interface DayBucket {
  /** JS getDay() index: 0 = Sunday. */
  day: number;
  /** 'Monday' .. 'Sunday'. */
  label: string;
  /** Total spent on this weekday inside the window. */
  total: number;
  /** How many times this weekday occurred in the window (up to today). */
  occurrences: number;
  /** total / occurrences - what a typical one costs. 0 when it never occurred. */
  avg: number;
  /** Number of transactions behind the total. */
  txCount: number;
}

export interface DowOptions {
  year: number;
  /** 0-11 to scope to one month; null/undefined for the whole year. */
  month?: number | null;
  /** First day of the week: 1 Monday (default), 0 Sunday, 6 Saturday. */
  weekStartsOn?: number;
  /** Drop recurring transactions - rent lands on whichever weekday the 1st
   *  falls, which is calendar noise in a view about behaviour. */
  oneOffsOnly?: boolean;
  /** Injectable clock for tests. */
  today?: Date;
}

export const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The seven weekday indexes in display order for a given first day. */
export function weekOrder(weekStartsOn = 1): number[] {
  const start = [0, 1, 6].includes(weekStartsOn) ? weekStartsOn : 1;
  return Array.from({ length: 7 }, (_, i) => (start + i) % 7);
}

export function dayOfWeekBreakdown(
  rows: DowRow[],
  currency: string,
  opts: DowOptions,
): DayBucket[] {
  const { year, month = null, weekStartsOn = 1, oneOffsOnly = false } = opts;
  const today = opts.today ?? new Date();

  const start = month == null ? new Date(year, 0, 1) : new Date(year, month, 1);
  let end = month == null
    ? new Date(year, 11, 31, 23, 59, 59, 999)
    : new Date(year, month + 1, 0, 23, 59, 59, 999);
  // Days that have not happened yet are not days on which nothing was spent -
  // counting them would water every average down for the running period.
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
  if (end > endOfToday) end = endOfToday;

  const totals = new Array(7).fill(0) as number[];
  const counts = new Array(7).fill(0) as number[];
  const occurrences = new Array(7).fill(0) as number[];

  // Window entirely in the future: no occurrences, all-zero buckets.
  if (start <= end) {
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      occurrences[d.getDay()]++;
    }
    for (const row of rows) {
      if (row.type === 'income') continue;
      if (oneOffsOnly && isRecurringRow(row)) continue;
      const at = parseLocalDate(row.date);
      if (at < start || at > end) continue;
      totals[at.getDay()] += mineAmount(row as never, currency);
      counts[at.getDay()]++;
    }
  }

  return weekOrder(weekStartsOn).map((day) => ({
    day,
    label: DAY_LABELS[day],
    total: totals[day],
    occurrences: occurrences[day],
    avg: occurrences[day] > 0 ? totals[day] / occurrences[day] : 0,
    txCount: counts[day],
  }));
}

/**
 * One sentence naming the finding, or null when there is not one. The
 * difference between a table and an insight: "Saturdays cost 2.3x a typical
 * Tuesday" is the line worth remembering.
 */
export function dowTakeaway(buckets: DayBucket[]): string | null {
  const seen = buckets.filter((b) => b.occurrences > 0);
  const spending = seen.filter((b) => b.avg > 0);
  if (spending.length < 2) return null;

  const IT = getLanguage() === 'it';
  const max = spending.reduce((a, b) => (b.avg > a.avg ? b : a));
  const plural = (label: string) => `${label}s`;
  // Italian talks about weekdays with the article, lowercase and singular:
  // "il sabato costa..." - no plural form needed.
  const dayIt = (b: DayBucket) => daysFull()[b.day].toLowerCase();

  // Some weekday saw no spending at all: a ratio against zero says nothing.
  if (spending.length < seen.length) {
    return IT
      ? `La maggior parte delle spese cade di ${dayIt(max)}.`
      : `Most spending lands on ${plural(max.label)}.`;
  }
  const min = spending.reduce((a, b) => (b.avg < a.avg ? b : a));
  const ratio = max.avg / min.avg;
  if (ratio < 1.25) {
    return IT
      ? 'Le spese sono distribuite in modo abbastanza uniforme sulla settimana.'
      : 'Spending is spread fairly evenly across the week.';
  }
  // One decimal, but "2.0x" reads better as "2x".
  const r = Math.round(ratio * 10) / 10;
  const rText = Number.isInteger(r) ? String(r) : r.toLocaleString(numberLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return IT
    ? `Il ${dayIt(max)} costa ${rText}x un tipico ${dayIt(min)}.`
    : `${plural(max.label)} cost ${rText}x a typical ${min.label}.`;
}
