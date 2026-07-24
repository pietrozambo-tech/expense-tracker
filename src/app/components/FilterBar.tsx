import { ChevronDown, Search, X, Wallet } from 'lucide-react';
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
        <div style={{ 
          WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)', 
          isolation: 'isolate',
          transform: 'translateZ(0)'
        }}>
          <select
            value={year}
            onChange={(e) => onYearChange(e.target.value)}
            className="px-2.5 py-1 rounded-md text-xs text-neutral-600 border border-neutral-200"
            style={{ 
              WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)',
              WebkitAppearance: 'none',
              appearance: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              touchAction: 'manipulation',
              backgroundColor: '#FAFAFA',
              transform: 'translateZ(0)',
              willChange: 'background-color'
            }}
          >
            {availableYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        
        {/* Month Filter */}
        <div style={{ 
          WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)', 
          isolation: 'isolate',
          transform: 'translateZ(0)'
        }}>
          <select
            value={month}
            onChange={(e) => onMonthChange(e.target.value)}
            className="px-2.5 py-1 rounded-md text-xs text-neutral-600 border border-neutral-200"
            style={{ 
              WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)',
              WebkitAppearance: 'none',
              appearance: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              touchAction: 'manipulation',
              backgroundColor: '#FAFAFA',
              transform: 'translateZ(0)',
              willChange: 'background-color'
            }}
          >
            <option value="Full Year">Full Year</option>
            {availableMonths.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        
        {/* Type Filter */}
        {onTypeFilterChange && (
          <div style={{ 
            WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)', 
            isolation: 'isolate',
            transform: 'translateZ(0)'
          }}>
            <select
              value={typeFilter}
              onChange={(e) => onTypeFilterChange(e.target.value as any)}
              className="px-2.5 py-1 rounded-md text-xs text-neutral-600 border border-neutral-200"
              style={{ 
                WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)',
                WebkitAppearance: 'none',
                appearance: 'none',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                touchAction: 'manipulation',
                backgroundColor: '#FAFAFA',
                transform: 'translateZ(0)',
                willChange: 'background-color'
              }}
            >
              <option value="All">All</option>
              <option value="One-off">One-off</option>
              <option value="Recurring">Recurring</option>
            </select>
          </div>
        )}
        
        {/* Source Filter */}
        {onOpenSourceSelector && (
          <button
            onClick={onOpenSourceSelector}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
              selectedSource ? 'bg-blue-50/70 hover:bg-blue-100' : 'bg-neutral-50/70 hover:bg-neutral-100'
            }`}
          >
            {selectedSource ? (
              <>
                <SourceLogo source={selectedSource} size={16} />
                <span className="text-blue-600 text-sm">{selectedSource.name}</span>
              </>
            ) : (
              <>
                <Wallet className="w-3.5 h-3.5 text-neutral-400" />
                <span className="text-neutral-600 text-sm">Source</span>
              </>
            )}
            <ChevronDown className={`w-3.5 h-3.5 ${selectedSource ? 'text-blue-400' : 'text-neutral-400'}`} />
          </button>
        )}

        {/* Category Filter */}
        <button
          onClick={onOpenCategorySelector}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-50/70 hover:bg-neutral-100 rounded-lg transition-colors"
        >
          <span className="text-neutral-600 text-sm">{category}</span>
          <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
        </button>
        
        {/* Subcategory Filter - only show when available */}
        {subcategory && subcategory !== 'All' && onOpenSubcategorySelector && (
          <button
            onClick={onOpenSubcategorySelector}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50/70 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <span className="text-blue-600 text-sm">{subcategory}</span>
            <ChevronDown className="w-3.5 h-3.5 text-blue-400" />
          </button>
        )}
        
        {/* Add Subcategory Filter button - only show when category is selected and no subcategory */}
        {category !== 'All' && (!subcategory || subcategory === 'All') && onOpenSubcategorySelector && (
          <button
            onClick={onOpenSubcategorySelector}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors"
          >
            <span className="text-neutral-400 text-sm">+ Subcategory</span>
          </button>
        )}
        
        {/* Active Search Query Display */}
        {searchQuery && onClearSearch && (
          <button
            onClick={onClearSearch}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50/70 hover:bg-green-100 rounded-lg transition-colors max-w-[140px]"
          >
            <Search className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
            <span className="text-green-600 text-sm truncate">{searchQuery}</span>
            <X className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
          </button>
        )}
        
        {/* Search */}
        <button
          onClick={onOpenSearch}
          className="ml-auto p-1.5 bg-neutral-50/70 hover:bg-neutral-100 rounded-lg transition-colors"
        >
          <Search className="w-4.5 h-4.5 text-neutral-400" />
        </button>
      </div>
    </div>
  );
}