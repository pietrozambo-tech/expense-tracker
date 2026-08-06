import { useState } from 'react';
import { t } from '../i18n';
import { Search } from 'lucide-react';
import { CURRENCIES } from '../utils/currency';

interface CurrencySearchListProps {
  selected?: string | null;
  onSelect: (code: string) => void;
  autoFocus?: boolean;
}

// Searchable list over the full currency set (code or name), used wherever the
// user can pick beyond the four main currencies - Settings' main-currency
// screen and onboarding. Row styling matches the app's list cards.
export function CurrencySearchList({ selected, onSelect, autoFocus = true }: CurrencySearchListProps) {
  const [query, setQuery] = useState('');

  const codes = Object.keys(CURRENCIES).filter((code) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const c = CURRENCIES[code];
    return code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="relative mb-3">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('add.searchCurrency')}
          autoFocus={autoFocus}
          // 16px (text-base) prevents iOS Safari from auto-zooming on focus
          className="w-full pl-9 pr-3 py-2.5 bg-white rounded-xl text-base outline-none shadow-sm focus:ring-2 focus:ring-blue-500"
          style={{ color: '#1C1C1E' }}
        />
      </div>

      <div
        className="bg-white rounded-2xl shadow-sm overflow-y-auto flex-1 min-h-0"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {codes.length === 0 ? (
          <div className="text-center py-8 text-neutral-400 text-sm">No currency found</div>
        ) : (
          codes.map((code, i) => {
            const c = CURRENCIES[code];
            const isSelected = selected === code;
            return (
              <button
                key={code}
                onClick={() => onSelect(code)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                style={{ borderBottom: i < codes.length - 1 ? '1px solid #F2F1ED' : 'none' }}
              >
                <span
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: isSelected ? '#E3F2FF' : '#F2F1ED', fontSize: '19px' }}
                >
                  {c.flag}
                </span>
                <span className="flex flex-col items-start min-w-0">
                  <span className="font-medium" style={{ color: isSelected ? '#3B82F6' : '#1C1C1E', fontSize: '15px' }}>
                    {code}
                  </span>
                  <span className="text-neutral-500 text-[13px] truncate">{c.name}</span>
                </span>
                {isSelected && (
                  <span
                    className="ml-auto w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#3B82F6' }}
                  >
                    <svg width="10" height="8" viewBox="0 0 12 10" fill="none">
                      <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
