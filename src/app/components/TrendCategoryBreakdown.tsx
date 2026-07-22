import { ChevronRight, TrendingUp, ArrowUpDown } from 'lucide-react';
import { getCategoryIcon } from './categoryIcons';
import { useState } from 'react';
import { formatSummaryAmount, CURRENCIES, convertAmount } from '../utils/currency';

interface TrendCategoryBreakdownProps {
  trendFilteredTransactions: any[];
  trendSortedCategories: any[];
  trendExpandedCategory: string | null;
  setTrendExpandedCategory: (category: string | null) => void;
  currency: string;
}

export function TrendCategoryBreakdown({
  trendFilteredTransactions,
  trendSortedCategories,
  trendExpandedCategory,
  setTrendExpandedCategory,
  currency
}: TrendCategoryBreakdownProps) {
  const [categorySortBy, setCategorySortBy] = useState<'alphabetical' | 'amount'>('alphabetical');
  
  // Calculate category totals and monthly averages
  const categoryBreakdown = trendSortedCategories.map(item => {
    const categoryTransactions = trendFilteredTransactions.filter(t => t.category.name === item.name);
    const totalAmount = categoryTransactions.reduce((sum, t) => {
      const transactionCurrency = t.currency || currency;
      const convertedAmount = convertAmount(t.amount, transactionCurrency, currency);
      return sum + convertedAmount;
    }, 0);
    
    // Calculate number of months with data for this category
    const monthsWithData = new Set(
      categoryTransactions.map(t => {
        const date = new Date(t.date);
        return `${date.getFullYear()}-${date.getMonth()}`;
      })
    ).size;
    
    const monthlyAvg = monthsWithData > 0 ? totalAmount / monthsWithData : 0;
    const totalSpending = trendFilteredTransactions.reduce((sum, t) => {
      const transactionCurrency = t.currency || currency;
      const convertedAmount = convertAmount(t.amount, transactionCurrency, currency);
      return sum + convertedAmount;
    }, 0);
    const weightPercentage = totalSpending > 0 ? (totalAmount / totalSpending) * 100 : 0;
    
    // Get subcategories for this category
    const subcategoryTotals = categoryTransactions.reduce((acc, t) => {
      if (t.subcategory) {
        if (!acc[t.subcategory]) {
          acc[t.subcategory] = { amount: 0, months: new Set() };
        }
        const transactionCurrency = t.currency || currency;
        const convertedAmount = convertAmount(t.amount, transactionCurrency, currency);
        acc[t.subcategory].amount += convertedAmount;
        const date = new Date(t.date);
        acc[t.subcategory].months.add(`${date.getFullYear()}-${date.getMonth()}`);
      }
      return acc;
    }, {} as Record<string, { amount: number; months: Set<string> }>);
    
    const subcategories = Object.entries(subcategoryTotals).map(([name, data]: [string, { amount: number; months: Set<string> }]) => ({
      name,
      amount: data.amount,
      monthlyAvg: monthsWithData > 0 ? data.amount / monthsWithData : 0,
      weightPercentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0
    }));
    
    return {
      ...item,
      totalAmount,
      monthlyAvg,
      weightPercentage,
      subcategories
    };
  }).filter(item => item.totalAmount > 0);
  
  // Sort the categoryBreakdown based on categorySortBy
  const sortedCategoryBreakdown = [...categoryBreakdown].sort((a, b) => {
    if (categorySortBy === 'amount') {
      return b.monthlyAvg - a.monthlyAvg;
    } else {
      return a.name.localeCompare(b.name);
    }
  });
  
  if (categoryBreakdown.length === 0) return null;
  
  return (
    <div className="px-6 py-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-neutral-900 font-semibold text-sm">
          Category Breakdown Monthly Average
        </h3>
        <button
          onClick={() => setCategorySortBy(categorySortBy === 'alphabetical' ? 'amount' : 'alphabetical')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors bg-neutral-100"
          aria-label="Toggle sort order"
        >
          <ArrowUpDown className="w-3.5 h-3.5 text-neutral-500" strokeWidth={2} />
          <span className="text-xs text-neutral-500">
            {categorySortBy === 'alphabetical' ? 'A-Z' : CURRENCIES[currency]?.symbol || '€'}
          </span>
        </button>
      </div>
      
      {/* Column Headers */}
      <div className="flex items-center justify-end gap-0.5 mb-2 pr-1">
        <div className="w-9 flex items-center justify-end">
          <TrendingUp className="w-3 h-3 text-neutral-400 flex-shrink-0" strokeWidth={2} />
        </div>
        <div className="w-16 flex items-center justify-end">
          <TrendingUp className="w-3 h-3 text-neutral-400 flex-shrink-0" strokeWidth={2} />
        </div>
      </div>
      
      <div className="space-y-px">
        {sortedCategoryBreakdown.map((item) => {
          const isExpanded = trendExpandedCategory === item.name;
          const subcategories = item.subcategories;
          
          return (
            <div key={item.name}>
              {/* Main Category Row */}
              <button
                onClick={subcategories.length > 0 ? () => setTrendExpandedCategory(isExpanded ? null : item.name) : undefined}
                className={`w-full flex items-center justify-between gap-3 py-1.5 rounded-lg transition-colors ${subcategories.length > 0 ? 'active:bg-neutral-50' : ''}`}
              >
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  {subcategories.length > 0 ? (
                    <ChevronRight
                      className={`w-4 h-4 text-neutral-400 flex-shrink-0 transition-transform ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                    />
                  ) : (
                    <div className="w-4 h-4 flex-shrink-0" />
                  )}
                  <div className={`w-7 h-7 ${item.category.bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    {(() => {
                      const Icon = getCategoryIcon(item.category.icon);
                      return <Icon className={`w-3.5 h-3.5 ${item.category.color}`} strokeWidth={2} />;
                    })()}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-neutral-900 font-medium text-xs">{item.name}</div>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
                  <div className="text-neutral-400 text-[11px] tabular-nums text-right w-9">{item.weightPercentage.toFixed(0)}%</div>
                  <div className="text-neutral-900 font-bold text-sm tabular-nums text-right w-16">
                    {formatSummaryAmount(item.monthlyAvg, currency)}
                  </div>
                </div>
              </button>
              
              {/* Subcategories */}
              {isExpanded && subcategories.length > 0 && (
                <div className="ml-11 mt-0.5 mb-1 space-y-0.5 border-l-2 border-neutral-100 pl-3">
                  {subcategories.map((sub) => {
                    return (
                      <div
                        key={sub.name}
                        className="flex items-center justify-between gap-3 py-1"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-neutral-500 text-xs truncate">{sub.name}</div>
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
                          <div className="text-neutral-400 text-[10px] tabular-nums text-right w-9">{sub.weightPercentage.toFixed(0)}%</div>
                          <div className="text-neutral-600 font-normal text-xs tabular-nums text-right w-16">
                            {formatSummaryAmount(sub.monthlyAvg, currency)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}