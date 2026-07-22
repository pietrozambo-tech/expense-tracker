import { Trash2, Repeat } from 'lucide-react';
import { formatAmountListView, convertAmount } from '../utils/currency';
import { useState } from 'react';
import { getCategoryIcon } from './categoryIcons';
import { useSwipeToDelete } from '../lib/useSwipeToDelete';

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
}

export function IncomeItem({ income, onTap, onDelete, currency }: IncomeItemProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { translateX, dragging, isOpen, close, handleTap, swipeHandlers } = useSwipeToDelete();

  const Icon = getCategoryIcon(income.category.icon);
  const transactionCurrency = income.currency || currency;
  const showConversion = transactionCurrency !== currency;
  const convertedAmount = showConversion ? convertAmount(income.amount, transactionCurrency, currency) : null;
  const isRecurrent = income.recurrence && income.recurrence !== 'Never repeat';

  return (
    <>
      <div className="relative overflow-hidden" style={{ backgroundColor: 'white' }}>
        {/* Delete action revealed by swiping the row left */}
        <button
          onClick={() => {
            close();
            setShowDeleteConfirm(true);
          }}
          aria-label="Delete income"
          tabIndex={isOpen ? 0 : -1}
          className="absolute right-0 top-0 bottom-0 w-20 flex items-center justify-center active:bg-red-600"
          style={{ backgroundColor: '#EF4444' }}
        >
          <Trash2 size={20} className="text-white" />
        </button>

        {/* Swipeable row */}
        <button
          {...swipeHandlers}
          onClick={() => handleTap(() => onTap(income.id))}
          className="w-full flex items-center gap-3 px-6 py-2.5 active:bg-neutral-100 min-h-[52px] relative"
          style={{
            backgroundColor: 'white',
            transform: `translateX(${translateX}px)`,
            transition: dragging ? 'none' : 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
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
            {isRecurrent && (
              <p className="text-neutral-400 text-[10px] mt-0.5 font-medium uppercase tracking-tight">
                {income.recurrence}
              </p>
            )}
          </div>

          {/* Amount */}
          <div className="flex-shrink-0 flex items-center gap-1.5 text-right pr-4">
            <div>
              {showConversion && convertedAmount !== null ? (
                <>
                  <p className="text-neutral-900 font-bold tabular-nums text-sm">
                    +{formatAmountListView(convertedAmount, currency, 2)}
                  </p>
                  <p className="text-neutral-500 text-[10px] tabular-nums mt-0.5 font-medium">
                    +{formatAmountListView(income.amount, transactionCurrency, 2)}
                  </p>
                </>
              ) : (
                <p className="text-neutral-900 font-bold tabular-nums text-sm">
                  +{formatAmountListView(income.amount, transactionCurrency, 2)}
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
            <h3 className="text-lg font-semibold text-neutral-900 mb-2">Delete Income?</h3>
            <p className="text-neutral-600 text-sm mb-6">
              Are you sure you want to delete "{income.description}"? This action cannot be undone.
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
                  onDelete(income.id);
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
