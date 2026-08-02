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
import { getItem, hydrate, removeItem, setItem } from './kv';

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
  // Whether the user chose to skip signing in. Durable with the rest: losing it
  // doesn't lose data, but it drops a guest back on the sign-in screen for no
  // reason they can see.
  guest: key('guest'),
};

/**
 * Pull the durable store into memory before the app reads any of it.
 *
 * Only does anything in the native shell, where localStorage can be evicted by
 * iOS and the real store is behind an async bridge. See lib/kv.ts.
 */
export const hydrateStorage = () => hydrate(Object.values(KEYS));

function read<T>(storageKey: string, fallback: T): T {
  try {
    const raw = getItem(storageKey);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(storageKey: string, value: unknown) {
  try {
    setItem(storageKey, JSON.stringify(value));
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

// ── Guest mode ──────────────────────────────────────────────────────────────

export const loadGuest = () => getItem(KEYS.guest) === 'true';
export const saveGuest = (guest: boolean) => {
  if (guest) setItem(KEYS.guest, 'true');
  else removeItem(KEYS.guest);
};

export function clearAllData() {
  try {
    // The guest flag is deliberately kept: erasing your data is not the same as
    // signing out of the app you are still standing in.
    Object.entries(KEYS)
      .filter(([name]) => name !== 'guest')
      .forEach(([, storageKey]) => removeItem(storageKey));
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
