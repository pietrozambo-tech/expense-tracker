import { mockExpenses } from '../components/mockExpenses';
import { convertAmount, BASE_CURRENCY } from '../utils/currency';
import { getLanguage } from '../i18n/store';
import { localiseDemoRow, bindDemoRow } from './demoItalian';
import { tripNameOf } from './trips';
import { droppedCategoryIdsFor } from '../components/categories';
import type { Category, Transaction } from '../types';

// The sample dataset has fixed dates. Shift every transaction by whole months
// so the newest sample month lands on the current month — this keeps the
// dashboard's "current month" view populated no matter when demo data is loaded.
//
// Those hand-written months only cover the recent stretch, which left every
// year-over-year view empty on a fresh device: no "vs last year" benchmark on
// the cumulative chart, no dashed previous-year line on Trend, and a year view
// with nothing to compare against. So the months before them are generated,
// back to January of last year, and a full previous calendar year always
// exists. Generated rather than written out because two more years of sample
// transactions would be ~150KB of data in every bundle, including for the
// people who never load the demo.

const monthIndex = (dateStr: string) => {
  const [year, month] = dateStr.split('-').map(Number);
  return year * 12 + (month - 1);
};

function shiftMonths(dateStr: string, offset: number): string {
  const [, , day] = dateStr.split('-').map(Number);
  const total = monthIndex(dateStr) + offset;
  const year = Math.floor(total / 12);
  const month = total % 12; // 0-11
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const clampedDay = Math.min(day, daysInMonth);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

// A stable 0..1 from a string. The variation below has to be deterministic:
// with Math.random the charts would redraw differently on every load, and no
// two screenshots of the demo would ever match.
function hashUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export function getDemoTransactions(currency: string, userCategories: Category[] = []): Transaction[] {
  const now = new Date();
  const sampleMonths = mockExpenses.map((t) => monthIndex(t.date));
  const newestMonth = Math.max(...sampleMonths);
  const oldestMonth = Math.min(...sampleMonths);
  const offset = now.getFullYear() * 12 + now.getMonth() - newestMonth;
  // The newest sample month is a partial one, with entries up to the 10th. Land
  // that on a month only a few days old and those entries fall after today -
  // sample spending that has not happened yet, which also skews the budget bar's
  // pace against the user. Pull anything past today back onto today.
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;

  // The hand-written stretch, ending on this month.
  const recent = mockExpenses.map((t) => ({
    ...t,
    id: `demo-${t.id}`,
    date: shiftMonths(t.date, offset),
  }));

  // Everything before it, back to January of last year.
  const oldestShown = oldestMonth + offset;
  const firstNeeded = (now.getFullYear() - 1) * 12;
  // Only whole months make usable templates - the newest hand-written one stops
  // mid-month, and a history of half-months would read as a spending collapse.
  const templates = [...new Set(sampleMonths)].sort((a, b) => a - b).filter((m) => m !== newestMonth);

  const history: typeof recent = [];
  for (let m = oldestShown - 1; m >= firstNeeded; m--) {
    const back = oldestShown - m; // 1 = the month just before the written ones
    const template = templates[(back - 1) % templates.length];
    // Spending drifts gently down the further back you go, so last year reads
    // as a slightly cheaper year rather than a carbon copy - which is the whole
    // point of a year-over-year view. The drift stays out of the last six
    // months, so the monthly "your usual" benchmark is untouched and the demo
    // never opens on a false "spending faster than usual".
    const drift = 1 - Math.min(back, 30) * 0.006;
    const wobble = 0.95 + hashUnit(`month:${m}`) * 0.1;
    const factor = drift * wobble;

    for (const t of mockExpenses) {
      if (monthIndex(t.date) !== template) continue;
      // Trip rows stay out of the backfill: cloned across a year of months,
      // one London becomes a dozen phantom Londons, each month its own card
      // in the Trips sheet. History is chart fodder; the trip lives once, in
      // the hand-written stretch.
      if (tripNameOf(t.description)) continue;
      // A tenth of the rows drop out, so no two months are identical.
      if (hashUnit(`${m}:${t.id}`) < 0.1) continue;
      // Scaling every category by the same number made last year a smaller
      // copy of this one: every single category came out "up", every arrow
      // red, which is not what a year looks like and tells the user nothing.
      // Each category gets its own multiplier instead, so some things cost
      // more than they used to and some less.
      //
      // Rent and salary are left on the plain drift: they only ever went up,
      // and a demo showing a 20% pay cut or a landlord dropping the rent
      // reads as broken rather than as variety.
      const steady = t.type === 'income' || t.category?.name === 'Housing';
      const perCategory = steady ? 1 : 0.78 + hashUnit(`cat:${t.category?.name ?? ''}`) * 0.55;
      const scaled = t.amount * factor * perCategory;
      history.push({
        ...t,
        id: `demo-h${m}-${t.id}`,
        date: shiftMonths(t.date, m - monthIndex(t.date)),
        // Salaries and payouts come in round numbers; groceries do not.
        amount: t.type === 'income' ? Math.round(scaled / 10) * 10 : Math.round(scaled * 100) / 100,
      });
    }
  }

  // Demo rows bind to the USER's categories by id, whatever the language -
  // their catalogue may be renamed, or seeded in the other language, and a row
  // filed under a name their catalogue doesn't carry falls off the Dashboard.
  // In an Italian UI the descriptions translate too (see demoItalian.ts).
  const localise: (t: Transaction) => Transaction =
    getLanguage() === 'it'
      ? (t) => localiseDemoRow(t, userCategories)
      : (t) => bindDemoRow(t, userCategories);

  // A language may leave a starter category out entirely (Italian drops Office
  // Food). Its sample rows go with it: kept, they would bind to a category the
  // user's catalogue does not have, and the Dashboard would silently drop them
  // anyway - but they would still be counted in totals and exports.
  const dropped = droppedCategoryIdsFor(getLanguage());
  const rows =
    dropped.size === 0
      ? [...recent, ...history]
      : [...recent, ...history].filter((t) => !t.category?.id || !dropped.has(t.category.id));

  return rows.map(localise).map((transaction) => {
    // Most sample rows are priced in the user's own currency, so they are
    // converted from the EUR figures in the file. A handful carry an explicit
    // foreign currency - a trip abroad - and those keep it: converting them
    // would erase the very thing they are there to show. Their home value is
    // locked at today's rate, exactly as the app does when you save one.
    const foreign = transaction.currency && transaction.currency !== 'EUR';
    return {
      ...transaction,
      date: transaction.date > todayStr ? todayStr : transaction.date,
      amount: foreign
        ? transaction.amount
        : currency === 'EUR'
          ? transaction.amount
          : Math.round(convertAmount(transaction.amount, 'EUR', currency) * 100) / 100,
      currency: foreign ? transaction.currency : currency,
      ...(foreign
        ? { baseAmount: convertAmount(transaction.amount, transaction.currency, BASE_CURRENCY) }
        : {}),
    };
  });
}
