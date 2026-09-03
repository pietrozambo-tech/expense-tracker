// The import file is written by an assistant from someone's spreadsheet and
// lands straight in the ledger, so buildImport is a trust boundary. These
// scenarios feed it the shapes assistants really emit and check that a row is
// either read correctly or reported - never silently wrong.
//
// Run with:  pnpm test:import   (add --before for the pre-validation behaviour)

import { buildImport, applyImportDecision, proposalKey } from './lib/importData';
import { applyBulkCategory, applyBulkSource } from './lib/bulkEdit';
import { applyBulkTrip } from './lib/trips';
import { applyFutureEdit, processRecurrence, tagPastSeries } from './lib/recurrence';
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

  // An unknown INCOME category on an account with no income catch-all. This
  // used to skip the row - "46 skipped", no reason - which is data loss
  // wearing a tidy count. A catch-all of that type is invented instead, the
  // row lands in it, and the commit adds it to the catalogue.
  const salaryOnly = [INC[0]]; // an income list with no catch-all on it
  const rNoBucket = buildImport(
    { version: 1, transactions: [row({ type: 'income', category: 'Welfare aziendale', subcategory: '' })] } as any,
    EXP, salaryOnly, 'EUR',
  );
  expect('an income row with no income catch-all is NOT skipped', rNoBucket.skipped.length, 0);
  expect('it lands in a catch-all made for its type',
    `${rNoBucket.transactions[0]?.category?.type}/${rNoBucket.transactions[0]?.category?.name}`, 'income/Other income');
  expect('with its original name kept as the handle', rNoBucket.transactions[0]?.subcategory ?? 'none', 'Welfare aziendale');
  expect('and the new catch-all is reported for the caller to add',
    (rNoBucket.createdCategories ?? []).map((c) => `${c.type}:${c.name}`).join('|'), 'income:Other income');
  const landed = applyImportDecision(rNoBucket, EXP, salaryOnly, new Set());
  expect('committing puts it on the income list', landed.incomeCategories.some((c) => c.name === 'Other income'), true);
  expect('and not on the expense one', landed.categories.some((c) => c.name === 'Other income'), false);
  expect('the caller\'s own arrays are still untouched', salaryOnly.some((c) => c.name === 'Other income'), false);
  // Two such rows share ONE invented catch-all, not one each.
  const rTwo = buildImport(
    { version: 1, transactions: [
      row({ type: 'income', category: 'Welfare aziendale', subcategory: '' }),
      row({ type: 'income', category: 'Buoni pasto', subcategory: '' }),
    ] } as any,
    EXP, salaryOnly, 'EUR',
  );
  expect('two homeless income rows share one invented catch-all', (rTwo.createdCategories ?? []).length, 1);

  // A subcategory that repeats its category is dropped, not proposed: "Sport"
  // under Sport was on a real review sheet, asking approval for a word the
  // user already had.
  const rSame = run([row({ category: 'Groceries', subcategory: 'groceries' })]);
  expect('a subcategory equal to its category is not proposed', props(rSame).length, 0);
  expect('and the row carries none', String(rSame.transactions[0]?.subcategory), 'undefined');
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

// ── a row with no hash is still a row the ledger already has ─────────────
//
// The dedupe read t.importHash and nothing else. That field is written at
// import time and never recomputed, so a row carrying one matches perfectly -
// and a row without one is INVISIBLE to it, and the whole file comes back.
// Rows arrive without one in ordinary ways: imported before the field
// existed, synced from a device on an older build, restored from an older
// backup. Somebody re-importing a trip to pick up four new expenses got
// fifty-two duplicates.
function scenarioDedupeWithoutHash() {
  heading('10. Rows that lost their import hash are still recognised');
  const file = [
    row({ description: 'Coffee' }),
    row({ date: '2026-07-11', amount: 55, description: 'Dinner' }),
    row({ date: '2026-07-12', amount: 9, description: 'Bus' }),
  ];
  const first = buildImport({ version: 1, transactions: file } as any, EXP, INC, 'EUR', []);
  expect('three rows in, three rows out', String(first.added), '3');

  const strip = (rows: any[], ...fields: string[]) =>
    rows.map((t) => { const c = { ...t }; for (const f of fields) delete c[f]; return c; });

  const noHash = strip(first.transactions, 'importHash');
  const again = buildImport({ version: 1, transactions: file } as any, EXP, INC, 'EUR', noHash as any);
  expect('the same file against hash-less copies adds nothing',
    `${again.added}/${again.alreadyImported}`, '0/3');

  // Only what is genuinely new gets through, hash or no hash.
  const wider = [...file, row({ date: '2026-08-02', amount: 4, description: 'Gelato' })];
  const partial = buildImport({ version: 1, transactions: wider } as any, EXP, INC, 'EUR', noHash as any);
  expect('and a wider file adds only the new row',
    `${partial.added}/${partial.alreadyImported}`, '1/3');

  // The identity is the row's content, so a trip renamed IN THE APP after
  // importing keeps its stored hash and is still matched by it.
  const renamed = first.transactions.map((t) => ({ ...t, description: `Azores \u{1F1F5}\u{1F1F9} - ${t.description}` }));
  const afterRename = buildImport({ version: 1, transactions: file } as any, EXP, INC, 'EUR', renamed as any);
  expect('a trip renamed after importing does not re-import',
    `${afterRename.added}/${afterRename.alreadyImported}`, '0/3');

  // One existing row absorbs ONE file row and no more: two identical coffees
  // in the file against one in the ledger is one new coffee.
  const oneCoffee = strip([first.transactions[0]], 'importHash');
  const twoCoffees = buildImport(
    { version: 1, transactions: [row({ description: 'Coffee' }), row({ description: 'Coffee' })] } as any,
    EXP, INC, 'EUR', oneCoffee as any);
  expect('one stored row cannot stand in for two in the file',
    `${twoCoffees.added}/${twoCoffees.alreadyImported}`, '1/1');

  // And the line that was drawn deliberately stays drawn: a row TYPED BY HAND
  // carries neither field, and must never block real spending from a file.
  const typed = strip(first.transactions, 'importHash', 'importedAt');
  const vsTyped = buildImport({ version: 1, transactions: file } as any, EXP, INC, 'EUR', typed as any);
  expect('hand-typed rows still never block an import',
    `${vsTyped.added}/${vsTyped.alreadyImported}`, '3/0');
}

console.log(` Import file handling   [${OLD ? 'BEFORE validation' : 'AFTER validation'}]`);
console.log(' (running the real src/app/lib/importData.ts)');

// ── the two fields the dedupe reads must survive being edited ────────────
//
// Dedupe recognises a row by importHash, falling back to importedAt plus the
// row's own content. Both are bookkeeping the user never sees, which is
// exactly why a write path can drop one without anybody noticing until a
// re-import doubles a trip - the bug that started all this. Every path that
// rewrites a stored row is walked here, because reading them once proves
// nothing about the next edit somebody writes.
function scenarioIdentitySurvivesEdits() {
  heading('11. Editing a row never costs it its import identity');
  const seed = buildImport(
    { version: 1, transactions: [row({ description: 'Azores - Cena' })] } as any,
    EXP, INC, 'EUR', []);
  const original = seed.transactions[0] as any;
  expect('an imported row starts with both marks',
    `${!!original.importHash}/${!!original.importedAt}`, 'true/true');

  const travel = C('c1', 'Groceries', 'expense', ['Supermarket']);
  const ids = new Set([original.id]);
  const kept = (label: string, rows: any[]) => {
    const t = rows.find((x) => x.id === original.id);
    expect(label,
      `${t?.importHash === original.importHash}/${t?.importedAt === original.importedAt}`,
      'true/true');
  };

  kept('a bulk category change keeps them', applyBulkCategory([original], ids, travel, 'Supermarket'));
  kept('a bulk account change keeps them', applyBulkSource([original], ids, 'cash'));
  kept('joining a trip keeps them', applyBulkTrip([original], ids, 'Azores', travel));
  kept('leaving a trip keeps them', applyBulkTrip([original], ids, null, travel));
  kept('renaming the trip keeps them',
    applyBulkTrip([original], ids, 'Azores \u{1F1F5}\u{1F1F9}', travel));

  // The shape an in-app edit takes: the form's values spread over the row.
  kept('editing it in the app keeps them',
    [{ ...original, amount: 99, description: 'Something else', updatedAt: 'now' }]);

  // A restore re-stamps every row; it must re-stamp, not rebuild.
  kept('restoring a backup keeps them',
    [original].map((t: any) => ({ ...t, updatedAt: '2026-09-01T00:00:00.000Z' })));

  // The recurrence engine rewrites rows it did not create (legacy seeds get a
  // recurrenceOf, skips get purged) - it must leave the rest alone.
  kept('a recurrence pass keeps them',
    processRecurrence([original], [], new Date('2026-08-01')).transactions);

  // Declaring a past row recurring, and editing a series forward.
  const tagged = tagPastSeries([original], ids, 'rule-1');
  kept('back-tagging it into a series keeps them', tagged);
  const rule = {
    id: 'rule-1', rule: 'Every month', anchorDate: '2026-06-10',
    template: { description: 'Azores - Cena', amount: 10, currency: 'EUR', category: travel, type: 'expense' as const },
  };
  kept('a "this and all future" edit keeps them',
    applyFutureEdit(tagged, [rule] as any, tagged[0] as any, rule as any, { amount: 12 } as any, 'rule-2').transactions);

  // And the point of all that: the row is still recognised by its file.
  const edited = applyBulkSource(
    applyBulkTrip([original], ids, 'Azores \u{1F1F5}\u{1F1F9}', travel), ids, 'cash');
  const reimport = buildImport(
    { version: 1, transactions: [row({ description: 'Azores - Cena' })] } as any,
    EXP, INC, 'EUR', edited as any);
  expect('so re-importing the file adds nothing after all of it',
    `${reimport.added}/${reimport.alreadyImported}`, '0/1');
}

// ── the catch-all bucket is not an English word list ──────────────────────
//
// An unmatched row goes into the user's catch-all category with its original
// category kept as a subcategory, rather than being dropped. Which category
// that is was decided here by a private English-only regex, while the rest of
// the app - including the import prompt, which tells the assistant what to
// file things under - used the shared list that also knows "Altro", the name
// the Italian seed gives it. So the same file imported clean in English and
// silently lost rows in Italian.
function scenarioCatchAllLanguages() {
  heading('Unmatched rows land in the catch-all, whatever it is called');
  const wanted = row({ category: 'Dining out' });

  const en = build({ version: 1, transactions: [wanted] } as any,
    [C('c1', 'Groceries', 'expense', ['Supermarket']), C('c9', 'Others', 'expense')], INC, 'EUR');
  expect('English: an unknown category lands in Others',
    `${en.transactions.length} ${en.transactions[0]?.category?.name} ${en.transactions[0]?.subcategory}`,
    '1 Others Dining out');

  const it = build({ version: 1, transactions: [wanted] } as any,
    [C('c1', 'Spesa', 'expense', ['Supermercato']), C('c9', 'Altro', 'expense')], INC, 'EUR');
  expect('Italian: the same row lands in Altro, not skipped',
    `${it.transactions.length} ${it.transactions[0]?.category?.name} ${it.transactions[0]?.subcategory}`,
    '1 Altro Dining out');
  expect('and nothing is dropped on the way', String(it.skipped.length), '0');

  // "Varie" is the other name the shared list knows.
  const varie = build({ version: 1, transactions: [wanted] } as any,
    [C('c1', 'Spesa', 'expense'), C('c9', 'Varie', 'expense')], INC, 'EUR');
  expect('so does a ledger whose bucket is called Varie',
    `${varie.transactions.length} ${varie.transactions[0]?.category?.name}`, '1 Varie');

  // With no bucket at all, one is INVENTED and the row goes in it. This used
  // to skip the row on the reasoning that there was nowhere honest to put
  // it - and "46 skipped" with no reason, on a real import, showed what that
  // honesty was worth. A row kept in a bucket called Altro with its original
  // name on it can be sorted next month; a row dropped is gone.
  const none = build({ version: 1, transactions: [wanted] } as any,
    [C('c1', 'Spesa', 'expense')], INC, 'EUR');
  expect('with no catch-all at all, the row is kept, not skipped',
    `${none.transactions.length} ${none.skipped.length}`, '1 0');
  expect('in a catch-all invented for its type, in the app\'s language',
    `${none.transactions[0]?.category?.type}/${none.transactions[0]?.category?.name}`, 'expense/Others');
  expect('and that catch-all is handed back for the commit to add',
    (none.createdCategories ?? []).map((c) => c.name).join('|'), 'Others');
}

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
// The old copy of this file had its own regex; only the current build can pass.
if (!OLD) scenarioCatchAllLanguages();
if (!OLD) scenarioDedupeWithoutHash();
if (!OLD) scenarioIdentitySurvivesEdits();
console.log('\n================================================================');
console.log(failures === 0 ? ' All checks passed.' : ` ${failures} check(s) FAILED.`);
console.log('================================================================\n');
process.exit(failures === 0 ? 0 : 1);
