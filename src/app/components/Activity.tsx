import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { FilterBar } from './FilterBar';
import { ActivityDayGroup } from './ActivityDayGroup';
import { CategoryFilterModal } from './CategoryFilterModal';
import { SubcategoryFilterModal } from './SubcategoryFilterModal';
import { SourceFilterModal } from './SourceFilterModal';
import { SearchModal } from './SearchModal';
import { ExportScopeModal } from './ExportScopeModal';
import { CURRENCIES, homeAmount } from '../utils/currency';
import { AmountText } from './AmountText';
import { switchGlow } from './categoryColors';
import { t } from '../i18n';
import { monthsShort } from '../i18n/store';
import { Download } from 'lucide-react';
import { buildTransactionsCsv, downloadTransactionsCsv } from '../lib/csv';
import { toast } from 'sonner';
import type { Transaction, Source } from '../types';
import { parseLocalDate } from '../lib/dates';

type ActivityTypeFilter = 'all' | 'expense' | 'income';

// Everything that makes up "where the user was": the filter bar, plus how far
// down the list they had scrolled. Opening a transaction routes through the
// 'add' screen, which unmounts this tab entirely - without a snapshot the user
// comes back to an unfiltered list, at the top, and has to find their place
// again.
export interface ActivityViewState {
  activityType: ActivityTypeFilter;
  selectedYear: string;
  selectedMonth: string;
  categoryFilter: string;
  subcategoryFilter: string;
  searchQuery: string;
  typeFilter: string;
  sourceFilter: string;
  scrollTop: number;
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
  // ordinary visit starts clean. Carries the YEAR of the imported batch and
  // the catch-all category too: an import of last year's data with the filter
  // still on the current month showed an empty list and looked like the
  // import had vanished.
  preset?: { typeFilter: string; year?: string; categoryFilter?: string };
  onPresetConsumed?: () => void;
  // Survives an edit round-trip; the parent nulls it once the user actually
  // leaves the tab, so an ordinary visit starts clean.
  viewStateRef?: React.MutableRefObject<ActivityViewState | null>;
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
  preset,
  onPresetConsumed,
  viewStateRef
}: ActivityProps) {
  const now = new Date();
  const currentYear = String(now.getFullYear());
  // selectedMonth is a view-state KEY: the month INDEX as a string ('0'-'11'),
  // or 'year' for the whole year - language-neutral, so the filter labels can
  // localise freely around it.
  const currentMonth = String(now.getMonth());

  // Restore what the user had set up, unless a preset ("Imported", from the
  // post-import nudge) was handed in - that must win and start clean.
  const saved = preset ? null : viewStateRef?.current ?? null;

  const [activityType, setActivityType] = useState<ActivityTypeFilter>(saved?.activityType ?? 'all');
  // The preset pins the year the batch actually landed in, over the whole
  // year - the imported rows must be on screen when the tab opens.
  const [selectedYear, setSelectedYear] = useState(preset?.year ?? saved?.selectedYear ?? currentYear);
  const [selectedMonth, setSelectedMonth] = useState(preset ? 'year' : saved?.selectedMonth ?? currentMonth);
  const [categoryFilter, setCategoryFilter] = useState(preset?.categoryFilter ?? saved?.categoryFilter ?? 'All');
  const [subcategoryFilter, setSubcategoryFilter] = useState(saved?.subcategoryFilter ?? 'All');
  const [searchQuery, setSearchQuery] = useState(saved?.searchQuery ?? '');
  const [typeFilter, setTypeFilter] = useState(preset?.typeFilter ?? saved?.typeFilter ?? 'All'); // All / One-off / Recurring / Imported
  const [sourceFilter, setSourceFilter] = useState(saved?.sourceFilter ?? 'All'); // 'All' or a source id

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isSubcategoryModalOpen, setIsSubcategoryModalOpen] = useState(false);
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // The preset is applied via the useState initialiser above; report it
  // consumed so the parent clears it and the next visit starts unfiltered.
  useEffect(() => {
    if (preset) onPresetConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the snapshot current on every change (ref write - no re-render), so
  // whatever is on screen is what comes back after editing a transaction.
  // Scroll is tracked separately below and carried through untouched.
  useEffect(() => {
    if (!viewStateRef) return;
    viewStateRef.current = {
      activityType,
      selectedYear,
      selectedMonth,
      categoryFilter,
      subcategoryFilter,
      searchQuery,
      typeFilter,
      sourceFilter,
      scrollTop: viewStateRef.current?.scrollTop ?? 0,
    };
  }, [viewStateRef, activityType, selectedYear, selectedMonth, categoryFilter, subcategoryFilter, searchQuery, typeFilter, sourceFilter]);

  // Put the list back where it was, before the browser paints - restoring in a
  // plain effect would show the top of the list for a frame first. The filters
  // are restored in the same commit, so the list is already its old height and
  // the offset still means what it meant.
  const listRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const top = saved?.scrollTop ?? 0;
    if (top && listRef.current) listRef.current.scrollTop = top;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


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
    return Array.from(monthsSet)
      .sort((a, b) => a - b)
      .map(String);
  };

  const availableYears = getAvailableYears();
  const availableMonths = getAvailableMonths();

  // Auto-adjust selected month if it doesn't exist in the selected year
  useEffect(() => {
    if (availableMonths.length > 0 && !availableMonths.includes(selectedMonth) && selectedMonth !== 'year') {
      setSelectedMonth('year');
    }
  }, [selectedYear, availableMonths, selectedMonth]);

  // Get date range based on selected year and month
  const getDateRange = () => {
    const year = parseInt(selectedYear);

    if (selectedMonth === 'year') {
      return { start: new Date(year, 0, 1), end: new Date(year, 11, 31, 23, 59, 59) };
    }

    const monthIndex = parseInt(selectedMonth, 10);

    if (!isNaN(year) && monthIndex >= 0 && monthIndex <= 11) {
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
    activityType === 'expense' ? (
      <AmountText amount={-netTotal} currency={currency} />
    ) : activityType === 'income' ? (
      <AmountText sign="+" amount={netTotal} currency={currency} />
    ) : (
      <AmountText sign={netTotal >= 0 ? '+' : '-'} amount={Math.abs(netTotal)} currency={currency} />
    );

  // CSV Export
  // The tab opens filtered - to this month, at least - so "download" meant one
  // thing to the button (the current view) and usually another to the person
  // pressing it (all my data). It asks now, unless the filters are leaving
  // everything on screen anyway, in which case there is nothing to ask.
  //
  // Both scopes go through lib/csv, and so does the Settings export, so the
  // three cannot drift into different dialects (they had: this one used comma
  // decimals and no BOM, the other the opposite).
  const [exportScopeOpen, setExportScopeOpen] = useState(false);

  // The filters in force, worded the way they read on screen.
  // Type-filter values stay canonical ('One-off', ...) - App presets and the
  // row filter compare them - so display goes through this map.
  const typeFilterLabel = (v: string) =>
    v === 'One-off' ? t('act.type.oneOff') : v === 'Recurring' ? t('act.type.recurring') : v === 'Imported' ? t('act.type.imported') : v;

  const activeFilters = (() => {
    const bits: string[] = [];
    if (activityType !== 'all') bits.push(activityType === 'expense' ? t('act.expenses') : t('act.income'));
    bits.push(selectedMonth === 'year' ? selectedYear : `${monthsShort()[parseInt(selectedMonth, 10)] ?? ''} ${selectedYear}`);
    if (categoryFilter !== 'All') bits.push(categoryFilter);
    if (subcategoryFilter !== 'All') bits.push(subcategoryFilter);
    if (typeFilter !== 'All') bits.push(typeFilterLabel(typeFilter));
    if (sourceFilter !== 'All') bits.push(sources.find((s) => s.id === sourceFilter)?.name ?? t('act.oneSource'));
    if (searchQuery) bits.push(`"${searchQuery}"`);
    return bits;
  })();

  const runExport = (scope: 'view' | 'all') => {
    const rows = scope === 'all' ? transactions : filteredTransactions;
    setExportScopeOpen(false);
    if (rows.length === 0) {
      toast.error(t('act.noExport'));
      return;
    }
    downloadTransactionsCsv(
      buildTransactionsCsv(rows, currency, sources),
      scope === 'all' ? 'tracklylab-transactions' : 'tracklylab-activity',
    );
    toast.success(`Exported ${rows.length} transaction${rows.length !== 1 ? 's' : ''}`);
  };

  const downloadActivity = () => {
    if (filteredTransactions.length === 0) {
      toast.error(t('act.noExport'));
      return;
    }
    if (filteredTransactions.length === transactions.length) {
      runExport('view'); // the view IS everything - nothing to choose between
      return;
    }
    setExportScopeOpen(true);
  };

  // Category list for the filter modal, matching the active type
  const modalCategories =
    activityType === 'income' ? incomeCategories : activityType === 'expense' ? categories : [...categories, ...incomeCategories];

  // Same three-way control as Trend's, in Activity's own order: the label
  // carries the meaning-colour and the thumb's glow repeats it underneath.
  // All is a scope rather than a direction, so it glows neutral.
  const typeOptions: Array<{ value: ActivityTypeFilter; label: string; activeColor: string }> = [
    { value: 'all', label: t('act.all'), activeColor: '#1C1C1E' },
    { value: 'expense', label: t('act.expenses'), activeColor: '#C2352B' },
    { value: 'income', label: t('act.income'), activeColor: '#1F7A43' }
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ backgroundColor: '#F6F5F2' }}>
      {/* Fixed Header - Always Visible */}
      <div className="flex-shrink-0 pt-0" style={{ backgroundColor: '#F6F5F2' }}>
        <div className="px-6 pb-4 flex items-center justify-between">
          <div className="flex-1">
            <h1 style={{ color: '#1C1C1E', fontSize: '28px', fontWeight: '600', letterSpacing: '-0.5px' }}>{t('act.title')}</h1>
            <p style={{ color: '#8E8E93', fontSize: '14px', marginTop: '4px' }}>
              {t(totalCount === 1 ? 'act.header.one' : 'act.header.other', { n: totalCount })} · {headerTotal}
            </p>
          </div>
          {filteredTransactions.length > 0 && (
            <button
              onClick={downloadActivity}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-colors active:bg-neutral-200"
              style={{ backgroundColor: '#F2F1ED' }}
            >
              <Download size={18} style={{ color: '#1C1C1E' }} />
            </button>
          )}
        </div>

        {/* All / Expenses / Income type filter */}
        <div className="px-6 pb-3">
          <div className="relative flex p-1 rounded-full" style={{ backgroundColor: '#ECEAE4' }}>
            <div
              className="absolute rounded-full"
              style={{
                top: 4, bottom: 4, left: 4, width: 'calc((100% - 8px) / 3)',
                backgroundColor: '#FFFFFF',
                boxShadow: switchGlow(activityType === 'all' ? 'all' : activityType),
                transform:
                  activityType === 'expense' ? 'translateX(100%)'
                  : activityType === 'income' ? 'translateX(200%)'
                  : 'translateX(0)',
                transition: 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)',
              }}
              aria-hidden="true"
            />
            {typeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => handleActivityTypeChange(option.value)}
                className="relative flex-1 min-w-0 py-1.5 text-sm font-medium transition-colors"
                style={{ color: activityType === option.value ? option.activeColor : '#8E8E93' }}
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
      <div
        ref={listRef}
        onScroll={(e) => {
          if (viewStateRef?.current) viewStateRef.current.scrollTop = e.currentTarget.scrollTop;
        }}
        className="flex-1 overflow-y-auto pt-2 pb-24"
      >
        {Object.entries(groupedTransactions).length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="text-neutral-400 text-sm mb-2">{t('act.noTx')}</div>
            <p className="text-neutral-500 text-xs">
              {searchQuery ? t('act.tryDifferent') : t('act.changeFilters')}
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

      {exportScopeOpen && (
        <ExportScopeModal
          filteredCount={filteredTransactions.length}
          totalCount={transactions.length}
          filters={activeFilters}
          onSelect={runExport}
          onClose={() => setExportScopeOpen(false)}
        />
      )}
    </div>
  );
}
