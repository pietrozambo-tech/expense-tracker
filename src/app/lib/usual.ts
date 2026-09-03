import { mineAmount } from '../utils/currency';
import { parseLocalDate } from './dates';

// Deliberately structural rather than the full Transaction: the Dashboard's
// own row type leaves `type` optional, and this only ever needs these three.
export interface UsualRow {
  date: string;
  type?: 'expense' | 'income';
  amount: number;
  currency?: string;
  baseAmount?: number;
  split?: { mine: number };
}

// "What this period usually looks like", as one curve the whole Dashboard
// agrees on: the cumulative-spending chart draws it, and the budget bar reads a
// single point off it. Two different yardsticks on one screen would contradict
// each other - the chart showing you below the line while the bar says you are
// spending faster than usual.
//
// MEDIAN, not mean. "Usual" is the typical period, and a mean is dragged around
// by any single unusual one: one holiday month at 4x the norm lifts the whole
// benchmark for the next six, quietly excusing a genuinely expensive month.
// The median ignores how extreme an outlier is, only that it is on one side.

export type PeriodType = 'month' | 'quarter' | 'year';

/** Middle value; the mean of the middle two when the count is even. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Cumulative expense totals at each step boundary of one period. */
function cumulativeForPeriod(
  expenses: UsualRow[],
  currency: string,
  start: Date,
  stepEnds: Date[],
): number[] {
  const inPeriod = expenses
    .filter((e) => e.type !== 'income')
    .map((e) => ({ at: parseLocalDate(e.date), amount: mineAmount(e as never, currency) }))
    .filter((e) => e.at >= start && e.at <= stepEnds[stepEnds.length - 1])
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const out: number[] = [];
  let running = 0;
  let i = 0;
  for (const end of stepEnds) {
    while (i < inPeriod.length && inPeriod[i].at <= end) {
      running += inPeriod[i].amount;
      i++;
    }
    out.push(running);
  }
  return out;
}

/**
 * The step boundaries of a period, matching the granularity the cumulative
 * chart draws: days within a month, weeks within a quarter, months within a
 * year. `steps` pins the length so periods of different lengths stay aligned
 * index by index - a 30-day month asked for 31 steps repeats its final total,
 * which is exactly right ("by the 31st" of a 30-day month is the whole month).
 */
function stepEndsFor(type: PeriodType, year: number, month: number, quarter: number, steps: number): Date[] {
  const ends: Date[] = [];
  if (type === 'month') {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < steps; i++) {
      const day = Math.min(i + 1, daysInMonth);
      ends.push(new Date(year, month, day, 23, 59, 59, 999));
    }
  } else if (type === 'quarter') {
    const qStart = new Date(year, quarter * 3, 1);
    const qEnd = new Date(year, quarter * 3 + 3, 0, 23, 59, 59, 999);
    for (let i = 0; i < steps; i++) {
      const weekEnd = new Date(qStart);
      weekEnd.setDate(weekEnd.getDate() + i * 7 + 6);
      weekEnd.setHours(23, 59, 59, 999);
      ends.push(weekEnd > qEnd ? qEnd : weekEnd);
    }
  } else {
    for (let i = 0; i < steps; i++) {
      const m = Math.min(i, 11);
      ends.push(new Date(year, m + 1, 0, 23, 59, 59, 999));
    }
  }
  return ends;
}

/** The start of the period `back` periods before the selected one. */
function periodStartBack(type: PeriodType, year: number, month: number, quarter: number, back: number) {
  if (type === 'month') return { year: new Date(year, month - back, 1).getFullYear(), month: new Date(year, month - back, 1).getMonth(), quarter: 0 };
  if (type === 'quarter') {
    const d = new Date(year, (quarter - back) * 3, 1);
    return { year: d.getFullYear(), month: 0, quarter: Math.floor(d.getMonth() / 3) };
  }
  return { year: year - back, month: 0, quarter: 0 };
}

export interface UsualOptions {
  type: PeriodType;
  year: number;
  month: number; // 0-11, used when type === 'month'
  quarter: number; // 0-3, used when type === 'quarter'
  steps: number; // points in the current period's chart
  lookback?: number; // how many earlier periods to consider
  minPeriods?: number; // below this, there is no honest benchmark
}

/**
 * The median cumulative curve of the periods before this one, aligned to the
 * current period's steps. Null when too few earlier periods carry any spending
 * - a benchmark drawn from one month is not a benchmark, it is that month.
 *
 * Periods with no expenses at all do not vote: they are months before tracking
 * started, not months where nothing was spent.
 */
export function usualCurve(
  expenses: UsualRow[],
  currency: string,
  opts: UsualOptions,
): number[] | null {
  const { type, year, month, quarter, steps } = opts;
  const lookback = opts.lookback ?? (type === 'year' ? 3 : 6);
  // Months and quarters need at least two earlier periods - one month is not
  // a benchmark, it is that month. A single earlier YEAR is different: "last
  // year" is a benchmark people actually reason with, and demanding two would
  // switch the feature off for almost everyone (two full years of tracking).
  const minPeriods = opts.minPeriods ?? (type === 'year' ? 1 : 2);
  if (steps <= 0) return null;

  const curves: number[][] = [];
  for (let back = 1; back <= lookback; back++) {
    const p = periodStartBack(type, year, month, quarter, back);
    const ends = stepEndsFor(type, p.year, p.month, p.quarter, steps);
    const start =
      type === 'month'
        ? new Date(p.year, p.month, 1)
        : type === 'quarter'
          ? new Date(p.year, p.quarter * 3, 1)
          : new Date(p.year, 0, 1);
    const curve = cumulativeForPeriod(expenses, currency, start, ends);
    if (curve[curve.length - 1] > 0) curves.push(curve);
  }
  if (curves.length < minPeriods) return null;

  return Array.from({ length: steps }, (_, i) => median(curves.map((c) => c[i])) ?? 0);
}

/** Which period a date falls in, as a comparable ordinal. Months count in
 *  months, quarters in quarters, years in years, so "is this one later than
 *  that one" is a single subtraction whatever the view. */
function ordinalOf(type: PeriodType, year: number, month: number, quarter: number): number {
  if (type === 'month') return year * 12 + month;
  if (type === 'quarter') return year * 4 + quarter;
  return year;
}

/**
 * When the median benchmark will first exist, for somebody who does not have
 * it yet.
 *
 * The rule above is honest and quiet about it: two earlier periods with
 * spending, or no line. The cost is that a new user's cumulative chart has
 * one line where it will later have two, the legend naming them is not drawn
 * at all, and nothing anywhere says why or for how long - the app's signature
 * comparison is two months away and the person is left to assume it does not
 * exist. This turns that unexplained absence into a dated one.
 *
 * Returns the period the curve arrives in, or null when there is nothing to
 * promise: no spending recorded at all, the benchmark already available, or
 * an arrival further out than the lookback window, which is a forecast rather
 * than a promise.
 *
 * Periods still in the future are counted as tracked, because that is the
 * premise of the sentence: keep going and it appears then. Periods already
 * behind are counted only if they actually hold spending - so someone who
 * imports three months of history is told a date that has already arrived,
 * which is to say told nothing, which is correct.
 */
export function usualArrives(
  expenses: UsualRow[],
  currency: string,
  opts: { type: PeriodType; year: number; month: number; quarter: number; now: Date; lookback?: number; minPeriods?: number },
): { year: number; month: number; quarter: number } | null {
  const { type, year, month, quarter, now } = opts;
  const lookback = opts.lookback ?? (type === 'year' ? 3 : 6);
  const minPeriods = opts.minPeriods ?? (type === 'year' ? 1 : 2);

  // Which periods this person has actually spent in. Same test usualCurve
  // applies to a whole period curve, row by row: a period whose expenses sum
  // to nothing does not vote, because it is a period before tracking started
  // rather than a period where nothing was spent.
  const spent = new Set<number>();
  for (const e of expenses) {
    if (e.type === 'income') continue;
    if (mineAmount(e as never, currency) <= 0) continue;
    const d = parseLocalDate(e.date);
    spent.add(ordinalOf(type, d.getFullYear(), d.getMonth(), Math.floor(d.getMonth() / 3)));
  }
  if (spent.size === 0) return null;

  const nowOrd = ordinalOf(type, now.getFullYear(), now.getMonth(), Math.floor(now.getMonth() / 3));
  const selectedOrd = ordinalOf(type, year, month, quarter);

  for (let ahead = 0; ahead <= lookback; ahead++) {
    const c = periodStartBack(type, year, month, quarter, -ahead);
    let votes = 0;
    for (let back = 1; back <= lookback; back++) {
      const p = periodStartBack(type, c.year, c.month, c.quarter, back);
      const ord = ordinalOf(type, p.year, p.month, p.quarter);
      if (ord > nowOrd || spent.has(ord)) votes++;
    }
    if (votes < minPeriods) continue;
    // Available already (or in a period being looked back at): there is no
    // date to give, and naming this one would read as "arriving now".
    return ordinalOf(type, c.year, c.month, c.quarter) > selectedOrd ? c : null;
  }
  return null;
}

/**
 * The cumulative curve of ONE specific period - "this same month, last year"
 * as an alternative benchmark to the median. Null when that period holds no
 * spending: a flat zero line is not a benchmark, it is an absence of one.
 */
export function periodCurve(
  expenses: UsualRow[],
  currency: string,
  opts: { type: PeriodType; year: number; month: number; quarter: number; steps: number },
): number[] | null {
  const { type, year, month, quarter, steps } = opts;
  if (steps <= 0) return null;
  const ends = stepEndsFor(type, year, month, quarter, steps);
  const start =
    type === 'month' ? new Date(year, month, 1)
    : type === 'quarter' ? new Date(year, quarter * 3, 1)
    : new Date(year, 0, 1);
  const curve = cumulativeForPeriod(expenses, currency, start, ends);
  return curve[curve.length - 1] > 0 ? curve : null;
}
