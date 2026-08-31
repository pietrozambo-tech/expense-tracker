import { ExpenseItem } from './ExpenseItem';
import { IncomeItem } from './IncomeItem';
import { mineAmount } from '../utils/currency';
import { AmountText } from './AmountText';
import { t } from '../i18n';
import { cachedDateFormat, dateLocale } from '../i18n/store';

// One literal object, so the formatter cache sees one shape.
const DAY_HEADER: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };
import type { Transaction } from '../types';
import { parseLocalDate } from '../lib/dates';

interface ActivityDayGroupProps {
  date: string;
  transactions: Transaction[];
  onTransactionTap: (id: string) => void;
  onDeleteTransaction: (id: string) => void;
  currency: string;
  /** Their unread changes, by transaction id. Passed through rather than
   *  derived here: one list feeds the dot, the shared view and these rows. */
  badges?: Map<string, 'new' | 'updated'>;
  /** Selection mode, passed straight through to the rows. */
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function ActivityDayGroup({
  date,
  transactions,
  onTransactionTap,
  onDeleteTransaction,
  currency,
  badges,
  selectable = false,
  selectedIds,
  onToggleSelect
}: ActivityDayGroupProps) {
  const isToday = (() => {
    const parsed = parseLocalDate(date);
    if (isNaN(parsed.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    parsed.setHours(0, 0, 0, 0);
    return parsed.getTime() === today.getTime();
  })();

  const formatDate = (dateString: string) => {
    const parsed = parseLocalDate(dateString);
    if (isNaN(parsed.getTime())) return dateString;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(parsed);
    selectedDate.setHours(0, 0, 0, 0);

    if (selectedDate.getTime() === today.getTime()) return t('date.today');

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (selectedDate.getTime() === yesterday.getTime()) return t('date.yesterday');

    // The kept formatter: this header renders once per day group, and a
    // month of groups was 27ms of formatter construction on every repaint.
    return cachedDateFormat(dateLocale(), DAY_HEADER).format(parsed);
  };

  // Net daily total in the user's currency: income adds, expenses subtract.
  //
  // A day that ended up ahead is worth spotting from a scroll, so it takes the
  // income green; an ordinary spending day stays grey rather than turning red,
  // because almost every day is one and a page of red reads as an error state.
  const netTotal = transactions.reduce((sum, t) => {
    const converted = mineAmount(t, currency);
    return t.type === 'income' ? sum + converted : sum - converted;
  }, 0);
  const totalSign = netTotal >= 0 ? '+' : '-';
  const ahead = netTotal > 0;

  return (
    <div className="mb-3">
      {/* Day Header. Today gets a brand-tinted band and an indigo label - one
          anchor in a list that is otherwise an undifferentiated run of days,
          and the only place on this screen the brand colour appears. */}
      <div
        className="flex items-center justify-between px-6 py-1"
        style={{ backgroundColor: isToday ? 'rgba(79, 116, 243, 0.07)' : 'var(--day-head)' }}
      >
        <h3
          className="font-bold text-[10px] uppercase tracking-wider"
          style={{ color: isToday ? 'var(--accent-ink)' : 'var(--ink-2)' }}
        >
          {formatDate(date)}
        </h3>
        <AmountText
          sign={totalSign}
          amount={Math.abs(netTotal)}
          currency={currency}
          decimals={2}
          className="text-[10px] font-medium tabular-nums pr-4"
          style={{ minWidth: '80px', textAlign: 'right', color: ahead ? 'var(--tone-income)' : 'var(--ink-2)' }}
        />
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
              selectable={selectable}
              selected={selectedIds?.has(transaction.id) ?? false}
              onToggleSelect={onToggleSelect}
            />
          ) : (
            <ExpenseItem
              key={transaction.id}
              expense={transaction}
              onTap={onTransactionTap}
              onDelete={onDeleteTransaction}
              currency={currency}
              badge={badges?.get(transaction.id) ?? null}
              selectable={selectable}
              selected={selectedIds?.has(transaction.id) ?? false}
              onToggleSelect={onToggleSelect}
            />
          )
        )}
      </div>
    </div>
  );
}
