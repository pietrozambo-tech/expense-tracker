import type { Category, RecurringRule, Source, Transaction } from '../types';

// The single source of truth for Trackly's full-backup file format - written by
// Settings > Export data and recognised again on Import (which restores it
// instead of appending). `version` lets a future import migrate or reject
// older/newer files instead of silently corrupting data.
export interface BackupFile {
  app: 'trackly';
  kind: 'backup';
  version: 1;
  exportedAt: string;
  settings: {
    userName: string;
    currency: string;
    defaultSourceExpense?: string;
    defaultSourceIncome?: string;
  };
  categories: Category[];
  incomeCategories: Category[];
  sources: Source[];
  transactions: Transaction[];
  recurringRules?: RecurringRule[]; // optional: older backups predate recurring rules
}

export function buildBackup(data: {
  userName: string;
  currency: string;
  defaultSourceExpense?: string;
  defaultSourceIncome?: string;
  categories: Category[];
  incomeCategories: Category[];
  sources: Source[];
  transactions: Transaction[];
  recurringRules?: RecurringRule[];
}): BackupFile {
  return {
    app: 'trackly',
    kind: 'backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: {
      userName: data.userName,
      currency: data.currency,
      defaultSourceExpense: data.defaultSourceExpense,
      defaultSourceIncome: data.defaultSourceIncome,
    },
    categories: data.categories,
    incomeCategories: data.incomeCategories,
    sources: data.sources,
    transactions: data.transactions,
    recurringRules: data.recurringRules ?? [],
  };
}

// Trigger a client-side download of the backup as a .json file.
export function downloadBackup(backup: BackupFile) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trackly-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Is this parsed JSON a full backup (from Export) rather than a lightweight
// import file? Restoring a backup REPLACES everything, so this must only be
// true for files we actually wrote.
//
// Deliberately does NOT sniff for a `categories`/`sources` array: an
// AI-generated import file can easily contain one, and misreading that as a
// backup would wipe the user's data instead of adding to it.
export function isBackupFile(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const o = payload as Record<string, unknown>;
  // 'expense-tracker' kept for files exported before the format was consolidated.
  return o.kind === 'backup' || o.app === 'trackly' || o.app === 'expense-tracker';
}
