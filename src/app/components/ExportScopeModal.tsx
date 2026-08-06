import { X, ListFilter, Database } from 'lucide-react';
import { numberLocale } from '../i18n/store';

// "Download" on the Activity tab is ambiguous, and silently guessing is the
// one thing it must not do: the tab opens filtered to the current month, so
// the obvious reading ("give me my data") and what the button actually did
// were different files. Ask instead, and say plainly what each one contains.
//
// Only shown when the two differ - with nothing filtered out there is nothing
// to choose, and a dialog would be a tax on the simple case.

export type ExportScope = 'view' | 'all';

interface ExportScopeModalProps {
  /** How many rows the filters currently leave on screen. */
  filteredCount: number;
  /** How many there are in total. */
  totalCount: number;
  /** The filters in force, already worded for a human ("Expenses", "Aug 2026"). */
  filters: string[];
  onSelect: (scope: ExportScope) => void;
  onClose: () => void;
}

const count = (n: number) => `${n.toLocaleString(numberLocale())} transaction${n === 1 ? '' : 's'}`;

export function ExportScopeModal({ filteredCount, totalCount, filters, onSelect, onClose }: ExportScopeModalProps) {
  const Option = ({ Icon, title, subtitle, rows, onClick }: {
    Icon: typeof ListFilter; title: string; subtitle: string; rows: number; onClick: () => void;
  }) => (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-4 rounded-xl text-left active:scale-[0.99]"
      style={{
        backgroundColor: '#F7F7F8',
        transition: 'background-color 0.15s ease',
        WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)',
      }}
    >
      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#E3F2FF' }}>
        <Icon className="w-4 h-4" style={{ color: '#3B82F6' }} strokeWidth={2.2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold" style={{ color: '#1C1C1E' }}>{title}</div>
        <div className="text-[13px] leading-snug mt-0.5 truncate" style={{ color: '#8E8E93' }}>{subtitle}</div>
      </div>
      <div className="text-[13px] tabular-nums flex-shrink-0" style={{ color: '#8E8E93' }}>{rows.toLocaleString(numberLocale())}</div>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-[430px] bg-white rounded-t-3xl shadow-2xl animate-slide-up relative z-10"
        onClick={(e) => e.stopPropagation()}
        style={{ transform: 'translateZ(0)' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <h3 className="text-neutral-900 font-semibold">Export CSV</h3>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-xl transition-colors" aria-label="Close">
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-2.5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 28px)' }}>
          <Option
            Icon={ListFilter}
            title="This view"
            subtitle={filters.length ? filters.join(' · ') : count(filteredCount)}
            rows={filteredCount}
            onClick={() => onSelect('view')}
          />
          <Option
            Icon={Database}
            title="Everything"
            subtitle="Every transaction, no filters"
            rows={totalCount}
            onClick={() => onSelect('all')}
          />
        </div>
      </div>
    </div>
  );
}
