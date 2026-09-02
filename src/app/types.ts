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
    /**
     * The series is shared, and every occurrence it generates is too.
     *
     * The rent is the clearest case there is for this feature and it was the
     * one thing sharing could not survive: the chip on the Add screen applied
     * to the first month only, and every month the engine wrote after that
     * came out as wholly yours. This is the "recurring rule" rung of the
     * priority ladder in docs/shared-expenses/README.md 5.2.
     *
     * Concrete, like every other field here: `mine` is computed from the
     * household's default at the amount on the rule, so an occurrence needs no
     * knowledge of the household to be stamped out.
     */
    split?: { mine: number; withIds?: string[]; paidByThem?: boolean };
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
  /**
   * The balance this settlement was recorded against.
   *
   * Redundant while settling always clears the whole balance - it equals
   * `amount` - and kept anyway, because it is the only record of what was true
   * at the time. Correct an expense from BEFORE a settlement and replaying the
   * ledger gives a different figure than the one both people agreed on that
   * evening; without this, nothing on the device can tell that the two ever
   * differed. Absent on settlements recorded before it existed.
   */
  balanceAt?: number;
  updatedAt?: string;
}

/**
 * One of their shared expenses that they deleted, held until you have seen it
 * go.
 *
 * Every other kind of change leaves a row behind that can carry its own mark.
 * A deletion removes the only thing that could have carried one, so without
 * this the household total simply drops and nothing on any screen accounts for
 * it. Short-lived by design: cleared the moment the shared view is opened.
 */
export interface SharedRemoval {
  /** The shared_items id it used to be, so a re-appearance replaces it. */
  id: string;
  description: string;
  /** The household figure in its OWN currency, converted where it is shown -
   *  the same shape every other amount in the app travels in. */
  amount: number;
  currency: string;
  baseAmount?: number;
  /** Your share of it, so the summary can say what its removal did to your
   *  own month rather than only to the household's. */
  mine: number;
  /** The day the money moved, so the removal can be scoped to a month like
   *  every other figure on the screen. */
  date: string;
  /** Whether THEY fronted it, which is what says which way its disappearance
   *  moves the balance. */
  paidByThem: boolean;
  /** When this device learned of the deletion. */
  at: string;
}

export interface Transaction {
  /**
   * When this row came into existence, as an ISO instant.
   *
   * `date` is the day the MONEY moved and carries no time, so two things
   * bought on the same day had nothing to order them by: a list showed them in
   * whatever position the array happened to hold, and a sync that rebuilt the
   * array could quietly swap them. This is the tiebreaker.
   *
   * Distinct from `updatedAt` on purpose - editing last Tuesday's coffee must
   * not vault it to the top of last Tuesday.
   *
   * Optional because rows written before it exists do not have one; see
   * `byRecency` for what happens to them.
   */
  createdAt?: string;
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
  // The row's identity within its import file (date|type|amount|currency|
  // desc-hash, plus "#n" for the nth identical row in one file). What lets a
  // later, overlapping import recognise it and skip it instead of
  // double-counting. Absent on everything added by hand - hand-typed rows
  // must never block an import (see importHashOf in lib/importData.ts).
  importHash?: string;
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
    /**
     * The other member fronted the money, whoever typed it in.
     *
     * Absent means "the author paid", which is what the app assumed
     * everywhere before this existed - so every row written until now reads
     * exactly as it did. See `paidByPartner()`, the one place that decision
     * is made.
     */
    paidByThem?: boolean;
    /**
     * Who last wrote this row, as an auth user id. Straight off the server's
     * `updated_by`, which the reconciler was already reading and throwing
     * away.
     *
     * It is what makes "changed by THEM since I last looked" a question the
     * ledger can answer on its own, without a second list to keep in step -
     * the same derive-don't-store choice the partner sources make.
     */
    updatedBy?: string;
    /**
     * What this row said before their last edit to it.
     *
     * Has to be captured at the moment the replica is overwritten, because
     * replicas are rebuilt rather than merged (spec 6.4): the instant their
     * correction lands, `amount` and `mine` are the new values and the old
     * ones exist nowhere - not on this device, not on the server, which keeps
     * no history either. A before/after read later cannot be reconstructed,
     * so it is either written down here or it is gone.
     *
     * Refreshed only once the previous one has been seen, so two edits in a
     * row while you were away still compare against the figure YOU last saw
     * rather than against the intermediate you never did.
     */
    was?: { amount: number; mine: number; at: string };
    /**
     * The category the OTHER member filed this under, on their side.
     *
     * Present only on replicas. The row displays MY category - that is what
     * mapping is for - and this is the record of where it came from, without
     * which nothing can tell a category she invented (and that fell into my
     * catch-all) from one she deliberately filed under Others. It is also what
     * a re-filing keys on, so choosing a home for "Palestra" once moves every
     * row she ever filed there.
     */
    theirCategory?: { key: string; name: string; icon?: string };
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
  /** How the category grid is ordered when adding. Absent means alphabetical.
   *  Synced rather than device-local: it is a habit, not an appearance. */
  categoryOrder?: 'alpha' | 'used';
  /** The month ('YYYY-MM') whose review card was dismissed, and the month
   *  whose "August summary" pointer was tapped.
   *
   *  Synced, unlike the rest of the nudge state. The install banner and the
   *  backup clock are facts about a DEVICE - this browser, this storage - so
   *  they stay local. These two are facts about the READER: having read last
   *  month's summary is true of the person, not of the phone it was read on.
   *  Kept device-local they came back on every new sign-in, which is an app
   *  that will not take yes for an answer. */
  recapSeen?: string;
  reviewSeen?: string;
}
