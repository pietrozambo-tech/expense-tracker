import type { Transaction, Category, TransactionType } from '../types';
import { convertAmount, BASE_CURRENCY, CURRENCIES } from '../utils/currency';

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
  currency?: string; // ISO code for this row; overrides the payload currency (e.g. a foreign purchase)
}

export interface ImportPayload {
  version?: number;
  currency?: string; // ISO code applied to every row unless a row overrides it
  transactions: ImportRecord[];
}

export interface ImportResult {
  transactions: Transaction[]; // new transactions, ready to prepend
  categories: Category[]; // expense categories (may gain new subcategories)
  incomeCategories: Category[]; // income categories (may gain new subcategories)
  added: number;
  defaulted: number; // rows whose category didn't match and fell back to a catch-all
  skipped: { record: ImportRecord; reason: string }[];
}

// A category name that acts as the catch-all bucket for anything unmatched.
const CATCHALL_RE = /^(other|others|miscellaneous|misc|uncategori[sz]ed)$/i;

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
  const findCatchAll = (type: TransactionType) =>
    (type === 'income' ? inc : exp).find((c) => CATCHALL_RE.test(c.name.trim()));

  const transactions: Transaction[] = [];
  const skipped: { record: ImportRecord; reason: string }[] = [];
  let defaulted = 0;

  for (const rec of payload.transactions || []) {
    if (!rec || typeof rec.amount !== 'number' || !rec.date || !rec.category || !rec.type) {
      skipped.push({ record: rec, reason: 'missing required field' });
      continue;
    }
    // Resolve the category. If the name doesn't match one of the user's
    // categories, fall back to a catch-all ("Others") rather than dropping the
    // row — and remember the original label as a subcategory so the intent
    // isn't lost. Only skip if there's no catch-all bucket at all.
    let cat = findCat(rec.category, rec.type);
    let subHint = rec.subcategory;
    if (!cat) {
      const bucket = findCatchAll(rec.type);
      if (!bucket) {
        skipped.push({ record: rec, reason: `unknown ${rec.type} category "${rec.category}"` });
        continue;
      }
      cat = bucket;
      if (!subHint || !subHint.trim()) subHint = rec.category; // keep the original name as a subcategory
      defaulted++;
    }

    let subcategory: string | undefined;
    if (subHint && subHint.trim()) {
      const sub = subHint.trim();
      const list = cat.subcategories || [];
      const existing = list.find((s) => s.toLowerCase() === sub.toLowerCase());
      if (existing) {
        subcategory = existing; // normalise to the existing spelling
      } else {
        cat.subcategories = [...list, sub]; // add the new subcategory
        subcategory = sub;
      }
    }

    // Per-row currency wins over the file-level currency; ignore an unknown code.
    const rowCurrency =
      rec.currency && CURRENCIES[rec.currency] ? rec.currency : payload.currency || fallbackCurrency;

    transactions.push({
      id: uid(),
      description: (rec.description || '').trim(),
      amount: rec.amount,
      category: cat,
      subcategory,
      date: rec.date,
      type: rec.type,
      currency: rowCurrency,
      baseAmount: convertAmount(rec.amount, rowCurrency, BASE_CURRENCY),
      recurrence: 'Never repeat',
      sourceId: rec.source || undefined,
    });
  }

  return { transactions, categories: exp, incomeCategories: inc, added: transactions.length, defaulted, skipped };
}
