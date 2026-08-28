// Importing a trip TWICE: mid-trip, then the finished file.
//
// The realistic sequence - load the tricount at three quarters, finish the
// trip, export again and load the whole thing - only works if the rows
// already in the ledger hash identically the second time. This pins which
// parts of that hold and which do not, because the failure is silent: a
// duplicated row looks like a real expense.
import { buildImport } from '../../src/app/lib/importData';
import type { Category } from '../../src/app/types';

const cat = (id: string, name: string, subcategories: string[] = []): Category => ({
  id, name, type: 'expense', icon: 'Plane', color: 'text-sky-600',
  bgColor: 'bg-sky-50', selectedBg: 'bg-sky-100', subcategories,
});
const cats: Category[] = [cat('travel', 'Travel', ['Food', 'Accomodation']), cat('others', 'Others')];

let failed = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failed += 1;
};

const row = (date: string, amount: number, description: string) =>
  ({ date, amount, type: 'expense' as const, category: 'Travel', subcategory: 'Food', description });

// Three quarters of the way through.
const first = { version: 1, currency: 'EUR', transactions: [
  row('2026-08-21', 26.5, 'Azzorre - Cena 1'),
  row('2026-08-22', 25.44, 'Azzorre - Pranzo Giorno 2'),
  row('2026-08-23', 13.34, 'Azzorre - Canoa'),
] };
const a = buildImport(first, cats, [], 'EUR', []);
ok(a.added === 3, `the mid-trip file imports its three rows (${a.added})`);

// Trip over: the same export plus what happened since.
const second = { version: 1, currency: 'EUR', transactions: [
  ...first.transactions,
  row('2026-08-25', 8.2, 'Azzorre - Traghetto'),
  row('2026-08-26', 23, 'Azzorre - Pranzo Chico do Norte'),
] };
const bRes = buildImport(second, cats, [], 'EUR', a.transactions);
ok(bRes.added === 2 && bRes.alreadyImported === 3,
  `re-importing the whole trip adds only what is new (${bRes.added} added, ${bRes.alreadyImported} recognised)`);

// The trip name has to be spelled the same. It is part of the description,
// and the description is part of the identity.
const renamed = { version: 1, currency: 'EUR', transactions:
  second.transactions.map((t) => ({ ...t, description: t.description.replace('Azzorre', 'Azores') })) };
const c = buildImport(renamed, cats, [], 'EUR', a.transactions);
ok(c.added === 5 && c.alreadyImported === 0,
  `renaming the trip between imports duplicates everything (${c.added} added) - the name is part of the identity`);

// The one that bites in real life: somebody is added to an old expense in
// Tricount after the first import, so MY share of it changes.
const edited = { version: 1, currency: 'EUR', transactions: [
  row('2026-08-21', 17.67, 'Azzorre - Cena 1'), // was 26.5, split three ways now
  ...second.transactions.slice(1),
] };
const d = buildImport(edited, cats, [], 'EUR', a.transactions);
ok(d.added === 3 && d.alreadyImported === 2,
  `a share edited in Tricount after the first import lands as a NEW row (${d.added} added, ${d.alreadyImported} recognised)`);
ok(
  d.transactions.some((t) => t.description === 'Azzorre - Cena 1' && Math.abs(t.amount - 17.67) < 0.01),
  'so the ledger ends up holding both the old amount and the new one - the case to warn about',
);

console.log(failed ? `\n${failed} FAILED` : '\nRe-import behaviour pinned.');
process.exit(failed ? 1 : 0);
