import { mockExpenses } from '../components/mockExpenses';
import { convertAmount, BASE_CURRENCY } from '../utils/currency';
import type { Transaction } from '../types';

// The sample dataset has fixed dates. Shift every transaction by whole months
// so the newest sample month lands on the current month — this keeps the
// dashboard's "current month" view populated no matter when demo data is loaded.

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

export function getDemoTransactions(currency: string): Transaction[] {
  const now = new Date();
  const newestMonth = Math.max(...mockExpenses.map((t) => monthIndex(t.date)));
  const offset = now.getFullYear() * 12 + now.getMonth() - newestMonth;
  // The newest sample month is a partial one, with entries up to the 10th. Land
  // that on a month only a few days old and those entries fall after today -
  // sample spending that has not happened yet, which also skews the budget bar's
  // pace against the user. Pull anything past today back onto today.
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;

  return mockExpenses.map((transaction) => {
    // Most sample rows are priced in the user's own currency, so they are
    // converted from the EUR figures in the file. A handful carry an explicit
    // foreign currency - a trip abroad - and those keep it: converting them
    // would erase the very thing they are there to show. Their home value is
    // locked at today's rate, exactly as the app does when you save one.
    const foreign = transaction.currency && transaction.currency !== 'EUR';
    return {
      ...transaction,
      id: `demo-${transaction.id}`,
      date: (() => {
        const shifted = shiftMonths(transaction.date, offset);
        return shifted > todayStr ? todayStr : shifted;
      })(),
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
