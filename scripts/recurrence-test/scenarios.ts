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
  findGeneratedDuplicates,
  tagPastSeries,
  nextDueDates,
  nextDueDate,
  upcomingSchedules,
  anchorForStart,
  strandedRules,
  generatesOn,
  isActiveRule,
  toDateStr,
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

scenarioUpcoming();
scenarioDeleteOnFutureEndedChain();
scenarioNothingHidden();
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
scenarioNoDoubleUp();
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

// 10. The engine must not invent a transaction the user already has. Marking
// an older transaction as recurring anchors the rule in the past, and the
// back-fill then walked straight over imported history - a generated copy on
// top of every real row since. Reported from a real device, as duplicates.
function scenarioNoDoubleUp() {
  heading('10. Back-fill never lands on a transaction that already exists');

  const tx = (id: string, date: string, amount: number, description: string, category = cat): Transaction => ({
    id, description, amount, currency: 'EUR', baseAmount: amount,
    category, date, type: 'expense', recurrence: 'Never repeat',
  });

  // A rule anchored in January, and imported history either side of it. The
  // history is worded in Italian while the series is not, so only the shape
  // connects them - exactly the case the guard has to catch.
  const rule: RecurringRule = { id: 'rule-rent3', rule: 'First day of the month', anchorDate: '2026-01-01',
    template: { description: 'Monthly rent', amount: 900, currency: 'EUR', category: cat, type: 'expense' } };
  const seed: Transaction = { ...tx('seed3', '2026-01-01', 900, 'Monthly rent'), recurrence: 'First day of the month', recurrenceOf: 'rule-rent3' };
  const imported = ['02', '03', '04', '05', '06', '07', '08'].map((m) => tx(`imp-${m}`, `2026-${m}-01`, 880, 'Affitto'));

  const res = processRecurrence([seed, ...imported], [rule], TODAY);
  const rentsPerDate = new Map<string, number>();
  for (const t of res.transactions) rentsPerDate.set(t.date, (rentsPerDate.get(t.date) ?? 0) + 1);
  say(`${imported.length} imported months, engine created ${res.createdCount}`);
  expect('nothing is generated over the imported months', String(res.createdCount), '0');
  expect('and no day holds two rents', String(Math.max(...rentsPerDate.values())), '1');

  // The guard is a skip, not a tombstone: remove the row the user kept and the
  // occurrence is created on the next pass, as it always would have been.
  const without = res.transactions.filter((t) => t.id !== 'imp-04');
  const again = processRecurrence(without, [rule], TODAY);
  expect('deleting the kept row lets the occurrence come back', String(again.createdCount), '1');

  // A different bill on the same day in the same category is not the rent.
  const other = processRecurrence(
    [seed, tx('gift', '2026-02-01', 15, 'Fiori')],
    [rule], TODAY,
  );
  expect('a small unrelated expense does not suppress the rent',
    String(other.transactions.some((t) => t.id === 'rec-rule-rent3-2026-02-01')), 'true');

  // And a day already owned by ANOTHER series never blocks this one.
  const gym: RecurringRule = { id: 'rule-gym2', rule: 'First day of the month', anchorDate: '2026-01-01',
    template: { description: 'Gym', amount: 900, currency: 'EUR', category: cat, type: 'expense' } };
  const twoSeries = processRecurrence(
    [seed, { ...tx('g', '2026-02-01', 900, 'Gym'), recurrence: 'First day of the month', recurrenceOf: 'rule-gym2' }],
    [rule, gym], TODAY,
  );
  expect('two schedules can share a day',
    String(twoSeries.transactions.some((t) => t.id === 'rec-rule-rent3-2026-02-01')), 'true');

  // Now the clean-up for data that predates the guard: find the generated
  // copies, and only those.
  const damaged = [seed, ...imported,
    ...['02', '03'].map((m) => ({ ...tx(`rec-rule-rent3-2026-${m}-01`, `2026-${m}-01`, 900, 'Monthly rent'), recurrence: 'First day of the month', recurrenceOf: 'rule-rent3' })),
  ];
  const dupes = findGeneratedDuplicates(damaged, [rule]);
  expect('both generated copies are found', String(dupes.length), '2');
  expect('and it is always the GENERATED row offered for removal',
    dupes.every((d) => d.generated.id.startsWith('rec-')) ? 'generated' : 'user row', 'generated');
  expect('the row kept is the user\'s own', dupes.map((d) => d.kept.id).sort().join(','), 'imp-02,imp-03');
  const cleaned = damaged.filter((t) => !dupes.some((d) => d.generated.id === t.id));
  expect('removing them leaves the ledger whole', String(cleaned.length), String(damaged.length - 2));
  expect('and nothing is found a second time',
    String(findGeneratedDuplicates(cleaned, [rule]).length), '0');
  expect('nor does the engine put them back',
    String(processRecurrence(cleaned, [rule], TODAY).createdCount), '0');
}

console.log('\n================================================================');
console.log(failures === 0 ? ' All checks passed.' : ` ${failures} check(s) FAILED.`);
console.log('================================================================\n');
process.exit(failures === 0 ? 0 : 1);

// ── Looking forward: the Scheduled screen ───────────────────────────────────
//
// Everything here is a PROJECTION. If any of it ever started writing rows, the
// Dashboard would count money in a month that has not happened, which is the
// one way this feature can break the rest of the app.
function scenarioNothingHidden() {
  heading('14. Nothing can add a future transaction while hidden from Recurring');
  // The rule the user asked for, as a property rather than a promise: if a
  // schedule can still put a row in the ledger dated today or later, it has to
  // be on the Recurring screen, where it can be read, edited and stopped.
  //
  // The screen shows upcomingSchedules (anything with a future occurrence) plus
  // strandedRules (live but producing nothing, so it can still be removed).
  const NOW = new Date(2026, 7, 11); // 11 August 2026
  const tpl = { description: 'Bill', amount: 10, currency: 'EUR', category: cat, type: 'expense' as const };

  const shapes: RecurringRule[] = [
    { id: 'live', rule: 'Every month', anchorDate: '2026-01-05', template: tpl },
    { id: 'live-weekly', rule: 'Every week', anchorDate: '2026-08-01', template: tpl },
    { id: 'ends-tomorrow', rule: 'Every month', anchorDate: '2026-01-12', endedAt: '2026-08-13', template: tpl },
    { id: 'ended-past', rule: 'Every month', anchorDate: '2026-01-05', endedAt: '2026-06-01', template: tpl },
    { id: 'ended-today', rule: 'Every month', anchorDate: '2026-01-05', endedAt: '2026-08-11', template: tpl },
    { id: 'alien', rule: 'Every fortnight on a Tuesday', anchorDate: '2026-01-05', template: tpl },
    { id: 'never', rule: 'Never repeat', anchorDate: '2026-01-05', template: tpl },
    { id: 'far-future-start', rule: 'Every month',
      anchorDate: anchorForStart('2027-03-01', 'Every month'), template: tpl },
    { id: 'skips-everything', rule: 'Every month', anchorDate: '2026-01-05',
      skipDates: ['2026-09-05', '2026-10-05'], template: tpl },
  ];

  const visible = new Set([
    ...upcomingSchedules(shapes, NOW).map((u) => u.rule.id),
    ...strandedRules(shapes, NOW).map((r) => r.id),
  ]);

  // Ask the engine, rule by rule, whether it creates anything dated from today
  // on - looking a year and a half ahead, not just at today.
  const HORIZON = new Date(2028, 0, 1);
  const todayStr = toDateStr(NOW);
  const creators = shapes.filter((r) => {
    const res = processRecurrence([], [r], HORIZON);
    return res.transactions.some((t) => t.date >= todayStr);
  }).map((r) => r.id);

  say(`can create a row dated today or later: ${creators.join(', ') || 'none'}`);
  say(`shown on the Recurring screen:         ${[...visible].join(', ') || 'none'}`);

  const hidden = creators.filter((id) => !visible.has(id));
  expect('nothing that can create a future row is hidden', hidden.join(',') || 'none', 'none');

  // And the converse worth stating: a chain ended in the past is genuinely
  // inert, which is why hiding it is safe.
  const inert = processRecurrence([], [shapes.find((r) => r.id === 'ended-past')!], HORIZON);
  expect('a chain ended in the past creates nothing from today on',
    String(inert.transactions.filter((t) => t.date >= todayStr).length), '0');
  expect('the live ones are all listed', String(visible.has('live') && visible.has('live-weekly')), 'true');
  expect('a chain ending tomorrow is listed - it still owes one',
    String(visible.has('ends-tomorrow')), 'true');
  expect('a schedule starting next year is listed', String(visible.has('far-future-start')), 'true');
  expect('an unrecognised cadence is listed so it can be removed',
    String(visible.has('alien')), 'true');
}

function scenarioDeleteOnFutureEndedChain() {
  heading('13. Deleting an occurrence of a chain that ends in the FUTURE');
  // The shape a real ledger arrived in: a monthly Amex fee whose chain had been
  // cut two days out by a schedule edit, so the chain still owed one occurrence.
  const rule: RecurringRule = {
    id: 'rule-amex', rule: 'Every month', anchorDate: '2026-07-09', endedAt: '2026-08-10',
    template: { description: 'Amex fee', amount: 67, currency: 'EUR', category: cat, type: 'expense' },
  };
  const NOW = new Date(2026, 7, 10); // 10 August
  const built = processRecurrence([], [rule], NOW);
  const aug = built.transactions.find((t) => t.date === '2026-08-09')!;
  expect('the ended-in-future chain still owes 9 August', aug ? aug.date : 'none', '2026-08-09');

  // The two questions that are not the same question.
  expect('isActiveRule says the chain is finished', String(isActiveRule(rule)), 'false');
  expect('generatesOn says 9 August is still live', String(generatesOn(rule, '2026-08-09')), 'true');
  expect('and that 10 August is not - endedAt is exclusive',
    String(generatesOn(rule, '2026-08-10')), 'false');

  // Deleting the row without recording a skip: the engine puts it straight back.
  const withoutSkip = processRecurrence(
    built.transactions.filter((t) => t.id !== aug.id), [rule], NOW);
  expect('deleted with no skip, it returns on the next open',
    String(!!withoutSkip.transactions.find((t) => t.id === aug.id)), 'true');

  // Which is why the delete path has to find this rule at all. Selecting it
  // with isActiveRule finds nothing, so no skip is ever written.
  const foundByActive = [rule].find((r) => r.id === aug.recurrenceOf && isActiveRule(r));
  const foundByGenerates = [rule].find(
    (r) => r.id === aug.recurrenceOf && generatesOn(r, occurrenceDueDate(aug, r)));
  expect('isActiveRule cannot find the rule to skip on', String(!!foundByActive), 'false');
  expect('generatesOn finds it', String(!!foundByGenerates), 'true');

  const skipped: RecurringRule = { ...rule, skipDates: ['2026-08-09'] };
  const withSkip = processRecurrence(
    built.transactions.filter((t) => t.id !== aug.id), [skipped], NOW);
  expect('with the skip recorded it stays deleted',
    String(!!withSkip.transactions.find((t) => t.id === aug.id)), 'false');
  expect('and nothing else is invented', String(withSkip.createdCount), '0');

  // The other half of the report: the SECOND Amex fee, a day after the first.
  //
  // Editing a live schedule defaults its start to the chain's next occurrence.
  // Defaulting to tomorrow is what produced the duplicate - the replacement
  // fired in a month the old chain had already charged.
  const live: RecurringRule = {
    id: 'rule-amex', rule: 'Every month', anchorDate: '2026-07-09',
    template: { description: 'Amex fee', amount: 67, currency: 'EUR', category: cat, type: 'expense' },
  };
  const start = nextDueDate(live, NOW)!;
  expect('the editor opens on the next occurrence, not tomorrow', start, '2026-09-09');
  expect('which is NOT tomorrow', String(start === '2026-08-11'), 'false');

  const replacement: RecurringRule = {
    id: 'rule-amex-2', rule: 'Every month', anchorDate: anchorForStart(start, 'Every month'),
    template: { ...live.template, amount: 70 },
  };
  const handover = processRecurrence([], [{ ...live, endedAt: start }, replacement],
    new Date(2026, 8, 20)); // 20 September
  const byMonth = handover.transactions.reduce((acc, t) => {
    acc[t.date.slice(0, 7)] = (acc[t.date.slice(0, 7)] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  expect('August charged once', String(byMonth['2026-08'] ?? 0), '1');
  expect('September charged once, at the handover', String(byMonth['2026-09'] ?? 0), '1');
  expect('and it is the replacement amount from September on',
    handover.transactions.filter((t) => t.date.startsWith('2026-09')).map((t) => String(t.amount)).join(','), '70');

  // The old default, kept as a guard: tomorrow puts two in one month.
  const bad = processRecurrence([], [
    { ...live, endedAt: '2026-08-11' },
    { id: 'r-bad', rule: 'Every month', anchorDate: anchorForStart('2026-08-11', 'Every month'),
      template: live.template },
  ], new Date(2026, 7, 20));
  expect('defaulting to tomorrow would have charged August twice',
    String(bad.transactions.filter((t) => t.date.startsWith('2026-08')).length), '2');
}

function scenarioUpcoming() {
  heading('12. Upcoming occurrences are projected, never materialized');
  const rule = (over: Partial<RecurringRule> = {}): RecurringRule => ({
    id: 'rule-up', rule: 'Every month', anchorDate: '2026-01-15',
    template: { description: 'Gym', amount: 40, currency: 'EUR', category: cat, type: 'expense' },
    ...over,
  });

  expect('the next three monthly dates follow today',
    nextDueDates(rule(), TODAY, 3).join(','), '2026-08-15,2026-09-15,2026-10-15');

  // Today itself is already materialized (or deliberately skipped), so the
  // projection has to start strictly after it.
  expect('a date landing on today is not "upcoming"',
    nextDueDate(rule({ anchorDate: '2026-07-02' }), TODAY), '2026-09-02');

  expect('skipped dates stay skipped',
    nextDueDates(rule({ skipDates: ['2026-08-15'] }), TODAY, 2).join(','), '2026-09-15,2026-10-15');

  expect('an ended rule has no future',
    String(nextDueDate(rule({ endedAt: '2026-08-10' }), TODAY)), 'null');

  expect('a one-off is never upcoming',
    String(nextDueDate(rule({ rule: 'Never repeat' }), TODAY)), 'null');

  // Month-end clamping has to behave the same looking forward as back.
  expect('the 31st clamps per month and returns',
    nextDueDates(rule({ anchorDate: '2026-01-31' }), TODAY, 3).join(','),
    '2026-08-31,2026-09-30,2026-10-31');

  expect('work days skip the weekend',
    nextDueDates(rule({ rule: 'Every work day', anchorDate: '2026-01-01' }), TODAY, 3).join(','),
    '2026-08-03,2026-08-04,2026-08-05');

  // A daily rule anchored years back must not walk every past day first.
  const t0 = Date.now();
  const daily = nextDueDates(rule({ rule: 'Every day', anchorDate: '2019-01-01' }), TODAY, 3);
  expect('a years-old daily rule still answers', daily.join(','), '2026-08-03,2026-08-04,2026-08-05');
  expect('and answers quickly', String(Date.now() - t0 < 250), 'true');

  // Ordering is the whole point of the screen.
  const sched = upcomingSchedules([
    rule({ id: 'a', anchorDate: '2026-01-20' }),                 // 20 Aug
    rule({ id: 'b', anchorDate: '2026-01-05' }),                 // 5 Sep (5 Aug passed? no: 5 Aug > 2 Aug)
    rule({ id: 'c', endedAt: '2026-08-01' }),                    // dropped
    rule({ id: 'd', rule: 'Never repeat' }),                     // dropped
  ], TODAY);
  expect('only live schedules appear', sched.map((s) => s.rule.id).join(','), 'b,a');
  expect('sorted by what fires next', sched.map((s) => s.next).join(','), '2026-08-05,2026-08-20');

  // The screen must announce every charge the engine will actually make.
  // Editing a schedule to start next month ends the current chain on that date
  // (exclusive), so the current chain still owes one occurrence at the OLD
  // amount. isActiveRule says that chain is finished; the engine disagrees, and
  // the engine is the one that moves the money.
  const tail = rule({ id: 'tail', anchorDate: '2026-07-15', endedAt: '2026-09-01' }); // 15 Aug, then done
  const replacement = rule({ id: 'new', anchorDate: anchorForStart('2026-09-01', 'Every month'),
    template: { ...rule().template, amount: 55 } });
  const both = upcomingSchedules([tail, replacement], TODAY);
  expect('a chain ending in the future still shows its last charge',
    both.map((s) => `${s.rule.id}@${s.next}`).join(','), 'tail@2026-08-15,new@2026-09-01');
  // Two rows, same name, different amounts: the row has to say which is ending.
  expect('and it is marked as the final one',
    both.map((s) => `${s.rule.id}:${s.last}`).join(','), 'tail:true,new:false');
  // ...and what it shows is exactly what gets recorded when those days arrive.
  const played = processRecurrence([], [tail, replacement], new Date('2026-09-02T12:00:00'));
  expect('and the engine records precisely those',
    played.transactions.map((t) => `${t.date}=${t.amount}`).sort().join(','),
    '2026-08-15=40,2026-09-01=55');
  expect('a chain that ended in the past shows nothing',
    upcomingSchedules([rule({ id: 'past', endedAt: '2026-07-01' })], TODAY).length + '', '0');

  // Adding from Settings: the user picks a start date and expects money on it.
  // Each cadence is tried twice - once starting soon, once starting far enough
  // out that anchorForStart leaves the ANCHOR ITSELF in the future. That second
  // case is the one that catches a projection accepting the anchor as an
  // occurrence: the engine generates strictly after the anchor, so a row on the
  // anchor date would be a charge announced here that never actually happens.
  for (const [cadence, soon, far] of [
    ['Every month', '2026-09-01', '2027-01-01'],
    ['Every week', '2026-08-19', '2026-12-16'],
    ['Every second week', '2026-08-19', '2026-12-16'],
    ['Every year', '2027-03-09', '2029-03-09'],
    ['Every day', '2026-08-06', '2026-11-20'],
    ['First day of the month', '2026-09-01', '2027-01-01'],
  ] as const) {
    for (const start of [soon, far]) {
      const r: RecurringRule = { id: 'x', rule: cadence, anchorDate: anchorForStart(start, cadence),
        template: rule().template };
      expect(`"${cadence}" starting ${start} first fires exactly then`, nextDueDate(r, TODAY) ?? 'null', start);
      // The engine agreeing is the point; the screen is only a preview of it.
      const onTheDay = processRecurrence([], [r], new Date(`${start}T12:00:00`));
      expect(`"${cadence}" starting ${start} is recorded on that day and not before`,
        onTheDay.transactions.map((t) => t.date).join(','), start);
    }
  }
  // Monday start on a work-day cadence anchors to the Friday before.
  const wd: RecurringRule = { id: 'w', rule: 'Every work day',
    anchorDate: anchorForStart('2026-08-10', 'Every work day'), template: rule().template };
  expect('"Every work day" starting a Monday fires that Monday', nextDueDate(wd, TODAY) ?? 'null', '2026-08-10');

  // The invariant that keeps the tabs agreeing.
  const before: Transaction[] = [];
  const res = processRecurrence(before, [rule({ anchorDate: '2026-08-01' })], TODAY);
  expect('projecting never creates a future row', String(res.createdCount), '0');
  expect('and writes nothing at all', String(res.transactions.length), '0');

  // --- Nothing already scheduled may be missing from the screen. ------------
  //
  // The screen is only worth opening if it lists EVERY live rule the user has,
  // including the ones set up long before it existed. Every cadence the app can
  // store, anchored well in the past the way a real long-running rule is:
  const CADENCES = ['Every day', 'Every work day', 'Every week', 'Every second week',
    'First day of the month', 'Every month', 'Every year'] as const;
  const longRunning = CADENCES.map((c, i) =>
    rule({ id: `old-${i}`, rule: c, anchorDate: '2024-02-29' }));
  expect('every cadence the app can create is listed',
    String(upcomingSchedules(longRunning, TODAY).length), String(CADENCES.length));
  // ...and each is listed for a day the engine really acts on. Cross-checked
  // from a recent anchor: dueDatesSince caps at 750 dates per pass, so a daily
  // rule anchored years back cannot be replayed in one go - a limit of the
  // materializer, not of what the screen shows.
  for (const c of CADENCES) {
    const r = rule({ id: 'x', rule: c, anchorDate: '2026-07-06' });
    const due = nextDueDate(r, TODAY)!;
    const played = processRecurrence([], [r], new Date(`${due}T12:00:00`));
    const last = played.transactions.map((t) => t.date).sort().pop();
    expect(`"${c}" is listed for the very next day the engine records`, last ?? 'none', due);
  }

  // A chain from before rules existed: a transaction carrying only a recurrence
  // label. processRecurrence migrates it, and the migrated rule has to surface
  // here too - otherwise the schedules a user has had running for months are
  // exactly the ones the screen would fail to show.
  const legacySeed: Transaction = {
    id: 'legacy-1', description: 'Gym', amount: 40, currency: 'EUR', baseAmount: 40,
    category: cat, date: '2025-11-11', type: 'expense', recurrence: 'Every month',
  };
  const migrated = processRecurrence([legacySeed], [], TODAY);
  expect('a pre-rules recurring transaction becomes a rule', String(migrated.rules.length), '1');
  expect('and that rule is listed as upcoming',
    upcomingSchedules(migrated.rules, TODAY).map((s) => s.next).join(','), '2026-08-11');

  // A rule from outside the app carrying a cadence nothing understands. It
  // creates no money, so it is not "upcoming" - but it is still sitting in the
  // user's data, and a screen that claims to show everything has to admit it.
  const alien = rule({ id: 'alien', rule: 'Every fortnight on a Tuesday' });
  const mixed = [alien, rule({ id: 'live' }), rule({ id: 'done', endedAt: '2026-07-01' })];
  expect('an unrecognised cadence is not sold as upcoming',
    upcomingSchedules(mixed, TODAY).map((s) => s.rule.id).join(','), 'live');
  expect('but it is still surfaced so it can be removed',
    strandedRules(mixed, TODAY).map((r) => r.id).join(','), 'alien');
  expect('a live rule is never stranded',
    strandedRules([rule({ id: 'live' })], TODAY).length + '', '0');
  expect('nor is one the user ended - that one is simply finished',
    strandedRules([rule({ id: 'done', endedAt: '2026-07-01' })], TODAY).length + '', '0');
  expect('stopping a stranded rule clears it from the screen',
    strandedRules([{ ...alien, endedAt: '2026-08-02' }], TODAY).length + '', '0');
}
