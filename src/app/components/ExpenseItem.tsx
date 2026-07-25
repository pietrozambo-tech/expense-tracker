import { Trash2, Repeat } from 'lucide-react';
import { formatAmountListView, homeAmount } from '../utils/currency';
import { useState } from 'react';
import { getCategoryIcon } from './categoryIcons';
import { useSwipeToDelete } from '../lib/useSwipeToDelete';

interface ExpenseItemProps {
  expense: {
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
}

// Compact date like "1 Jul" for inline row use
const formatShortDate = (dateString: string) => {
  const parsed = new Date(dateString);
  if (isNaN(parsed.getTime())) return dateString;
  return parsed.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
};

export function ExpenseItem({ expense, onTap, onDelete, currency, showDate = false }: ExpenseItemProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { ref, translateX, dragging, isOpen, close, handleTap, rowStyle } = useSwipeToDelete();

  const Icon = getCategoryIcon(expense.category.icon);
  const transactionCurrency = expense.currency || currency;
  const showConversion = transactionCurrency !== currency;
  const convertedAmount = showConversion ? homeAmount(expense, currency) : null;
  const isRecurrent = expense.recurrence && expense.recurrence !== 'Never repeat';
  // A negative expense is a refund / credit: show it as a green "+" inflow
  // instead of a broken double-minus.
  const isCredit = expense.amount < 0;
  const sign = isCredit ? '+' : '-';
  const creditStyle = isCredit ? { color: '#34C759' } : undefined;

  return (
    <>
      <div className="relative overflow-hidden" style={{ backgroundColor: 'white' }}>
        {/* Delete action revealed by swiping the row left */}
        <button
          onClick={() => {
            close();
            setShowDeleteConfirm(true);
          }}
          aria-label="Delete expense"
          tabIndex={isOpen ? 0 : -1}
          className="absolute right-0 top-0 bottom-0 w-20 flex items-center justify-center active:bg-red-600"
          style={{ backgroundColor: '#EF4444' }}
        >
          <Trash2 size={20} className="text-white" />
        </button>

        {/* Swipeable row */}
        <button
          ref={ref}
          onClick={() => handleTap(() => onTap(expense.id))}
          className="w-full flex items-center gap-3 px-6 py-2.5 active:bg-neutral-100 min-h-[52px] relative"
          style={{
            ...rowStyle,
            backgroundColor: 'white',
            transform: `translateX(${translateX}px)`,
            transition: dragging ? 'none' : 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {/* Category Icon */}
          <div className={`flex-shrink-0 w-8 h-8 ${expense.category.bgColor} rounded-lg flex items-center justify-center`}>
            <Icon className={`w-4 h-4 ${expense.category.color}`} strokeWidth={2} />
          </div>

          {/* Description & Category/Subcategory */}
          <div className="flex-1 text-left min-w-0 pr-2">
            <p className="text-neutral-900 leading-tight truncate text-sm">{expense.description}</p>
            <p className="text-neutral-500 text-[11px] truncate mt-0.5 font-medium">
              {expense.category.name}
              {expense.subcategory && ` - ${expense.subcategory}`}
            </p>
            {showDate ? (
              <p className="text-neutral-400 text-[10px] mt-0.5 font-medium">
                {formatShortDate(expense.date)}
              </p>
            ) : isRecurrent ? (
              <p className="text-neutral-400 text-[10px] mt-0.5 font-medium uppercase tracking-tight">
                {expense.recurrence}
              </p>
            ) : null}
          </div>

          {/* Amount */}
          <div className="flex-shrink-0 flex items-center gap-1.5 text-right pr-4">
            <div>
              {showConversion && convertedAmount !== null ? (
                <>
                  <p className="text-neutral-900 font-bold tabular-nums text-sm" style={creditStyle}>
                    {sign}{formatAmountListView(Math.abs(convertedAmount), currency, 2)}
                  </p>
                  <p className="text-neutral-500 text-[10px] tabular-nums mt-0.5 font-medium">
                    {sign}{formatAmountListView(Math.abs(expense.amount), transactionCurrency, 2)}
                  </p>
                </>
              ) : (
                <p className="text-neutral-900 font-bold tabular-nums text-sm" style={creditStyle}>
                  {sign}{formatAmountListView(Math.abs(expense.amount), transactionCurrency, 2)}
                </p>
              )}
            </div>
            {isRecurrent && <Repeat size={14} className="text-neutral-400 flex-shrink-0" strokeWidth={2} />}
          </div>
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6"
          onClick={() => setShowDeleteConfirm(false)}
          style={{ transform: 'translateZ(0)' }}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
            style={{ transform: 'translateZ(0)' }}
          >
            <h3 className="text-lg font-semibold text-neutral-900 mb-2">Delete Expense?</h3>
            <p className="text-neutral-600 text-sm mb-6">
              Are you sure you want to delete "{expense.description}"? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-3 rounded-xl font-medium bg-neutral-100 text-neutral-900 active:bg-neutral-200"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDelete(expense.id);
                  setShowDeleteConfirm(false);
                }}
                className="flex-1 px-4 py-3 rounded-xl font-medium bg-red-500 text-white active:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
