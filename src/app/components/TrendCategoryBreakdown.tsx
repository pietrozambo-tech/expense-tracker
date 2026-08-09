import { ChevronRight, ArrowUpDown } from 'lucide-react';
import { getCategoryIcon } from './categoryIcons';
import { useState } from 'react';
import { CURRENCIES, homeAmount } from '../utils/currency';
import { AmountText } from './AmountText';
import { t } from '../i18n';

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
  // Opens on the answer, not the alphabet. This card exists to say what you
  // spend most on; sorted A-Z the two categories that were half the spend sat
  // sixth and seventh, and you had to rank fourteen numbers yourself. A-Z is
  // still one tap away for when you are hunting a specific category.
  const [categorySortBy, setCategorySortBy] = useState<'alphabetical' | 'amount'>('amount');
  // Long tails are the norm here - a dozen categories at 1-3% each. Show the
  // ones that carry the month, keep the rest one tap away.
  const [showAll, setShowAll] = useState(false);
  
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
  
  // The number the percentages are percentages OF. Without it a "26%" on the
  // page has nothing to be a share of.
  const totalMonthlyAvg = categoryBreakdown.reduce((sum, c) => sum + c.monthlyAvg, 0);
  // Bars are scaled to the largest share, not to 100%: at 26% max, scaling to
  // 100 would leave every bar a stub and encode nothing.
  const maxShare = Math.max(...categoryBreakdown.map((c) => c.weightPercentage), 1);

  const COLLAPSED = 8;
  // Only worth collapsing when it actually hides something - folding one row
  // behind a button that costs a row saves nothing.
  const collapsible = sortedCategoryBreakdown.length > COLLAPSED + 1;
  const visibleCategories = collapsible && !showAll
    ? sortedCategoryBreakdown.slice(0, COLLAPSED)
    : sortedCategoryBreakdown;
  const hiddenCount = sortedCategoryBreakdown.length - visibleCategories.length;

  if (categoryBreakdown.length === 0) return null;
  
  return (
    <div className="px-6 py-4 bg-white">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-neutral-900 font-semibold text-sm">
            {t('tcb.title')}
          </h3>
          <div className="text-[11.5px] mt-0.5" style={{ color: '#8E8E93' }}>
            <AmountText amount={totalMonthlyAvg} currency={currency} decimals={0} abbreviate="fit" />
            {' '}
            {t(categoryBreakdown.length === 1 ? 'tcb.subtitle.one' : 'tcb.subtitle.other',
               { n: categoryBreakdown.length })}
          </div>
        </div>
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
        <div className="w-9 text-right text-[9px] uppercase tracking-wide text-neutral-400">{t('tcb.share')}</div>
        <div className="w-16 text-right text-[9px] uppercase tracking-wide text-neutral-400">{t('tcb.avg')}</div>
      </div>
      
      <div className="space-y-px">
        {visibleCategories.map((item) => {
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
                    <div className="text-neutral-900 font-medium text-[13.5px]">{item.name}</div>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
                  <div className="text-neutral-400 text-[11px] tabular-nums text-right w-9">{item.weightPercentage.toFixed(0)}%</div>
                  <div className="text-neutral-900 font-bold text-sm tabular-nums text-right w-16">
                    <AmountText amount={item.monthlyAvg} currency={currency} abbreviate="summary" />
                  </div>
                </div>
              </button>

              {/* The share as something you see rather than parse. Indented to
                  the name so the bars share a left edge and can be compared by
                  length alone, and scaled to the biggest share on screen. */}
              <div className="pl-[51px] pb-1.5" aria-hidden="true">
                <div className="h-1 rounded-full" style={{ backgroundColor: '#F1F0EC' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max((item.weightPercentage / maxShare) * 100, 1.5)}%`,
                      backgroundColor: '#4F74F3',
                    }}
                  />
                </div>
              </div>
              
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
                            <AmountText amount={sub.monthlyAvg} currency={currency} abbreviate="summary" />
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

      {/* The tail. Named rather than a bare chevron, and it says how much is
          under it, because "8 more" is the difference between a list that ends
          and a list that was cut. */}
      {collapsible && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full mt-1 py-2 rounded-lg text-center transition-colors active:bg-neutral-50"
          style={{ color: '#4F74F3', fontSize: 12.5, fontWeight: 600 }}
        >
          {showAll ? t('tcb.showLess') : t('tcb.showAll', { n: hiddenCount })}
        </button>
      )}
    </div>
  );
}