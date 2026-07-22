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

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  category: Category;
  subcategory?: string;
  date: string; // YYYY-MM-DD in local time
  type: TransactionType;
  currency: string; // ISO code, e.g. 'EUR'
  recurrence?: string; // 'Never repeat', 'Every month', ...
}

export interface UserSettings {
  onboarded: boolean;
  userName: string;
  currency: string;
}
