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
  recurrenceOf?: string; // id of the seed transaction this occurrence was materialized from
  sourceId?: string; // id into the sources list (optional for older data)
}

export interface UserSettings {
  onboarded: boolean;
  userName: string;
  currency: string;
  // Whether the first-run feature carousel has been shown
  hasSeenIntro?: boolean;
  // Source pre-selected on new transactions, separately for each direction
  defaultSourceExpense?: string;
  defaultSourceIncome?: string;
}
