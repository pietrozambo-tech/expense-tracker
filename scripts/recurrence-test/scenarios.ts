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
  findPastSeriesMatches,
  findUnclaimedSeriesRows,
  tagPastSeries,
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
scenarioBackTag();
scenarioUnclaimedScan();
scenarioForeignWording();
// 7. Retro-tagging imported history as recurring, without minting new rules.
function scenarioBackTag() {
  heading('7. A year of imported "Monthly rent" joins the new chain safely');

  const tx = (id: string, date: string, amount: number, description: string): Transaction => ({
    id, description, amount, currency: 'EUR', baseAmount: amount,
    category: cat, date, type: 'expense', recurrence: 'Never repeat',
  });

  // Twelve imported one-offs, plus a look-alike in another category and a
  // different bill, neither of which may be swept up.
  const otherCat = { ...cat, id: 'c2', name: 'Leisure' };
  const history: Transaction[] = [];
  for (let m = 0; m < 12; m++) {
    history.push(tx(`imp-${m}`, '2025-' + String(m + 1).padStart(2, '0') + '-01', 800, 'Monthly rent'));
  }
  history.push({ ...tx('imp-look', '2025-06-15', 12, 'monthly RENT'), category: otherCat });
  history.push(tx('imp-dazn', '2025-06-20', 30, 'DAZN'));

  // The user opens their newest rent and declares it recurring: App.tsx makes
  // the rule and then offers the back-tag.
  const seedValues = tx('imp-11', '2025-12-01', 800, 'Monthly rent');
  const rule: RecurringRule = {
    id: newRuleId(),
    rule: 'Every month',
    anchorDate: '2025-12-01',
    template: buildRuleTemplate(seedValues),
  };

  const matches = findPastSeriesMatches(history, seedValues);
  expect('the 11 earlier rents match - name, category, direction',
    String(matches.length), '11');
  expect('case and spacing do not defeat the name match, category does',
    matches.some((m) => m.id === 'imp-look') ? 'look-alike swept up' : 'look-alike left alone',
    'look-alike left alone');
  expect('other bills are not touched',
    matches.some((m) => m.id === 'imp-dazn') ? 'DAZN swept up' : 'DAZN left alone',
    'DAZN left alone');

  let txns = tagPastSeries(history, matches.map((m) => m.id), rule);
  expect('tagged rows join the chain with BOTH markers',
    String(txns.filter((t) => t.recurrence === 'Every month' && t.recurrenceOf === rule.id).length),
    '11');

  // The whole reason recurrenceOf must be set: run the engine. Without the
  // chain link every tagged row is a legacy seed and becomes its own rule.
  txns = txns.map((t) => (t.id === 'imp-11' ? { ...t, recurrence: 'Every month', recurrenceOf: rule.id } : t));
  const res = processRecurrence(txns, [rule], TODAY);
  expect('the engine mints no extra rules out of the tagged history',
    String(res.rules.length), '1');
  const perDate: Record<string, number> = {};
  for (const t of res.transactions) perDate[t.date] = (perDate[t.date] ?? 0) + (t.description === 'Monthly rent' ? 1 : 0);
  expect('and no month ever holds two rents',
    String(Math.max(...Object.values(perDate))), '1');

  // Matching is not offered rows already in a chain, nor future ones.
  const again = findPastSeriesMatches(res.transactions, seedValues);
  expect('once tagged, nothing is left to offer', String(again.length), '0');

  // And the trap this design avoids, demonstrated: stamping the label WITHOUT
  // the chain link makes every row a legacy seed, and the migration mints a
  // rule out of each one.
  const naive = history.map((t) =>
    matches.some((m) => m.id === t.id) ? { ...t, recurrence: 'Every month' } : t,
  );
  const boom = processRecurrence(naive, [rule], TODAY);
  say(`label-only tagging would have minted ${boom.rules.length} rules from one rent`);
  expect('which is exactly why tagged rows must join the chain',
    String(boom.rules.length > 1), 'true');
}

// 8. The scan from the rules' side: series set up long ago, history imported
// afterwards. The user's actual case - the "declare recurring" moment never
// comes again, so the offer has to start from what already exists.
function scenarioUnclaimedScan() {
  heading('8. Existing rules claim imported history; the future is untouched');

  const tx = (id: string, date: string, amount: number, description: string): Transaction => ({
    id, description, amount, currency: 'EUR', baseAmount: amount,
    category: cat, date, type: 'expense', recurrence: 'Never repeat',
  });

  // Two live series and one ended one. Anchors in 2026; history in 2025.
  const rent: RecurringRule = { id: 'rule-rent2', rule: 'First day of the month', anchorDate: '2026-01-01',
    template: { description: 'Monthly rent', amount: 800, currency: 'EUR', category: cat, type: 'expense' } };
  const voda: RecurringRule = { id: 'rule-voda', rule: 'Every month', anchorDate: '2026-02-10',
    template: { description: 'Vodafone', amount: 25, currency: 'EUR', category: cat, type: 'expense' } };
  const ended: RecurringRule = { id: 'rule-gym', rule: 'Every month', anchorDate: '2026-01-05', endedAt: '2026-03-05',
    template: { description: 'Gym', amount: 40, currency: 'EUR', category: cat, type: 'expense' } };

  const txns: Transaction[] = [
    tx('r1', '2025-03-01', 780, 'Monthly rent'),
    tx('r2', '2025-04-01', 780, 'monthly  Rent'), // case and spacing differ
    tx('v1', '2025-06-10', 23, 'Vodafone'),
    tx('g1', '2025-05-05', 40, 'Gym'),            // matches only the ENDED rule
    tx('post', '2026-03-01', 800, 'Monthly rent'),// AFTER the anchor: likely a duplicate, not history
    { ...tx('occ', '2026-01-01', 800, 'Monthly rent'), recurrence: 'First day of the month', recurrenceOf: 'rule-rent2' },
  ];

  const claims = findUnclaimedSeriesRows(txns, [rent, voda, ended]);
  const byRule: Record<string, string> = {};
  for (const c of claims) byRule[c.rule.id] = (byRule[c.rule.id] ? byRule[c.rule.id] + ',' : '') + c.rows.map((r) => r.id).sort().join(',');
  expect('the rent history is found, spacing and case aside', byRule['rule-rent2'] ?? '(none)', 'r1,r2');
  expect('each series claims only its own', byRule['rule-voda'] ?? '(none)', 'v1');
  expect('an ended series claims nothing', byRule['rule-gym'] ?? '(none)', '(none)');
  say('the post-anchor look-alike next to a real occurrence stays out: it may be a duplicate');
  expect('rows after the anchor are not offered',
    claims.some((c) => c.rows.some((r) => r.id === 'post')) ? 'offered' : 'left alone', 'left alone');

  // Accept, then run the engine well past the anchors: the tagging must not
  // change what the rules produce.
  let tagged = txns;
  for (const c of claims) tagged = tagPastSeries(tagged, c.rows.map((r) => r.id), c.rule);
  const before = processRecurrence(txns, [rent, voda, ended], TODAY);
  const after = processRecurrence(tagged, [rent, voda, ended], TODAY);
  expect('the engine creates exactly as many occurrences as it would have anyway',
    String(after.createdCount), String(before.createdCount));
  expect('and no new rules', String(after.rules.length), String(before.rules.length));
  const scan2 = findUnclaimedSeriesRows(after.transactions, after.rules);
  expect('a second scan finds nothing left to offer', String(scan2.length), '0');
}

// 9. The wording is not the series. Imported history in another language, or
// simply named differently by the bank, has to be claimable - a dictionary of
// translations would never cover enough, so the shape carries it: same
// category and direction, an amount in the same neighbourhood, and a cadence
// that actually repeated.
function scenarioForeignWording() {
  heading('9. "Affitto" is claimed by the "Monthly rent" series');

  const garage = { ...cat, id: 'c-gar', name: 'Garage' };
  const food = { ...cat, id: 'c-food', name: 'Groceries' };
  const tx = (id: string, date: string, amount: number, description: string, category = cat): Transaction => ({
    id, description, amount, currency: 'EUR', baseAmount: amount,
    category, date, type: 'expense', recurrence: 'Never repeat',
  });

  const rent: RecurringRule = { id: 'r-rent', rule: 'Every month', anchorDate: '2026-01-01',
    template: { description: 'Monthly rent', amount: 900, currency: 'EUR', category: cat, type: 'expense' } };
  // A second series in the SAME category, so the assignment has to choose.
  const box: RecurringRule = { id: 'r-box', rule: 'Every month', anchorDate: '2026-01-05',
    template: { description: 'Garage', amount: 100, currency: 'EUR', category: garage, type: 'expense' } };
  // A yearly series: its history is not monthly, so shape cannot speak for it.
  const ins: RecurringRule = { id: 'r-ins', rule: 'Every year', anchorDate: '2026-02-01',
    template: { description: 'Home insurance', amount: 300, currency: 'EUR', category: cat, type: 'expense' } };

  const txns: Transaction[] = [
    // The real case: a year of Italian rent, slightly cheaper than today.
    ...Array.from({ length: 12 }, (_, i) => tx(`aff-${i}`, `2025-${String(i + 1).padStart(2, '0')}-02`, 880, 'Affitto')),
    // Same category, repeated, but nowhere near the rent's amount.
    ...['01', '02', '03'].map((m) => tx(`cond-${m}`, `2025-${m}-15`, 120, 'Condominio')),
    // Looks like rent, but happened once: a deposit, not a series.
    tx('dep', '2025-01-03', 900, 'Caparra'),
    // Another category entirely, repeated and similar in size.
    ...['01', '02', '03'].map((m) => tx(`sp-${m}`, `2025-${m}-20`, 870, 'Spesa grande', food)),
    // The garage series' own history, closer to 100 than to 900.
    ...['01', '02', '03'].map((m) => tx(`box-${m}`, `2025-${m}-06`, 95, 'Box auto', garage)),
  ];

  const claims = findUnclaimedSeriesRows(txns, [rent, box, ins]);
  const claimed = Object.fromEntries(claims.map((c) => [c.label, `${c.rows.length}->${c.rule.id}:${c.confidence}`]));
  say(`claims: ${claims.map((c) => `${c.label} x${c.rows.length} -> ${c.rule.template.description}`).join(', ') || '(none)'}`);

  expect('the Italian rent is claimed by the rent series, on shape', claimed['Affitto'] ?? '(none)', '12->r-rent:likely');
  expect('a repeated bill of a different size is not swept in', claimed['Condominio'] ?? '(none)', '(none)');
  expect('a one-off that looks like rent is not a series', claimed['Caparra'] ?? '(none)', '(none)');
  expect('another category is never touched', claimed['Spesa grande'] ?? '(none)', '(none)');
  expect('and each series takes the history nearest its own amount', claimed['Box auto'] ?? '(none)', '3->r-box:likely');
  expect('a yearly series claims nothing on monthly shape',
    claims.some((c) => c.rule.id === 'r-ins') ? 'claimed' : 'left alone', 'left alone');

  // Exact wording still outranks shape when both are on offer.
  const both = findUnclaimedSeriesRows([...txns, tx('en-1', '2025-04-02', 880, 'Monthly rent')], [rent, box, ins]);
  const exact = both.find((c) => c.confidence === 'exact');
  expect('same-wording history is still an exact claim', exact ? `${exact.label}:${exact.rows.length}` : '(none)', 'Monthly rent:1');

  // And the promise that matters: tagging changes nothing about the future.
  let tagged = txns;
  for (const c of claims) tagged = tagPastSeries(tagged, c.rows.map((r) => r.id), c.rule);
  const before = processRecurrence(txns, [rent, box, ins], TODAY);
  const after = processRecurrence(tagged, [rent, box, ins], TODAY);
  expect('the engine still creates exactly what it would have',
    String(after.createdCount), String(before.createdCount));
  expect('and mints no rules', String(after.rules.length), String(before.rules.length));
}

console.log('\n================================================================');
console.log(failures === 0 ? ' All checks passed.' : ` ${failures} check(s) FAILED.`);
console.log('================================================================\n');
process.exit(failures === 0 ? 0 : 1);
