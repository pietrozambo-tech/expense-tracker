// What Activity's selection mode does to the rows it has selected.
//
// Bulk delete is the only destructive action in the app that acts on rows the
// user is not looking at one by one, so the interesting questions are all
// about reach: does it take exactly what was ticked, does a schedule put back
// what it just removed, and does "stop the schedules" say how far it goes.
// Those are answered here, against the real recurrence engine.

import {
  applyBulkCategory,
  applyBulkDelete,
  applyBulkSource,
  planBulkDelete,
} from '../../src/app/lib/bulkEdit';
import { processRecurrence } from '../../src/app/lib/recurrence';
import type { Category, RecurringRule, Transaction } from '../../src/app/types';

let failed = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failed += 1;
};

const cat = (id: string, name: string, type: 'expense' | 'income', subs: string[] = []): Category => ({
  id, name, type, icon: 'ShoppingCart', color: 'text-emerald-600',
  bgColor: 'bg-emerald-50', selectedBg: 'bg-emerald-100', subcategories: subs,
});
const groceries = cat('groc', 'Groceries', 'expense', ['Supermarket']);
const travel = cat('travel', 'Travel', 'expense', ['Flights', 'Hotel']);
const salary = cat('sal', 'Salary', 'income');

const tx = (over: Partial<Transaction> & { id: string; date: string }): Transaction => ({
  description: 'Something', amount: 10, category: groceries, type: 'expense', currency: 'EUR',
  ...over,
});

const rule = (): RecurringRule => ({
  id: 'r1',
  rule: 'Every month',
  anchorDate: '2026-01-15',
  template: {
    description: 'Gym', amount: 30, currency: 'EUR', category: groceries, type: 'expense',
  },
});
const occ = (d: string): Transaction =>
  tx({ id: `rec-r1-${d}`, date: d, description: 'Gym', amount: 30, recurrenceOf: 'r1', recurrence: 'Every month' });

// ── plain rows ────────────────────────────────────────────────────────────
{
  const rows = [
    tx({ id: 'a', date: '2026-03-01' }),
    tx({ id: 'b', date: '2026-03-02' }),
    tx({ id: 'c', date: '2026-03-03' }),
  ];
  const out = applyBulkDelete(rows, [], new Set(['a', 'c']), 'one');
  ok(out.expenses.map((e) => e.id).join(',') === 'b', 'a plain delete takes exactly what was ticked');
  ok(rows.length === 3, 'and leaves the array it was given alone - undo depends on it');
}

// ── a schedule must not put back what was just deleted ────────────────────
//
// The bug this pins was shipped once already on the single-row path: the
// occurrence was removed, nothing recorded the removal, and the engine wrote
// it again on the next open. Forever.
{
  const rules = [rule()];
  const rows = [occ('2026-02-15'), occ('2026-03-15'), occ('2026-04-15')];
  const ids = new Set(['rec-r1-2026-03-15']);

  const plan = planBulkDelete(ids, rows, rules);
  ok(plan.recurring.length === 1, 'the plan sees the ticked row belongs to a schedule');
  // collateral describes the OTHER answer - what stopping the schedule would
  // take on top - so April counts here even though this delete leaves it.
  ok(plan.collateral === 1, 'and that stopping the schedule would take April as well');

  const out = applyBulkDelete(rows, rules, ids, 'one');
  ok(out.expenses.length === 2, 'the occurrence goes');
  ok(
    (out.rules[0].skipDates ?? []).join(',') === '2026-03-15',
    'and the rule remembers the date, which is the whole point',
  );

  const after = processRecurrence(out.expenses, out.rules, new Date('2026-05-01T12:00:00Z'));
  ok(
    !after.transactions.some((t) => t.id === 'rec-r1-2026-03-15'),
    'so the engine does not write it back on the next open',
  );
  ok(
    after.transactions.some((t) => t.id === 'rec-r1-2026-02-15'),
    'while the occurrences either side of it stay',
  );
}

// ── a row the user typed themselves is not the engine's to regenerate ─────
{
  const rules = [rule()];
  const rows = [tx({ id: 'typed-1', date: '2026-03-15', recurrenceOf: 'r1', description: 'Gym', amount: 30 })];
  const out = applyBulkDelete(rows, rules, new Set(['typed-1']), 'one');
  ok(out.expenses.length === 0, 'a hand-written row in a chain deletes like any other');
  ok(
    (out.rules[0].skipDates ?? []).length === 0,
    'and records no skip - nothing would have recreated it',
  );
}

// ── stop the schedules: how far it actually reaches ───────────────────────
{
  const rules = [rule()];
  const rows = [occ('2026-02-15'), occ('2026-03-15'), occ('2026-04-15'), tx({ id: 'x', date: '2026-03-20' })];
  // Ticked: the March occurrence and an unrelated row. April is NOT ticked.
  const ids = new Set(['rec-r1-2026-03-15', 'x']);

  const plan = planBulkDelete(ids, rows, rules);
  ok(plan.rows.length === 2, 'the plan counts what was ticked');
  ok(plan.collateral === 1, 'and warns that stopping the schedule takes one more the user did not tick');

  const out = applyBulkDelete(rows, rules, ids, 'future');
  ok(out.rules[0].endedAt === '2026-03-15', 'the chain ends at the EARLIEST ticked occurrence');
  ok(
    out.expenses.map((e) => e.id).join(',') === 'rec-r1-2026-02-15',
    'February survives; March and the untouched April both go',
  );

  const after = processRecurrence(out.expenses, out.rules, new Date('2026-05-01T12:00:00Z'));
  ok(
    !after.transactions.some((t) => t.recurrenceOf === 'r1' && t.date >= '2026-03-15'),
    'and the engine writes nothing from the cut-off onwards',
  );
}

// ── a chain whose end is in the FUTURE is still a live chain ──────────────
//
// isActiveRule would call this one dead and skip the question entirely, which
// is exactly how a deleted occurrence came back before.
{
  const rules: RecurringRule[] = [{ ...rule(), endedAt: '2027-01-01' }];
  const rows = [occ('2026-03-15')];
  const plan = planBulkDelete(new Set(['rec-r1-2026-03-15']), rows, rules);
  ok(plan.recurring.length === 1, 'an occurrence of a chain that ends next year still counts as recurring');
}

// ── shared rows are the ones a delete has to tell a server about ──────────
{
  const rows = [
    tx({ id: 'a', date: '2026-03-01' }),
    tx({ id: 'b', date: '2026-03-02', split: { mine: 5 } }),
  ];
  const plan = planBulkDelete(new Set(['a', 'b']), rows, []);
  ok(plan.shared.map((t) => t.id).join(',') === 'b', 'the plan picks out the shared row');
}

// ── filing a selection under a category ───────────────────────────────────
{
  const rows = [
    tx({ id: 'a', date: '2026-03-01', subcategory: 'Supermarket' }),
    tx({ id: 'b', date: '2026-03-02' }),
    tx({ id: 'c', date: '2026-03-03', description: 'untouched' }),
  ];
  const out = applyBulkCategory(rows, new Set(['a', 'b']), travel, 'Hotel', '2026-05-01T00:00:00.000Z');
  ok(out[0].category.id === 'travel' && out[1].category.id === 'travel', 'the ticked rows move');
  ok(out[0].subcategory === 'Hotel', 'and take the chosen subcategory');
  ok(out[0].updatedAt === '2026-05-01T00:00:00.000Z', 'stamped, so a sync knows this copy is the newer one');
  ok(out[2].category.id === 'groc', 'the rest are untouched');

  const cleared = applyBulkCategory(rows, new Set(['a']), travel, null);
  ok(cleared[0].subcategory === undefined, 'no subcategory chosen means none, not the old one carried across');
}

// ── an income row can never wear an expense category ──────────────────────
//
// The screen only offers this on a single-type selection. If that ever slips,
// the row would be counted as spending by every total in the app while still
// rendering green.
{
  const rows = [
    tx({ id: 'a', date: '2026-03-01' }),
    tx({ id: 'b', date: '2026-03-02', type: 'income', category: salary }),
  ];
  const out = applyBulkCategory(rows, new Set(['a', 'b']), travel, null);
  ok(out[0].category.id === 'travel', 'the expense moves');
  ok(out[1].category.id === 'sal', 'the income does not');
}

// ── putting a selection on an account ─────────────────────────────────────
{
  const rows = [tx({ id: 'a', date: '2026-03-01' }), tx({ id: 'b', date: '2026-03-02', sourceId: 'cash' })];
  const out = applyBulkSource(rows, new Set(['a']), 'revolut', '2026-05-01T00:00:00.000Z');
  ok(out[0].sourceId === 'revolut', 'the ticked row lands on the account');
  ok(out[0].updatedAt === '2026-05-01T00:00:00.000Z', 'stamped like any other edit');
  ok(out[1].sourceId === 'cash', 'the rest keep theirs');
  ok(rows[0].sourceId === undefined, 'and the input is left alone');
}

console.log(failed ? `\n${failed} FAILED` : '\nBulk edits behave.');
process.exit(failed ? 1 : 0);
