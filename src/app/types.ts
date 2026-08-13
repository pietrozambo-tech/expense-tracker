// Shared data model for the app.
// These shapes are persisted to localStorage, so keep them JSON-serializable.

export type TransactionType = 'expense' | 'income';

export interface Category {
  id: string;
  name: string;
  icon: string; // lucide icon name, resolved via components/categoryIcons.ts
  color: string;
  bgColor: string;
  selectedBg: string;
  subcategories?: string[];
  type: TransactionType;
  // When this category (name, look, or subcategory list) was last edited.
  // The cross-device merge prefers the newer stamp; without one, concurrent
  // edits to the same category resolved by write order, and a renamed
  // category on one device could silently drop a subcategory added on
  // another. Absent on categories never edited since this was added.
  updatedAt?: string;
}

// A payment source / account a transaction flows to or from: cash or a bank.
// Rendered as a small brand-coloured logo tile (see components/SourceLogo).
export interface Source {
  id: string;
  name: string;
  kind: 'cash' | 'bank';
  brand: string; // tile background colour (hex)
  fg?: string; // tile foreground colour (defaults to white)
  monogram?: string; // 1–2 letter mark, e.g. 'R', 'IS'
  mark?: 'banknote' | 'monogram'; // which glyph the tile draws
}

// A recurring schedule, decoupled from the transactions it creates: the
// template holds the values future occurrences are stamped from, so editing
// past transactions never rewrites the schedule and vice versa.
export interface RecurringRule {
  id: string; // chain key; occurrences point back via Transaction.recurrenceOf
  rule: string; // 'Every month', ... (same vocabulary as Transaction.recurrence)
  anchorDate: string; // YYYY-MM-DD the cadence is anchored to (occurrences start after it)
  endedAt?: string; // exclusive cutoff: no occurrences on/after this date
  skipDates?: string[]; // occurrence dates the user deleted individually
  updatedAt?: string; // ISO stamp of the last edit, so sync merges can pick the newer copy
  template: {
    description: string;
    amount: number;
    currency: string;
    category: Category;
    subcategory?: string;
    sourceId?: string;
    type: TransactionType;
  };
}

// ---------------------------------------------------------------------------
// Shared expenses (design: docs/shared-expenses/README.md). All fields below
// are optional and absent for anyone without a household - the app reads
// identically to before they existed.

/** How a shared amount divides. Reusable: the household's default, and later a
 *  source's or recurring rule's override, are all this one shape. */
export interface SplitRule {
  mode: 'equal' | 'percent';
  ways?: number; // 'equal': heads including you
  percent?: number; // 'percent': your share, 0-100
}

/** Someone you share costs with. Local-only until account pairing exists. */
export interface Person {
  id: string;
  name: string;
  color: string; // avatar background (hex)
  /** Their auth user id, once the two accounts are paired. Absent while the
   *  household is local-only (you tracking a split without them in the app). */
  userId?: string;
  updatedAt?: string;
}

/** The one household this account shares costs with. Its absence IS the
 *  feature toggle: no household means no switcher, no chip, no shared view -
 *  the app is exactly what it was before the feature shipped. */
export interface Household {
  id: string;
  memberIds: string[]; // Person ids, not including you
  defaultSplit: SplitRule;
  /** Category ids whose expenses share by default ("always shared"). */
  sharedCategoryIds: string[];
  /** Finer grain: single subcategories that share by default, keyed by
   *  category id, for categories not wholly in sharedCategoryIds (a wholly
   *  shared category needs no entry - all of it shares). */
  sharedSubcategories?: Record<string, string[]>;
  /** false = split amounts correctly but keep no balance (joint account you
   *  both fund). Defaults true - without a balance the feature is close to
   *  pointless, you may as well type your share. */
  trackBalance: boolean;
  /** The server-side household id, once paired. Absent = local-only: splits
   *  and the balance still work, they are simply one-sided. */
  remoteId?: string;
  updatedAt?: string;
}

/** Money received from (or paid to) the household member, retiring part of the
 *  balance. Not a Transaction: it is neither spending nor income and never
 *  enters a category. */
export interface Settlement {
  id: string;
  personId: string;
  date: string; // YYYY-MM-DD local, like Transaction.date
  /** Positive: they paid you. Negative: you paid them. In the home currency
   *  at the time it was recorded. */
  amount: number;
  updatedAt?: string;
}

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  category: Category;
  subcategory?: string;
  date: string; // YYYY-MM-DD in local time
  type: TransactionType;
  currency: string; // ISO code, e.g. 'EUR'
  // Amount converted to the base currency (EUR) at save time. This locks the
  // FX value so a foreign-currency transaction keeps its worth as rates move.
  // Optional for older data / same-currency entries.
  baseAmount?: number;
  recurrence?: string; // 'Never repeat', 'Every month', ...
  recurrenceOf?: string; // id of the RecurringRule chain this transaction belongs to
  sourceId?: string; // id into the sources list (optional for older data)
  // Set (to the batch's timestamp) on transactions created by Import - so a
  // big import can be reviewed in bulk from Activity's filter. Absent on
  // everything added by hand.
  importedAt?: string;
  // When this transaction was created or last edited, stamped by the device
  // that did it. Sync uses it to decide which of two copies is newer - the
  // only signal that stays true even when one device runs an older build.
  // Absent on data from before the field existed; the merge then falls back
  // to comparing against the last-agreed base.
  updatedAt?: string;
  // Present only on shared transactions: `amount` stays what left the account,
  // `split.mine` is the part that is actually yours, in the transaction's OWN
  // currency. Resolved at save time from whichever rule fired, so no reader
  // ever does lookups and changing a household default never rewrites history.
  split?: {
    mine: number;
    /** Person ids the rest belongs to. */
    withIds?: string[];
  };
  /** Set on a REPLICA of the other member's shared expense: the id of the
   *  shared_items row it mirrors. Its presence means they paid, not you -
   *  which is what flips the balance - and that the row is theirs to edit.
   *  Replicas are rebuilt from the server, never merged. */
  fromShared?: string;
}

export interface UserSettings {
  onboarded: boolean;
  userName: string;
  currency: string;
  // Monthly spending limit in `currency`; undefined/0 = no budget set
  monthlyBudget?: number;
  // Set once the user dismisses the Dashboard's "set a budget" card, so it
  // stays gone until a budget actually exists
  budgetNudgeDismissed?: boolean;
  /** The month-review card on the Dashboard. Absent means on - a setting the
   *  user has never touched should not have to be written to be true. */
  insightsEnabled?: boolean;
  // Whether the first-run feature carousel has been shown
  hasSeenIntro?: boolean;
  // Source pre-selected on new transactions, separately for each direction
  defaultSourceExpense?: string;
  defaultSourceIncome?: string;
  // First day of the week for day-of-week views: 1 Monday (default), 0 Sunday,
  // 6 Saturday
  weekStartsOn?: number;
  // UI language. Absent means English: existing accounts predate the choice,
  // and must never flip language just because the device is Italian.
  language?: 'en' | 'it';
}
