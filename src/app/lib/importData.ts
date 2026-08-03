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

// A subcategory the file wants that the user does not have. The import never
// creates it on its own: categories and subcategories are the user's structure,
// and nothing enters it without an explicit yes (the review sheet). Rows keep
// the proposed name on their `subcategory` field until the decision is applied.
export interface ProposedSubcategory {
  categoryId: string;
  categoryName: string;
  type: TransactionType; // which list the category lives in
  name: string; // first-seen spelling from the file
  rows: number; // how many imported rows carry it
}

/** Stable identity of a proposal, for approve/decline bookkeeping. */
export const proposalKey = (p: { type: TransactionType; categoryId: string; name: string }) =>
  `${p.type}:${p.categoryId}:${p.name.trim().toLowerCase()}`;

export interface ImportResult {
  transactions: Transaction[]; // new transactions, ready to prepend
  added: number;
  defaulted: number; // rows whose category didn't match and fell back to a catch-all
  // Rows that ended up in the catch-all bucket HOWEVER they got there - the
  // app's own fallback, or an AI that pre-mapped them to "Others" before the
  // file ever arrived. This is the number the user acts on: transactions
  // waiting to be given a real category.
  uncategorized: number;
  skipped: { record: ImportRecord; reason: string }[];
  // Subcategories the file references that the user does not have. Empty for
  // most files; when not, the caller shows the review sheet before committing.
  proposedSubcategories: ProposedSubcategory[];
}

// A category name that acts as the catch-all bucket for anything unmatched.
const CATCHALL_RE = /^(other|others|miscellaneous|misc|uncategori[sz]ed)$/i;

function uid() {
  return `imp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// Everything below validates at the boundary, because the file is written by
// an AI from someone's spreadsheet and lands straight in the ledger. A row that
// cannot be read is reported, never guessed at: a wrong date or a flipped sign
// is worse than a row the user is told about and fixes by hand.

/** 'YYYY-M-D' -> 'YYYY-MM-DD'. Null for anything not a real calendar date. */
function normaliseDate(raw: unknown): string | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(raw ?? '').trim());
  if (!m) return null; // includes '10/07/2026', which is ambiguous by nature
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return null;
  if (d > new Date(y, mo, 0).getDate()) return null; // 31 April, 30 February
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * A finite number, from a number or the numeric string an assistant often
 * emits. NaN and Infinity are rejected: `typeof NaN === 'number'` let them
 * through, and one of them turns every total in the app into NaN.
 */
function normaliseAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  let s = raw.trim().replace(/[\s ]/g, '');
  // "1,234.56" -> thousands separators; "1234,56" -> decimal comma.
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 'Income' / ' expense ' -> the canonical value. Null if it is neither. */
function normaliseType(raw: unknown): TransactionType | null {
  const t = String(raw ?? '').trim().toLowerCase();
  return t === 'expense' || t === 'income' ? t : null;
}

/** A supported ISO code, case-insensitively. Null if we do not know it. */
function normaliseCurrency(raw: unknown): string | null {
  const c = String(raw ?? '').trim().toUpperCase();
  return c && CURRENCIES[c] ? c : null;
}

/**
 * Turn a lightweight ImportPayload into app Transactions.
 *
 * - Category names are matched case-insensitively against the user's current
 *   expense/income categories. Unmatched rows fall back to the catch-all (and
 *   are reported); only rows with no catch-all at all are skipped.
 * - The user's categories are READ, never changed. A subcategory the file
 *   references that the user does not have becomes a proposal in the result;
 *   it only turns into a real chip if applyImportDecision() is told so.
 *   (It used to be added silently, which grew the user's taxonomy behind
 *   their back - and any later loss of the chip left "ghost" subcategories
 *   visible in trends but absent from Settings.)
 */
export function buildImport(
  payload: ImportPayload,
  expenseCats: Category[],
  incomeCats: Category[],
  fallbackCurrency: string
): ImportResult {
  const findCat = (name: string, type: TransactionType) => {
    const list = type === 'income' ? incomeCats : expenseCats;
    const n = name.trim().toLowerCase();
    return list.find((c) => c.name.trim().toLowerCase() === n);
  };
  const findCatchAll = (type: TransactionType) =>
    (type === 'income' ? incomeCats : expenseCats).find((c) => CATCHALL_RE.test(c.name.trim()));

  // Proposals, deduped case-insensitively per category, counting their rows.
  const proposals = new Map<string, ProposedSubcategory>();

  const transactions: Transaction[] = [];
  const skipped: { record: ImportRecord; reason: string }[] = [];
  let defaulted = 0;
  let uncategorized = 0;
  // One stamp for the whole batch: "this import" is a thing the user can
  // find again as a group.
  const importedAt = new Date().toISOString();

  // Applied to every row that doesn't override it - validated once, here, so an
  // unknown code cannot reach a transaction and break its formatting.
  const fileCurrency = normaliseCurrency(payload.currency);

  for (const rec of payload.transactions || []) {
    if (!rec || !rec.category) {
      skipped.push({ record: rec, reason: 'missing required field' });
      continue;
    }
    const date = normaliseDate(rec.date);
    if (!date) {
      // Never guessed at: '10/07/2026' is October in one country and July in
      // another, and silently picking one puts money in the wrong month.
      skipped.push({ record: rec, reason: `unreadable date "${rec.date}"` });
      continue;
    }
    const type = normaliseType(rec.type);
    if (!type) {
      // Left unchecked, "Income" (capitalised) stored verbatim and every
      // `type === 'income'` test in the app missed it - income counted as
      // spending, with the sign flipped everywhere.
      skipped.push({ record: rec, reason: `unknown type "${rec.type}"` });
      continue;
    }
    const amount = normaliseAmount(rec.amount);
    if (amount === null) {
      skipped.push({ record: rec, reason: `unreadable amount "${rec.amount}"` });
      continue;
    }
    // The add form refuses a 0 amount, and the importer holds the same line:
    // a zero-amount transaction moves no money and only clutters the list.
    // (Split-expense exports produce these for rows that were fully paid
    // back.) Negative stays allowed - that is how refunds are recorded.
    if (amount === 0) {
      skipped.push({ record: rec, reason: 'zero amount' });
      continue;
    }
    // Resolve the category. If the name doesn't match one of the user's
    // categories, fall back to a catch-all ("Others") rather than dropping the
    // row — and remember the original label as a subcategory so the intent
    // isn't lost. Only skip if there's no catch-all bucket at all.
    let cat = findCat(rec.category, type);
    let subHint = rec.subcategory;
    if (!cat) {
      const bucket = findCatchAll(type);
      if (!bucket) {
        skipped.push({ record: rec, reason: `unknown ${type} category "${rec.category}"` });
        continue;
      }
      cat = bucket;
      if (!subHint || !subHint.trim()) subHint = rec.category; // keep the original name as a subcategory
      defaulted++;
    }

    if (CATCHALL_RE.test(cat.name.trim())) uncategorized++;

    let subcategory: string | undefined;
    if (subHint && subHint.trim()) {
      const sub = subHint.trim();
      const list = cat.subcategories || [];
      const existing = list.find((s) => s.toLowerCase() === sub.toLowerCase());
      if (existing) {
        subcategory = existing; // normalise to the existing spelling
      } else {
        // Not one of the user's chips: keep the name on the row, and propose it.
        subcategory = sub;
        const k = proposalKey({ type, categoryId: cat.id, name: sub });
        const p = proposals.get(k);
        if (p) p.rows++;
        else proposals.set(k, { categoryId: cat.id, categoryName: cat.name, type, name: sub, rows: 1 });
      }
    }

    // Per-row currency wins over the file's; an unrecognised code on either
    // falls through to the user's own, rather than being stored as-is and
    // leaving a transaction the app cannot price or format.
    const rowCurrency = normaliseCurrency(rec.currency) || fileCurrency || fallbackCurrency;

    transactions.push({
      id: uid(),
      description: (rec.description || '').trim(),
      amount,
      category: cat,
      subcategory,
      date,
      type,
      currency: rowCurrency,
      baseAmount: convertAmount(amount, rowCurrency, BASE_CURRENCY),
      recurrence: 'Never repeat',
      sourceId: rec.source || undefined,
      importedAt,
      updatedAt: importedAt,
    });
  }

  return {
    transactions,
    added: transactions.length,
    defaulted,
    uncategorized,
    skipped,
    proposedSubcategories: [...proposals.values()],
  };
}

const cloneCats = (cats: Category[]): Category[] =>
  cats.map((c) => ({ ...c, subcategories: c.subcategories ? [...c.subcategories] : c.subcategories }));

/**
 * Apply the user's review decision to an import.
 *
 * Approved proposals become real chips on their categories; the rows keep
 * their subcategory. Declined ones add nothing: their rows import with the
 * subcategory stripped - still categorised, still findable under the
 * "Imported" filter, they just don't grow the user's structure.
 *
 * Nothing is mutated: fresh arrays come back for the caller to persist.
 */
export function applyImportDecision(
  result: ImportResult,
  expenseCats: Category[],
  incomeCats: Category[],
  approvedKeys: ReadonlySet<string>
): { transactions: Transaction[]; categories: Category[]; incomeCategories: Category[] } {
  const exp = cloneCats(expenseCats);
  const inc = cloneCats(incomeCats);

  const declined = new Set<string>();
  for (const p of result.proposedSubcategories) {
    const k = proposalKey(p);
    if (!approvedKeys.has(k)) {
      declined.add(k);
      continue;
    }
    const cat = (p.type === 'income' ? inc : exp).find((c) => c.id === p.categoryId);
    if (!cat) continue; // category vanished between build and decision
    const list = cat.subcategories || [];
    if (!list.some((s) => s.toLowerCase() === p.name.toLowerCase())) {
      cat.subcategories = [...list, p.name];
      // A chip the user just approved is an edit like any other: the stamp is
      // what carries it past a stale copy on another device.
      cat.updatedAt = new Date().toISOString();
    }
  }

  const transactions = result.transactions.map((t) => {
    if (!t.subcategory) return t;
    const k = proposalKey({ type: t.type, categoryId: t.category.id, name: t.subcategory });
    return declined.has(k) ? { ...t, subcategory: undefined } : t;
  });

  return { transactions, categories: exp, incomeCategories: inc };
}
