import { mockExpenses } from '../components/mockExpenses';
import { convertAmount } from '../utils/currency';
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

  return mockExpenses.map((transaction) => ({
    ...transaction,
    id: `demo-${transaction.id}`,
    date: shiftMonths(transaction.date, offset),
    amount:
      currency === 'EUR'
        ? transaction.amount
        : Math.round(convertAmount(transaction.amount, 'EUR', currency) * 100) / 100,
    currency,
  }));
}
