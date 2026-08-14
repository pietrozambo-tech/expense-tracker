import type { Household, SplitRule, Settlement, Transaction } from '../types';
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
