import type { Category, Transaction } from '../types';

/**
 * Trips, read out of the ledger rather than stored beside it.
 *
 * A trip has no field of its own. What marks one is the name the import put in
 * front of every description - "Azores - Cena porto" - which both the script
 * and the in-app AI prompt ask for by name, precisely so a trip can be pulled
 * back out later. Deriving from that costs no migration and works on trips
 * imported months ago; the price is that the rules below have to be strict
 * enough that an ordinary description never becomes a holiday.
 */

/** Space-hyphen-space, exactly as the importer writes it. "Milano-Roma" is a
 *  place, not a trip, and must not match. */
export const TRIP_SEP = ' - ';

/** Longest a trip name may be, and the most words it may have. A description
 *  that opens with half a sentence before a dash is a description. */
const MAX_NAME_CHARS = 24;
const MAX_NAME_WORDS = 3;

/** Below this a group is a coincidence, not a holiday. Three keeps a weekend
 *  with four expenses while rejecting the two hand-typed rows that happen to
 *  share an opening word - a false positive costs one card in a sheet you
 *  opened deliberately, a false negative hides a real trip. */
export const MIN_TRIP_ROWS = 3;

/** A month must hold this share of the group's rows to be its own trip. */
const PEAK_SHARE = 0.25;
/** ...and stand this far from every other peak. Below it, the two months are
 *  one trip either side of a boundary (a New Year trip is December AND
 *  January, and must not be split into two). */
const PEAK_GAP_MONTHS = 4;

const fold = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** The trip name a description carries, or null. */
export function tripNameOf(description: string | undefined): string | null {
  if (!description) return null;
  const i = description.indexOf(TRIP_SEP);
  if (i <= 0) return null;
  const name = description.slice(0, i).trim();
  if (!name || name.length > MAX_NAME_CHARS) return null;
  if (name.split(/\s+/).length > MAX_NAME_WORDS) return null;
  return name;
}

/**
 * Would the app still recognise a trip called this?
 *
 * The name IS the identity - there is no trip record to fall back on - so a
 * rename to something the detector cannot read back does not fail loudly: the
 * descriptions are rewritten, every row stops matching, and the trip vanishes
 * from the sheet with no way to find it again except by remembering what it
 * used to be called.
 *
 * So this asks the detector rather than restating its rules. Any limit added
 * to tripNameOf later is enforced here the same day, which a hand-copied list
 * of "max 3 words, max 24 chars, no separator" would not be.
 */
export function isTripName(name: string): boolean {
  const clean = name.trim();
  if (!clean) return false;
  return tripNameOf(`${clean}${TRIP_SEP}x`) === clean;
}

/** The description with any trip name taken off the front. */
export function tripBodyOf(description: string | undefined): string {
  const d = description ?? '';
  const name = tripNameOf(d);
  return name ? d.slice(name.length + TRIP_SEP.length).trim() : d.trim();
}

/**
 * The user's travel category, by id first and then by name.
 *
 * Same resolution the AI prompt and the import script use: `travel` is the
 * seeded id, but a category renamed "Viaggi" - or rebuilt by hand - still has
 * to be found, or a trip would be filed under a category that does not exist.
 */
export function travelCategoryOf(categories: Category[]): Category | null {
  return (
    categories.find((c) => c.id === 'travel') ??
    categories.find((c) => ['travel', 'viaggi', 'viaggio', 'trips', 'trip'].includes(fold(c.name))) ??
    null
  );
}

const monthOf = (date: string) => date.slice(0, 7);
const monthIndex = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
const monthsApart = (a: string, b: string) => Math.abs(monthIndex(a) - monthIndex(b));

export interface Trip {
  /** Stable within a render: the folded name plus the peak month. */
  key: string;
  /** As the user spelled it, taken from the earliest row. */
  name: string;
  /** 'YYYY-MM' of the peak - what the trip is CALLED, not when it was paid. */
  month: string;
  rows: Transaction[];
  total: number;
  /** Descending, and never more than a handful; the tail is folded into one. */
  parts: { name: string | null; amount: number }[];
}

/**
 * Split one name's rows into the trips it actually represents.
 *
 * Grouping by name alone is wrong in both directions, and the two failures
 * pull against each other. Formentera in two consecutive summers is TWO trips
 * under one name. The Azores is ONE trip whose flights were booked in March,
 * a car in June and everything else in August - five months of dates, one
 * holiday.
 *
 * So the split is by density, not by gaps: the busiest month is a peak, and
 * another month joins it as a peak only if it carries a real share of the rows
 * AND stands far enough away. Everything else - the stray booking months -
 * attaches to whichever peak is nearest, which is what makes March's flights
 * part of August's trip rather than a trip of their own.
 */
function peaksOf(rows: Transaction[]): string[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(monthOf(r.date), (counts.get(monthOf(r.date)) ?? 0) + 1);
  // Count first, then month, so the result never depends on ledger order.
  const ordered = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const peaks: string[] = [];
  for (const [month, n] of ordered) {
    if (peaks.length === 0) {
      peaks.push(month);
      continue;
    }
    if (n / rows.length < PEAK_SHARE) continue;
    if (peaks.every((p) => monthsApart(p, month) >= PEAK_GAP_MONTHS)) peaks.push(month);
  }
  return peaks.sort();
}

/**
 * Every trip in the ledger.
 *
 * `amountOf` converts a row to the user's own currency - passed in rather than
 * imported so this stays pure and the test battery can ask about the grouping
 * without an FX table.
 */
export function detectTrips(
  transactions: Transaction[],
  travel: Category | null,
  amountOf: (t: Transaction) => number,
): Trip[] {
  if (!travel) return [];

  const byName = new Map<string, Transaction[]>();
  for (const t of transactions) {
    // Expenses in the travel category only. Income is not trip spending, and a
    // prefix on a row filed elsewhere is somebody's description, not a trip.
    if (t.type !== 'expense' || t.category?.id !== travel.id) continue;
    const name = tripNameOf(t.description);
    if (!name) continue;
    const key = fold(name);
    const list = byName.get(key) ?? [];
    list.push(t);
    byName.set(key, list);
  }

  const trips: Trip[] = [];
  for (const [key, all] of byName) {
    const rows = [...all].sort((a, b) => a.date.localeCompare(b.date));
    const peaks = peaksOf(rows);

    const buckets = new Map<string, Transaction[]>(peaks.map((p) => [p, []]));
    for (const r of rows) {
      const m = monthOf(r.date);
      // Nearest peak; ties go to the earlier one, which is already first.
      let best = peaks[0];
      for (const p of peaks) if (monthsApart(p, m) < monthsApart(best, m)) best = p;
      buckets.get(best)!.push(r);
    }

    for (const [month, group] of buckets) {
      if (group.length < MIN_TRIP_ROWS) continue;
      const total = group.reduce((sum, t) => sum + Math.abs(amountOf(t)), 0);

      const bySub = new Map<string | null, number>();
      for (const t of group) {
        const sub = t.subcategory ?? null;
        bySub.set(sub, (bySub.get(sub) ?? 0) + Math.abs(amountOf(t)));
      }
      const parts = [...bySub]
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount);

      // Spelled as the earliest row spells it: the grouping folds case, the
      // label should not invent one.
      const name = tripNameOf(group[0].description) ?? group[0].description ?? '';
      trips.push({ key: `${key}|${month}`, name, month, rows: group, total, parts });
    }
  }

  // Newest first: the trip you just came back from is the one you want.
  return trips.sort((a, b) => b.month.localeCompare(a.month));
}

/**
 * Put a selection into a trip, take it out, or move it between trips.
 *
 * The name is written onto the description the same way the importer writes
 * it, and any name already there is replaced rather than stacked - assigning
 * twice must not produce "Azores - Azores - Cena".
 *
 * The category moves too. Membership requires the travel category, so a taxi
 * still filed under Transportation would take the name and then not appear in
 * the trip - an edit that looks like it failed. It also keeps a plain
 * arithmetic true: the travel category is the trips plus whatever travel was
 * not part of one.
 *
 * `null` removes the row from its trip: the name comes off and the category
 * stays where it is, because nothing here knows where it came from.
 */
/**
 * The trip this one would be swallowed by, if it were renamed to `name`.
 *
 * Grouping is by name and by density, so renaming a trip to something another
 * trip in the same season is already called MERGES the two into one card. That
 * is not a bug - two halves of one holiday spelled differently by an import
 * are exactly what it fixes - but it is a surprise if nobody says so, and it
 * cannot be undone by renaming back: the two sets of rows now share a name.
 *
 * Answered by doing it and looking, not by re-deriving the grouping rules: the
 * rename is applied to a copy and the trips re-detected, so this agrees with
 * what the sheet will actually show by construction. Returns null when the
 * renamed trip lands on a card of its own.
 */
export function tripMergeTarget(
  transactions: Transaction[],
  trip: Trip,
  name: string,
  travel: Category,
  amountOf: (t: Transaction) => number,
): { name: string; month: string } | null {
  if (!isTripName(name)) return null;
  const ids = new Set(trip.rows.map((r) => r.id));
  const after = detectTrips(applyBulkTrip(transactions, ids, name, travel), travel, amountOf);
  const landed = after.find((t) => t.rows.some((r) => ids.has(r.id)));
  if (!landed) return null;
  const strangers = landed.rows.some((r) => !ids.has(r.id));
  return strangers ? { name: landed.name, month: landed.month } : null;
}

export function applyBulkTrip(
  transactions: Transaction[],
  ids: Set<string>,
  name: string | null,
  travel: Category,
  stamp = new Date().toISOString(),
): Transaction[] {
  const clean = name?.trim() ?? null;
  return transactions.map((t) => {
    if (!ids.has(t.id) || t.type !== 'expense') return t;
    const body = tripBodyOf(t.description);
    if (!clean) {
      return { ...t, description: body, updatedAt: stamp };
    }
    const description = body ? `${clean}${TRIP_SEP}${body}` : clean;
    // Already in this category: leave the subcategory alone. Moving in from
    // elsewhere: the old subcategory belongs to the old category, so it goes.
    const sameCategory = t.category?.id === travel.id;
    return {
      ...t,
      description,
      category: travel,
      subcategory: sameCategory ? t.subcategory : undefined,
      updatedAt: stamp,
    };
  });
}
