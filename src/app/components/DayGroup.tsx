import { ExpenseItem } from './ExpenseItem';
import { formatAmountListView, convertAmount } from '../utils/currency';

interface DayGroupProps {
  date: string;
  expenses: Array<{
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
    currency?: string; // Add currency field
    recurrence?: string; // Add recurrence field
  }>;
  onExpenseTap: (id: string) => void;
  onDeleteExpense: (id: string) => void;
  currency: string;
}

export function DayGroup({ date, expenses, onExpenseTap, onDeleteExpense, currency }: DayGroupProps) {
  const formatDate = (dateString: string) => {
    // Check if it's a composite key from amount sorting (date_id)
    const actualDatePart = dateString.includes('_') ? dateString.split('_')[0] : dateString;
    
    const date = new Date(actualDatePart);
    if (isNaN(date.getTime())) {
      return actualDatePart; // Return as is if not a valid date
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);
    
    if (selectedDate.getTime() === today.getTime()) {
      return 'Today';
    }
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (selectedDate.getTime() === yesterday.getTime()) {
      return 'Yesterday';
    }
    
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  // Calculate daily total - convert all transactions to user's currency
  const dailyTotal = expenses.reduce((sum, expense) => {
    const expenseCurrency = expense.currency || currency;
    const convertedAmount = convertAmount(expense.amount, expenseCurrency, currency);
    return sum + convertedAmount;
  }, 0);

  return (
    <div className="mb-3">
      {/* Day Header */}
      <div className="flex items-center justify-between px-6 py-1 bg-neutral-50/50">
        <h3 className="text-neutral-500 font-bold text-[10px] uppercase tracking-wider">{formatDate(date)}</h3>
        <span className="text-neutral-400 text-[10px] font-medium tabular-nums pr-4" style={{ minWidth: '80px', textAlign: 'right' }}>{formatAmountListView(dailyTotal, currency, 2)}</span>
      </div>
      
      {/* Expense Items */}
      <div>
        {expenses.map((expense) => (
          <ExpenseItem 
            key={expense.id} 
            expense={expense} 
            onTap={onExpenseTap}
            onDelete={onDeleteExpense}
            currency={currency}
          />
        ))}
      </div>
    </div>
  );
}