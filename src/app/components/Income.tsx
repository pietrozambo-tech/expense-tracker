import { formatAmount } from '../utils/currency';

interface IncomeProps {
  expenses: any[];
  currency: string;
}

export function Income({ expenses, currency }: IncomeProps) {
  // Filter only income transactions
  const incomeTransactions = expenses.filter(e => e.type === 'income');
  
  if (incomeTransactions.length === 0) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#F5F5F7' }}>
        {/* Header */}
        <div className="px-6 pb-6">
          <h1 style={{ color: '#1C1C1E', fontSize: '28px', fontWeight: '600', letterSpacing: '-0.5px' }}>Income</h1>
          <p style={{ color: '#8E8E93', fontSize: '13px', marginTop: '6px' }}>
            Track your income sources
          </p>
        </div>

        {/* Empty State */}
        <div className="flex flex-col items-center justify-center py-20 px-6">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: '#F2F2F7' }}>
            <span className="text-3xl">💰</span>
          </div>
          <h2 style={{ color: '#1C1C1E', fontWeight: '600', fontSize: '18px', marginBottom: '8px' }}>No income yet</h2>
          <p style={{ color: '#8E8E93', fontSize: '14px', textAlign: 'center' }}>
            Start tracking your income by tapping the + button
          </p>
        </div>
      </div>
    );
  }
  
  // Calculate total income
  const totalIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);
  
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F7' }}>
      {/* Header */}
      <div className="px-6 pb-6">
        <h1 style={{ color: '#1C1C1E', fontSize: '28px', fontWeight: '600', letterSpacing: '-0.5px' }}>Income</h1>
        <p style={{ color: '#8E8E93', fontSize: '13px', marginTop: '6px' }}>
          Track your income sources
        </p>
      </div>

      {/* Total Income Card */}
      <div className="px-6 pb-4">
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <p style={{ color: '#8E8E93', fontSize: '13px', marginBottom: '8px' }}>Total Income</p>
          <p style={{ color: '#34C759', fontSize: '32px', fontWeight: '700', letterSpacing: '-1px' }}>
            {formatAmount(totalIncome, currency)}
          </p>
        </div>
      </div>

      {/* Income List */}
      <div className="px-6 space-y-2">
        <h3 style={{ color: '#1C1C1E', fontWeight: '600', fontSize: '16px', marginBottom: '12px' }}>Recent Income</h3>
        {incomeTransactions.map(transaction => (
          <div key={transaction.id} className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <p style={{ color: '#1C1C1E', fontWeight: '500', fontSize: '15px' }}>{transaction.description}</p>
                <p style={{ color: '#8E8E93', fontSize: '13px', marginTop: '4px' }}>
                  {transaction.category.name}
                  {transaction.subcategory && ` • ${transaction.subcategory}`}
                </p>
                <p style={{ color: '#8E8E93', fontSize: '12px', marginTop: '4px' }}>
                  {new Date(transaction.date).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </p>
              </div>
              <p style={{ color: '#34C759', fontWeight: '600', fontSize: '16px' }}>
                +{formatAmount(transaction.amount, currency)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}