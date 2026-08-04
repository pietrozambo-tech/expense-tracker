// The day-of-week breakdown: an average per calendar occurrence of each
// weekday, not a total. These scenarios pin the properties that matter - a
// month with five Saturdays cannot crown Saturday just for occurring more
// often, days that have not happened yet do not water the averages down,
// recurring rows can be excluded, and the takeaway line only claims what the
// numbers support.
//
// Run with:  pnpm test:dow   (add --before for the naive totals it replaced)

import { dayOfWeekBreakdown, dowTakeaway, weekOrder, DAY_LABELS, type DayBucket } from './lib/dayOfWeek';

const OLD = process.argv.includes('--before');

const heading = (s: string) => console.log(`\n${s}\n${'-'.repeat(s.length)}`);
const say = (s: string) => console.log('   ' + s);

let failures = 0;
function expect(label: string, actual: unknown, expected: unknown) {
  const a = String(actual), e = String(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) { console.log(`         expected: ${e}`); console.log(`         actual:   ${a}`); }
}

const tx = (date: string, amount: number, recurrence = 'Never repeat') =>
  ({ date, amount, type: 'expense' as const, currency: 'EUR', recurrence });

// August 2026 starts on a Saturday: Sat/Sun/Mon fall five times, Tue-Fri four.
const AUG = { year: 2026, month: 7, today: new Date(2026, 8, 15) };

const at = (buckets: DayBucket[], label: string) => buckets.find((b) => b.label === label)!;

console.log(OLD ? '\nRunning the NAIVE TOTALS this replaced' : '\nRunning the CURRENT per-occurrence averages');

// 1. The reason the statistic is an average: occurrence counts differ.
heading('1. Five Saturdays cannot beat four dearer Tuesdays');
{
  const rows = [
    ...[1, 8, 15, 22, 29].map((d) => tx(`2026-08-${String(d).padStart(2, '0')}`, 100)), // 500 total
    ...[4, 11, 18, 25].map((d) => tx(`2026-08-${String(d).padStart(2, '0')}`, 110)),    // 440 total
  ];
  const b = dayOfWeekBreakdown(rows, 'EUR', AUG);
  const sat = at(b, 'Saturday'), tue = at(b, 'Tuesday');
  say(`Saturday: 500 over 5 days. Tuesday: 440 over 4 days.`);
  const dearest = OLD
    ? (sat.total > tue.total ? 'Saturday' : 'Tuesday') // ranked by total
    : [...b].sort((x, y) => y.avg - x.avg)[0].label;
  expect('the expensive day is the one that costs more PER DAY', dearest, 'Tuesday');
  expect('a typical Saturday is 100', Math.round(sat.avg), 100);
  expect('a typical Tuesday is 110', Math.round(tue.avg), 110);
  expect('and the day counts ride along (Sat)', sat.occurrences, 5);
  expect('and the day counts ride along (Tue)', tue.occurrences, 4);
}

// 2. A running period only counts the days that have happened.
heading('2. Days still to come do not water the average down');
{
  // Mid-August: the 12th (a Wednesday). Two Saturdays so far, not five.
  const rows = [tx('2026-08-01', 100)];
  const b = dayOfWeekBreakdown(rows, 'EUR', { year: 2026, month: 7, today: new Date(2026, 7, 12) });
  const sat = at(b, 'Saturday');
  say('100 spent on Saturday the 1st; today is the 12th, so 2 Saturdays exist');
  expect('the average divides by the Saturdays SO FAR',
    Math.round(OLD ? sat.total / 5 : sat.avg), OLD ? 50 : 50);
  expect('the day count says 2, not 5', sat.occurrences, 2);

  const future = dayOfWeekBreakdown(rows, 'EUR', { year: 2026, month: 8, today: new Date(2026, 7, 12) });
  expect('a month that has not started yet holds nothing',
    future.every((x) => x.occurrences === 0 && x.avg === 0), true);
}

// 3. Recurring rows can be excluded - they are calendar noise, not behaviour.
heading('3. One-offs only: rent does not own the weekday the 1st fell on');
{
  const rows = [
    tx('2026-08-01', 1000, 'Every month'), // rent, on a Saturday
    tx('2026-08-04', 10),                  // coffee, on a Tuesday
  ];
  const all = dayOfWeekBreakdown(rows, 'EUR', AUG);
  const oneOff = dayOfWeekBreakdown(rows, 'EUR', { ...AUG, oneOffsOnly: true });
  expect('with everything in, Saturday carries the rent', Math.round(at(all, 'Saturday').total), 1000);
  expect('one-offs only: Saturday drops to zero', at(oneOff, 'Saturday').total, 0);
  expect('while the coffee stays', Math.round(at(oneOff, 'Tuesday').total), 10);

  // A rule-made occurrence can arrive with only the chain marker: an edit,
  // an import or an older build may have wiped the label. It is still rent.
  const marked = [
    { ...tx('2026-08-08', 500), recurrence: 'Never repeat', recurrenceOf: 'rule-1' },
    tx('2026-08-11', 10),
  ];
  const m = dayOfWeekBreakdown(marked, 'EUR', { ...AUG, oneOffsOnly: true });
  expect('the recurrenceOf marker alone is enough to exclude a row', at(m, 'Saturday').total, 0);
}

// 4. Income is not spending.
heading('4. Payday does not make Friday look expensive');
{
  const rows = [
    { date: '2026-08-07', amount: 3000, type: 'income' as const, currency: 'EUR', recurrence: 'Every month' },
    tx('2026-08-03', 50),
  ];
  const b = dayOfWeekBreakdown(rows, 'EUR', AUG);
  expect('Friday holds no salary', at(b, 'Friday').total, 0);
  expect('Monday holds the spending', Math.round(at(b, 'Monday').total), 50);
}

// 5. The full-year window spans every month.
heading('5. A year scope counts the whole year');
{
  // 2025 started on a Wednesday: 53 Wednesdays, 52 of everything else.
  const rows = [tx('2025-03-07', 200), tx('2025-11-07', 100)]; // both Fridays
  const b = dayOfWeekBreakdown(rows, 'EUR', { year: 2025, today: new Date(2026, 6, 1) });
  const fri = at(b, 'Friday');
  expect('both Fridays count, months apart', Math.round(fri.total), 300);
  expect('over the 52 Fridays of 2025', fri.occurrences, 52);
  expect('and 2025 has 53 Wednesdays', at(b, 'Wednesday').occurrences, 53);
}

// 6. The order of the rows follows the chosen week start.
heading('6. Week order follows Settings');
{
  expect('Monday start', weekOrder(1).map((d) => DAY_LABELS[d][0]).join(''), 'MTWTFSS');
  expect('Sunday start', weekOrder(0).map((d) => DAY_LABELS[d][0]).join(''), 'SMTWTFS');
  expect('Saturday start', weekOrder(6).map((d) => DAY_LABELS[d][0]).join(''), 'SSMTWTF');
  expect('anything else falls back to Monday', weekOrder(3).map((d) => DAY_LABELS[d][0]).join(''), 'MTWTFSS');
  const b = dayOfWeekBreakdown([], 'EUR', { ...AUG, weekStartsOn: 0 });
  expect('and the buckets come back in that order', b[0].label + '/' + b[6].label, 'Sunday/Saturday');
}

// 7. The takeaway line claims only what the numbers support.
heading('7. The takeaway');
{
  const bucket = (label: string, avg: number, occurrences = 4): DayBucket =>
    ({ day: DAY_LABELS.indexOf(label), label, avg, occurrences, total: avg * occurrences, txCount: 1 });
  const week = (avgs: number[]) => DAY_LABELS.map((l, i) => bucket(l, avgs[i]));

  //                         Sun Mon Tue Wed Thu Fri Sat
  const spiky = week([40, 20, 20, 25, 30, 45, 50]);
  expect('names the ratio against the cheapest day', dowTakeaway(spiky), 'Saturdays cost 2.5x a typical Monday.');
  const whole = week([30, 20, 22, 25, 30, 35, 40]);
  expect('a whole-number ratio drops the decimal', dowTakeaway(whole), 'Saturdays cost 2x a typical Monday.');
  const even = week([100, 101, 99, 100, 102, 98, 100]);
  expect('an even week says so instead of inventing a spike', dowTakeaway(even), 'Spending is spread fairly evenly across the week.');
  const gap = week([40, 0, 20, 25, 30, 45, 50]);
  expect('a day with no spending: no ratio against zero', dowTakeaway(gap), 'Most spending lands on Saturdays.');
  const thin = week([0, 0, 0, 0, 0, 0, 50]);
  expect('one spending day is not a pattern', dowTakeaway(thin), null);
  const empty = DAY_LABELS.map((l) => bucket(l, 0, 0));
  expect('no data, no claim', dowTakeaway(empty), null);
}

console.log(
  failures === 0
    ? `\nAll checks passed.${OLD ? ' - the naive version should NOT do that' : ''}\n`
    : `\n${failures} check(s) FAILED.\n`
);
process.exit(failures === 0 ? 0 : 1);
