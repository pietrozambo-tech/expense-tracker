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
  // Whether the first-run feature carousel has been shown
  hasSeenIntro?: boolean;
  // Source pre-selected on new transactions, separately for each direction
  defaultSourceExpense?: string;
  defaultSourceIncome?: string;
  // First day of the week for day-of-week views: 1 Monday (default), 0 Sunday,
  // 6 Saturday
  weekStartsOn?: number;
}
