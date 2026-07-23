import type { Category, Source, Transaction } from '../types';
import { DEFAULT_SOURCES } from '../components/sources';

// On-disk shape of an exported backup. `version` lets a future import migrate
// or reject older/newer files instead of silently corrupting data.
export interface BackupFile {
  app: 'expense-tracker';
  version: 1;
  exportedAt: string;
  userName: string;
  currency: string;
  transactions: Transaction[];
  categories: Category[];
  incomeCategories: Category[];
  sources: Source[];
  defaultSourceExpense?: string;
  defaultSourceIncome?: string;
}

interface BackupInput {
  userName: string;
  currency: string;
  transactions: Transaction[];
  categories: Category[];
  incomeCategories: Category[];
  sources: Source[];
  defaultSourceExpense?: string;
  defaultSourceIncome?: string;
}

export function buildBackup(data: BackupInput): BackupFile {
  return {
    app: 'expense-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    userName: data.userName,
    currency: data.currency,
    transactions: data.transactions,
    categories: data.categories,
    incomeCategories: data.incomeCategories,
    sources: data.sources,
    defaultSourceExpense: data.defaultSourceExpense,
    defaultSourceIncome: data.defaultSourceIncome,
  };
}

// Trigger a client-side download of the backup as a .json file.
export function downloadBackup(backup: BackupFile) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `expense-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const isTransaction = (t: unknown): t is Transaction => {
  if (typeof t !== 'object' || t === null) return false;
  const o = t as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.amount === 'number' &&
    typeof o.date === 'string' &&
    (o.type === 'expense' || o.type === 'income') &&
    typeof o.category === 'object' &&
    o.category !== null
  );
};

/**
 * Parse and validate a backup file's text. Throws an Error with a
 * user-readable message when the file isn't a valid backup, so the caller can
 * surface it in a toast rather than importing garbage.
 */
export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file isn't valid JSON.");
  }

  if (typeof data !== 'object' || data === null) {
    throw new Error("This file isn't an Expense Tracker backup.");
  }
  const o = data as Record<string, unknown>;

  if (o.app !== 'expense-tracker') {
    throw new Error("This file isn't an Expense Tracker backup.");
  }
  if (o.version !== 1) {
    throw new Error('This backup was made with an unsupported version.');
  }
  if (!Array.isArray(o.transactions) || !o.transactions.every(isTransaction)) {
    throw new Error('This backup is missing or has invalid transactions.');
  }
  if (!Array.isArray(o.categories) || !Array.isArray(o.incomeCategories)) {
    throw new Error('This backup is missing category data.');
  }

  // Sources were added after v1 shipped; older backups won't have them, so fall
  // back to the defaults rather than rejecting the file.
  const sources =
    Array.isArray(o.sources) && o.sources.length > 0 ? (o.sources as Source[]) : DEFAULT_SOURCES;

  return {
    app: 'expense-tracker',
    version: 1,
    exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : new Date().toISOString(),
    userName: typeof o.userName === 'string' ? o.userName : '',
    currency: typeof o.currency === 'string' ? o.currency : 'EUR',
    transactions: o.transactions as Transaction[],
    categories: o.categories as Category[],
    incomeCategories: o.incomeCategories as Category[],
    sources,
    defaultSourceExpense: typeof o.defaultSourceExpense === 'string' ? o.defaultSourceExpense : undefined,
    defaultSourceIncome: typeof o.defaultSourceIncome === 'string' ? o.defaultSourceIncome : undefined,
  };
}
