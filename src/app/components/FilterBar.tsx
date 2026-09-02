import { useState } from 'react';
import { ChevronDown, Search, X, SlidersHorizontal, ArrowDownWideNarrow } from 'lucide-react';
import { t } from '../i18n';
import { monthsShort } from '../i18n/store';
import type { Source } from '../types';
import { PeriodSheet, TypeSheet, FiltersSheet, ALL_YEARS } from './ActivityFilterSheets';
import { FILTER_ACTIVE } from './filterChip';

interface FilterBarProps {
  year: string; // e.g., "2025"
  month: string; // month index '0'-'11', or 'year'
  category: string;
  subcategory?: string;
  searchQuery?: string;
  typeFilter?: string; // "All", "Non-repeated", "Repeated"
  sourceFilter?: string; // 'All' or a source id
  sources?: Source[];
  /** The name of the trip being shown, when one is. */
  tripLabel?: string;
  availableYears: string[];
  availableMonths: string[];
  onYearChange: (year: string) => void;
  onMonthChange: (month: string) => void;
  onOpenCategorySelector: () => void;
  onOpenSubcategorySelector?: () => void;
  onOpenSourceSelector?: () => void;
  /** Absent for anyone with no trips. */
  onOpenTripSelector?: () => void;
  onOpenSearch: () => void;
  /** 'date' (newest first, the default) or 'amount' (largest first). */
  sortBy?: 'date' | 'amount';
  onToggleSort?: () => void;
  onClearSearch?: () => void;
  onTypeFilterChange?: (type: string) => void;
  // Clearing a filter from its chip. Selecting one already goes through the
  // existing selector modals; these are the one-tap way back out.
  onSourceClear?: () => void;
  onCategoryClear?: () => void;
  onSubcategoryClear?: () => void;
  onTripClear?: () => void;
  /** Lets the shell hide the nav dock while a sheet is up, exactly as the
   *  category/source/search modals already do. */
  onSheetOpenChange?: (open: boolean) => void;
}

// One shared pill spec so every filter chip has the same height, radius, type
// size and chevron — whether it's a native <select> or a button that opens a
// modal. The transparent border keeps bordered (dashed) and fill pills the
// exact same height.
const PILL = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[13px] leading-5 transition-colors';
const PILL_NEUTRAL = 'bg-neutral-100 border-transparent text-neutral-600 hover:bg-neutral-200/60';
const CHEVRON = 'w-3.5 h-3.5 flex-shrink-0';

// Display labels for the canonical type-filter values.
function typeFilterDisplay(v: string): string {
  return v === 'All'
    ? t('act.type.all')
    : v === 'One-off'
      ? t('act.type.oneOff')
      : v === 'Recurring'
        ? t('act.type.recurring')
        : v === 'Imported'
          ? t('act.type.imported')
          : v;
}

export function FilterBar({
  year,
  month,
  category,
  subcategory,
  searchQuery,
  typeFilter,
  sourceFilter,
  sources,
  tripLabel,
  availableYears,
  availableMonths,
  onYearChange,
  onMonthChange,
  onOpenCategorySelector,
  onOpenSubcategorySelector,
  onOpenSourceSelector,
  onOpenTripSelector,
  onOpenSearch,
  sortBy = 'date',
  onToggleSort,
  onClearSearch,
  onTypeFilterChange,
  onSourceClear,
  onCategoryClear,
  onSubcategoryClear,
  onTripClear,
  onSheetOpenChange
}: FilterBarProps) {
  const selectedSource = sources?.find((s) => s.id === sourceFilter);
  const [sheet, setSheet] = useState<'period' | 'filters' | 'type' | null>(null);
  const openSheet = (which: 'period' | 'filters' | 'type' | null) => {
    setSheet(which);
    onSheetOpenChange?.(which !== null);
  };

  // What is actually narrowing the list right now. Search is deliberately not
  // counted: it already shows as its own chip and has its own affordance.
  // Same order as the rows in the sheet - the chips are what those rows chose,
  // and reading them in a different sequence than they were picked in makes
  // the bar look unrelated to the sheet it came from.
  const activeChips: { key: string; label: string; clear: () => void }[] = [];
  if (category !== 'All') {
    activeChips.push({ key: 'category', label: category, clear: () => onCategoryClear?.() });
  }
  if (subcategory && subcategory !== 'All') {
    activeChips.push({ key: 'subcategory', label: subcategory, clear: () => onSubcategoryClear?.() });
  }
  if (typeFilter && typeFilter !== 'All' && onTypeFilterChange) {
    activeChips.push({ key: 'type', label: typeFilterDisplay(typeFilter), clear: () => onTypeFilterChange('All') });
  }
  if (selectedSource && onOpenSourceSelector) {
    activeChips.push({ key: 'source', label: selectedSource.name, clear: () => onSourceClear?.() });
  }
  if (tripLabel) {
    activeChips.push({ key: 'trip', label: tripLabel, clear: () => onTripClear?.() });
  }

  // "All years" is a whole label, not a year to append a month to - composing
  // it the usual way produced "Full Year all".
  const periodLabel =
    year === ALL_YEARS
      ? t('act.allYears')
      : `${month === 'year' ? t('act.fullYear') : monthsShort()[parseInt(month, 10)] ?? month} ${year}`;

  const clearAll = () => {
    if (typeFilter && typeFilter !== 'All') onTypeFilterChange?.('All');
    if (selectedSource) onSourceClear?.();
    if (category !== 'All') onCategoryClear?.();
    if (subcategory && subcategory !== 'All') onSubcategoryClear?.();
    if (tripLabel) onTripClear?.();
  };

  return (
    // Header chrome, so it takes the PAGE colour. As bg-white it became the
    // card grey in dark and read as a slab across the top of the tab.
    //
    // The hairline STAYS, unlike Trend's, because here it marks something
    // real: this bar sits in Activity's fixed header and the transaction list
    // is a separate scroll container starting at exactly this edge, so rows
    // are genuinely clipped on that line. Without it a row scrolling up looks
    // sliced in mid-air - the same fault the Settings sub-pages had.
    //
    // `sticky` is dropped: the bar is inside a flex-shrink-0 header that never
    // scrolls, so it was inert, and z-10 with it (z-index needs positioning,
    // and the header and list do not overlap).
    <div
      className="border-b px-6 py-2.5"
      style={{
        backgroundColor: 'var(--bg-chrome)',
        // Not --line-chrome: this edge is load-bearing in both themes, because
        // the transaction list is a real scroll container starting on it.
        borderColor: 'var(--line-2)',
        WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)',
      }}
    >
      {/* One row: period, everything else, search. The six-control version
          wrapped to two lines and spent most of its width rendering the word
          "All". What is actually filtering now lives in the chip row below,
          where it can be read and cleared in one tap. */}
      <div
        className="flex items-center gap-2"
        style={{ WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)' }}
      >
        <button onClick={() => openSheet('period')} data-period-chip className={`${PILL} ${PILL_NEUTRAL}`}>
          <span>{periodLabel}</span>
          <ChevronDown className={`${CHEVRON} text-neutral-400`} />
        </button>

        <button
          onClick={() => openSheet('filters')}
          className={`${PILL} ${activeChips.length ? 'font-semibold' : PILL_NEUTRAL}`}
          style={
            activeChips.length
              ? { backgroundColor: FILTER_ACTIVE.bg, borderColor: FILTER_ACTIVE.border, color: FILTER_ACTIVE.text }
              : undefined
          }
        >
          <SlidersHorizontal className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{t('act.filters')}</span>
          {activeChips.length > 0 && (
            <span
              className="min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
              style={{ backgroundColor: '#4F74F3', color: '#FFFFFF' }}
            >
              {activeChips.length}
            </span>
          )}
        </button>

        {/* Sort. Silent at rest: on the default (newest first) it is an icon
            the size of the search button beside it, saying only "order can be
            changed". Switched to amount it becomes a labelled pill in the same
            active blue the Filters chip uses - the list is no longer in its
            expected order, and the control that did it says so. */}
        <button
          onClick={onToggleSort}
          aria-label={t('act.ariaSort')}
          aria-pressed={sortBy === 'amount'}
          className={
            sortBy === 'amount'
              ? `${PILL} font-semibold ml-auto flex-shrink-0`
              : 'ml-auto flex items-center justify-center w-8 h-8 rounded-lg border border-transparent bg-neutral-100 hover:bg-neutral-200/60 transition-colors flex-shrink-0'
          }
          style={
            sortBy === 'amount'
              ? { backgroundColor: FILTER_ACTIVE.bg, borderColor: FILTER_ACTIVE.border, color: FILTER_ACTIVE.text }
              : undefined
          }
        >
          <ArrowDownWideNarrow
            className={sortBy === 'amount' ? 'w-3.5 h-3.5 flex-shrink-0' : 'w-4 h-4 text-neutral-400'}
          />
          {sortBy === 'amount' && <span>{t('act.sortAmount')}</span>}
        </button>

        <button
          onClick={onOpenSearch}
          aria-label={t('act.ariaSearch')}
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-transparent bg-neutral-100 hover:bg-neutral-200/60 transition-colors flex-shrink-0"
        >
          <Search className="w-4 h-4 text-neutral-400" />
        </button>
      </div>

      {(activeChips.length > 0 || searchQuery) && (
        <div className="flex items-center gap-2 flex-wrap mt-2">
          {activeChips.map((c) => (
            <button
              key={c.key}
              data-filter-chip={c.key}
              onClick={c.clear}
              className={`${PILL} font-medium max-w-[160px]`}
              style={{ backgroundColor: FILTER_ACTIVE.bg, borderColor: FILTER_ACTIVE.border, color: FILTER_ACTIVE.text }}
            >
              <span className="truncate">{c.label}</span>
              <X className="w-3.5 h-3.5 flex-shrink-0" style={{ color: FILTER_ACTIVE.icon }} />
            </button>
          ))}
          {searchQuery && onClearSearch && (
            <button
              onClick={onClearSearch}
              className={`${PILL} bg-green-50 border-transparent text-green-600 hover:bg-green-100 max-w-[160px]`}
            >
              <Search className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
              <span className="truncate">{searchQuery}</span>
              <X className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
            </button>
          )}
        </div>
      )}

      {sheet === 'period' && (
        <PeriodSheet
          year={year}
          month={month}
          availableYears={availableYears}
          availableMonths={availableMonths}
          onYearChange={onYearChange}
          onMonthChange={onMonthChange}
          onClose={() => openSheet(null)}
        />
      )}
      {sheet === 'type' && (
        <TypeSheet
          typeFilter={typeFilter ?? 'All'}
          typeDisplay={typeFilterDisplay}
          onSelect={(v) => onTypeFilterChange?.(v)}
          onClose={() => openSheet(null)}
        />
      )}
      {sheet === 'filters' && (
        <FiltersSheet
          typeFilter={typeFilter ?? 'All'}
          typeDisplay={typeFilterDisplay}
          sourceLabel={selectedSource ? selectedSource.name : t('act.type.all')}
          categoryLabel={category === 'All' ? t('act.type.all') : category}
          subcategoryLabel={subcategory && subcategory !== 'All' ? subcategory : t('act.type.all')}
          tripLabel={tripLabel || t('act.type.all')}
          onOpenTrip={onOpenTripSelector && (() => { openSheet(null); onOpenTripSelector(); })}
          canPickSubcategory={category !== 'All'}
          // Its own sheet now, reached like every other row - not four chips
          // sitting open at the top of this one.
          onOpenType={onTypeFilterChange ? () => setSheet('type') : undefined}
          onOpenSource={onOpenSourceSelector ? () => { setSheet(null); onOpenSourceSelector(); } : undefined}
          onOpenCategory={() => { setSheet(null); onOpenCategorySelector(); }}
          onOpenSubcategory={onOpenSubcategorySelector ? () => { setSheet(null); onOpenSubcategorySelector(); } : undefined}
          onClearAll={clearAll}
          activeCount={activeChips.length}
          onClose={() => openSheet(null)}
        />
      )}
    </div>
  );
}
