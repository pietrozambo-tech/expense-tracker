// One schedule, one person, and every way an edit can go wrong.
//
// Runs the REAL src/app/lib/recurrence.ts: both the materialization engine and
// applyFutureEdit, which have to agree about occurrence ids. When they did not,
// editing a past occurrence with "this and future ones" duplicated every later
// one - and only on the NEXT app open, so the edit and the damage never looked
// connected.
//
// Run with:  pnpm test:recurrence   (add --before for the pre-fix behaviour)

import {
  processRecurrence,
  applyFutureEdit,
  occurrenceDueDate,
  buildRuleTemplate,
  newRuleId,
} from './lib/recurrence';
import type { RecurringRule, Transaction } from './types';

const OLD = process.argv.includes('--before');
const TODAY = new Date(2026, 7, 2); // 2 August 2026

const cat = {
  id: 'c1', name: 'Housing', icon: 'Home', color: '', bgColor: '', selectedBg: '',
  type: 'expense' as const, subcategories: [],
};

const say = (s: string) => console.log('   ' + s);
const heading = (s: string) => console.log(`\n${s}\n${'-'.repeat(s.length)}`);

let failures = 0;
function expect(label: string, actual: string, expected: string) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`\n   ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  console.log(`         expected: ${expected}`);
  if (!ok) console.log(`         actual:   ${actual}`);
}

const fmt = (txns: Transaction[]) =>
  [...txns].sort((a, b) => a.date.localeCompare(b.date)).map((t) => `${t.date.slice(5)}:${t.amount}`).join(' ');

// The pre-fix applyRecurringFuture, copied faithfully from App.tsx - including
// the stopping branch, so --before shows only the damage that was really there.
// The one difference that matters: restamped later occurrences kept ids
// encoding the OLD rule.
function applyFutureEditBefore(
  transactions: Transaction[], rules: RecurringRule[],
  current: Transaction, rule: RecurringRule, values: Partial<Transaction>, nextRuleId: string,
) {
  const cutoff = occurrenceDueDate(current, rule);
  const stopping = values.recurrence === 'Never repeat';
  const nextRule: RecurringRule | null = stopping ? null : {
    id: nextRuleId, rule: values.recurrence!, anchorDate: values.date!,
    template: buildRuleTemplate(values as Transaction),
  };
  const nextRules = [
    ...rules.map((r) => (r.id === rule.id ? { ...r, endedAt: cutoff } : r)),
    ...(nextRule ? [nextRule] : []),
  ];
  const isLater = (e: Transaction) =>
    e.id !== current.id && e.recurrenceOf === rule.id && occurrenceDueDate(e, rule) > cutoff;
  if (stopping) {
    return {
      rules: nextRules,
      transactions: transactions
        .filter((e) => !isLater(e))
        .map((e) => (e.id === current.id ? { ...e, ...values, recurrenceOf: undefined } : e)),
    };
  }
  return {
    rules: nextRules,
    transactions: transactions.map((e) => {
      if (e.id === current.id) return { ...e, ...values, recurrenceOf: nextRule!.id };
      if (!isLater(e)) return e;
      return {
        ...e, ...buildRuleTemplate(values as Transaction),
        recurrence: values.recurrence, recurrenceOf: nextRule!.id, baseAmount: values.amount!,
      };
    }),
  };
}
const applyEdit = OLD ? applyFutureEditBefore : applyFutureEdit;

/** A monthly rent chain anchored in March, materialized up to today. */
function rentChain() {
  const rule: RecurringRule = {
    id: 'rule-rent', rule: 'Every month', anchorDate: '2026-03-01',
    template: { description: 'Rent', amount: 800, currency: 'EUR', category: cat, type: 'expense' },
  };
  const seed: Transaction = {
    id: 'seed-rent', description: 'Rent', amount: 800, currency: 'EUR', baseAmount: 800,
    category: cat, date: '2026-03-01', type: 'expense', recurrence: 'Every month', recurrenceOf: 'rule-rent',
  };
  const res = processRecurrence([seed], [rule], TODAY);
  return { transactions: res.transactions, rules: res.rules };
}

const edit = (over: Partial<Transaction> = {}): Partial<Transaction> => ({
  description: 'Rent', amount: 900, currency: 'EUR', category: cat,
  date: '2026-05-01', type: 'expense', recurrence: 'Every month',
  updatedAt: '2026-08-02T10:00:00.000Z', ...over,
});

// ---------------------------------------------------------------------------

function scenarioFutureEdit() {
  heading('1. Edit a PAST occurrence, "this and future" - then reopen the app');
  let { transactions, rules } = rentChain();
  say(`materialized: ${fmt(transactions)}`);

  const current = transactions.find((t) => t.date === '2026-05-01')!;
  const rule = rules.find((r) => r.id === 'rule-rent')!;
  ({ transactions, rules } = applyEdit(transactions, rules, current, rule, edit(), 'rule-new'));
  say(`after edit:   ${fmt(transactions)}`);

  const after = processRecurrence(transactions, rules, TODAY);
  say(`next open:    ${fmt(after.transactions)}`);
  expect('nothing is duplicated on the next open', fmt(after.transactions),
    '03-01:800 04-01:800 05-01:900 06-01:900 07-01:900 08-01:900');
  expect('and the engine creates nothing new', String(after.createdCount), '0');
}

function scenarioIdempotent() {
  heading('2. Reopening again and again keeps creating nothing');
  let { transactions, rules } = rentChain();
  const current = transactions.find((t) => t.date === '2026-05-01')!;
  const rule = rules.find((r) => r.id === 'rule-rent')!;
  ({ transactions, rules } = applyEdit(transactions, rules, current, rule, edit(), 'rule-new'));
  let created = 0;
  for (let i = 0; i < 3; i++) {
    const r = processRecurrence(transactions, rules, TODAY);
    created += r.createdCount;
    transactions = r.transactions;
    rules = r.rules;
  }
  say(`after three opens: ${fmt(transactions)}`);
  expect('three passes create nothing', String(created), '0');
}

function scenarioPastUntouched() {
  heading('3. Occurrences before the edited one keep their old amount');
  let { transactions, rules } = rentChain();
  const current = transactions.find((t) => t.date === '2026-05-01')!;
  const rule = rules.find((r) => r.id === 'rule-rent')!;
  ({ transactions, rules } = applyEdit(transactions, rules, current, rule, edit(), 'rule-new'));
  const past = transactions.filter((t) => t.date < '2026-05-01');
  expect('March and April still cost 800', fmt(past), '03-01:800 04-01:800');
}

function scenarioDeletedStayDeleted() {
  heading('4. An occurrence deleted before the edit is not resurrected');
  let { transactions, rules } = rentChain();
  // The user deletes July individually: it is skipped and removed.
  rules = rules.map((r) => (r.id === 'rule-rent' ? { ...r, skipDates: ['2026-07-01'] } : r));
  transactions = transactions.filter((t) => t.date !== '2026-07-01');
  say(`after deleting July: ${fmt(transactions)}`);

  const current = transactions.find((t) => t.date === '2026-05-01')!;
  const rule = rules.find((r) => r.id === 'rule-rent')!;
  ({ transactions, rules } = applyEdit(transactions, rules, current, rule, edit(), 'rule-new'));
  const after = processRecurrence(transactions, rules, TODAY);
  say(`next open:           ${fmt(after.transactions)}`);
  expect('July stays deleted', fmt(after.transactions),
    '03-01:800 04-01:800 05-01:900 06-01:900 08-01:900');
}

function scenarioStopping() {
  heading('5. "Never repeat" from a past occurrence stops the chain for good');
  let { transactions, rules } = rentChain();
  const current = transactions.find((t) => t.date === '2026-05-01')!;
  const rule = rules.find((r) => r.id === 'rule-rent')!;
  ({ transactions, rules } = applyEdit(
    transactions, rules, current, rule, edit({ recurrence: 'Never repeat' }), 'rule-new',
  ));
  const after = processRecurrence(transactions, rules, TODAY);
  say(`next open: ${fmt(after.transactions)}`);
  expect('June onward are gone and stay gone', fmt(after.transactions),
    '03-01:800 04-01:800 05-01:900');
}

function scenarioStamps() {
  heading('6. Restamped occurrences carry a fresh edit stamp (for sync)');
  let { transactions, rules } = rentChain();
  const current = transactions.find((t) => t.date === '2026-05-01')!;
  const rule = rules.find((r) => r.id === 'rule-rent')!;
  ({ transactions, rules } = applyEdit(transactions, rules, current, rule, edit(), 'rule-new'));
  const later = transactions.filter((t) => t.date > '2026-05-01');
  const stamped = later.every((t) => t.updatedAt === '2026-08-02T10:00:00.000Z');
  expect('every changed row is stamped', String(stamped), 'true');
}

console.log('\n================================================================');
console.log(` Recurring transactions   [${OLD ? 'BEFORE the fix' : 'AFTER the fix'}]`);
console.log(' (running the real src/app/lib/recurrence.ts)');
console.log('================================================================');
scenarioFutureEdit();
scenarioIdempotent();
scenarioPastUntouched();
scenarioDeletedStayDeleted();
scenarioStopping();
scenarioStamps();
console.log('\n================================================================');
console.log(failures === 0 ? ' All checks passed.' : ` ${failures} check(s) FAILED.`);
console.log('================================================================\n');
process.exit(failures === 0 ? 0 : 1);
