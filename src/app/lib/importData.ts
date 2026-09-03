import type { Transaction, Category, TransactionType } from '../types';
import { CATCHALL_RE } from './categoryOps';
import { convertAmount, BASE_CURRENCY, CURRENCIES } from '../utils/currency';
import { getLanguage } from '../i18n/store';

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
  // Rows the ledger already holds from an earlier import - same date, type,
  // amount, currency and description. Counted, not listed: a re-imported
  // statement can be hundreds of rows, and the one thing the user needs to
  // know is that none of them double-counted.
  alreadyImported: number;
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
  // Catch-all categories this import had to invent because the user had none
  // of that type to fall back on. The caller adds them to the catalogue when
  // it commits. Usually empty; on a first income import it is the one that
  // keeps 46 salary rows from vanishing.
  createdCategories: Category[];
}

// The catch-all bucket comes from categoryOps, not a second list here.
//
// This file kept its own English-only copy, and the Italian seed names that
// category "Altro". So an unmatched row on an Italian ledger found no bucket
// and was SKIPPED - silently dropped, where the same row on an English ledger
// landed in Others with its original category kept as a subcategory. The
// import prompt reads the shared list, so it had been telling the assistant to
// file things under a bucket the importer could not find.

/**
 * The stable identity of an imported row, for dedupe across imports.
 *
 * Bank exports overlap - "last 3 months" in October shares two months with the
 * same export pulled in September - and one-step imports invite pulling the
 * same file twice. The fields are the ones every export format carries;
 * description is case- and whitespace-folded, then FNV-hashed so a long memo
 * does not bloat every stored row.
 *
 * The occurrence counter is what keeps this honest for REAL duplicates: two
 * identical coffees on the same day in one file are two coffees (the second
 * hashes with "#2"), but re-importing that file finds both hashes taken and
 * skips both. Manual entries never carry a hash, so hand-typed rows can never
 * block an import - across-door dedupe is a harder problem than same-door,
 * and guessing at it would silently drop real spending.
 */
export function importHashOf(
  date: string,
  type: TransactionType,
  amount: number,
  currency: string,
  description: string,
): string {
  const desc = description.trim().toLowerCase().replace(/\s+/g, ' ');
  let h = 0x811c9dc5;
  for (let i = 0; i < desc.length; i++) {
    h ^= desc.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${date}|${type}|${amount}|${currency}|${h.toString(36)}`;
}

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
  fallbackCurrency: string,
  // The ledger as it stands, for dedupe. Only rows that carry an importHash
  // participate - see importHashOf.
  existing: Transaction[] = []
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
  // Catch-alls invented for a type the catalogue has none of. Kept HERE, not
  // pushed into the caller's arrays: those are the app's live state, and an
  // import that quietly appended to them would be committing before the
  // review screen. The caller adds these when it commits.
  const created: Category[] = [];
  const madeCatchAll: Partial<Record<TransactionType, Category>> = {};
  let alreadyImported = 0;
  // What the ledger already holds, indexed by every key a row could be
  // recognised under - and CLAIMED one for one, so an existing row can absorb
  // at most one row from the file.
  //
  // This used to read `t.importHash` and nothing else. That field is written
  // at import time and never recomputed, so a row that has one is matched
  // perfectly - and a row that has none is invisible to the dedupe, which
  // re-adds the whole file. Rows arrive without one in ordinary ways: imported
  // before the field existed, synced from a device on an older build, restored
  // from an older backup, or typed by hand. Someone re-importing their trip to
  // pick up four new expenses got fifty-two duplicates.
  //
  // The stored hash IS a content key - date, type, amount, currency and a hash
  // of the description - so the fix is to compute the same key from the row
  // itself when the field is missing, rather than to invent a second notion of
  // sameness. A row registers under both when they differ, which is what keeps
  // a trip renamed AFTER importing still recognisable: its stored hash still
  // describes the description the file has.
  const claimed = new Set<number>();
  const byKey = new Map<string, number[]>();
  existing.forEach((t, i) => {
    // Only rows that came from a FILE take part. A hand-typed row that happens
    // to match one must still never block an import - that call was made
    // deliberately, and it stands: across-door dedupe would silently drop real
    // spending on a guess. importedAt is what tells the two apart, and every
    // imported row has carried it for longer than the hash has existed, which
    // is why it can rescue rows the hash cannot.
    if (!t.importHash && !t.importedAt) return;
    const keys = new Set<string>();
    // The within-file occurrence suffix is not part of the identity; two
    // identical rows are told apart by there being two of them, below.
    if (t.importHash) keys.add(t.importHash.replace(/#\d+$/, ''));
    keys.add(importHashOf(t.date, t.type ?? 'expense', t.amount, t.currency || fallbackCurrency, t.description ?? ''));
    for (const k of keys) {
      const list = byKey.get(k);
      if (list) list.push(i);
      else byKey.set(k, [i]);
    }
  });
  /** True when an unclaimed existing row answers to this key, claiming it. */
  const claimExisting = (key: string): boolean => {
    const list = byKey.get(key);
    if (!list) return false;
    const hit = list.find((i) => !claimed.has(i));
    if (hit === undefined) return false;
    claimed.add(hit);
    return true;
  };
  // How many times each base hash has appeared in THIS file, for the
  // occurrence counter.
  const fileSeen = new Map<string, number>();
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
    // Per-row currency wins over the file's; an unrecognised code on either
    // falls through to the user's own, rather than being stored as-is and
    // leaving a transaction the app cannot price or format. Resolved before
    // dedupe because the currency is part of a row's identity.
    const rowCurrency = normaliseCurrency(rec.currency) || fileCurrency || fallbackCurrency;

    // Dedupe against earlier imports, before any category work: a duplicate
    // is a duplicate whatever it would have been filed as.
    const baseHash = importHashOf(date, type, amount, rowCurrency, rec.description || '');
    if (claimExisting(baseHash)) {
      alreadyImported++;
      continue;
    }
    // Not already in the ledger. The suffix keeps two identical rows in ONE
    // file distinguishable in storage; matching strips it again.
    const n = (fileSeen.get(baseHash) ?? 0) + 1;
    fileSeen.set(baseHash, n);
    const rowHash = n === 1 ? baseHash : `${baseHash}#${n}`;

    // Resolve the category. If the name doesn't match one of the user's
    // categories, fall back to a catch-all ("Others") rather than dropping the
    // row — and remember the original label as a subcategory so the intent
    // isn't lost. Only skip if there's no catch-all bucket at all.
    let cat = findCat(rec.category, type);
    let subHint = rec.subcategory;
    if (!cat) {
      // No category of that name: the catch-all takes it, and the original
      // name rides along as a subcategory so the intent is not lost.
      //
      // And if there is no catch-all of that TYPE, one is made. This used
      // to skip the row instead, which read as tidy and was data loss: a
      // first income import on an account with expense categories only
      // dropped every salary row and reported "46 skipped" with no reason.
      // An import is never the place to lose a row over a name.
      let bucket = findCatchAll(type) ?? madeCatchAll[type];
      if (!bucket) {
        bucket = catchAllFor(type);
        madeCatchAll[type] = bucket;
        created.push(bucket);
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
      } else if (sub.toLowerCase() === cat.name.trim().toLowerCase()) {
        // "Sport" under Sport. A subcategory that repeats its category says
        // nothing, and proposing it as a new chip - which a real import did
        // - asks the user to approve a word they already have.
        subcategory = undefined;
      } else {
        // Not one of the user's chips: keep the name on the row, and propose it.
        subcategory = sub;
        const k = proposalKey({ type, categoryId: cat.id, name: sub });
        const p = proposals.get(k);
        if (p) p.rows++;
        else proposals.set(k, { categoryId: cat.id, categoryName: cat.name, type, name: sub, rows: 1 });
      }
    }

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
      importHash: rowHash,
      updatedAt: importedAt,
      // Everything in one file arrives together; within a day they keep the
      // order the file had.
      createdAt: importedAt,
    });
  }

  return {
    transactions,
    added: transactions.length,
    alreadyImported,
    defaulted,
    uncategorized,
    skipped,
    proposedSubcategories: [...proposals.values()],
    createdCategories: created,
  };
}

/** A catch-all for a type the catalogue has none for. The same shape and
 *  name reassignToOthers makes, so the app has one idea of "Others". */
function catchAllFor(type: TransactionType): Category {
  return {
    id: `others-${type}-${Date.now().toString(36)}`,
    name: type === 'income'
      ? (getLanguage() === 'it' ? 'Altre entrate' : 'Other income')
      : (getLanguage() === 'it' ? 'Altro' : 'Others'),
    icon: 'MoreHorizontal',
    color: 'text-neutral-500',
    bgColor: 'bg-neutral-50',
    selectedBg: 'bg-neutral-100',
    subcategories: [],
    type,
    updatedAt: new Date().toISOString(),
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
  // The catch-alls the import had to invent become real here, on the list
  // of their type, so the rows filed under them have somewhere to be.
  for (const c of result.createdCategories ?? []) {
    const list = c.type === 'income' ? inc : exp;
    if (!list.some((x) => x.id === c.id)) list.push({ ...c, subcategories: [...(c.subcategories ?? [])] });
  }

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
