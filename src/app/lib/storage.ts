import type { Category, RecurringRule, Source, Transaction, UserSettings } from '../types';
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
  recurringRules: key('recurring-rules'),
  // The last state this device and the cloud agreed on, plus that state's
  // version stamp. Kept across launches so the next hydrate can three-way
  // merge (and tell an offline addition apart from a remote deletion) instead
  // of taking the cloud wholesale.
  syncBase: key('sync-base'),
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
  hasSeenIntro: false,
  defaultSourceExpense: DEFAULT_SOURCE_EXPENSE,
  defaultSourceIncome: DEFAULT_SOURCE_INCOME,
};

export const loadSettings = () => read<UserSettings>(KEYS.settings, DEFAULT_SETTINGS);
export const saveSettings = (settings: UserSettings) => write(KEYS.settings, settings);

export const loadSources = () => read<Source[]>(KEYS.sources, DEFAULT_SOURCES);
export const saveSources = (sources: Source[]) => write(KEYS.sources, sources);

export const loadTransactions = () => read<Transaction[]>(KEYS.transactions, []);

export const loadRecurringRules = () => read<RecurringRule[]>(KEYS.recurringRules, []);
export const saveRecurringRules = (rules: RecurringRule[]) => write(KEYS.recurringRules, rules);
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

// ── Sync base ───────────────────────────────────────────────────────────────

export interface SyncBase {
  payload: unknown;
  version: string | null;
}

export const loadSyncBase = (): SyncBase | null => read<SyncBase | null>(KEYS.syncBase, null);
export const saveSyncBase = (base: SyncBase | null) => {
  if (base === null) {
    try {
      localStorage.removeItem(KEYS.syncBase);
    } catch {
      /* storage unavailable */
    }
    return;
  }
  write(KEYS.syncBase, base);
};
