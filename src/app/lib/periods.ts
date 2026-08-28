/**
 * Which periods a screen may be pointed at.
 *
 * Every screen that reads the ledger looks at a month or a year, and none of
 * them should be able to look at one that has not happened. The Dashboard
 * already refused - its picker disables years and months ahead of today - but
 * Activity and Trend built their lists straight from the dates in the data, so
 * a single future-dated row (a flight booked for December, a schedule seeded
 * ahead) put December in the picker and let you browse spending that has not
 * occurred. Two screens saying different things about what "August" contains
 * is the kind of disagreement that makes people stop trusting the totals.
 *
 * The rule lives here rather than three times over, and is pure so the cases
 * below can be asked about without waiting for a month to pass.
 */

const yearOf = (date: string) => Number(date.slice(0, 4));
const monthOf = (date: string) => Number(date.slice(5, 7)) - 1;

/**
 * Years with data, never later than the current one.
 *
 * Always at least the current year: a ledger holding nothing, or nothing but
 * future rows, still has to offer somewhere to stand.
 */
export function selectableYears(dates: string[], today: Date = new Date()): number[] {
  const nowY = today.getFullYear();
  const years = new Set<number>();
  for (const d of dates) {
    const y = yearOf(d);
    if (y <= nowY) years.add(y);
  }
  years.add(nowY);
  return [...years].sort((a, b) => b - a);
}

/**
 * Months with data inside one year, never later than the current month.
 *
 * Past years are unclipped - all twelve are behind us - and a future year
 * yields nothing, which is what makes an out-of-range selection collapse
 * rather than render an empty screen that looks broken.
 */
export function selectableMonths(dates: string[], year: number, today: Date = new Date()): number[] {
  const nowY = today.getFullYear();
  const nowM = today.getMonth();
  if (!Number.isFinite(year) || year > nowY) return [];
  const months = new Set<number>();
  for (const d of dates) {
    if (yearOf(d) !== year) continue;
    const m = monthOf(d);
    if (year === nowY && m > nowM) continue;
    months.add(m);
  }
  return [...months].sort((a, b) => a - b);
}

/** The year a screen should fall back to when the one it held is out of range. */
export function clampYear(year: number, today: Date = new Date()): number {
  const nowY = today.getFullYear();
  return Number.isFinite(year) && year <= nowY ? year : nowY;
}
