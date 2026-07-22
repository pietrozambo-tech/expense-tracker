import { ExpenseItem } from './ExpenseItem';
import { IncomeItem } from './IncomeItem';
import { formatAmountListView, convertAmount } from '../utils/currency';
import type { Transaction } from '../types';

interface ActivityDayGroupProps {
  date: string;
  transactions: Transaction[];
  onTransactionTap: (id: string) => void;
  onDeleteTransaction: (id: string) => void;
  currency: string;
}

export function ActivityDayGroup({
  date,
  transactions,
  onTransactionTap,
  onDeleteTransaction,
  currency
}: ActivityDayGroupProps) {
  const formatDate = (dateString: string) => {
    const parsed = new Date(dateString);
    if (isNaN(parsed.getTime())) return dateString;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(parsed);
    selectedDate.setHours(0, 0, 0, 0);

    if (selectedDate.getTime() === today.getTime()) return 'Today';

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (selectedDate.getTime() === yesterday.getTime()) return 'Yesterday';

    return parsed.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    });
  };

  // Net daily total in the user's currency: income adds, expenses subtract
  const hasIncome = transactions.some(t => t.type === 'income');
  const hasExpense = transactions.some(t => t.type !== 'income');
  const netTotal = transactions.reduce((sum, t) => {
    const converted = convertAmount(t.amount, t.currency || currency, currency);
    return t.type === 'income' ? sum + converted : sum - converted;
  }, 0);

  // Pure expense days read like a spending total (plain, no sign); any day with
  // income shows the signed net, green when positive
  const totalLabel = !hasIncome
    ? formatAmountListView(-netTotal, currency, 2)
    : `${netTotal >= 0 ? '+' : '-'}${formatAmountListView(Math.abs(netTotal), currency, 2)}`;
  const totalColor = hasIncome && netTotal >= 0 ? '#34C759' : undefined;

  return (
    <div className="mb-3">
      {/* Day Header */}
      <div className="flex items-center justify-between px-6 py-1 bg-neutral-50/50">
        <h3 className="text-neutral-500 font-bold text-[10px] uppercase tracking-wider">{formatDate(date)}</h3>
        <span
          className="text-[10px] font-medium tabular-nums pr-4"
          style={{ minWidth: '80px', textAlign: 'right', color: totalColor || '#A3A3A3' }}
        >
          {totalLabel}
        </span>
      </div>

      {/* Transaction rows: income entries render green with +, expenses plain */}
      <div>
        {transactions.map((transaction) =>
          transaction.type === 'income' ? (
            <IncomeItem
              key={transaction.id}
              income={transaction}
              onTap={onTransactionTap}
              onDelete={onDeleteTransaction}
              currency={currency}
            />
          ) : (
            <ExpenseItem
              key={transaction.id}
              expense={transaction}
              onTap={onTransactionTap}
              onDelete={onDeleteTransaction}
              currency={currency}
            />
          )
        )}
      </div>
    </div>
  );
}
