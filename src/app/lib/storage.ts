import type { Category, Transaction, UserSettings } from '../types';
import {
  categories as defaultCategories,
  incomeCategories as defaultIncomeCategories,
} from '../components/categories';

// Versioned keys so a future schema change can migrate (or ignore) old data.
const key = (name: string) => `expense-tracker.v1.${name}`;

const KEYS = {
  transactions: key('transactions'),
  categories: key('categories'),
  incomeCategories: key('income-categories'),
  settings: key('settings'),
};

function read<T>(storageKey: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(storageKey: string, value: unknown) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode) or full; the app keeps working in memory.
  }
}

export const DEFAULT_SETTINGS: UserSettings = {
  onboarded: false,
  userName: '',
  currency: 'EUR',
};

export const loadSettings = () => read<UserSettings>(KEYS.settings, DEFAULT_SETTINGS);
export const saveSettings = (settings: UserSettings) => write(KEYS.settings, settings);

export const loadTransactions = () => read<Transaction[]>(KEYS.transactions, []);
export const saveTransactions = (transactions: Transaction[]) =>
  write(KEYS.transactions, transactions);

export const loadCategories = () => read<Category[]>(KEYS.categories, defaultCategories);
export const saveCategories = (categories: Category[]) => write(KEYS.categories, categories);

export const loadIncomeCategories = () =>
  read<Category[]>(KEYS.incomeCategories, defaultIncomeCategories);
export const saveIncomeCategories = (categories: Category[]) =>
  write(KEYS.incomeCategories, categories);

export function clearAllData() {
  try {
    Object.values(KEYS).forEach((storageKey) => localStorage.removeItem(storageKey));
  } catch {
    // Ignore; nothing to clear if storage is unavailable.
  }
}
