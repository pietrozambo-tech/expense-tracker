import type { Transaction, Category, TransactionType } from '../types';
import { convertAmount, BASE_CURRENCY } from '../utils/currency';

// A single transaction in the lightweight import format. Categories are
// referenced by *name* (not the full object) so the file is easy to generate
// from a spreadsheet; buildImport() resolves them against the user's own
// category list at import time.
export interface ImportRecord {
  date: string; // YYYY-MM-DD
  amount: number; // expenses positive; a negative expense is a refund/credit
  type: TransactionType;
  category: string; // category name, matched case-insensitively
  subcategory?: string; // added to the category if it doesn't exist yet
  description?: string;
  source?: string; // source id (e.g. 'revolut'); optional
}

export interface ImportPayload {
  version?: number;
  currency?: string; // ISO code applied to every row unless overridden
  transactions: ImportRecord[];
}

export interface ImportResult {
  transactions: Transaction[]; // new transactions, ready to prepend
  categories: Category[]; // expense categories (may gain new subcategories)
  incomeCategories: Category[]; // income categories (may gain new subcategories)
  added: number;
  skipped: { record: ImportRecord; reason: string }[];
}

function uid() {
  return `imp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

const cloneCats = (cats: Category[]): Category[] =>
  cats.map((c) => ({ ...c, subcategories: c.subcategories ? [...c.subcategories] : c.subcategories }));

/**
 * Turn a lightweight ImportPayload into app Transactions.
 *
 * - Category names are matched case-insensitively against the user's current
 *   expense/income categories. Unmatched rows are skipped (and reported).
 * - A subcategory that doesn't exist on its category is added to it, so custom
 *   subcategories (e.g. "Betting") come across as first-class chips.
 * - Nothing is mutated: fresh category arrays are returned for the caller to
 *   persist alongside the new transactions.
 */
export function buildImport(
  payload: ImportPayload,
  expenseCats: Category[],
  incomeCats: Category[],
  fallbackCurrency: string
): ImportResult {
  const exp = cloneCats(expenseCats);
  const inc = cloneCats(incomeCats);

  const findCat = (name: string, type: TransactionType) => {
    const list = type === 'income' ? inc : exp;
    const n = name.trim().toLowerCase();
    return list.find((c) => c.name.trim().toLowerCase() === n);
  };

  const transactions: Transaction[] = [];
  const skipped: { record: ImportRecord; reason: string }[] = [];

  for (const rec of payload.transactions || []) {
    if (!rec || typeof rec.amount !== 'number' || !rec.date || !rec.category || !rec.type) {
      skipped.push({ record: rec, reason: 'missing required field' });
      continue;
    }
    const cat = findCat(rec.category, rec.type);
    if (!cat) {
      skipped.push({ record: rec, reason: `unknown ${rec.type} category "${rec.category}"` });
      continue;
    }

    let subcategory: string | undefined;
    if (rec.subcategory && rec.subcategory.trim()) {
      const sub = rec.subcategory.trim();
      const list = cat.subcategories || [];
      const existing = list.find((s) => s.toLowerCase() === sub.toLowerCase());
      if (existing) {
        subcategory = existing; // normalise to the existing spelling
      } else {
        cat.subcategories = [...list, sub]; // add the new subcategory
        subcategory = sub;
      }
    }

    transactions.push({
      id: uid(),
      description: (rec.description || '').trim(),
      amount: rec.amount,
      category: cat,
      subcategory,
      date: rec.date,
      type: rec.type,
      currency: payload.currency || fallbackCurrency,
      baseAmount: convertAmount(rec.amount, payload.currency || fallbackCurrency, BASE_CURRENCY),
      recurrence: 'Never repeat',
      sourceId: rec.source || undefined,
    });
  }

  return { transactions, categories: exp, incomeCategories: inc, added: transactions.length, skipped };
}
