import { Trash2, Repeat } from 'lucide-react';
import { t } from '../i18n';
import { homeAmount } from '../utils/currency';
import { AmountText } from './AmountText';
import { useState } from 'react';
import { getCategoryIcon } from './categoryIcons';
import { useSwipeToDelete } from '../lib/useSwipeToDelete';
import { SelectDot } from './SelectDot';
import { formatFullDate } from '../lib/dates';

// The app's income green, the same one the Expenses/Income switches use. Money
// arriving and money leaving used to be typeset identically here, so a salary
// and a rent bill differed by one "+" glyph at 14px - the sign was carrying the
// whole distinction on the busiest list in the app. Expenses stay near-black
// rather than turning red: most rows are expenses, and a page of red reads as
// an error state instead of an ordinary month.
const INCOME_AMOUNT: React.CSSProperties = { color: 'var(--tone-income)' };
const INCOME_SECONDARY: React.CSSProperties = { color: 'var(--tone-income)', opacity: 0.65 };

interface IncomeItemProps {
  income: {
    id: string;
    description: string;
    amount: number;
    category: {
      id: string;
      name: string;
      icon: string;
      color: string;
      bgColor: string;
    };
    subcategory?: string;
    date: string;
    currency?: string;
    recurrence?: string;
  };
  onTap: (id: string) => void;
  onDelete: (id: string) => void;
  currency: string; // fallback when the transaction has no currency of its own
  showDate?: boolean; // show the transaction date on the row (e.g. amount-sorted lists with no day headers)
  /** Activity is in selection mode: a tick leads the row and a tap ticks it. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}



export function IncomeItem({
  income, onTap, onDelete, currency, showDate = false,
  selectable = false, selected = false, onToggleSelect,
}: IncomeItemProps) {
  const { ref, translateX, dragging, isOpen, close, handleTap, rowStyle } = useSwipeToDelete(!selectable);

  const Icon = getCategoryIcon(income.category.icon);
  const transactionCurrency = income.currency || currency;
  const showConversion = transactionCurrency !== currency;
  const convertedAmount = showConversion ? homeAmount(income, currency) : null;
  const isRecurrent = income.recurrence && income.recurrence !== 'Never repeat';

  return (
    <>
      <div className="relative overflow-hidden" style={{ backgroundColor: 'var(--bg-card)' }}>
        {/* Delete action revealed by swiping the row left. Not while selecting -
            see ExpenseItem. */}
        {!selectable && (
          <button
            // Straight to the delete, no question in between. The toast that
            // follows carries Undo for five seconds - the same answer fifty
            // ticked rows get - so asking first was the app charging a tap for
            // a safety net it already had.
            onClick={() => {
              close();
              onDelete(income.id);
            }}
            aria-label="Delete income"
            tabIndex={isOpen ? 0 : -1}
            className="absolute right-0 top-0 bottom-0 w-20 flex items-center justify-center active:bg-red-600"
            style={{ backgroundColor: 'var(--tone-danger)' }}
          >
            <Trash2 size={20} className="text-white" />
          </button>
        )}

        {/* Swipeable row */}
        <button
          ref={ref}
          data-row-id={income.id}
          onClick={() => (selectable ? onToggleSelect?.(income.id) : handleTap(() => onTap(income.id)))}
          className="w-full flex items-center gap-3 px-6 py-2.5 active:bg-neutral-100 min-h-[52px] relative"
          style={{
            ...rowStyle,
            backgroundColor: selected ? 'var(--wash-accent2)' : 'var(--bg-card)',
            transform: `translateX(${translateX}px)`,
            transition: dragging ? 'none' : 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {selectable && <SelectDot on={selected} />}

          {/* Category Icon */}
          <div className={`flex-shrink-0 w-8 h-8 ${income.category.bgColor} rounded-lg flex items-center justify-center`}>
            <Icon className={`w-4 h-4 ${income.category.color}`} strokeWidth={2} />
          </div>

          {/* Description & Category/Subcategory */}
          <div className="flex-1 text-left min-w-0 pr-2">
            <p className="text-neutral-900 leading-tight truncate text-sm">{income.description}</p>
            <p className="text-neutral-500 text-[11px] truncate mt-0.5 font-medium">
              {income.category.name}
              {income.subcategory && ` - ${income.subcategory}`}
            </p>
            {showDate ? (
              <p className="text-neutral-400 text-[10px] mt-0.5 font-medium">
                {formatFullDate(income.date)}
              </p>
            ) : null}
            {/* No third line for recurring rows: the repeat icon beside the
                amount already says it, and the caps line said it again. */}
          </div>

          {/* Amount. Recurrence marker leads, so the amount's right edge stays
              on the shared column - same as ExpenseItem. */}
          <div className="flex-shrink-0 flex items-center gap-1.5 text-right pr-4">
            {isRecurrent && <Repeat size={14} className="text-neutral-400 flex-shrink-0" strokeWidth={2} />}
            <div>
              {showConversion && convertedAmount !== null ? (
                <>
                  <p className="font-bold tabular-nums text-sm" style={INCOME_AMOUNT}>
                    <AmountText sign="+" amount={convertedAmount} currency={currency} decimals={2} />
                  </p>
                  <p className="text-[10px] tabular-nums mt-0.5 font-medium" style={INCOME_SECONDARY}>
                    <AmountText sign="+" amount={income.amount} currency={transactionCurrency} decimals={2} />
                  </p>
                </>
              ) : (
                <p className="font-bold tabular-nums text-sm" style={INCOME_AMOUNT}>
                  <AmountText sign="+" amount={income.amount} currency={transactionCurrency} decimals={2} />
                </p>
              )}
            </div>
          </div>
        </button>
      </div>

    </>
  );
}
