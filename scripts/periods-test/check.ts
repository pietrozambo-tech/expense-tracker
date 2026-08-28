// Which periods a screen may be pointed at.
//
// A single future-dated row - a flight booked for December, a schedule seeded
// ahead - used to put its month in Activity's picker, and the list then showed
// spending that has not happened. The Dashboard already refused. These are the
// cases that keep the three screens saying the same thing.

import { clampYear, selectableMonths, selectableYears } from '../../src/app/lib/periods';

let failed = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failed += 1;
};

// 28 August 2026, the day the app is being used.
const TODAY = new Date(2026, 7, 28);

// ── years ─────────────────────────────────────────────────────────────────
{
  const dates = ['2024-03-02', '2025-11-30', '2026-08-01'];
  ok(selectableYears(dates, TODAY).join(',') === '2026,2025,2024', 'years with data, newest first');

  const withFuture = [...dates, '2027-01-15', '2026-12-31'];
  ok(selectableYears(withFuture, TODAY).join(',') === '2026,2025,2024',
    'a row booked for next year does not open next year');
  // December 2026 is future but IN this year, so the year stays - the month
  // list is what keeps December out.
  ok(selectableYears(['2026-12-31'], TODAY).join(',') === '2026', 'a future month keeps its own year');

  ok(selectableYears([], TODAY).join(',') === '2026', 'an empty ledger still offers somewhere to stand');
  ok(selectableYears(['2028-01-01'], TODAY).join(',') === '2026',
    'and so does one holding nothing but the future');
}

// ── months ────────────────────────────────────────────────────────────────
{
  const dates = ['2026-01-10', '2026-08-05', '2026-08-27', '2026-09-01', '2026-12-31'];
  ok(selectableMonths(dates, 2026, TODAY).join(',') === '0,7',
    'months with data up to this one - September and December are not offered');
  // The current month is offered whole, including the days still to come in
  // it: that is the month you are living in, and the Dashboard counts it too.
  ok(selectableMonths(['2026-08-31'], 2026, TODAY).join(',') === '7',
    'a row later THIS month keeps the month, which is the one you are in');

  ok(selectableMonths(['2025-02-03', '2025-11-20'], 2025, TODAY).join(',') === '1,10',
    'a past year is unclipped - all of it is behind us');
  ok(selectableMonths(dates, 2027, TODAY).length === 0, 'a future year yields nothing');
  ok(selectableMonths(dates, NaN, TODAY).length === 0, 'and so does a year that is not a year');
  ok(selectableMonths([], 2026, TODAY).length === 0, 'no data, no months');
}

// ── the fallback for a view that points somewhere unreachable ─────────────
{
  ok(clampYear(2025, TODAY) === 2025, 'a past year is left alone');
  ok(clampYear(2026, TODAY) === 2026, 'and so is this one');
  ok(clampYear(2027, TODAY) === 2026, 'a future year falls back to this one');
  ok(clampYear(NaN, TODAY) === 2026, 'and so does a broken one');
}

console.log(failed ? `\n${failed} FAILED` : '\nNo screen can be pointed at a month that has not happened.');
process.exit(failed ? 1 : 0);
