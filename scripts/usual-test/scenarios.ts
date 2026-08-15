// The "usual" benchmark: one median curve that the cumulative chart draws and
// the budget bar reads a single point off. These scenarios pin the properties
// that matter - it resists an outlier month, it refuses to exist without
// enough history, and it lines up index for index across months of different
// lengths.
//
// Run with:  pnpm test:usual   (add --before for the mean it replaced)

import { usualCurve, median } from './lib/usual';
import { dailyAllowance } from './lib/budget';
import { acceptCountry, currencyOfCountry, dismissCountry, observeCountry, travelSuggestion } from './lib/travel';
import { countryOfZone } from './lib/zones';

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

// 6. Year view: one earlier year IS a benchmark ("last year").
heading("6. A single previous year counts; a single previous month doesn't");
{
  const rows = [
    tx('2025-03-10', 900), tx('2025-08-10', 300),
    tx('2026-02-10', 500),
  ];
  const y = usualCurve(rows, 'EUR', { type: 'year', year: 2026, month: 0, quarter: 0, steps: 12 });
  expect('the year benchmark exists with one prior year', y === null ? 'null' : 'a curve', 'a curve');
  expect('and is that year, cumulatively', y ? `${Math.round(y[2])}/${Math.round(y[11])}` : 'null', '900/1200');
  expect('a single prior month still gives nothing',
    curveFor([tx('2026-07-01', 100), tx('2026-06-01', 100)].slice(0, 1), 31), null);
}

// 7. The plain statistic, on its own.
heading('7. median()');
{
  expect('odd count', median([3, 1, 2]), 2);
  expect('even count averages the middle two', median([1, 2, 3, 4]), 2.5);
  expect('an extreme value cannot drag it', median([1, 1, 1, 1, 1000]), 1);
  expect('empty', median([]), null);
}

// 8. The budget card's per-day allowance, and when it should keep quiet.
//
// A per-day figure is advice only inside a band. Below it the number is too
// small to act on; above it there is nothing to act on, and the card starts
// encouraging spending it has no business encouraging. The upper edge is the
// one that bites in real use, because it opens up exactly as the month runs
// out - which is when nobody is looking at this code.
heading('8. dailyAllowance() - the band the advice has to fall inside');
{
  // The screenshot that started this: 3,200 budget, 1,630 spent, 15 days left
  // in a 31-day month. 104/day against a 103/day pace - the case it exists for.
  expect('mid-month, tracking the budget: shown',
    dailyAllowance(1630, 3200, 15, 16 / 31), 104);

  // Same budget, three days left, 690 still to go. 230/day at somebody whose
  // budget implies 103 is not a limit they were going to reach.
  expect('late month with room to burn: silent',
    dailyAllowance(2510, 3200, 3, 28 / 31), null);
  // ...but the same three days ON pace still says something useful.
  expect('late month actually on pace: still shown',
    dailyAllowance(2900, 3200, 3, 28 / 31), 100);

  // The old lower edge, unchanged: a euro a day is arithmetic, not advice.
  expect('almost nothing left: silent', dailyAllowance(3190, 3200, 3, 28 / 31), null);

  // Exactly on each edge, so the comparisons cannot drift into being
  // exclusive without a test noticing. Pace here is 3100/31 = 100.
  expect('at twice the pace: still shown', dailyAllowance(1100, 3100, 10, 21 / 31), 200);
  expect('a hair over twice the pace: silent', dailyAllowance(1090, 3100, 10, 21 / 31), null);

  // Nothing to pace, or nothing to pace with.
  expect('over budget: silent', dailyAllowance(3300, 3200, 5, 26 / 31), null);
  expect('last day: silent', dailyAllowance(1000, 3200, 0, 30 / 31), null);
  expect('no budget: silent', dailyAllowance(500, 0, 10, 21 / 31), null);
  // A month reported as fully elapsed would divide by zero working its length
  // back out; it must fail closed rather than print Infinity at anyone.
  expect('a month with no time left in it: silent', dailyAllowance(1000, 3200, 5, 1), null);

  // Floored, never rounded: 1500 over 9 days is 166.67, and a figure the card
  // introduces with "up to" must not overshoot the budget it came from.
  expect('the figure is floored, so following it cannot overshoot',
    dailyAllowance(1600, 3100, 9, 22 / 31), 166);
}


// 9. The travel nudge: telling a trip from an address.
//
// Every case here is really the same question asked from a different angle -
// is this somewhere you ARE, or somewhere you LIVE. Get it wrong in one
// direction and a traveller never hears about the local currency; get it
// wrong in the other and somebody living in Dubai with euro books is asked
// about dirhams every day for the rest of their life.
heading('9. travelSuggestion() - somewhere you are vs somewhere you live');
{
  const days = (n: number, from = 1, month = '2026-08') =>
    Array.from({ length: n }, (_, i) => `${month}-${String(from + i).padStart(2, '0')}`);

  // The country the app first sees is taken as home on the spot. People
  // install an app at home; waiting a week to believe it would nudge every
  // new user in their own kitchen.
  {
    const h = observeCountry([], 'AE', '2026-08-01');
    expect('the first country seen is home immediately', h[0].home, true);
    expect('and is never nudged', travelSuggestion(h, 'EUR', 'AE'), null);
  }

  // The case that shaped the whole design: living in Dubai, accounting in
  // euros. Country and currency disagree permanently and that is fine.
  {
    const h = observeCountry([], 'AE', '2026-08-01');
    expect('living somewhere your books are not: still silent',
      travelSuggestion(h, 'EUR', 'AE'), null);
    // ...and a real trip from there still speaks up.
    const away = observeCountry(h, 'PH', '2026-08-12');
    expect('but a trip abroad offers the local money',
      travelSuggestion(away, 'EUR', 'PH')?.currency, 'PHP');
  }

  // A fortnight away is a holiday, not an address: the day count alone must
  // not promote it, or the nudge would go quiet halfway through every trip.
  {
    const h = [
      { cc: 'AE', days: ['2026-01-01'], home: true },
      { cc: 'PH', days: days(14) },
    ];
    expect('two weeks in one month is still a trip',
      travelSuggestion(h, 'EUR', 'PH')?.currency, 'PHP');
  }
  // Spread across months, it is somewhere you live.
  {
    const h = [
      { cc: 'AE', days: ['2026-01-01'], home: true },
      { cc: 'PH', days: [...days(5, 1, '2026-07'), ...days(5, 1, '2026-08')] },
    ];
    expect('the same days spread over two months is an address',
      travelSuggestion(h, 'EUR', 'PH'), null);
  }

  // The fast path out, for an actual move: three refusals in a row and it
  // stops asking, long before the slow test above would catch up.
  {
    let h: any = [{ cc: 'IT', days: ['2026-01-01'], home: true }, { cc: 'AE', days: days(3) }];
    expect('first refusal does not silence it', travelSuggestion(h = dismissCountry(h, 'AE'), 'EUR', 'AE')?.currency, 'AED');
    expect('nor the second', travelSuggestion(h = dismissCountry(h, 'AE'), 'EUR', 'AE')?.currency, 'AED');
    expect('the third does', travelSuggestion(dismissCountry(h, 'AE'), 'EUR', 'AE'), null);
    // Taking it once forgives everything before, so a change of mind is not
    // punished by a counter the user cannot see.
    const forgiven = acceptCountry(dismissCountry(dismissCountry(h, 'AE'), 'AE'), 'AE');
    expect('accepting once clears the refusals', travelSuggestion(forgiven, 'EUR', 'AE')?.currency, 'AED');
  }

  // Nothing to offer is not a nudge.
  {
    const h = [{ cc: 'IT', days: ['2026-01-01'], home: true }, { cc: 'FR', days: ['2026-08-12'] }];
    expect('a eurozone hop offers nothing, because nothing would change',
      travelSuggestion(h, 'EUR', 'FR'), null);
    expect('an unplaceable timezone says nothing', travelSuggestion(h, 'EUR', null), null);
    expect('a country we carry no currency for says nothing',
      travelSuggestion(h, 'EUR', 'ZZ'), null);
  }

  // Observation is idempotent within a day - it runs on every launch.
  {
    let h = observeCountry([], 'IT', '2026-08-01');
    h = observeCountry(h, 'IT', '2026-08-01');
    h = observeCountry(h, 'IT', '2026-08-02');
    expect('a day is recorded once however often the app is opened', h[0].days.length, 2);
  }

  // The country -> currency map, including the half derived from the flags
  // already in currencyData and the half that had to be written down.
  expect('from the flag data: the Philippines', currencyOfCountry('PH'), 'PHP');
  expect('from the flag data: Japan', currencyOfCountry('JP'), 'JPY');
  expect('written down: Italy is the euro, not its own flag', currencyOfCountry('IT'), 'EUR');
  expect('written down: Ecuador is dollarised', currencyOfCountry('EC'), 'USD');
  expect('written down: Senegal is the CFA franc', currencyOfCountry('SN'), 'XOF');
  expect('somewhere we cannot place', currencyOfCountry('ZZ'), null);

  // And the timezone table underneath it all.
  expect('a timezone resolves to its country', countryOfZone('Asia/Manila'), 'PH');
  expect('a legacy alias resolves too', countryOfZone('Asia/Calcutta'), 'IN');
  expect('an unknown zone resolves to nothing', countryOfZone('Mars/Olympus'), null);
}


console.log(
  failures === 0
    ? `\nAll checks passed.${OLD ? ' - the mean should NOT do that' : ''}\n`
    : `\n${failures} check(s) FAILED.\n`
);
process.exit(failures === 0 ? 0 : 1);
