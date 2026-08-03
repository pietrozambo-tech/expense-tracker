// The "usual" benchmark: one median curve that the cumulative chart draws and
// the budget bar reads a single point off. These scenarios pin the properties
// that matter - it resists an outlier month, it refuses to exist without
// enough history, and it lines up index for index across months of different
// lengths.
//
// Run with:  pnpm test:usual   (add --before for the mean it replaced)

import { usualCurve, median } from './lib/usual';

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

const tx = (date: string, amount: number) => ({ date, amount, type: 'expense' as const, currency: 'EUR' });

/** The pre-fix statistic: a plain mean of what was spent by the same day. */
function meanByDay(rows: { date: string; amount: number }[], year: number, month: number, day: number, lookback = 6) {
  let sum = 0, n = 0;
  for (let back = 1; back <= lookback; back++) {
    const d = new Date(year, month - back, 1);
    const y = d.getFullYear(), m = d.getMonth();
    const inMonth = rows.filter((r) => { const [ry, rm] = r.date.split('-').map(Number); return ry === y && rm - 1 === m; });
    if (inMonth.length === 0) continue;
    const cut = Math.min(day, new Date(y, m + 1, 0).getDate());
    sum += inMonth.filter((r) => Number(r.date.slice(8)) <= cut).reduce((a, r) => a + r.amount, 0);
    n++;
  }
  return n > 0 ? sum / n : null;
}

const curveFor = (rows: any[], steps: number, opts: any = {}) =>
  usualCurve(rows, 'EUR', { type: 'month', year: 2026, month: 7, quarter: 0, steps, ...opts });

const at = (c: number[] | null, day: number) => (c ? Math.round(c[day - 1]) : null);

console.log(OLD ? '\nRunning the MEAN this replaced' : '\nRunning the CURRENT median');

// 1. The reason for the change: one holiday month must not move the benchmark.
heading('1. An outlier month does not move "usual"');
{
  // Five ordinary months: 100 on the 1st, 100 more on the 15th.
  const rows: any[] = [];
  for (const m of ['02', '03', '04', '05', '06']) {
    rows.push(tx(`2026-${m}-01`, 100), tx(`2026-${m}-15`, 100));
  }
  // July: a trip. Same shape, ten times the money.
  rows.push(tx('2026-07-01', 1000), tx('2026-07-15', 1000));

  const c = curveFor(rows, 31);
  const meanDay1 = meanByDay(rows, 2026, 7, 1);
  say(`five months at 100 by day 1, one at 1000`);
  say(`mean says ${Math.round(meanDay1 ?? 0)}, median says ${at(c, 1)}`);
  expect('the benchmark is the typical month, not the average',
    OLD ? Math.round(meanDay1 ?? 0) : at(c, 1), 100);
  expect('and it holds later in the month too', OLD ? 'n/a' : at(c, 20), OLD ? 'n/a' : 200);
}

// 2. It must refuse to exist when there is nothing to average over.
heading('2. No benchmark without enough history');
{
  expect('no history at all', curveFor([], 31), null);
  expect('a single earlier month is not a benchmark',
    curveFor([tx('2026-07-01', 100)], 31), null);
  const two = curveFor([tx('2026-07-01', 100), tx('2026-06-01', 100)], 31);
  expect('two earlier months are', two === null ? 'null' : 'a curve', 'a curve');
  say('months with no spending do not vote - they are months before tracking started');
  const gap = curveFor([tx('2026-07-01', 100), tx('2026-02-01', 300)], 31);
  expect('two months with data, four empty ones between: still a benchmark',
    gap === null ? 'null' : `${at(gap, 1)}`, '200');
}

// 3. Cumulative means never going down, and ending at the period total.
heading('3. The curve is cumulative and complete');
{
  const rows = [
    tx('2026-06-05', 50), tx('2026-06-20', 70),
    tx('2026-07-05', 50), tx('2026-07-20', 70),
  ];
  const c = curveFor(rows, 31)!;
  expect('starts at zero before anything is spent', at(c, 1), 0);
  expect('picks up the first expense on its day', at(c, 5), 50);
  expect('holds flat until the next one', at(c, 19), 50);
  expect('and ends at the period total', at(c, 31), 120);
  const monotonic = c.every((v, i) => i === 0 || v >= c[i - 1]);
  expect('never decreases', String(monotonic), 'true');
}

// 4. Months are different lengths; the alignment must not lie.
heading('4. Short months align without inventing spending');
{
  // Both prior months spend early, so the median is not what is under test -
  // the clamping is. February has 28 days: asked for 31 steps, its last three
  // repeat the month total rather than running on.
  const rows = [tx('2026-01-05', 200), tx('2026-02-05', 200)];
  const c = usualCurve(rows, 'EUR', { type: 'month', year: 2026, month: 2, quarter: 0, steps: 31 })!;
  expect('the spend shows on its day', at(c, 5), 200);
  expect('day 28 has the whole month', at(c, 28), 200);
  expect('day 31 of a 28-day month is still the whole month, not more', at(c, 31), 200);

  // And a month genuinely ending on the 31st is not truncated.
  const late = usualCurve([tx('2026-01-31', 200), tx('2026-03-31', 200)], 'EUR',
    { type: 'month', year: 2026, month: 4, quarter: 0, steps: 31 })!;
  expect('a last-day expense still lands by day 31', at(late, 31), 200);
}

// 5. Income is not spending.
heading('5. Only expenses count');
{
  const rows = [
    { ...tx('2026-06-02', 100) },
    { date: '2026-06-03', amount: 3000, type: 'income' as const, currency: 'EUR' },
    { ...tx('2026-07-02', 100) },
    { date: '2026-07-03', amount: 3000, type: 'income' as const, currency: 'EUR' },
  ];
  const c = curveFor(rows, 31)!;
  expect('salary does not lift the spending benchmark', at(c, 10), 100);
}

// 6. The plain statistic, on its own.
heading('6. median()');
{
  expect('odd count', median([3, 1, 2]), 2);
  expect('even count averages the middle two', median([1, 2, 3, 4]), 2.5);
  expect('an extreme value cannot drag it', median([1, 1, 1, 1, 1000]), 1);
  expect('empty', median([]), null);
}

console.log(
  failures === 0
    ? `\nAll checks passed.${OLD ? ' - the mean should NOT do that' : ''}\n`
    : `\n${failures} check(s) FAILED.\n`
);
process.exit(failures === 0 ? 0 : 1);
