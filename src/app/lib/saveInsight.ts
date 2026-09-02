// What the save toast has to add, if anything.
//
// Saving an expense already answers "did that work": the toast says
// "12,50€ saved to Food". This decides whether there is a second line worth
// putting under it - and the answer is usually no, deliberately.
//
// The rule the two cases here were chosen by: a toast may say what will
// HAPPEN, or what you cannot SEE. Everything else is trivia dressed as an
// insight. A category overtaking another one is true and useless; nobody
// changes anything because Food passed Housing. The percentage of the month a
// category holds is on the screen behind the toast already.
//
// So, two cases only:
//
//   first    the very first expense this person writes. Not an insight - a
//            handshake. It is the one moment where saying "from here on I
//            keep count" is the whole product in six words.
//
//   repeat   the same description, over and over, in one month. This is the
//            invisible one: the rows exist, the person typed every one of
//            them, and the app shows them a day apart in a list. Nothing
//            anywhere adds them up, because nothing in the app groups by
//            description. Four coffees is not news; €34 of coffee is.

export interface InsightRow {
  id: string;
  date: string;
  description?: string;
  amount: number;
  type?: 'expense' | 'income';
}

export type SaveInsight =
  | { kind: 'first' }
  | { kind: 'repeat'; times: number; label: string; total: number };

/** Every N repeats, not every one past N: the fourth coffee is a discovery,
 *  the fifth is the same sentence again. */
const EVERY = 4;

/** Below this the sum is not the point. Four things at 80 cents add up to a
 *  number nobody needed told. */
const MIN_TOTAL = 10;

/** Same thing, however it was typed. Case, stray spaces and a trailing full
 *  stop are not different purchases. */
export const normalise = (s: string): string =>
  s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,;]+$/, '');

const monthOf = (date: string) => date.slice(0, 7);

/**
 * @param rows  the person's OWN expenses, demo rows excluded, as they stand
 *              AFTER the save
 * @param saved the row just written
 * @param now   today, so a backdated row can be told from a live one
 */
export function saveInsight({ rows, saved, now }: {
  rows: InsightRow[];
  saved: InsightRow;
  now: Date;
}): SaveInsight | null {
  // The handshake. Their own first, so loading the sample data and then
  // writing a real expense still counts as the first one they wrote.
  if (rows.length === 1 && rows[0].id === saved.id) return { kind: 'first' };

  const label = (saved.description ?? '').trim();
  if (!label) return null;
  // Only for a row dated into the month in progress. Backdating a receipt
  // from March is bookkeeping, and "4 times this month" would be a lie about
  // which month.
  const nowMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (monthOf(saved.date) !== nowMonth) return null;

  const key = normalise(label);
  const same = rows.filter(
    (r) => r.type !== 'income' && monthOf(r.date) === nowMonth && normalise(r.description ?? '') === key,
  );
  if (same.length < EVERY || same.length % EVERY !== 0) return null;

  const total = same.reduce((sum, r) => sum + Math.abs(r.amount), 0);
  if (total < MIN_TOTAL) return null;

  return { kind: 'repeat', times: same.length, label, total };
}
