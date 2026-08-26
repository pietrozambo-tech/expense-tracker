// The Tricount conversion, against hand-built entries.
//
// The live API cannot be reached from a test, and would need somebody's real
// trip even if it could - so what is exercised here is the part that decides
// what a row MEANS: whose money it was, how much of it was mine, and which
// rows are not spending at all. Those are the decisions that would otherwise
// misstate a holiday quietly.
import { execFileSync } from 'node:child_process';
import { copyFileSync, globSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertEntry, convertExported, keyFromUrl } from './tricount-import.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failed += 1;
};
// Problems are returned rather than thrown, so one run can report all of them
// instead of sending you round the loop per bad row.
const refuses = (result, kind, msg) => {
  const got = result.problem?.kind;
  ok(got === kind, `${msg}${got === kind ? '' : ` (got ${got ?? JSON.stringify(result)})`}`);
};

const who = (name) => ({ RegistryMembershipNonUser: { alias: { display_name: name } } });
const money = (value, currency = 'EUR') => ({ value: String(value), currency });

// Amounts arrive signed from the payer's point of view, which is why every
// fixture here carries the negatives the API actually sends.
const expense = ({ desc = 'Dinner', date = '2026-07-14', total = 100, shares, currency = 'EUR', category = 'Food & drinks', type = 'NORMAL' }) => ({
  id: 1,
  description: desc,
  date: `${date} 20:15:00.000000`,
  type_transaction: type,
  amount: money(-total, currency),
  category,
  membership_owned: who('Pietro'),
  allocations: Object.entries(shares).map(([name, v]) => ({
    membership: who(name),
    amount: money(-v, currency),
    type: 'AMOUNT',
  })),
});

// An even four-way split: the classic case, and the one where paying does not
// mean spending. Pietro fronted 100 and consumed 25.
{
  const { record } = convertEntry(
    expense({ total: 100, shares: { Pietro: 25, Anna: 25, Luca: 25, Sara: 25 } }),
    'Pietro',
    'EUR',
  );
  ok(record.amount === 25, `an even four-way split records my share, not what I paid (${record.amount})`);
  ok(record.type === 'expense' && record.date === '2026-07-14', 'with the date and type carried across');
  ok(record.currency === undefined, 'and no per-row currency when it matches the file');
}

// Uneven splits are the whole reason for reading allocations rather than
// dividing by the number of people.
{
  const { record } = convertEntry(
    expense({ desc: 'Hotel', total: 300, shares: { Pietro: 120, Anna: 120, Luca: 60 } }),
    'Luca',
    'EUR',
  );
  ok(record.amount === 60, `an uneven split reads the real allocation (${record.amount})`);
}

// Settling up is money moving between people. Counting it as spending would
// double the trip.
{
  const r = convertEntry(
    expense({ desc: 'Anna pays Pietro', total: 75, shares: { Pietro: 75 }, type: 'BALANCE' }),
    'Pietro',
    'EUR',
  );
  ok(r.skip === 'settlement', 'settling up is not spending and is left out');
}

// An expense somebody else had, that I was not part of.
{
  const r = convertEntry(
    expense({ total: 40, shares: { Anna: 20, Luca: 20 } }),
    'Pietro',
    'EUR',
  );
  ok(r.skip === 'not mine', 'a round I was not in is left out');
}

// Fully paid back: a zero-amount row is clutter, not spending.
{
  const r = convertEntry(
    expense({ total: 40, shares: { Pietro: 0, Anna: 40 } }),
    'Pietro',
    'EUR',
  );
  ok(r.skip === 'zero share', 'a zero share is left out rather than imported as 0');
}

// Foreign currency travels as spent; TracklyLab does its own conversion.
{
  const { record } = convertEntry(
    expense({ desc: 'Taxi', total: 60, shares: { Pietro: 30, Anna: 30 }, currency: 'CHF' }),
    'Pietro',
    'EUR',
  );
  ok(record.amount === 30 && record.currency === 'CHF',
    `a foreign row keeps its own currency and is not pre-converted (${record.amount} ${record.currency})`);
}

// Thirds do not divide cleanly, and a ledger should not carry 33.33333333333.
{
  const { record } = convertEntry(
    expense({ total: 100, shares: { Pietro: 33.333333333, Anna: 33.333333333, Luca: 33.333333334 } }),
    'Pietro',
    'EUR',
  );
  ok(record.amount === 33.33, `a third is rounded to cents (${record.amount})`);
}

// The failures that must stop the run rather than produce a number.
refuses(
  convertEntry(expense({ total: 100, shares: { Pietro: 25, Anna: 25 } }), 'Pietro', 'EUR'),
  'does not reconcile',
  'shares that do not add up to the expense total stop the run',
);
refuses(
  convertEntry(expense({ total: 10, shares: { Pietro: 10 }, type: 'SOMETHING_NEW' }), 'Pietro', 'EUR'),
  'unknown type',
  'an unrecognised entry type stops the run instead of being assumed',
);
// INCOME is the one that caught me out: it was on an invented list of things
// to skip quietly, which would have dropped real rows without a word. Only
// NORMAL and BALANCE are confirmed by working clients; everything else, this
// one included, has to be identified before it is treated.
refuses(
  convertEntry(expense({ total: 50, shares: { Pietro: 50 }, type: 'INCOME' }), 'Pietro', 'EUR'),
  'unknown type',
  'INCOME is surfaced rather than silently dropped as a guessed-at settlement',
);
refuses(
  convertEntry({ ...expense({ total: 10, shares: { Pietro: 10 } }), date: 'last tuesday' }, 'Pietro', 'EUR'),
  'bad date',
  'an unreadable date stops the run',
);
refuses(
  convertEntry({ ...expense({ total: 10, shares: { Pietro: 10 } }), allocations: [] }, 'Pietro', 'EUR'),
  'no allocations',
  'an entry with no allocations stops the run',
);

// ---- the offline road: a JSON export from tricount-exporter.pages.dev ----
//
// Shapes taken from a real trip, because that is where the awkward rows come
// from. Its `shares` are COSTS; the neighbouring format everyone assumes
// (Splitwise) puts BALANCES in the same place, and reading one as the other
// gives wrong numbers that look entirely reasonable.
const exported = (o) => ({ date: '2026-08-26', category: 'UNCATEGORIZED', paid_by: 'Merlo', ...o });

{
  // Three-way with the odd cent, exactly as the exporter writes it.
  const { record } = convertExported(
    exported({ description: 'Toast', total: 8.6, shares: { Pit: 2.87, Merlo: 2.87, Max: 2.86 } }),
    'Pit',
  );
  ok(record.amount === 2.87, `an export's own rounding is taken as given (${record.amount})`);
  ok(record.category === 'Others', 'and UNCATEGORIZED goes to the catch-all to be reviewed, not to a guess');
}
{
  // Somebody else paid, and the whole thing was mine.
  const { record } = convertExported(
    exported({ description: 'Whale 2', total: 66.78, shares: { Pit: 66.78 } }),
    'Pit',
  );
  ok(record.amount === 66.78, 'an expense somebody else paid entirely for me is entirely my spending');
}
{
  const r = convertExported(exported({ description: 'Monte', total: 50, shares: { Merlo: 25, Max: 25 } }), 'Pit');
  ok(r.skip === 'not mine', 'a row I am not in is left out');
}
{
  const { record } = convertExported(
    exported({ description: 'Cena tramonto brutto', total: 18.5, shares: { Pit: 11, Max: 7.5 } }),
    'Pit',
  );
  ok(record.amount === 11, `an uneven split is read as written, not divided by heads (${record.amount})`);
}
{
  const { record } = convertExported(
    exported({ description: 'Macchina Pico', category: 'TRANSPORT', total: 230, shares: { Pit: 76.67, Merlo: 76.66, Max: 76.67 } }),
    'Pit',
  );
  ok(record.category === 'Transports', 'the exporter category enum maps onto a real category name');
}
refuses(
  convertExported(exported({ description: 'Broken', total: 100, shares: { Pit: 10, Merlo: 10 } }), 'Pit'),
  'does not reconcile',
  'an export whose shares do not add up stops the run just the same',
);

// Both roads must produce the same shape, or only one of them is really tested.
{
  const viaApi = convertEntry(expense({ total: 100, shares: { Pietro: 25, Anna: 25, Luca: 25, Sara: 25 } }), 'Pietro', 'EUR').record;
  const viaFile = convertExported(exported({ description: 'Dinner', total: 100, shares: { Pietro: 25, Anna: 25, Luca: 25, Sara: 25 } }), 'Pietro').record;
  ok(
    JSON.stringify(Object.keys(viaApi).sort()) === JSON.stringify(Object.keys(viaFile).sort()),
    `the API road and the export road write the same record shape (${Object.keys(viaFile).sort().join(', ')})`,
  );
}

// Tricount has used more than one link shape.
ok(keyFromUrl('https://tricount.com/t/AbCdEf123') === 'AbCdEf123', 'the key is read from a /t/ link');
ok(keyFromUrl('https://www.tricount.com/AbCdEf123') === 'AbCdEf123', 'and from a bare link');
ok(keyFromUrl('https://tricount.com/t/AbCdEf123?utm_source=x') === 'AbCdEf123', 'and survives a tracking query');

// And then the round trip, against the app's real importer. Same assembly
// trick as test-import.mjs: esbuild is only resolvable as a binary here.
const esbuild = globSync(join(root, 'node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild'))[0];
if (!esbuild) {
  console.error('\ntricount-test: esbuild binary not found under node_modules/.pnpm');
  process.exit(1);
}

console.log('');
const tmp = mkdtempSync(join(tmpdir(), 'tricount-test-'));
try {
  mkdirSync(join(tmp, 'src/app/lib'), { recursive: true });
  mkdirSync(join(tmp, 'src/app/utils'), { recursive: true });
  mkdirSync(join(tmp, 'src/app/i18n'), { recursive: true });
  mkdirSync(join(tmp, 'scripts/tricount-test'), { recursive: true });
  copyFileSync(join(root, 'src/app/types.ts'), join(tmp, 'src/app/types.ts'));
  for (const f of ['importData.ts', 'dates.ts', 'fx.ts', 'currencyData.ts']) {
    copyFileSync(join(root, 'src/app/lib', f), join(tmp, 'src/app/lib', f));
  }
  copyFileSync(join(root, 'src/app/utils/currency.ts'), join(tmp, 'src/app/utils/currency.ts'));
  copyFileSync(join(root, 'src/app/i18n/store.ts'), join(tmp, 'src/app/i18n/store.ts'));
  copyFileSync(join(root, 'scripts/tricount-test/roundtrip.ts'), join(tmp, 'scripts/tricount-test/roundtrip.ts'));

  const bundle = join(tmp, 'roundtrip.mjs');
  execFileSync(process.execPath, [
    esbuild, join(tmp, 'scripts/tricount-test/roundtrip.ts'),
    '--bundle', '--format=esm', '--platform=node', `--outfile=${bundle}`, '--log-level=warning',
  ], { stdio: 'inherit' });
  execFileSync(process.execPath, [bundle], { stdio: 'inherit' });
} catch {
  failed += 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} FAILED` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
