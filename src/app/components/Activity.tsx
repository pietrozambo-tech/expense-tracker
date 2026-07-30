import { useState, useEffect } from 'react';
import { FilterBar } from './FilterBar';
import { ActivityDayGroup } from './ActivityDayGroup';
import { CategoryFilterModal } from './CategoryFilterModal';
import { SubcategoryFilterModal } from './SubcategoryFilterModal';
import { SourceFilterModal } from './SourceFilterModal';
import { SearchModal } from './SearchModal';
import { formatAmount, CURRENCIES, homeAmount } from '../utils/currency';
import { Download } from 'lucide-react';
import { buildTransactionsCsv, downloadTransactionsCsv } from '../lib/csv';
import { toast } from 'sonner';
import type { Transaction, Source } from '../types';
import { parseLocalDate } from '../lib/dates';

type ActivityTypeFilter = 'all' | 'expense' | 'income';

// Everything the filter bar holds. Opening a transaction routes through the
// 'add' screen, which unmounts this tab entirely - without a snapshot the user
// comes back to an unfiltered list they have to set up again.
export interface ActivityFilterState {
  activityType: ActivityTypeFilter;
  selectedYear: string;
  selectedMonth: string;
  categoryFilter: string;
  subcategoryFilter: string;
  searchQuery: string;
  typeFilter: string;
  sourceFilter: string;
}

interface ActivityProps {
  transactions: Transaction[];
  onEditTransaction: (id: string) => void;
  onDeleteTransaction: (id: string) => void;
  onModalOpenChange?: (isOpen: boolean) => void;
  categories: any[];
  incomeCategories: any[];
  currency: string;
  sources: Source[];
  // One-shot: start with this type filter selected (e.g. 'Imported' from the
  // post-import "Review in Activity" button). Consumed on mount so the next
  // ordinary visit starts clean.
  presetTypeFilter?: string;
  onPresetConsumed?: () => void;
  // Survives an edit round-trip; the parent nulls it once the user actually
  // leaves the tab, so an ordinary visit starts clean.
  filterStateRef?: React.MutableRefObject<ActivityFilterState | null>;
}

export function Activity({
  transactions,
  onEditTransaction,
  onDeleteTransaction,
  onModalOpenChange,
  categories,
  incomeCategories,
  currency,
  sources,
  presetTypeFilter,
  onPresetConsumed,
  filterStateRef
}: ActivityProps) {
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const currentMonth = now.toLocaleString('en-US', { month: 'short' });

  // Restore what the user had set up, unless a preset ("Imported", from the
  // post-import nudge) was handed in - that must win and start clean.
  const saved = presetTypeFilter ? null : filterStateRef?.current ?? null;

  const [activityType, setActivityType] = useState<ActivityTypeFilter>(saved?.activityType ?? 'all');
  const [selectedYear, setSelectedYear] = useState(saved?.selectedYear ?? currentYear);
  const [selectedMonth, setSelectedMonth] = useState(saved?.selectedMonth ?? currentMonth);
  const [categoryFilter, setCategoryFilter] = useState(saved?.categoryFilter ?? 'All');
  const [subcategoryFilter, setSubcategoryFilter] = useState(saved?.subcategoryFilter ?? 'All');
  const [searchQuery, setSearchQuery] = useState(saved?.searchQuery ?? '');
  const [typeFilter, setTypeFilter] = useState(presetTypeFilter ?? saved?.typeFilter ?? 'All'); // All / One-off / Recurring / Imported
  const [sourceFilter, setSourceFilter] = useState(saved?.sourceFilter ?? 'All'); // 'All' or a source id

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isSubcategoryModalOpen, setIsSubcategoryModalOpen] = useState(false);
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // The preset is applied via the useState initialiser above; report it
  // consumed so the parent clears it and the next visit starts unfiltered.
  useEffect(() => {
    if (presetTypeFilter) onPresetConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the snapshot current on every change (ref write - no re-render), so
  // whatever is on screen is what comes back after editing a transaction.
  useEffect(() => {
    if (!filterStateRef) return;
    filterStateRef.current = {
      activityType,
      selectedYear,
      selectedMonth,
      categoryFilter,
      subcategoryFilter,
      searchQuery,
      typeFilter,
      sourceFilter,
    };
  }, [filterStateRef, activityType, selectedYear, selectedMonth, categoryFilter, subcategoryFilter, searchQuery, typeFilter, sourceFilter]);


  // Transactions narrowed by the All/Expenses/Income control — every other
  // filter and the header totals work off this set
  const typedTransactions = transactions.filter(t =>
    activityType === 'all' ? true : activityType === 'income' ? t.type === 'income' : t.type !== 'income'
  );

  // Get available years (only years with data)
  const getAvailableYears = () => {
    const years = new Set<string>();
    typedTransactions.forEach(t => {
      years.add(String(parseLocalDate(t.date).getFullYear()));
    });
    return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
  };

  // Get available months for the selected year (only months with data)
  const getAvailableMonths = () => {
    const year = parseInt(selectedYear);
    const monthsSet = new Set<number>();
    typedTransactions.forEach(t => {
      const date = parseLocalDate(t.date);
      if (date.getFullYear() === year) {
        monthsSet.add(date.getMonth());
      }
    });
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return Array.from(monthsSet)
      .sort((a, b) => a - b)
      .map(monthIndex => monthNames[monthIndex]);
  };

  const availableYears = getAvailableYears();
  const availableMonths = getAvailableMonths();

  // Auto-adjust selected month if it doesn't exist in the selected year
  useEffect(() => {
    if (availableMonths.length > 0 && !availableMonths.includes(selectedMonth) && selectedMonth !== 'Full Year') {
      setSelectedMonth('Full Year');
    }
  }, [selectedYear, availableMonths, selectedMonth]);

  // Get date range based on selected year and month
  const getDateRange = () => {
    const year = parseInt(selectedYear);

    if (selectedMonth === 'Full Year') {
      return { start: new Date(year, 0, 1), end: new Date(year, 11, 31, 23, 59, 59) };
    }

    const monthIndex = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(selectedMonth);

    if (!isNaN(year) && monthIndex !== -1) {
      return {
        start: new Date(year, monthIndex, 1),
        end: new Date(year, monthIndex + 1, 0, 23, 59, 59)
      };
    }
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    };
  };

  const filteredTransactions = typedTransactions.filter((t) => {
    const { start, end } = getDateRange();
    const date = parseLocalDate(t.date);
    if (date < start || date > end) return false;

    if (categoryFilter !== 'All' && t.category.name !== categoryFilter) return false;
    if (subcategoryFilter !== 'All' && t.subcategory !== subcategoryFilter) return false;
    if (sourceFilter !== 'All' && t.sourceId !== sourceFilter) return false;
    if (searchQuery && !t.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;

    // Recurrence filter
    const recurrence = t.recurrence || 'Never repeat';
    if (typeFilter === 'One-off' && recurrence !== 'Never repeat') return false;
    if (typeFilter === 'Recurring' && recurrence === 'Never repeat') return false;
    // Everything a past Import created, as one reviewable group. No marker on
    // the rows themselves - the flag only exists behind this filter.
    if (typeFilter === 'Imported' && !t.importedAt) return false;

    return true;
  });

  // Get available subcategories based on selected category
  const getAvailableSubcategories = () => {
    if (categoryFilter === 'All') {
      const allSubcats = new Set<string>();
      typedTransactions.forEach(t => {
        if (t.subcategory) allSubcats.add(t.subcategory);
      });
      return Array.from(allSubcats).sort();
    }
    const activeCategories = activityType === 'income' ? incomeCategories : activityType === 'expense' ? categories : [...categories, ...incomeCategories];
    const category = activeCategories.find(c => c.name === categoryFilter);
    return category?.subcategories || [];
  };

  const handleCategoryChange = (category: string) => {
    setCategoryFilter(category);
    setSubcategoryFilter('All');
  };

  const handleActivityTypeChange = (type: ActivityTypeFilter) => {
    setActivityType(type);
    // Category filters are type-specific, reset them on switch
    setCategoryFilter('All');
    setSubcategoryFilter('All');
  };

  // Group transactions by date
  const groupedTransactions = filteredTransactions.reduce((groups, t) => {
    if (!groups[t.date]) groups[t.date] = [];
    groups[t.date].push(t);
    return groups;
  }, {} as Record<string, Transaction[]>);

  // Header total: net for All (signed), spending total for Expenses, +total for Income
  const totalCount = filteredTransactions.length;
  const netTotal = filteredTransactions.reduce((sum, t) => {
    const converted = homeAmount(t, currency);
    return t.type === 'income' ? sum + converted : sum - converted;
  }, 0);
  const headerTotal =
    activityType === 'expense'
      ? formatAmount(-netTotal, currency)
      : activityType === 'income'
        ? `+${formatAmount(netTotal, currency)}`
        : `${netTotal >= 0 ? '+' : '-'}${formatAmount(Math.abs(netTotal), currency)}`;

  // CSV Export
  // Exports the CURRENT VIEW - whatever the filters above have narrowed the
  // list to. The full-dataset export lives in Settings; both go through
  // lib/csv so the two buttons cannot drift into different dialects (they
  // had: this one used comma decimals and no BOM, the other the opposite).
  const downloadActivity = () => {
    if (filteredTransactions.length === 0) {
      toast.error('No transactions to export');
      return;
    }
    downloadTransactionsCsv(
      buildTransactionsCsv(filteredTransactions, currency, sources),
      'tracklylab-activity',
    );
    toast.success(`Exported ${filteredTransactions.length} transaction${filteredTransactions.length !== 1 ? 's' : ''}`);
  };

  // Category list for the filter modal, matching the active type
  const modalCategories =
    activityType === 'income' ? incomeCategories : activityType === 'expense' ? categories : [...categories, ...incomeCategories];

  const typeOptions: Array<{ value: ActivityTypeFilter; label: string; activeBg: string; activeColor: string }> = [
    { value: 'all', label: 'All', activeBg: '#1C1C1E', activeColor: '#FFFFFF' },
    { value: 'expense', label: 'Expenses', activeBg: '#FFE8E6', activeColor: '#D32F2F' },
    { value: 'income', label: 'Income', activeBg: '#E8F5E9', activeColor: '#2E7D32' }
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ backgroundColor: '#F5F5F7' }}>
      {/* Fixed Header - Always Visible */}
      <div className="flex-shrink-0 pt-0" style={{ backgroundColor: '#F5F5F7' }}>
        <div className="px-6 pb-4 flex items-center justify-between">
          <div className="flex-1">
            <h1 style={{ color: '#1C1C1E', fontSize: '28px', fontWeight: '600', letterSpacing: '-0.5px' }}>Activity</h1>
            <p style={{ color: '#8E8E93', fontSize: '14px', marginTop: '4px' }}>
              {totalCount} transaction{totalCount !== 1 ? 's' : ''} · {headerTotal}
            </p>
          </div>
          {filteredTransactions.length > 0 && (
            <button
              onClick={downloadActivity}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-colors active:bg-neutral-200"
              style={{ backgroundColor: '#F2F2F7' }}
            >
              <Download size={18} style={{ color: '#1C1C1E' }} />
            </button>
          )}
        </div>

        {/* Expense / Income type filter */}
        <div className="px-6 pb-3">
          <div
            className="flex gap-0 rounded-lg overflow-hidden"
            style={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E5EA' }}
          >
            {typeOptions.map((option, index) => (
              <button
                key={option.value}
                onClick={() => handleActivityTypeChange(option.value)}
                className="flex-1 px-4 py-1.5 transition-all text-sm font-medium"
                style={{
                  backgroundColor: activityType === option.value ? option.activeBg : 'transparent',
                  color: activityType === option.value ? option.activeColor : '#8E8E93',
                  borderRight: index < typeOptions.length - 1 ? '1px solid #E5E5EA' : 'none'
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filter Bar - Always Visible */}
        <FilterBar
          year={selectedYear}
          month={selectedMonth}
          category={categoryFilter}
          subcategory={subcategoryFilter}
          searchQuery={searchQuery}
          typeFilter={typeFilter}
          sourceFilter={sourceFilter}
          sources={sources}
          availableYears={availableYears}
          availableMonths={availableMonths}
          onYearChange={(year) => setSelectedYear(year)}
          onMonthChange={(month) => setSelectedMonth(month)}
          onOpenCategorySelector={() => {
            setIsCategoryModalOpen(true);
            onModalOpenChange?.(true);
          }}
          onOpenSubcategorySelector={() => {
            setIsSubcategoryModalOpen(true);
            onModalOpenChange?.(true);
          }}
          onOpenSourceSelector={() => {
            setIsSourceModalOpen(true);
            onModalOpenChange?.(true);
          }}
          onOpenSearch={() => {
            setIsSearchModalOpen(true);
            onModalOpenChange?.(true);
          }}
          onClearSearch={() => setSearchQuery('')}
          onTypeFilterChange={(type) => setTypeFilter(type)}
        />
      </div>

      {/* Scrollable Transaction List */}
      <div className="flex-1 overflow-y-auto pt-2 pb-24">
        {Object.entries(groupedTransactions).length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="text-neutral-400 text-sm mb-2">No transactions found</div>
            <p className="text-neutral-500 text-xs">
              {searchQuery ? 'Try a different search term' : 'Change your filters or add a new transaction'}
            </p>
          </div>
        ) : (
          Object.entries(groupedTransactions)
            .sort(([dateA], [dateB]) => new Date(dateB).getTime() - new Date(dateA).getTime())
            .map(([date, dayTransactions]) => (
              <ActivityDayGroup
                key={date}
                date={date}
                transactions={dayTransactions}
                onTransactionTap={onEditTransaction}
                onDeleteTransaction={onDeleteTransaction}
                currency={currency}
              />
            ))
        )}
      </div>

      {/* Modals */}
      <CategoryFilterModal
        isOpen={isCategoryModalOpen}
        selectedCategory={categoryFilter}
        onClose={() => {
          setIsCategoryModalOpen(false);
          onModalOpenChange?.(false);
        }}
        onSelectCategory={(newCategory) => {
          handleCategoryChange(newCategory);
          setIsCategoryModalOpen(false);
          onModalOpenChange?.(false);
        }}
        categories={modalCategories}
        incomeCategories={[]}
      />

      <SubcategoryFilterModal
        isOpen={isSubcategoryModalOpen}
        selectedSubcategory={subcategoryFilter}
        onClose={() => {
          setIsSubcategoryModalOpen(false);
          onModalOpenChange?.(false);
        }}
        onSelectSubcategory={(newSubcategory) => {
          setSubcategoryFilter(newSubcategory);
          setIsSubcategoryModalOpen(false);
          onModalOpenChange?.(false);
        }}
        availableSubcategories={getAvailableSubcategories()}
      />

      <SourceFilterModal
        isOpen={isSourceModalOpen}
        sources={sources}
        selected={sourceFilter}
        onClose={() => {
          setIsSourceModalOpen(false);
          onModalOpenChange?.(false);
        }}
        onSelect={(value) => {
          setSourceFilter(value);
          setIsSourceModalOpen(false);
          onModalOpenChange?.(false);
        }}
      />

      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => {
          setIsSearchModalOpen(false);
          onModalOpenChange?.(false);
        }}
        onSearch={(query) => {
          setSearchQuery(query);
          setIsSearchModalOpen(false);
          onModalOpenChange?.(false);
        }}
      />
    </div>
  );
}
