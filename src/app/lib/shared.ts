import type { Household, Person, Source, SplitRule, Settlement, Transaction } from '../types';
import { homeAmount, mineAmount } from '../utils/currency';
import { balanceFrom } from './sharedSync';

// Helpers for shared expenses. Small on purpose: the split is resolved once at
// save time and stored on the transaction, so almost everything downstream is
// plain arithmetic over fields that already exist.

/** Your fraction of a shared amount under a rule. Clamped to [0, 1]. */
export function shareFraction(rule: SplitRule): number {
  const f =
    rule.mode === 'percent'
      ? (rule.percent ?? 50) / 100
      : 1 / Math.max(2, rule.ways ?? 2);
  return Math.min(1, Math.max(0, f));
}

/** Your share of `amount` in cents-exact form. Rounded normally: the spec's
 *  "remainder never lands on you" concern only bites past two decimals, and
 *  cents are as far as the app goes. */
export function myShareOf(amount: number, rule: SplitRule): number {
  return Math.round(amount * shareFraction(rule) * 100) / 100;
}

/** Is a transaction shared into the household ledger? */
export const isShared = (t: Transaction): boolean =>
  !!t.split && isFinite(t.split.mine);

/**
 * The running balance, in the home currency: positive means they owe you.
 *
 * Two-sided once the accounts are paired - a replica of their expense moves
 * it the other way. Scoped to `memberIds`, so a balance belongs to the
 * household that ran it up. The arithmetic lives in sharedSync.balanceFrom,
 * next to the reconciler that creates the replicas; this binds it to the app's
 * currency helpers.
 */
export function runningBalance(
  transactions: Transaction[],
  settlements: Settlement[],
  homeCurrency: string,
  memberIds: string[],
): number {
  return balanceFrom(
    transactions,
    settlements,
    (t) => homeAmount(t, homeCurrency),
    (t) => mineAmount(t, homeCurrency),
    memberIds,
  );
}

/** The default household shape created by Settings. */
export function newHousehold(personId: string): Household {
  return {
    id: `household-${Date.now().toString(36)}`,
    memberIds: [personId],
    defaultSplit: { mode: 'equal', ways: 2 },
    sharedCategoryIds: [],
    trackBalance: true,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Newest first, and within a day newest first as well.
 *
 * Every list of transactions in the app is a list in time order, and `date`
 * only resolves to the day - so same-day rows were left in whatever order the
 * array held. Adding groceries after the butcher put them BELOW it, and a
 * shared sync rebuilding the array could reorder a day on its own.
 *
 * `createdAt` is the tiebreaker, falling back to `updatedAt` for rows written
 * before it existed. That fallback is imperfect in one way worth knowing: an
 * OLD row edited today floats to the top of its own day. It applies to
 * historical data only - everything written from now on carries a real
 * creation stamp - and it is better than the alternative, which is no order at
 * all. Rows with neither keep their relative position, because Array.sort is
 * stable.
 */
export const recencyKey = (t: Transaction): number => {
  const stamp = t.createdAt ?? t.updatedAt;
  const ms = stamp ? Date.parse(stamp) : NaN;
  return Number.isFinite(ms) ? ms : 0;
};

export function byRecency(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return recencyKey(b) - recencyKey(a);
}

/**
 * The Source that stands for the other member.
 *
 * Their expenses arrive with no source of their own - which card they used is
 * theirs, not ours, and it never crosses the wire - so they landed under "No
 * source" in the spending-by-source donut, where they read as a gap in your own
 * records rather than as money somebody else spent.
 *
 * A source named after them, wearing their initial in their colour, answers it
 * where the question is asked: the donut segment is the same violet as their
 * avatar everywhere else in the app.
 *
 * Derived from the person rather than stored, so the id is stable and the name
 * and colour follow theirs - which matters most right after pairing, when the
 * placeholder "Partner" becomes whatever they actually call themselves.
 */
export const partnerSourceId = (personId: string) => `src-partner-${personId}`;

/** The prefix every partner-derived source id carries. */
const PARTNER_SOURCE_PREFIX = 'src-partner-';

/**
 * The sources that may be CHOSEN for a new entry.
 *
 * A partner's source is not a bank the user added; it is derived from a person
 * being in the household, and it should live exactly as long as that fact
 * does. Turn sharing off - or pair with somebody else - and the old name has
 * no business still sitting in the Add screen's picker.
 *
 * Retired, not deleted, and the difference is the whole point: the rows she
 * paid for are still in the ledger and still yours to look at, so the source
 * has to keep resolving for the donut, Activity and an export. Deleting the
 * object would drop months of real spending into "No source". So this is a
 * filter applied where things are picked, never where they are displayed.
 *
 * Derived rather than a stored flag: the answer is already in the household,
 * so a field would only be a second copy of it to keep in step - and it would
 * need a migration for every ledger already carrying one of these.
 */
export function selectableSources(sources: Source[], household: Household | null): Source[] {
  const live = new Set((household?.memberIds ?? []).map(partnerSourceId));
  return sources.filter((s) => !s.id.startsWith(PARTNER_SOURCE_PREFIX) || live.has(s.id));
}

export function partnerSource(person: Person): Source {
  return {
    id: partnerSourceId(person.id),
    name: person.name,
    kind: 'bank',
    brand: person.color,
    monogram: (person.name[0] ?? '?').toUpperCase(),
    mark: 'monogram',
  };
}
