import { IncomeItem } from './IncomeItem';
import { formatAmountListView, convertAmount } from '../utils/currency';

interface IncomeDayGroupProps {
  date: string;
  incomes: Array<{
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
  onIncomeTap: (id: string) => void;
  onDeleteIncome: (id: string) => void;
  currency: string;
}

export function IncomeDayGroup({ date, incomes, onIncomeTap, onDeleteIncome, currency }: IncomeDayGroupProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
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
  const dailyTotal = incomes.reduce((sum, income) => {
    const incomeCurrency = income.currency || currency;
    const convertedAmount = convertAmount(income.amount, incomeCurrency, currency);
    return sum + convertedAmount;
  }, 0);

  return (
    <div className="mb-6">
      {/* Day Header */}
      <div className="flex items-center justify-between px-6 py-2 bg-neutral-50/50">
        <h3 className="text-neutral-700 font-semibold text-sm uppercase tracking-wide">{formatDate(date)}</h3>
        <span className="text-[#34C759] font-semibold text-xs tabular-nums pr-4" style={{ minWidth: '100px', textAlign: 'right' }}>+{formatAmountListView(dailyTotal, currency)}</span>
      </div>
      
      {/* Income Items */}
      <div>
        {incomes.map((income) => (
          <IncomeItem 
            key={income.id} 
            income={income} 
            onTap={onIncomeTap}
            onDelete={onDeleteIncome}
            currency={currency}
          />
        ))}
      </div>
    </div>
  );
}