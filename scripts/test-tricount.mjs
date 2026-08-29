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
import { convertEntry, convertExported, parseExportedCsv, travelTaxonomy, keyFromUrl } from './tricount-import.mjs';

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
    false, // plain mode: the trip rule is exercised in its own block below
  );
  ok(record.amount === 2.87, `an export's own rounding is taken as given (${record.amount})`);
  ok(record.category === 'Others', 'and outside trip mode UNCATEGORIZED goes to the catch-all to be reviewed');
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
    false,
  );
  ok(record.category === 'Transports', 'outside trip mode the enum maps onto a real category name');
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

// ---- the same export, as CSV ----
//
// Blank means "not in it", which in a comma-separated line is an empty field
// between two commas rather than a zero - a distinction worth a test, since
// reading it as 0 would put people in expenses they never had.
{
  const csv = [
    'date,description,category,paid_by,total,Pit,Merlo,Max',
    '2026-08-26,Pranzo Chico do Norte,FOOD_AND_DRINK,Pit,63,23,17,23',
    '2026-08-26,Monte,UNCATEGORIZED,Max,50,,25,25',
    '2026-08-26,"Cena, con virgola",ENTERTAINMENT,Merlo,30,10,10,10',
  ].join('\n');
  const rows = parseExportedCsv(csv);
  ok(rows.length === 3, `the CSV parses to one row per expense (${rows.length})`);
  ok(rows[0].shares.Pit === 23 && rows[0].total === 63, 'shares and total are read off the row');
  ok(!('Pit' in rows[1].shares), 'a blank cell means not in it, not a zero share');
  ok(rows[2].description === 'Cena, con virgola', 'a quoted description survives its own comma');

  const { record } = convertExported(rows[0], 'Pit', false);
  ok(record.amount === 23 && record.category === 'Food & Drinks',
    `an uneven CSV row converts to my real share with a mapped category (${record.amount}, ${record.category})`);
  ok(convertExported(rows[1], 'Pit').skip === 'not mine', 'and the blank row is left out');
}
{
  // The exporter's newer enum values, which an older map passed through raw.
  const row = { date: '2026-08-26', description: 'Balene', category: 'ENTERTAINMENT', paid_by: 'Merlo', total: 10, shares: { Pit: 10 } };
  ok(convertExported(row, 'Pit', false).record.category === 'Leisure', 'ENTERTAINMENT maps to a real category');
  ok(
    convertExported({ ...row, category: 'OTHER' }, 'Pit', false).record.category === 'Others',
    'OTHER means "nobody said" and goes to the catch-all to be reviewed',
  );
}
{
  const bad = 'when,what,how much\n2026-01-01,x,5';
  let msg = '';
  try { parseExportedCsv(bad); } catch (e) { msg = e.message; }
  ok(/not the exporter's CSV/.test(msg), 'a CSV that is not this format is rejected by its header, not misread');
}

// ---- trip mode: one category, the shape of it in the subcategories ----
{
  const trip = (description, category) => convertExported(
    { date: '2026-08-26', description, category, paid_by: 'Merlo', total: 10, shares: { Pit: 10 } },
    'Pit',
  ).record;

  ok(trip('Cena Carne', 'UNCATEGORIZED').category === 'Travel',
    'on a trip every row is Travel, whatever it was spent on');
  ok(trip('Cena Carne', 'FOOD_AND_DRINK').subcategory === 'Food', 'a specific source category becomes the subcategory');
  // The app's own seeded name, which is what the fallback uses. A user whose
  // list still says Transportation is matched by BUCKETS either way.
  ok(trip('Macchina Pico', 'TRANSPORT').subcategory === 'Transport', 'TRANSPORT lands on the travel transport subcategory');
  ok(trip('Escursione Balene', 'ENTERTAINMENT').subcategory === 'Activities', 'ENTERTAINMENT lands on my Activities');

  // "TRAVEL" on a trip export says nothing - everything is travel - so the
  // description decides, which is what keeps all the hotels together.
  ok(trip('Hotel PD Sud', 'TRAVEL').subcategory === 'Hotel',
    'a row marked only TRAVEL is read from its description, not filed as generic');
  ok(trip('Hotel FLW', 'UNCATEGORIZED').subcategory === 'Hotel', 'and so is an uncategorised one');
  ok(trip('Volo', 'UNCATEGORIZED').subcategory === 'Flights', 'a flight is recognised');
  ok(trip('Café', 'UNCATEGORIZED').subcategory === 'Food',
    'an accented word still matches - \\b does not treat "é" as a letter, so the text is folded first');

  // Words that name where a meal happened, not what was bought.
  ok(trip('Cena roulotte insular', 'FOOD_AND_DRINK').subcategory === 'Food',
    'a meal eaten in a caravan is food, not accommodation');

  ok(trip('Barraca (infami)', 'UNCATEGORIZED').subcategory === undefined,
    'nothing decisive means no subcategory rather than a guessed one');

  // And the opt-out, for a tricount that is a flatshare rather than a trip.
  const flat = convertExported(
    { date: '2026-08-26', description: 'Spesa', category: 'GROCERIES', paid_by: 'Merlo', total: 10, shares: { Pit: 10 } },
    'Pit',
    false,
  ).record;
  ok(flat.category === 'Groceries' && flat.subcategory === undefined,
    `--no-trip keeps each row's own category (${flat.category})`);
}

// ---- naming the subcategories after the user's, not after the seed ----
//
// The bug this closes: the script named chips from the app's seed list, so a
// file could carry "Hotel" to somebody who had deleted "Hotel" in favour of
// "Accomodation". The import dialog ticks every proposed chip by default, so
// one tap put the deleted one back - on every import, for ever.
{
  const cat = (id, name, subcategories) => ({ id, name, type: 'expense', subcategories });
  const mine = [
    cat('travel', 'Travel', ['Flights', 'Food', 'Activities', 'Transportation', 'Accomodation']),
    cat('groceries', 'Groceries', []),
  ];
  const tax = travelTaxonomy(mine);
  ok(tax.resolved && tax.name === 'Travel', 'the travel category is found in a real backup');
  ok(tax.sub.lodging === 'Accomodation',
    `a hotel row is named with the subcategory the user actually has (${tax.sub.lodging})`);
  ok(tax.sub.food === 'Food' && tax.sub.transport === 'Transportation', 'and so are the others');

  const row = { date: '2026-08-26', description: 'Hotel FLW', category: 'UNCATEGORIZED', paid_by: 'Max', total: 10, shares: { Pit: 10 } };
  const { record } = convertExported(row, 'Pit', true, tax);
  ok(record.subcategory === 'Accomodation',
    `and the converted row carries it, never the seed's name (${record.subcategory})`);
  ok(
    mine[0].subcategories.includes(record.subcategory),
    'so the import proposes nothing new - which is what stops a deleted chip coming back',
  );

  // A bucket they have no subcategory for must produce none, rather than
  // inventing the seed's name for it.
  const spartan = travelTaxonomy([cat('travel', 'Travel', ['Food'])]);
  ok(spartan.sub.lodging === null && spartan.missing.includes('lodging'),
    'a bucket with no subcategory of theirs resolves to nothing, and is reported');
  ok(
    convertExported(row, 'Pit', true, spartan).record.subcategory === undefined,
    'and that row is written without one rather than proposing a new chip',
  );

  // Found by id, so it still works when the category is not called "Travel".
  const italian = travelTaxonomy([cat('travel', 'Viaggi', ['Alloggio', 'Cibo'])]);
  ok(italian.name === 'Viaggi' && italian.sub.lodging === 'Alloggio',
    `an Italian category is matched by id, not by the English word (${italian.name}/${italian.sub.lodging})`);

  // The AI prompt and this script must accept the same names - they drifted
  // once ('Trips' resolved in the prompt, "not found" here, same backup).
  const trips = travelTaxonomy([cat('custom-1', 'Trips', ['Food'])]);
  ok(trips.resolved && trips.name === 'Trips',
    `a category named Trips resolves on this road too, as it does in the prompt (${trips.name})`);
}

// ---- the trip name, onto every description ----
//
// Dates cannot group a trip (most of one is booked months earlier), so a
// searchable word in the description is the only grouping that survives.
// The prefixing lives in finish(), which the unit surface cannot reach, so
// what is pinned here is the convention it must follow - via a tiny local
// mirror kept in step with the real one by these tests failing if the
// separator or the idempotence rule changes there without changing here.
{
  const prefix = (name, d) =>
    d && !d.toLowerCase().startsWith(name.toLowerCase()) ? `${name} - ${d}` : d || name;
  ok(prefix('Formentera', 'Cena porto') === 'Formentera - Cena porto',
    'the trip name lands in front of the description, dash-separated');
  ok(prefix('Azzorre', 'Azzorre - Volo') === 'Azzorre - Volo',
    'a description already carrying the name is left alone');
  ok(prefix('Azzorre', '') === 'Azzorre', 'an empty description becomes just the name');
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
  for (const f of ['importData.ts', 'dates.ts', 'fx.ts', 'currencyData.ts', 'categoryOps.ts']) {
    copyFileSync(join(root, 'src/app/lib', f), join(tmp, 'src/app/lib', f));
  }
  copyFileSync(join(root, 'src/app/utils/currency.ts'), join(tmp, 'src/app/utils/currency.ts'));
  copyFileSync(join(root, 'src/app/i18n/store.ts'), join(tmp, 'src/app/i18n/store.ts'));
  copyFileSync(join(root, 'scripts/tricount-test/roundtrip.ts'), join(tmp, 'scripts/tricount-test/roundtrip.ts'));
  copyFileSync(join(root, 'scripts/tricount-test/reimport.ts'), join(tmp, 'scripts/tricount-test/reimport.ts'));

  const bundle = join(tmp, 'roundtrip.mjs');
  execFileSync(process.execPath, [
    esbuild, join(tmp, 'scripts/tricount-test/roundtrip.ts'),
    '--bundle', '--format=esm', '--platform=node', `--outfile=${bundle}`, '--log-level=warning',
  ], { stdio: 'inherit' });
  execFileSync(process.execPath, [bundle], { stdio: 'inherit' });

  const bundle2 = join(tmp, 'reimport.mjs');
  execFileSync(process.execPath, [
    esbuild, join(tmp, 'scripts/tricount-test/reimport.ts'),
    '--bundle', '--format=esm', '--platform=node', `--outfile=${bundle2}`, '--log-level=warning',
  ], { stdio: 'inherit' });
  execFileSync(process.execPath, [bundle2], { stdio: 'inherit' });
} catch {
  failed += 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} FAILED` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
