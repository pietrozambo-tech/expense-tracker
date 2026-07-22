import { 
  Trash2,
  Repeat
} from 'lucide-react';
import { formatAmountListView, convertAmount } from '../utils/currency';
import { useState, useRef, useEffect } from 'react';
import { getCategoryIcon } from './categoryIcons';

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
    currency?: string; // Add currency to expense type
    recurrence?: string; // Add recurrence to expense type
  };
  onTap: (id: string) => void;
  onDelete: (id: string) => void;
  currency: string; // Keep as fallback for backward compatibility
}

export function ExpenseItem({ expense, onTap, onDelete, currency }: ExpenseItemProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [translateX, setTranslateX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchCurrentX = useRef(0);
  const itemRef = useRef<HTMLDivElement>(null);
  
  const Icon = getCategoryIcon(expense.category.icon);
  
  // Transaction's currency (defaults to user's currency if not set)
  const transactionCurrency = expense.currency || currency;
  
  // Check if we need to show conversion
  const showConversion = transactionCurrency !== currency;
  
  // Calculate converted amount if needed
  const convertedAmount = showConversion 
    ? convertAmount(expense.amount, transactionCurrency, currency)
    : null;
  
  // Check if this is a recurrent transaction
  const isRecurrent = expense.recurrence && expense.recurrence !== 'Never repeat';
  
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setIsSwiping(true);
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;
    
    touchCurrentX.current = e.touches[0].clientX;
    const touchCurrentY = e.touches[0].clientY;
    const deltaX = touchCurrentX.current - touchStartX.current;
    const deltaY = touchCurrentY - touchStartY.current;
    
    // Detect if this is a horizontal swipe (more horizontal than vertical movement)
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // This is a horizontal swipe, prevent vertical scrolling
      e.preventDefault();
    }
    
    // Only allow left swipe (negative values) and limit to -80px
    if (deltaX < 0) {
      setTranslateX(Math.max(deltaX, -80));
    } else if (translateX < 0) {
      // Allow swiping back right
      setTranslateX(Math.min(deltaX + translateX, 0));
    }
  };
  
  const handleTouchEnd = () => {
    setIsSwiping(false);
    
    // Snap to open (-80px) or closed (0) based on threshold
    if (translateX < -40) {
      setTranslateX(-80);
    } else {
      setTranslateX(0);
    }
  };

  // Mouse drag support for desktop testing
  const handleMouseDown = (e: React.MouseEvent) => {
    // Prevent text selection during drag
    e.preventDefault();
    touchStartX.current = e.clientX;
    setIsSwiping(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isSwiping) return;
    
    touchCurrentX.current = e.clientX;
    const diff = touchCurrentX.current - touchStartX.current;
    
    // Only allow left swipe (negative values) and limit to -80px
    if (diff < 0) {
      setTranslateX(Math.max(diff, -80));
    } else if (translateX < 0) {
      // Allow swiping back right
      setTranslateX(Math.min(diff + translateX, 0));
    }
  };

  const handleMouseUp = () => {
    setIsSwiping(false);
    
    // Snap to open (-80px) or closed (0) based on threshold
    if (translateX < -40) {
      setTranslateX(-80);
    } else {
      setTranslateX(0);
    }
  };

  // Handle mouse leave (in case mouse leaves while dragging)
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isSwiping) {
        handleMouseUp();
      }
    };

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isSwiping) return;
      
      touchCurrentX.current = e.clientX;
      const diff = touchCurrentX.current - touchStartX.current;
      
      if (diff < 0) {
        setTranslateX(Math.max(diff, -80));
      } else if (translateX < 0) {
        setTranslateX(Math.min(diff + translateX, 0));
      }
    };

    if (isSwiping) {
      document.addEventListener('mouseup', handleGlobalMouseUp);
      document.addEventListener('mousemove', handleGlobalMouseMove);
    }

    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [isSwiping, translateX]);
  
  const handleItemClick = () => {
    if (translateX < 0) {
      // If swiped open, close it
      setTranslateX(0);
    } else {
      // If closed, open the expense
      onTap(expense.id);
    }
  };
  
  // Close swipe when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (itemRef.current && !itemRef.current.contains(e.target as Node) && translateX < 0) {
        setTranslateX(0);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [translateX]);
  
  return (
    <>
      <div ref={itemRef} className="relative overflow-hidden" style={{ backgroundColor: 'white' }}>
        {/* Delete Button Background - Behind the item */}
        <div className="absolute right-0 top-0 bottom-0 w-20 flex items-center justify-center" style={{ backgroundColor: '#EF4444' }}>
          <Trash2 size={20} className="text-white" />
        </div>
        
        {/* Swipeable Item */}
        <button
          onClick={handleItemClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="w-full flex items-center gap-3 px-6 py-2.5 active:bg-neutral-100 transition-colors min-h-[52px] relative"
          style={{ 
            backgroundColor: 'white',
            transform: `translateX(${translateX}px)`,
            transition: isSwiping ? 'none' : 'transform 0.3s ease',
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
            {isRecurrent && (
              <p className="text-neutral-400 text-[10px] mt-0.5 font-medium uppercase tracking-tight">
                {(expense as any).recurrence}
              </p>
            )}
          </div>
          
          {/* Amount */}
          <div className="flex-shrink-0 flex items-center gap-1.5 text-right pr-4">
            <div>
              {showConversion && convertedAmount !== null ? (
                <>
                  <p className="text-neutral-900 font-bold tabular-nums text-sm">
                    {formatAmountListView(convertedAmount, currency, 2)}
                  </p>
                  <p className="text-neutral-500 text-[10px] tabular-nums mt-0.5 font-medium">
                    {formatAmountListView(expense.amount, transactionCurrency, 2)}
                  </p>
                </>
              ) : (
                <p className="text-neutral-900 font-bold tabular-nums text-sm">
                  {formatAmountListView(expense.amount, transactionCurrency, 2)}
                </p>
              )}
            </div>
            {isRecurrent && (
              <Repeat size={14} className="text-neutral-400 flex-shrink-0" strokeWidth={2} />
            )}
          </div>
        </button>
        
        {/* Delete Button - Clickable area on the right */}
        {translateX < 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteConfirm(true);
            }}
            className="absolute right-0 top-0 bottom-0 w-20 flex items-center justify-center active:bg-red-600"
            style={{ backgroundColor: '#EF4444' }}
          >
            <Trash2 size={20} className="text-white" />
          </button>
        )}
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
                style={{ 
                  transition: 'background-color 0.15s ease',
                  transform: 'translateZ(0)'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDelete(expense.id);
                  setShowDeleteConfirm(false);
                }}
                className="flex-1 px-4 py-3 rounded-xl font-medium bg-red-500 text-white active:bg-red-600"
                style={{ 
                  transition: 'background-color 0.15s ease',
                  transform: 'translateZ(0)'
                }}
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