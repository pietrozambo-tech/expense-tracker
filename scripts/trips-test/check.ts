// Trips are read out of the ledger, not stored in it, so the whole feature is
// only as good as the grouping. The cases below are the ones that pull against
// each other: the Azores is ONE trip spread over five months of booking dates,
// Formentera in two summers is TWO trips under one name, and a New Year trip
// is one trip across a year boundary. A rule that gets any two of those right
// and the third wrong is easy to write by accident.

import {
  applyBulkTrip,
  detectTrips,
  travelCategoryOf,
  tripBodyOf,
  tripNameOf,
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

console.log(failed ? `\n${failed} FAILED` : '\nTrips group the way they should.');
process.exit(failed ? 1 : 0);
