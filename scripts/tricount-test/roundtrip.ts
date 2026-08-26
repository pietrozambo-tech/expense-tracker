// The other half of the Tricount test: what the script writes has to be a
// file the app will actually take. Run through the REAL buildImport, with a
// category list shaped like a real one, so a format drift on either side
// shows up here rather than as a failed import on somebody's phone.
import { buildImport } from '../../src/app/lib/importData';
import type { Category } from '../../src/app/types';

const cat = (id: string, name: string, subcategories: string[] = []): Category => ({
  id,
  name,
  type: 'expense',
  icon: 'Plane',
  color: 'text-sky-600',
  bgColor: 'bg-sky-50',
  selectedBg: 'bg-sky-100',
  subcategories,
});

const expenseCats: Category[] = [
  cat('travel', 'Travel'),
  cat('food', 'Food & Drinks'),
  cat('others', 'Others'),
];

let failed = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failed += 1;
};

// Exactly the shape scripts/tricount-import.mjs writes.
const payload = {
  version: 1,
  currency: 'EUR',
  transactions: [
    { date: '2026-07-14', amount: 25, type: 'expense' as const, category: 'Food & Drinks', description: 'Dinner' },
    { date: '2026-07-15', amount: 60, type: 'expense' as const, category: 'Travel', description: 'Hotel' },
    { date: '2026-07-16', amount: 30, type: 'expense' as const, category: 'Taxi', description: 'Airport', currency: 'CHF' },
  ],
};

const res = buildImport(payload, expenseCats, [], 'EUR', []);

ok(res.added === 3, `the app accepts every row the script writes (${res.added}/3)`);
ok(res.skipped.length === 0, `and skips none of them (${res.skipped.map((s) => s.reason).join(', ') || 'none'})`);
ok(
  res.transactions.find((t) => t.description === 'Dinner')?.amount === 25,
  'my share arrives as the amount, untouched',
);
ok(
  res.transactions.find((t) => t.description === 'Airport')?.currency === 'CHF',
  'a foreign row keeps its currency for the app to convert',
);
// "Taxi" is not one of these categories: it must land in the catch-all and be
// COUNTED, which is what turns it into the review filter rather than a silent
// mis-filing.
ok(res.uncategorized === 1, `a category the user does not have is counted for review (${res.uncategorized})`);
ok(
  res.transactions.find((t) => t.description === 'Airport')?.category.name === 'Others',
  'and lands in the catch-all rather than being invented',
);

// Re-importing the same trip must not double it - the trip file is exactly
// the kind of thing somebody runs twice.
const again = buildImport(payload, expenseCats, [], 'EUR', res.transactions);
ok(again.added === 0 && again.alreadyImported === 3,
  `running the same trip twice imports nothing the second time (${again.added} added, ${again.alreadyImported} known)`);

console.log(failed ? `\n${failed} FAILED` : '\nRound-trip clean.');
process.exit(failed ? 1 : 0);
