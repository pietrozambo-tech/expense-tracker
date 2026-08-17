// The import file is written by an assistant from someone's spreadsheet and
// lands straight in the ledger, so buildImport is a trust boundary. These
// scenarios feed it the shapes assistants really emit and check that a row is
// either read correctly or reported - never silently wrong.
//
// Run with:  pnpm test:import   (add --before for the pre-validation behaviour)

import { buildImport, applyImportDecision, proposalKey } from './lib/importData';
import { parseLocalDate } from './lib/dates';
import { homeAmount } from './utils/currency';
import type { Category } from './types';

const OLD = process.argv.includes('--before');

const C = (id: string, name: string, type: 'expense' | 'income', subs: string[] = []): Category =>
  ({ id, name, icon: 'X', color: '', bgColor: '', selectedBg: '', type, subcategories: subs });
const EXP = [C('c1', 'Groceries', 'expense', ['Supermarket']), C('c9', 'Others', 'expense')];
const INC = [C('i1', 'Salary', 'income'), C('i9', 'Others', 'income')];

const heading = (s: string) => console.log(`\n${s}\n${'-'.repeat(s.length)}`);
const say = (s: string) => console.log('   ' + s);

let failures = 0;
function expect(label: string, actual: string, expected: string) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`\n   ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  console.log(`         expected: ${expected}`);
  if (!ok) console.log(`         actual:   ${actual}`);
}

// The pre-validation buildImport, copied faithfully from the old source: a
// number-typed amount, truthiness for the rest, and everything else stored
// verbatim. Written out in full rather than wrapping the fixed function, so
// --before really does reproduce what the old code did.
function buildImportBefore(payload: any, exp: Category[], inc: Category[], fallback: string): any {
  const CATCHALL = /^(other|others|miscellaneous|misc|uncategori[sz]ed)$/i;
  const clone = (cs: Category[]) => cs.map((c) => ({ ...c, subcategories: c.subcategories ? [...c.subcategories] : c.subcategories }));
  const e = clone(exp);
  const i = clone(inc);
  const findCat = (name: string, type: string) =>
    (type === 'income' ? i : e).find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
  const findCatchAll = (type: string) => (type === 'income' ? i : e).find((c) => CATCHALL.test(c.name.trim()));
  const transactions: any[] = [];
  const skipped: any[] = [];
  let uncategorized = 0;
  for (const rec of payload.transactions || []) {
    if (!rec || typeof rec.amount !== 'number' || !rec.date || !rec.category || !rec.type) {
      skipped.push({ record: rec, reason: 'missing required field' });
      continue;
    }
    if (rec.amount === 0) { skipped.push({ record: rec, reason: 'zero amount' }); continue; }
    let cat = findCat(rec.category, rec.type);
    let subHint = rec.subcategory;
    if (!cat) {
      const bucket = findCatchAll(rec.type);
      if (!bucket) { skipped.push({ record: rec, reason: `unknown ${rec.type} category "${rec.category}"` }); continue; }
      cat = bucket;
      if (!subHint || !subHint.trim()) subHint = rec.category;
    }
    if (CATCHALL.test(cat.name.trim())) uncategorized++;
    let subcategory: string | undefined;
    if (subHint && subHint.trim()) {
      const sub = subHint.trim();
      const list = cat.subcategories || [];
      const existing = list.find((x) => x.toLowerCase() === sub.toLowerCase());
      if (existing) subcategory = existing;
      else { cat.subcategories = [...list, sub]; subcategory = sub; }
    }
    // The old passthrough: row currency only when it is an exact known key,
    // otherwise the file's code verbatim - unvalidated.
    const KNOWN: Record<string, boolean> = { EUR: true, USD: true, GBP: true, CHF: true, JPY: true };
    const rowCurrency = rec.currency && KNOWN[rec.currency] ? rec.currency : payload.currency || fallback;
    transactions.push({
      id: 'old-' + transactions.length,
      description: (rec.description || '').trim(),
      amount: rec.amount,          // NaN / Infinity pass straight through
      category: cat, subcategory,
      date: rec.date,              // stored verbatim, however malformed
      type: rec.type,              // stored verbatim, however capitalised
      currency: rowCurrency,
      baseAmount: rec.amount,
      recurrence: 'Never repeat',
      sourceId: rec.source || undefined,
    });
  }
  return { transactions, categories: e, incomeCategories: i, added: transactions.length, defaulted: 0, uncategorized, skipped };
}

const build = OLD ? buildImportBefore : buildImport;

const row = (over: any = {}) => ({ date: '2026-07-10', amount: 10, type: 'expense', category: 'Groceries', ...over });
const run = (rows: any[], extra: any = {}) => build({ version: 1, transactions: rows, ...extra } as any, EXP, INC, 'EUR');

/** How a row actually lands: the date it will be filed under, and its home value. */
const landed = (r: ReturnType<typeof buildImport>) => {
  if (r.added === 0) return `skipped(${r.skipped[0]?.reason ?? 'none'})`;
  const t = r.transactions[0];
  const d = parseLocalDate(t.date);
  return `${isNaN(d.getTime()) ? 'InvalidDate' : d.toISOString().slice(0, 10)} ${t.type} ${homeAmount(t, 'EUR')}`;
};

// ---------------------------------------------------------------------------

function scenarioDates() {
  heading('1. Dates that are not YYYY-MM-DD');
  say(`"10/07/2026" -> ${landed(run([row({ date: '10/07/2026' })]))}`);
  expect('an ambiguous DD/MM vs MM/DD date is refused, not guessed',
    landed(run([row({ date: '10/07/2026' })])), 'skipped(unreadable date "10/07/2026")');
  expect('an impossible date is refused', landed(run([row({ date: '2026-13-45' })])),
    'skipped(unreadable date "2026-13-45")');
  expect('30 February is refused', landed(run([row({ date: '2026-02-30' })])),
    'skipped(unreadable date "2026-02-30")');
  expect('a single-digit month/day is accepted and padded',
    landed(run([row({ date: '2026-7-5' })])), '2026-07-05 expense 10');
}

function scenarioType() {
  heading('2. type in the wrong case');
  expect('"Expense" is understood', landed(run([row({ type: 'Expense' })])), '2026-07-10 expense 10');
  expect('"Income" stays income - not counted as spending',
    landed(run([row({ type: 'Income', category: 'Salary' })])), '2026-07-10 income 10');
  expect('a type that is neither is refused', landed(run([row({ type: 'transfer' })])),
    'skipped(unknown type "transfer")');
}

function scenarioAmount() {
  heading('3. Amounts that are not plain numbers');
  expect('NaN never reaches the ledger', landed(run([row({ amount: NaN })])),
    'skipped(unreadable amount "NaN")');
  expect('Infinity never reaches the ledger', landed(run([row({ amount: Infinity })])),
    'skipped(unreadable amount "Infinity")');
  expect('a numeric string is read', landed(run([row({ amount: '42.50' })])), '2026-07-10 expense 42.5');
  expect('a decimal comma is read', landed(run([row({ amount: '42,50' })])), '2026-07-10 expense 42.5');
  expect('thousands separators are read', landed(run([row({ amount: '1,234.56' })])),
    '2026-07-10 expense 1234.56');
  expect('a negative amount still means a refund', landed(run([row({ amount: -20 })])),
    '2026-07-10 expense -20');
  expect('zero is skipped as before', landed(run([row({ amount: 0 })])), 'skipped(zero amount)');
}

function scenarioCurrency() {
  heading('4. Currency codes');
  expect('a lowercase row code is understood', landed(run([row({ currency: 'usd' })])),
    '2026-07-10 expense ' + String(homeAmount({ amount: 10, currency: 'USD' } as any, 'EUR')));
  const unknown = run([row()], { currency: 'EURO' });
  expect('an unknown file code falls back to the user\'s own',
    unknown.transactions[0]?.currency ?? 'none', 'EUR');
}

function scenarioNothingSilent() {
  heading('5. Every row is either imported or reported - none vanish');
  const rows = [
    row(),                                   // fine
    row({ date: '10/07/2026' }),             // bad date
    row({ type: 'transfer' }),               // bad type
    row({ amount: NaN }),                    // bad amount
    row({ amount: 0 }),                      // zero
    row({ category: 'Nonexistent' }),        // falls back to Others
  ];
  const r = run(rows);
  say(`added ${r.added}, skipped ${r.skipped.length}, of ${rows.length} rows`);
  expect('added + skipped accounts for every row', String(r.added + r.skipped.length), String(rows.length));
  expect('the unmatched category is counted for review', String(r.uncategorized), '1');
}

function scenarioTotalsStayFinite() {
  heading('6. A bad row cannot poison the totals');
  const r = run([row({ amount: 10 }), row({ amount: NaN }), row({ amount: 20 })]);
  const total = r.transactions.reduce((s, t) => s + homeAmount(t, 'EUR'), 0);
  say(`total across imported rows = ${total}`);
  expect('the total is a real number', String(Number.isFinite(total)), 'true');
  expect('and it is the sum of the readable rows', String(total), '30');
}


// What actually got committed, uniformly for both builds: the old one already
// "decided" by silently mutating; the current one decides via the review step.
const committed = (r: any, approved: Set<string>) =>
  OLD
    ? { transactions: r.transactions, categories: r.categories, incomeCategories: r.incomeCategories }
    : applyImportDecision(r, EXP, INC, approved);
const props = (r: any) => ((r.proposedSubcategories ?? []) as any[]);
const allKeys = (r: any) => new Set(props(r).map(proposalKey));
const chips = (cats: any[], id: string) => (cats.find((c) => c.id === id)?.subcategories ?? []).join(',');

function scenarioProposals() {
  heading('7. Imports propose subcategories, never commit them');

  const r = run([
    row({ subcategory: 'Tobacco', category: 'Others' }),
    row({ subcategory: 'tobacco', category: 'Others' }), // same, different case
    row({ subcategory: 'supermarket' }), // exists on Groceries (as "Supermarket")
  ]);
  expect('an unknown subcategory becomes a proposal (deduped, rows counted)',
    props(r).map((p) => `${p.name}@${p.categoryName}x${p.rows}`).join('|'), 'Tobacco@Othersx2');
  expect('an existing chip is matched (normalised), not proposed',
    r.transactions[2]?.subcategory ?? 'none', 'Supermarket');

  const declined = committed(r, new Set());
  expect('declined: the category list gains nothing', chips(declined.categories, 'c9'), '');
  expect('declined: rows import without the subcategory',
    String(declined.transactions[0]?.subcategory), 'undefined');
  expect('declined: the row itself still lands, categorised',
    declined.transactions[0]?.category?.name ?? 'none', 'Others');

  const approved = committed(r, allKeys(r));
  expect('approved: the chip is added once, first-seen spelling', chips(approved.categories, 'c9'), 'Tobacco');
  expect('approved: rows keep their subcategory', approved.transactions[0]?.subcategory ?? 'none', 'Tobacco');
  expect('the user\'s own arrays are never touched in place', chips(EXP, 'c9'), '');
}

function scenarioProposalEdges() {
  heading('8. Proposal edge cases');

  // Unknown category: lands in the catch-all, original name proposed as the
  // re-sorting handle - approval still required.
  const r = run([row({ category: 'Vices', subcategory: '' })]);
  expect('unknown category falls back to the catch-all', r.transactions[0]?.category?.name ?? 'none', 'Others');
  expect('and its original name is proposed, not committed',
    props(r).map((p) => `${p.name}@${p.categoryName}`).join('|'), 'Vices@Others');
  const declined = committed(r, new Set());
  expect('declining it keeps the row, in Others, unlabelled',
    `${declined.transactions[0]?.category?.name}/${String(declined.transactions[0]?.subcategory)}`, 'Others/undefined');

  // Income side: proposals carry their list, approval lands on the right one.
  const ri = run([row({ type: 'income', category: 'Salary', subcategory: 'Bonus' })]);
  expect('an income proposal knows its side', props(ri).map((p) => `${p.type}:${p.name}`).join('|'), 'income:Bonus');
  const ok = committed(ri, allKeys(ri));
  expect('approving it grows the income category', chips(ok.incomeCategories, 'i1'), 'Bonus');
  expect('and leaves the expense side alone', chips(ok.categories, 'c1'), 'Supermarket');
}

console.log('\n================================================================');

function scenarioDedupe() {
  heading('9. Overlapping exports never double-count');
  const file = [
    row({ description: 'Coffee' }),
    row({ description: 'Coffee' }), // a real second coffee, same day
    row({ date: '2026-07-11', amount: 55, description: 'Dinner' }),
  ];
  const first = buildImport({ version: 1, transactions: file } as any, EXP, INC, 'EUR', []);
  expect('two identical rows in ONE file are two real coffees', String(first.added), '3');
  expect('and each carries its own identity',
    String(new Set(first.transactions.map((t) => t.importHash)).size), '3');
  const again = buildImport({ version: 1, transactions: file } as any, EXP, INC, 'EUR', first.transactions);
  expect('the same file again adds nothing', String(again.added), '0');
  expect('and says why', String(again.alreadyImported), '3');
  const wider = [...file, row({ date: '2026-08-01', amount: 12, description: 'Cinema' })];
  const overlap = buildImport({ version: 1, transactions: wider } as any, EXP, INC, 'EUR', first.transactions);
  expect('a wider export adds only what is genuinely new', `${overlap.added}/${overlap.alreadyImported}`, '1/3');
  // A hand-typed twin never blocks the import - across-door dedupe would
  // silently drop real spending on a guess.
  const manual = [{ ...first.transactions[2], id: 'manual', importHash: undefined, importedAt: undefined }];
  const vsManual = buildImport({ version: 1, transactions: [file[2]] } as any, EXP, INC, 'EUR', manual as any);
  expect('a hand-typed twin does not block the row', `${vsManual.added}/${vsManual.alreadyImported}`, '1/0');
  // Case and spacing noise in a bank's description is still the same row.
  const noisy = buildImport({ version: 1, transactions: [row({ description: '  COFFEE ' })] } as any, EXP, INC, 'EUR', first.transactions);
  expect('description case/whitespace noise is still a duplicate', String(noisy.alreadyImported), '1');
}

console.log(` Import file handling   [${OLD ? 'BEFORE validation' : 'AFTER validation'}]`);
console.log(' (running the real src/app/lib/importData.ts)');
console.log('================================================================');
scenarioDates();
scenarioType();
scenarioAmount();
scenarioCurrency();
scenarioNothingSilent();
scenarioTotalsStayFinite();
scenarioProposals();
scenarioProposalEdges();
// Dedupe exists only in the current build - nothing to compare --before.
if (!OLD) scenarioDedupe();
console.log('\n================================================================');
console.log(failures === 0 ? ' All checks passed.' : ` ${failures} check(s) FAILED.`);
console.log('================================================================\n');
process.exit(failures === 0 ? 0 : 1);
