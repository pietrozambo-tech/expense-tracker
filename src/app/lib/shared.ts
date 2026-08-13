import type { Household, SplitRule, Settlement, Transaction } from '../types';
import { homeAmount, mineAmount } from '../utils/currency';

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
 * The running balance, in the home currency: what the other member owes you
 * (positive) or you owe them (negative, once their entries can exist).
 *
 * Every local transaction was paid by YOU, so each shared one adds what they
 * owe you back (paid minus yours); settlements retire it. Deliberately not
 * month-scoped - a debt does not reset on the 1st.
 */
export function runningBalance(
  transactions: Transaction[],
  settlements: Settlement[],
  homeCurrency: string,
): number {
  const fronted = transactions.reduce((sum, t) => {
    if (!isShared(t) || t.type === 'income') return sum;
    return sum + (homeAmount(t, homeCurrency) - mineAmount(t, homeCurrency));
  }, 0);
  const settled = settlements.reduce((sum, s) => sum + s.amount, 0);
  return fronted - settled;
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
