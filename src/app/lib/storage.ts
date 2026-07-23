import type { Category, Source, Transaction, UserSettings } from '../types';
import {
  categories as defaultCategories,
  incomeCategories as defaultIncomeCategories,
} from '../components/categories';
import {
  DEFAULT_SOURCES,
  DEFAULT_SOURCE_EXPENSE,
  DEFAULT_SOURCE_INCOME,
} from '../components/sources';

// Versioned keys so a future schema change can migrate (or ignore) old data.
const key = (name: string) => `expense-tracker.v1.${name}`;

const KEYS = {
  transactions: key('transactions'),
  categories: key('categories'),
  incomeCategories: key('income-categories'),
  sources: key('sources'),
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
  defaultSourceExpense: DEFAULT_SOURCE_EXPENSE,
  defaultSourceIncome: DEFAULT_SOURCE_INCOME,
};

export const loadSettings = () => read<UserSettings>(KEYS.settings, DEFAULT_SETTINGS);
export const saveSettings = (settings: UserSettings) => write(KEYS.settings, settings);

export const loadSources = () => read<Source[]>(KEYS.sources, DEFAULT_SOURCES);
export const saveSources = (sources: Source[]) => write(KEYS.sources, sources);

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
