import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronRight } from 'lucide-react';
import { t } from '../i18n';
import { monthsShort } from '../i18n/store';
import { useBackClose } from '../lib/useBackClose';

// Two small bottom sheets behind the Activity filter row.
//
// The row used to carry six controls, which wrapped onto a second line and
// left the search button stranded on its own. Most of them read "All" most of
// the time - six controls to say "no filters". These sheets hold the same
// controls, so the row can be one line and the chips below it can show only
// what is actually filtering.
//
// Same shell as CategoryFilterModal: tap-outside to dismiss, slide up from the
// bottom, capped at the phone column width.

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  // Every sheet in this file goes through here, so the back gesture is wired
  // once for the period picker and the filter panel both.
  useBackClose(true, onClose);
  // Portalled to <body> on purpose. The filter bar it is rendered from is
  // `sticky z-10`, which opens a stacking context - so a z-50 overlay nested
  // inside it is still only "z-50 within z-10", and the z-40 nav dock painted
  // straight over the bottom of the sheet.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-[430px] bg-white rounded-t-3xl shadow-2xl animate-slide-up relative z-10"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h3 style={{ color: 'var(--ink)', fontSize: 17, fontWeight: 600 }}>{title}</h3>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="w-8 h-8 rounded-full flex items-center justify-center active:bg-neutral-100 transition-colors"
          >
            <X className="w-4.5 h-4.5" style={{ color: 'var(--ink-2)' }} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// The year filter's "no year at all" value. A string because it sits in the
// same slot as "2026" - in state, in the saved view, in App's presets - and a
// sentinel that travels with them beats a second nullable field everywhere.
export const ALL_YEARS = 'all';

export function PeriodSheet({
  year,
  month,
  availableYears,
  availableMonths,
  onYearChange,
  onMonthChange,
  onClose,
}: {
  year: string;
  month: string;
  availableYears: string[];
  availableMonths: string[];
  onYearChange: (v: string) => void;
  onMonthChange: (v: string) => void;
  onClose: () => void;
}) {
  const short = monthsShort();
  return (
    <Sheet title={t('act.period')} onClose={onClose}>
      <div className="px-6 pb-5">
        {/* Years: a scrolling row rather than a picker - there are rarely more
            than a handful, and seeing them all is faster than opening a list. */}
        <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1">
          {/* First, because it is the widest lens - the years narrow from
              here. It exists for the trip that crosses New Year: no single
              year contains it, so without this the app can only ever show
              half of one. */}
          <button
            onClick={() => { onYearChange(ALL_YEARS); onClose(); }}
            data-period-all
            className="px-3.5 py-1.5 rounded-full text-[13px] font-semibold flex-shrink-0 transition-colors"
            style={{
              backgroundColor: year === ALL_YEARS ? '#4F74F3' : 'var(--bg-field)',
              color: year === ALL_YEARS ? '#FFFFFF' : '#5c5c60',
            }}
          >
            {t('act.allYears')}
          </button>
          {availableYears.map((y) => {
            const on = y === year;
            return (
              <button
                key={y}
                onClick={() => onYearChange(y)}
                className="px-3.5 py-1.5 rounded-full text-[13px] font-semibold flex-shrink-0 transition-colors"
                style={{
                  backgroundColor: on ? '#4F74F3' : 'var(--bg-field)',
                  color: on ? '#FFFFFF' : '#5c5c60',
                }}
              >
                {y}
              </button>
            );
          })}
        </div>

        {year === ALL_YEARS ? null : (
        <>
        <button
          onClick={() => { onMonthChange('year'); onClose(); }}
          className="w-full mb-2 py-2.5 rounded-xl text-[14px] font-semibold transition-colors"
          style={{
            backgroundColor: month === 'year' ? 'var(--wash-accent)' : 'var(--bg-field)',
            color: month === 'year' ? '#4F74F3' : '#5c5c60',
          }}
        >
          {t('act.fullYear')}
        </button>

        <div className="grid grid-cols-4 gap-2">
          {short.map((label, idx) => {
            const value = String(idx);
            const available = availableMonths.includes(value);
            const on = month === value;
            return (
              <button
                key={label}
                disabled={!available}
                onClick={() => { onMonthChange(value); onClose(); }}
                className="py-2.5 rounded-xl text-[13px] font-semibold transition-colors disabled:opacity-35"
                style={{
                  backgroundColor: on ? '#4F74F3' : 'var(--bg-field)',
                  color: on ? '#FFFFFF' : '#5c5c60',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        </>
        )}
      </div>
    </Sheet>
  );
}

/**
 * The Type filter, in a sheet of its own.
 *
 * Four options and a check on the one in force - the same shape the Source
 * and Category pickers use, so the row that opens it behaves like the rows
 * around it. Picking closes the sheet: the answer is the list underneath.
 */
export function TypeSheet({
  typeFilter,
  typeDisplay,
  onSelect,
  onClose,
}: {
  typeFilter: string;
  typeDisplay: (v: string) => string;
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title={t('act.type')} onClose={onClose}>
      <div data-type-sheet>
        {['All', 'One-off', 'Recurring', 'Imported'].map((v) => {
          const on = (typeFilter || 'All') === v;
          return (
            <button
              key={v}
              data-type-option={v}
              onClick={() => { onSelect(v); onClose(); }}
              className="w-full flex items-center justify-between px-6 py-3.5 active:bg-neutral-50 transition-colors border-b border-neutral-100 last:border-b-0"
            >
              <span style={{ color: on ? '#4F74F3' : 'var(--ink)', fontSize: 15, fontWeight: on ? 600 : 400 }}>
                {typeDisplay(v)}
              </span>
              {on && (
                <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: '#4F74F3' }}>
                  <svg width="11" height="9" viewBox="0 0 12 10" fill="none" aria-hidden="true">
                    <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

export function FiltersSheet({
  typeFilter,
  typeDisplay,
  sourceLabel,
  categoryLabel,
  subcategoryLabel,
  tripLabel,
  canPickSubcategory,
  onOpenType,
  onOpenSource,
  onOpenCategory,
  onOpenSubcategory,
  onOpenTrip,
  onClearAll,
  activeCount,
  onClose,
}: {
  typeFilter: string;
  typeDisplay: (v: string) => string;
  sourceLabel: string;
  categoryLabel: string;
  subcategoryLabel: string;
  tripLabel: string;
  canPickSubcategory: boolean;
  onOpenType?: () => void;
  onOpenSource?: () => void;
  onOpenCategory: () => void;
  onOpenSubcategory?: () => void;
  /** Absent for anyone with no trips - which is most people, most of the
   *  time, and they should not be shown a filter for a thing they do not
   *  have. */
  onOpenTrip?: () => void;
  onClearAll: () => void;
  activeCount: number;
  onClose: () => void;
}) {
  const Row = ({ label, value, onClick, ...rest }: { label: string; value: string; onClick: () => void }) => (
    <button
      {...rest}
      onClick={onClick}
      className="w-full flex items-center justify-between px-6 py-3.5 active:bg-neutral-50 transition-colors border-b border-neutral-100 last:border-b-0"
    >
      <span style={{ color: 'var(--ink)', fontSize: 15 }}>{label}</span>
      <span className="flex items-center gap-1.5">
        <span style={{ color: 'var(--ink-2)', fontSize: 15 }}>{value}</span>
        <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
      </span>
    </button>
  );

  return (
    <Sheet title={t('act.filters')} onClose={onClose}>
      {/* Five rows, all shut, in the order people reach for them: what it was
          spent on first, then the narrower cut of that, then how it recurs,
          then what paid, then where.

          Type used to sit at the top as a row of chips, open before anyone
          asked - the one filter already expanded, above the two most people
          actually want, pushing them down and making the sheet look like it
          was mid-answer. It is a row like the rest now, and it says its own
          value at rest the way the others do. */}
      <div>
        <Row label={t('act.category')} value={categoryLabel} onClick={onOpenCategory} data-filter-category />
        {/* Only once a category is chosen: the subcategories on offer are that
            category's, so with none picked the row could only ever say All. */}
        {canPickSubcategory && onOpenSubcategory && (
          <Row label={t('act.subcategory')} value={subcategoryLabel} onClick={onOpenSubcategory} data-filter-subcategory />
        )}
        {onOpenType && <Row label={t('act.type')} value={typeDisplay(typeFilter || 'All')} onClick={onOpenType} data-filter-type />}
        {onOpenSource && <Row label={t('act.source')} value={sourceLabel} onClick={onOpenSource} data-filter-source />}
        {/* Last, and only when there is one: a trip is a narrower thing than
            a category, and it is the row most people will never see. */}
        {onOpenTrip && <Row label={t('act.trip')} value={tripLabel} onClick={onOpenTrip} data-filter-trip />}
      </div>
      {activeCount > 0 && (
        <div className="px-6 pt-4">
          <button
            onClick={() => { onClearAll(); onClose(); }}
            className="w-full py-3 rounded-xl text-[15px] font-medium active:scale-[0.98] transition-transform"
            style={{ backgroundColor: 'var(--bg-field)', color: 'var(--ink)' }}
          >
            {t('act.clearFilters')}
          </button>
        </div>
      )}
    </Sheet>
  );
}
