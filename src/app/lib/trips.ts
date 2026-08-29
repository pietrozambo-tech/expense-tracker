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
 * A description with a trip name on the front.
 *
 * The inverse of tripBodyOf, and the only place the two halves are joined -
 * the importer, the bulk edit and the description field all write the same
 * string because they all call this. Written out by hand in three places it
 * would be three chances for one of them to use a different separator, and a
 * trip whose rows do not all match is a trip that has silently split.
 *
 * An empty body leaves the name alone: a row whose whole description is the
 * trip name is still in the trip, and appending a bare separator would put a
 * dangling dash on the screen.
 */
export function withTripName(name: string, body: string): string {
  const clean = name.trim();
  const rest = body.trim();
  return rest ? `${clean}${TRIP_SEP}${rest}` : clean;
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

/** The first and last dates a trip's rows carry. */
export function tripSpan(trip: Trip): { from: string; to: string } {
  let from = trip.rows[0]?.date ?? trip.month;
  let to = from;
  for (const r of trip.rows) {
    if (r.date < from) from = r.date;
    if (r.date > to) to = r.date;
  }
  return { from, to };
}

/**
 * The trip a description belongs to, checked against the trips that exist.
 *
 * tripNameOf on its own answers "could this be a name", which is the right
 * question for the importer and the wrong one for a screen. A person typing
 * "Volo - andata" into a travel expense has written a description; showing
 * them a "Volo" trip chip - and cutting their sentence in half to do it -
 * would be the app asserting something it does not believe, since three rows
 * are needed before any of this is a trip at all.
 *
 * So the prefix has to name a trip that is really there. Returned as the
 * DESCRIPTION spells it, not as the trip does: that spelling is what goes
 * back on the row when the two halves are rejoined, and a case difference
 * quietly rewritten here would be an edit nobody asked for.
 */
export function tripOfDescription(description: string | undefined, trips: Trip[]): string | null {
  const name = tripNameOf(description);
  if (!name) return null;
  return trips.some((t) => fold(t.name) === fold(name)) ? name : null;
}

const DAY_MS = 86_400_000;
/** Whole days from `b` to `a`. Both are 'YYYY-MM-DD', so both parse as UTC
 *  midnight and the difference carries no timezone in it. */
const daysBetween = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / DAY_MS);

/**
 * Every trip, ordered for a transaction on this date: nearest first.
 *
 * ONE rule, and it fits in a sentence: trips are ordered by how close their
 * days are to this expense. The trip you were on that day comes first, then
 * the one that ended most recently.
 *
 * That sentence is the whole specification, and it was worth rewriting this
 * to get. The first version ranked by the MONTH a trip is named after, which
 * fell apart on the case that matters most - two trips a fortnight apart are
 * in the same month, the comparison ties, and which one leads becomes
 * impossible to explain to the person looking at it. Days do not tie.
 *
 * The span is the rows' own range, not the month in the title, so the Azores
 * - flights in March, a car in June, the trip in August - is a candidate for
 * a date anywhere in that stretch.
 *
 * There is no "is this one near enough" flag any more, and its absence is the
 * point. It existed so the app could decide whether to raise the subject
 * unprompted, which it did whenever a date fell inside a trip - meaning under
 * every expense written during the fortnight you were away. The picker now
 * waits inside the travel category instead, and a control you opened
 * deliberately does not need evidence before it is allowed to speak.
 */
const shiftDate = (date: string, days: number) =>
  new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * Expenses that could join this trip.
 *
 * ONE rule, and it is the one a person would give: spending near the trip's
 * own dates that is not in a trip already. "Not in a trip already" is read
 * off the description rather than from the detected trips, and that stricter
 * reading is deliberate - a row saying "Milano - Roma treno" is not in any
 * trip, but assigning it here would rewrite it to "Azores - Roma treno" and
 * lose the word "Milano" without saying so. Anything already carrying a
 * prefix belongs to somebody's idea of a group, so it is left alone.
 *
 * The window is the trip's own span, padded. Widening it is the caller's
 * choice because the case that needs it is real - a flight booked in March
 * for an August trip falls nowhere near the holiday - and the case that does
 * not is far more common, where a wide window buries three plausible rows in
 * three hundred.
 *
 * Newest first, capped: a list nobody can reach the end of is not a list.
 */
export function tripCandidates(
  transactions: Transaction[],
  trip: Trip,
  padDays = 7,
  limit = 40,
): Transaction[] {
  const { from, to } = tripSpan(trip);
  const lo = shiftDate(from, -padDays);
  const hi = shiftDate(to, padDays);
  return transactions
    .filter((t) =>
      t.type === 'expense' &&
      tripNameOf(t.description) === null &&
      t.date >= lo && t.date <= hi)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

/** The window tripCandidates is looking at, for the screen to say out loud. */
export function tripCandidateWindow(trip: Trip, padDays: number): { from: string; to: string } {
  const { from, to } = tripSpan(trip);
  return { from: shiftDate(from, -padDays), to: shiftDate(to, padDays) };
}

export function tripChoicesFor(trips: Trip[], date: string, limit = 3): Trip[] {
  return trips
    .map((trip) => {
      const { from, to } = tripSpan(trip);
      // Zero while inside it; otherwise the days to whichever end is closer.
      const gap = date < from ? daysBetween(from, date) : date > to ? daysBetween(date, to) : 0;
      return { trip, gap, to, width: daysBetween(to, from) };
    })
    .sort((a, b) =>
      a.gap - b.gap
      // Both contain the date: the TIGHTER one wins. A five-month stretch
      // holds a date because flights were booked in March and the holiday
      // was in August - it is a container. Five days around the date is the
      // trip you were actually on, and that is the one to offer first.
      || a.width - b.width
      // Neither contains it and they are equally far: the one that ended
      // later, which is the one still being added to.
      || b.to.localeCompare(a.to))
    .slice(0, limit)
    .map(({ trip }) => trip);
}

/**
 * "16-26 Aug 2026", or "28 Dec 2025 - 3 Jan 2026" when it straddles a year.
 *
 * The dates are what tells two trips apart when their names do not: a list
 * showing "Formentera" twice says nothing, and the same list showing
 * "4-6 Jul 2025" and "4-6 Jul 2026" needs no explaining.
 *
 * Which is exactly why the YEAR is always here, though it makes the label
 * longer than it looks like it needs to be. Formentera in two consecutive
 * summers is the case this whole label exists for, and those two trips can
 * easily fall on the same days of the same month - so a label without a year
 * fails precisely where it is needed and reads fine everywhere it is not.
 *
 * Month names are passed in for the same reason the import prompt takes them:
 * a lookup in here would answer in the browser's language rather than the one
 * the user chose.
 */
export function tripDatesLabel(trip: Trip, monthsShort: string[]): string {
  const { from, to } = tripSpan(trip);
  const day = (d: string) => String(Number(d.slice(8, 10)));
  const mon = (d: string) => monthsShort[Number(d.slice(5, 7)) - 1] ?? '';
  const year = (d: string) => d.slice(0, 4);
  if (year(from) !== year(to)) {
    return `${day(from)} ${mon(from)} ${year(from)} - ${day(to)} ${mon(to)} ${year(to)}`;
  }
  if (from === to) return `${day(from)} ${mon(from)} ${year(to)}`;
  return from.slice(0, 7) === to.slice(0, 7)
    ? `${day(from)}-${day(to)} ${mon(to)} ${year(to)}`
    : `${day(from)} ${mon(from)} - ${day(to)} ${mon(to)} ${year(to)}`;
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
    const description = withTripName(clean, body);
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
