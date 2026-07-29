import { ChevronRight, ArrowUpDown } from 'lucide-react';
import { getCategoryIcon } from './categoryIcons';
import { useState } from 'react';
import { formatSummaryAmount, CURRENCIES, homeAmount } from '../utils/currency';

interface TrendCategoryBreakdownProps {
  trendFilteredTransactions: any[];
  trendSortedCategories: any[];
  trendExpandedCategory: string | null;
  setTrendExpandedCategory: (category: string | null) => void;
  currency: string;
  // Months in the period with any activity for this type - the denominator the
  // headline Monthly Average card uses, handed down so every average on the
  // screen is a share of the same months.
  monthCount: number;
}

export function TrendCategoryBreakdown({
  trendFilteredTransactions,
  trendSortedCategories,
  trendExpandedCategory,
  setTrendExpandedCategory,
  currency,
  monthCount
}: TrendCategoryBreakdownProps) {
  const [categorySortBy, setCategorySortBy] = useState<'alphabetical' | 'amount'>('alphabetical');
  
  // Calculate category totals and monthly averages
  const categoryBreakdown = trendSortedCategories.map(item => {
    const categoryTransactions = trendFilteredTransactions.filter(t => t.category.name === item.name);
    const totalAmount = categoryTransactions.reduce((sum, t) => {
      const convertedAmount = homeAmount(t, currency);
      return sum + convertedAmount;
    }, 0);
    
    // Averaged over the whole period's active months, NOT over the months this
    // category happened to appear in. Dividing by the category's own months
    // made a single tax refund - one transaction in one month out of seven -
    // show its full amount as a "monthly average", and left the rows summing
    // to more than the headline card they sit under.
    const monthlyAvg = monthCount > 0 ? totalAmount / monthCount : 0;
    const totalSpending = trendFilteredTransactions.reduce((sum, t) => {
      const convertedAmount = homeAmount(t, currency);
      return sum + convertedAmount;
    }, 0);
    const weightPercentage = totalSpending > 0 ? (totalAmount / totalSpending) * 100 : 0;
    
    // Get subcategories for this category
    const subcategoryTotals = categoryTransactions.reduce((acc, t) => {
      if (t.subcategory) {
        const convertedAmount = homeAmount(t, currency);
        acc[t.subcategory] = (acc[t.subcategory] ?? 0) + convertedAmount;
      }
      return acc;
    }, {} as Record<string, number>);

    const subcategories = Object.entries(subcategoryTotals).map(([name, amount]: [string, number]) => ({
      name,
      amount,
      monthlyAvg: monthCount > 0 ? amount / monthCount : 0,
      weightPercentage: totalAmount > 0 ? (amount / totalAmount) * 100 : 0
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
          Monthly Average by Category
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
      
      {/* Column headers. Two bare trend arrows used to sit here, which said
          nothing about what the columns hold; naming them costs the same room. */}
      <div className="flex items-center justify-end gap-0.5 mb-2 pr-1">
        <div className="w-9 text-right text-[9px] uppercase tracking-wide text-neutral-400">Share</div>
        <div className="w-16 text-right text-[9px] uppercase tracking-wide text-neutral-400">Avg</div>
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