// Trips are read out of the ledger, not stored in it, so the whole feature is
// only as good as the grouping. The cases below are the ones that pull against
// each other: the Azores is ONE trip spread over five months of booking dates,
// Formentera in two summers is TWO trips under one name, and a New Year trip
// is one trip across a year boundary. A rule that gets any two of those right
// and the third wrong is easy to write by accident.

import {
  applyBulkTrip,
  detectTrips,
  isTripName,
  travelCategoryOf,
  tripBodyOf,
  tripChoicesFor,
  tripMergeTarget,
  tripNameOf,
  tripOfDescription,
  tripSpan,
  withTripName,
} from '../../src/app/lib/trips';
import type { Category, Transaction } from '../../src/app/types';

let failed = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failed += 1;
};

const cat = (id: string, name: string, type: 'expense' | 'income' = 'expense'): Category => ({
  id, name, type, icon: 'Plane', color: 'text-sky-600',
  bgColor: 'bg-sky-50', selectedBg: 'bg-sky-100', subcategories: ['Hotel', 'Food', 'Flights'],
});
const travel = cat('travel', 'Travel');
const transport = cat('trans', 'Transportation');
const salary = cat('sal', 'Salary', 'income');

let seq = 0;
const tx = (date: string, description: string, over: Partial<Transaction> = {}): Transaction => ({
  id: `t${seq++}`, date, description, amount: 10, type: 'expense',
  currency: 'EUR', category: travel, ...over,
});
const amountOf = (t: Transaction) => t.amount;
const run = (rows: Transaction[]) => detectTrips(rows, travel, amountOf);

// ── what counts as a name ─────────────────────────────────────────────────
ok(tripNameOf('Azores - Cena porto') === 'Azores', 'the name is what stands before " - "');
ok(tripNameOf('Milano-Roma treno') === null, 'a hyphen without spaces is a place, not a trip');
ok(tripNameOf('Cena') === null, 'no separator, no trip');
ok(tripNameOf('- Cena') === null, 'nothing before the separator is not a name');
ok(
  tripNameOf('Weekend lungo con i ragazzi - Cena') === null,
  'half a sentence before a dash is a description, not a trip name',
);
ok(tripNameOf('Formentera 2025 - Cena') === 'Formentera 2025', 'a couple of words is fine');
ok(tripBodyOf('Azores - Cena porto') === 'Cena porto', 'the body is what is left');
ok(tripBodyOf('Cena porto') === 'Cena porto', 'and an unprefixed description is all body');

// ── and back again ────────────────────────────────────────────────────────
// The description field takes the two halves apart to show the name as a
// chip, so the join has to put back exactly what came off - anything else and
// editing a description quietly moves the row out of its trip.
ok(withTripName('Azores', 'Cena porto') === 'Azores - Cena porto', 'the halves go back together');
ok(withTripName('Azores', '') === 'Azores', 'an empty body leaves the name bare, not a dangling dash');
ok(withTripName(' Azores ', ' Cena ') === 'Azores - Cena', 'and both halves are trimmed');
// The description field's whole trick: split for display, join on save. Any
// description carrying a name has to survive the round trip untouched.
for (const d of ['Azores - Cena porto', 'Azores 🇵🇹 - Extra night', 'Formentera 2025 - Volo']) {
  ok(withTripName(tripNameOf(d)!, tripBodyOf(d)) === d, `"${d}" survives being taken apart and put back`);
}

// ── the travel category is found the way the prompt finds it ──────────────
ok(travelCategoryOf([cat('travel', 'Anything')])!.id === 'travel', 'by id first');
ok(travelCategoryOf([cat('x', 'Viaggi')])!.id === 'x', 'then by name, so a renamed one still works');
ok(travelCategoryOf([cat('x', 'Groceries')]) === null, 'and nothing else passes for it');

// ── the Azores: one trip, five months of dates ────────────────────────────
//
// The real shape of the user's import: 6 rows in March (flights, a car), 2 in
// June (a hotel), 32 in August (the trip itself).
{
  const rows: Transaction[] = [];
  for (let i = 0; i < 6; i++) rows.push(tx('2026-03-13', `Azores - Volo ${i}`, { subcategory: 'Flights', amount: 50 }));
  for (let i = 0; i < 2; i++) rows.push(tx('2026-06-28', `Azores - Hotel ${i}`, { subcategory: 'Hotel', amount: 100 }));
  for (let i = 0; i < 32; i++) rows.push(tx('2026-08-21', `Azores - Cena ${i}`, { subcategory: 'Food', amount: 10 }));

  const trips = run(rows);
  ok(trips.length === 1, `five months of dates are still one trip (${trips.length})`);
  ok(trips[0].month === '2026-08', `and it is called by its peak, not its first date (${trips[0].month})`);
  ok(trips[0].rows.length === 40, 'every row belongs to it, bookings included');
  ok(trips[0].total === 820, `the total is the whole trip (${trips[0].total})`);
  ok(
    trips[0].parts.map((p) => `${p.name}:${p.amount}`).join(',') === 'Flights:300,Food:320,Hotel:200'
      .split(',').sort((a, b) => Number(b.split(':')[1]) - Number(a.split(':')[1])).join(','),
    `the breakdown is by subcategory, biggest first (${trips[0].parts.map((p) => p.name).join(', ')})`,
  );
}

// ── which trip to offer, and on what evidence ─────────────────────────────
//
// The description field proposes a trip only when it has a reason. NEAR is
// that reason: the date falls inside the dates the trip's own rows cover. The
// rest are offered as merely possible, and the flag is what lets the screen
// stay quiet when there is nothing to say.
{
  const rows: Transaction[] = [];
  // The Azores again: booked in March, a hotel in June, the trip in August.
  for (let i = 0; i < 6; i++) rows.push(tx('2026-03-13', `Azores - Volo ${i}`, { amount: 50 }));
  for (let i = 0; i < 2; i++) rows.push(tx('2026-06-28', `Azores - Hotel ${i}`, { amount: 100 }));
  for (let i = 0; i < 32; i++) rows.push(tx('2026-08-21', `Azores - Cena ${i}`, { amount: 10 }));
  // A short one in May, entirely inside the Azores' booking-to-trip stretch.
  for (let i = 0; i < 4; i++) rows.push(tx('2026-05-16', `Trieste - Cena ${i}`, { amount: 25 }));
  const trips = run(rows);

  const span = tripSpan(trips.find((t) => t.name === 'Azores')!);
  ok(span.from === '2026-03-13' && span.to === '2026-08-21',
    `a trip's span is its first row to its last (${span.from} → ${span.to})`);

  const on = (date: string) => tripChoicesFor(trips, date);
  const named = (date: string) => on(date).map((c) => `${c.trip.name}${c.near ? '*' : ''}`).join(',');

  ok(named('2026-08-22') === 'Azores*,Trieste', 'a date in the middle of a trip proposes it, and marks it as evidence');
  ok(on('2026-08-24')[0].near, 'three days past the last row still counts as inside');
  ok(!on('2026-08-30')[0].near, 'nine days past it does not');
  ok(on('2026-08-30').length === 2, 'though both trips are still offered, just without the claim');

  // May 16 sits inside BOTH spans - Trieste's own, and the Azores' long
  // booking stretch. The one the month is named after has to lead, or the
  // trip you are actually on loses to the one you booked flights for.
  ok(named('2026-05-16') === 'Trieste*,Azores*', 'two trips can both be near, and the closer peak leads');

  ok(tripChoicesFor(trips, '2026-08-22', 1).length === 1, 'the list is capped');
  ok(tripChoicesFor([], '2026-08-22').length === 0, 'no trips, nothing to offer');

  // ── is this description actually in a trip? ─────────────────────────────
  // The description field cuts the name off the front and shows it as a chip.
  // It may only do that for a name that names a real trip: otherwise typing
  // " - " into a travel expense would split the sentence you are writing and
  // claim you had joined a trip that does not exist.
  ok(tripOfDescription('Azores - Cena porto', trips) === 'Azores', 'a real trip name is recognised');
  ok(tripOfDescription('AZORES - Cena', trips) === 'AZORES',
    'matched case-insensitively, but handed back as the row spells it');
  ok(tripOfDescription('Volo - andata', trips) === null, 'a prefix naming no trip is just a description');
  ok(tripOfDescription('Cena porto', trips) === null, 'and so is one with no prefix at all');
  ok(tripOfDescription('Azores - Cena', []) === null, 'with no trips in the ledger, nothing is in one');
}

// ── Formentera twice: one name, two trips ─────────────────────────────────
{
  const rows: Transaction[] = [];
  for (let i = 0; i < 14; i++) rows.push(tx('2025-08-10', `Formentera - Cena ${i}`, { amount: 20 }));
  for (let i = 0; i < 3; i++) rows.push(tx('2025-06-02', `Formentera - Volo ${i}`, { amount: 80 }));
  for (let i = 0; i < 18; i++) rows.push(tx('2026-07-11', `Formentera - Pranzo ${i}`, { amount: 15 }));
  for (let i = 0; i < 3; i++) rows.push(tx('2026-05-04', `Formentera - Hotel ${i}`, { amount: 120 }));

  const trips = run(rows);
  ok(trips.length === 2, `the same name in two summers is two trips (${trips.length})`);
  ok(trips.map((t) => t.month).join(',') === '2026-07,2025-08', 'each called by its own peak, newest first');
  ok(trips[0].rows.length === 21 && trips[1].rows.length === 17,
    'and each summer keeps its own bookings');
}

// ── a trip across New Year stays one trip ─────────────────────────────────
//
// December and January are a month apart, so the second month never becomes a
// peak of its own however many rows it holds. This is the case the All years
// filter was built for; splitting it here would undo that.
{
  const rows: Transaction[] = [];
  for (let i = 0; i < 12; i++) rows.push(tx('2025-12-30', `Capodanno - Cena ${i}`, { amount: 10 }));
  for (let i = 0; i < 10; i++) rows.push(tx('2026-01-02', `Capodanno - Pranzo ${i}`, { amount: 10 }));

  const trips = run(rows);
  ok(trips.length === 1, `December into January is one trip (${trips.length})`);
  ok(trips[0].rows.length === 22, 'with both halves in it');
}

// ── what is NOT a trip ────────────────────────────────────────────────────
{
  const rows = [
    tx('2026-04-01', 'Milano - Roma treno'),
    tx('2026-04-02', 'Milano - Hotel'),
  ];
  ok(run(rows).length === 0, 'two rows sharing an opening word are a coincidence');

  rows.push(tx('2026-04-03', 'Milano - Cena'));
  ok(run(rows).length === 1, 'three make it a trip - the threshold is the whole defence');
}
{
  const rows = [
    tx('2026-04-01', 'Azores - Cena', { category: transport }),
    tx('2026-04-02', 'Azores - Volo', { category: transport }),
    tx('2026-04-03', 'Azores - Hotel', { category: transport }),
  ];
  ok(run(rows).length === 0, 'a prefix outside the travel category is somebody\'s description');
}
{
  const rows = [
    tx('2026-04-01', 'Azores - Cena'),
    tx('2026-04-02', 'Azores - Volo'),
    tx('2026-04-03', 'Azores - Rimborso', { type: 'income', category: salary }),
  ];
  ok(run(rows).length === 0, 'and income is not trip spending, so it does not make up the count');
}
ok(detectTrips([tx('2026-04-01', 'Azores - Cena')], null, amountOf).length === 0,
  'no travel category at all means no trips, rather than a guess');

// ── case: one trip however it was typed ───────────────────────────────────
{
  const rows = [
    tx('2026-04-01', 'Azores - Cena'),
    tx('2026-04-02', 'azores - Volo'),
    tx('2026-04-03', 'AZORES - Hotel'),
  ];
  const trips = run(rows);
  ok(trips.length === 1, 'the same name typed three ways is one trip');
  ok(trips[0].name === 'Azores', `labelled as the earliest row spells it (${trips[0].name})`);
}

// ── putting rows in and out of a trip ─────────────────────────────────────
{
  const rows = [
    tx('2026-08-21', 'Taxi aeroporto', { id: 'a', category: transport, subcategory: 'Taxi' }),
    tx('2026-08-21', 'Azores - Cena', { id: 'b', subcategory: 'Food' }),
    tx('2026-08-21', 'Gelato', { id: 'c', category: transport }),
  ];
  const out = applyBulkTrip(rows, new Set(['a']), 'Azores', travel, '2026-09-01T00:00:00.000Z');
  ok(out[0].description === 'Azores - Taxi aeroporto', 'the name goes on the front');
  ok(out[0].category.id === 'travel', 'and the row moves to travel, or it would not be in the trip');
  ok(out[0].subcategory === undefined, 'its old subcategory belonged to the old category, so it goes');
  ok(out[0].updatedAt === '2026-09-01T00:00:00.000Z', 'stamped like any other edit');
  ok(out[2].description === 'Gelato', 'rows that were not selected are untouched');

  const twice = applyBulkTrip(out, new Set(['a']), 'Azores', travel);
  ok(twice[0].description === 'Azores - Taxi aeroporto', 'assigning twice does not stack the name');

  const moved = applyBulkTrip(rows, new Set(['b']), 'Formentera', travel);
  ok(moved[1].description === 'Formentera - Cena', 'moving between trips replaces the name');
  ok(moved[1].subcategory === 'Food', 'and a row already in travel keeps its subcategory');

  const removed = applyBulkTrip(rows, new Set(['b']), null, travel);
  ok(removed[1].description === 'Cena', 'removing takes the name back off');
  ok(removed[1].category.id === 'travel', 'and leaves the category alone - nothing knows where it came from');

  ok(rows[0].description === 'Taxi aeroporto', 'the input array is never mutated');
}

// ── the round trip: add a row by hand, it joins the trip ──────────────────
{
  const rows = [
    tx('2026-08-21', 'Azores - Cena', { amount: 20 }),
    tx('2026-08-22', 'Azores - Hotel', { amount: 100 }),
    tx('2026-08-23', 'Azores - Volo', { amount: 200 }),
    tx('2026-08-23', 'Taxi', { id: 'late', category: transport, amount: 30 }),
  ];
  ok(run(rows)[0].total === 320, 'before: the late taxi is not in the trip');
  const after = applyBulkTrip(rows, new Set(['late']), 'Azores', travel);
  const trip = run(after)[0];
  ok(trip.rows.length === 4 && trip.total === 350, `after: it is (${trip.total})`);
}

// ── renaming a trip ───────────────────────────────────────────────────────
//
// The name IS the identity, so a rename is a rewrite of every description and
// a bad one does not fail loudly: the rows change, nothing matches, and the
// trip disappears from the sheet. isTripName is what the editor asks before
// letting the button work, and it asks the detector rather than restating its
// rules - so these cases are the detector's, seen from the other side.
{
  ok(isTripName('Azores') === true, 'a plain name is a name');
  ok(isTripName('Azores \u{1F1F5}\u{1F1F9}') === true, 'and so is one with a flag on it');
  ok(isTripName('Formentera 2025') === true, 'two words are fine');
  ok(isTripName('  Azores  ') === true, 'surrounding space does not count against it');
  ok(isTripName('') === false, 'an empty name is not one');
  ok(isTripName('   ') === false, 'nor is a name of spaces');
  ok(isTripName('Azores - costa nord') === false,
    'a name containing the separator would split every description in two');
  ok(isTripName('Weekend lungo con i ragazzi') === false, 'four words is a description');
  ok(isTripName('Azores estate duemilaventisei') === false, 'and 29 characters is over the limit');
  // The reason the check is a round trip and not a copy of the rules: this
  // name passes a naive length count and fails the real one, because a flag
  // is four UTF-16 units, not one.
  ok(isTripName('Azori \u{1F1F5}\u{1F1F9}\u{1F1EA}\u{1F1F8}\u{1F1EE}\u{1F1F9}\u{1F1EB}\u{1F1F7}\u{1F1E9}\u{1F1EA}') === false,
    'emoji cost what they really cost, not one character each');

  // The rename itself, end to end: same write as assigning a selection.
  const rows = [
    tx('2026-08-21', 'Azores - Cena', { amount: 20 }),
    tx('2026-08-22', 'Azores - Hotel', { amount: 100 }),
    tx('2026-08-23', 'Azores - Volo', { amount: 200 }),
  ];
  const ids = new Set(run(rows)[0].rows.map((r) => r.id));
  const after = applyBulkTrip(rows, ids, 'Azores \u{1F1F5}\u{1F1F9}', travel);
  const renamed = run(after);
  ok(renamed.length === 1, 'renaming leaves one trip, not two');
  ok(renamed[0].name === 'Azores \u{1F1F5}\u{1F1F9}', `it wears the new name (${renamed[0].name})`);
  ok(renamed[0].rows.length === 3 && renamed[0].total === 320, 'with every row and the same total');
  ok(after.every((r) => r.description.startsWith('Azores \u{1F1F5}\u{1F1F9} - ')),
    'and the prefix is rewritten, not stacked');
  ok(tripBodyOf(after[0].description) === 'Cena', 'the body survives untouched');
}

// ── renaming onto another trip merges them, and it is said in advance ─────
{
  const rows = [
    tx('2026-07-11', 'Formentera - Pranzo', { amount: 30 }),
    tx('2026-07-12', 'Formentera - Cena', { amount: 30 }),
    tx('2026-07-13', 'Formentera - Hotel', { amount: 40 }),
    tx('2026-08-21', 'Azores - Cena', { amount: 20 }),
    tx('2026-08-22', 'Azores - Hotel', { amount: 100 }),
    tx('2026-08-23', 'Azores - Volo', { amount: 200 }),
  ];
  const trips = run(rows);
  ok(trips.length === 2, 'two trips a month apart');
  const azores = trips.find((t) => t.name === 'Azores')!;

  ok(tripMergeTarget(rows, azores, 'Azores \u{1F1F5}\u{1F1F9}', travel, amountOf) === null,
    'a name nobody else uses merges with nothing');
  const target = tripMergeTarget(rows, azores, 'Formentera', travel, amountOf);
  ok(target?.name === 'Formentera' && target?.month === '2026-07',
    `renaming onto a neighbouring trip is announced (${JSON.stringify(target)})`);
  // And it is not a false alarm: doing it really does produce one card.
  const merged = run(applyBulkTrip(rows, new Set(azores.rows.map((r) => r.id)), 'Formentera', travel));
  ok(merged.length === 1 && merged[0].rows.length === 6,
    `the warning matches what actually happens (${merged.length} card(s))`);

  // Far enough apart and the same name is two trips, so there is nothing to
  // warn about - the summer-after-summer case the grouping exists for.
  const older = [
    tx('2025-08-10', 'Ibiza - Cena', { amount: 20 }),
    tx('2025-08-11', 'Ibiza - Hotel', { amount: 20 }),
    tx('2025-08-12', 'Ibiza - Volo', { amount: 20 }),
    ...rows.slice(3),
  ];
  const az = run(older).find((t) => t.name === 'Azores')!;
  ok(tripMergeTarget(older, az, 'Ibiza', travel, amountOf) === null,
    'a year apart, the same name is two trips and nothing merges');
}

console.log(failed ? `\n${failed} FAILED` : '\nTrips group the way they should.');
process.exit(failed ? 1 : 0);
