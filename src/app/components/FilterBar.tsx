import { ChevronDown, Search, X, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Source } from '../types';
import { SourceLogo } from './SourceLogo';

interface FilterBarProps {
  year: string; // e.g., "2025"
  month: string; // e.g., "Jan"
  category: string;
  subcategory?: string;
  searchQuery?: string;
  typeFilter?: string; // "All", "Non-repeated", "Repeated"
  sourceFilter?: string; // 'All' or a source id
  sources?: Source[];
  availableYears: string[];
  availableMonths: string[];
  onYearChange: (year: string) => void;
  onMonthChange: (month: string) => void;
  onOpenCategorySelector: () => void;
  onOpenSubcategorySelector?: () => void;
  onOpenSourceSelector?: () => void;
  onOpenSearch: () => void;
  onClearSearch?: () => void;
  onTypeFilterChange?: (type: string) => void;
}

// One shared pill spec so every filter chip has the same height, radius, type
// size and chevron — whether it's a native <select> or a button that opens a
// modal. The transparent border keeps bordered (dashed) and fill pills the
// exact same height.
const PILL = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[13px] leading-5 transition-colors';
const PILL_NEUTRAL = 'bg-neutral-100 border-transparent text-neutral-600 hover:bg-neutral-200/60';
const CHEVRON = 'w-3.5 h-3.5 flex-shrink-0';

// iOS rendering hints (kept from the original native selects).
const IOS_SELECT_STYLE = {
  WebkitTapHighlightColor: 'rgba(255,255,255,0)',
  WebkitAppearance: 'none' as const,
  appearance: 'none' as const,
  userSelect: 'none' as const,
  WebkitUserSelect: 'none' as const,
  touchAction: 'manipulation' as const,
  transform: 'translateZ(0)',
};

// A pill that looks exactly like the button chips (visible value + chevron),
// with a transparent native <select> overlaid on top to capture taps and show
// the OS picker. Rendering the value/chevron as normal flex children (rather
// than overlaying a chevron on the select) keeps it identical to the buttons.
function SelectPill({
  value,
  onChange,
  children,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  label: string;
}) {
  return (
    <div className={`${PILL} ${PILL_NEUTRAL} relative`}>
      <span>{value}</span>
      <ChevronDown className={`${CHEVRON} text-neutral-400`} />
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        style={IOS_SELECT_STYLE}
      >
        {children}
      </select>
    </div>
  );
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
  availableYears,
  availableMonths,
  onYearChange,
  onMonthChange,
  onOpenCategorySelector,
  onOpenSubcategorySelector,
  onOpenSourceSelector,
  onOpenSearch,
  onClearSearch,
  onTypeFilterChange
}: FilterBarProps) {
  const selectedSource = sources?.find((s) => s.id === sourceFilter);
  return (
    <div
      className="sticky top-0 z-10 bg-white border-b border-neutral-100 px-6 py-2.5"
      style={{ WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)' }}
    >
      <div
        className="flex items-center gap-2 flex-wrap"
        style={{ WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)' }}
      >
        {/* Year Filter */}
        <SelectPill value={year} onChange={onYearChange} label="Filter by year">
          {availableYears.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </SelectPill>

        {/* Month Filter */}
        <SelectPill value={month} onChange={onMonthChange} label="Filter by month">
          <option value="Full Year">Full Year</option>
          {availableMonths.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </SelectPill>

        {/* Type Filter */}
        {onTypeFilterChange && (
          <SelectPill value={typeFilter ?? 'All'} onChange={(v) => onTypeFilterChange(v)} label="Filter by type">
            <option value="All">All</option>
            <option value="One-off">One-off</option>
            <option value="Recurring">Recurring</option>
            <option value="Imported">Imported</option>
          </SelectPill>
        )}

        {/* Source Filter */}
        {onOpenSourceSelector && (
          <button
            onClick={onOpenSourceSelector}
            className={`${PILL} ${
              selectedSource
                ? 'bg-blue-50 border-transparent text-blue-600 hover:bg-blue-100'
                : PILL_NEUTRAL
            }`}
          >
            {selectedSource ? (
              <>
                <SourceLogo source={selectedSource} size={16} />
                <span>{selectedSource.name}</span>
              </>
            ) : (
              <>
                <Wallet className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
                <span>Source</span>
              </>
            )}
            <ChevronDown className={`${CHEVRON} ${selectedSource ? 'text-blue-400' : 'text-neutral-400'}`} />
          </button>
        )}

        {/* Category Filter */}
        <button onClick={onOpenCategorySelector} className={`${PILL} ${PILL_NEUTRAL}`}>
          <span>{category}</span>
          <ChevronDown className={`${CHEVRON} text-neutral-400`} />
        </button>

        {/* Subcategory Filter - only show when available */}
        {subcategory && subcategory !== 'All' && onOpenSubcategorySelector && (
          <button
            onClick={onOpenSubcategorySelector}
            className={`${PILL} bg-blue-50 border-transparent text-blue-600 hover:bg-blue-100`}
          >
            <span>{subcategory}</span>
            <ChevronDown className={`${CHEVRON} text-blue-400`} />
          </button>
        )}

        {/* Add Subcategory Filter button - only show when category is selected and no subcategory */}
        {category !== 'All' && (!subcategory || subcategory === 'All') && onOpenSubcategorySelector && (
          <button
            onClick={onOpenSubcategorySelector}
            className={`${PILL} bg-transparent border-dashed border-neutral-300 text-neutral-400 hover:bg-neutral-50`}
          >
            <span>+ Subcategory</span>
          </button>
        )}

        {/* Active Search Query Display */}
        {searchQuery && onClearSearch && (
          <button
            onClick={onClearSearch}
            className={`${PILL} bg-green-50 border-transparent text-green-600 hover:bg-green-100 max-w-[140px]`}
          >
            <Search className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
            <span className="truncate">{searchQuery}</span>
            <X className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
          </button>
        )}

        {/* Search */}
        <button
          onClick={onOpenSearch}
          className="ml-auto flex items-center justify-center w-8 h-8 rounded-lg border border-transparent bg-neutral-100 hover:bg-neutral-200/60 transition-colors"
        >
          <Search className="w-4 h-4 text-neutral-400" />
        </button>
      </div>
    </div>
  );
}
