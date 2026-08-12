import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { CURRENCIES, MAIN_CURRENCY_CODES } from '../utils/currency';
import { ChevronDown, ChevronRight, ChevronLeft, Search } from 'lucide-react';

interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
  currency: string;
  onCurrencyChange?: (currency: string) => void;
  rightSlot?: React.ReactNode; // e.g. the source selector pill, aligned to the amount line
  // Raise the keyboard on mount. True when adding - the amount is always the
  // next thing typed. False when editing: the reason for opening an existing
  // transaction is just as often the category or the source, and a keyboard
  // covering half the form costs a tap to dismiss before reaching them.
  autoFocus?: boolean;
}

export function AmountInput({ value, onChange, currency, onCurrencyChange, rightSlot, autoFocus = true }: AmountInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showCurrencySelector, setShowCurrencySelector] = useState(false);
  const [showAllCurrencies, setShowAllCurrencies] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const currencySymbol = CURRENCIES[currency]?.symbol || '€';

  const closeCurrency = () => {
    setShowCurrencySelector(false);
    setShowAllCurrencies(false);
    setCurrencySearch('');
  };

  const allCurrencyCodes = Object.keys(CURRENCIES).filter((code) => {
    const q = currencySearch.trim().toLowerCase();
    if (!q) return true;
    const c = CURRENCIES[code];
    return code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
    // Mount only: re-focusing mid-edit would yank the caret back from
    // whatever field the user had moved to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    
    // Remove thousand separators (commas used for display)
    let rawValue = inputValue.replace(/,(?=\d{3})/g, '');
    
    // Convert decimal comma to decimal point for European keyboards
    // Replace any remaining comma with a period (decimal separator)
    rawValue = rawValue.replace(',', '.');
    
    // Only allow numbers and one decimal point with up to 2 decimal places
    if (rawValue === '' || /^\d*\.?\d{0,2}$/.test(rawValue)) {
      onChange(rawValue);
    }
  };

  // Format the display value with thousands separators
  const formatDisplayValue = (val: string): string => {
    if (!val) return '';
    
    // Split into integer and decimal parts
    const parts = val.split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1];
    
    // Format integer part with commas
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    
    // Reconstruct with decimal if exists
    return decimalPart !== undefined ? `${formattedInteger}.${decimalPart}` : formattedInteger;
  };

  const handleCurrencyClick = () => {
    setShowCurrencySelector(!showCurrencySelector);
  };

  const handleCurrencySelect = (selectedCurrency: string) => {
    if (onCurrencyChange) {
      onCurrencyChange(selectedCurrency);
    }
    closeCurrency();
  };

  // One currency row, shared by the "main" list and the full "Others" list
  const renderCurrencyRow = (code: string, showBorder: boolean) => {
    const currencyData = CURRENCIES[code];
    if (!currencyData) return null;
    return (
      <button
        key={code}
        onClick={() => handleCurrencySelect(code)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
        style={{ borderBottom: showBorder ? '1px solid var(--bg-inset)' : 'none' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: currency === code ? 'var(--wash-accent3)' : 'var(--bg-inset)', fontSize: '22px' }}
          >
            {currencyData.flag}
          </div>
          <div className="flex flex-col items-start">
            <span className="font-medium" style={{ color: currency === code ? '#4F74F3' : 'var(--ink)', fontSize: '16px' }}>
              {code}
            </span>
            <span className="text-neutral-500 text-sm">{currencyData.name}</span>
          </div>
        </div>
        {currency === code && (
          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#4F74F3' }}>
            <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
              <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </button>
    );
  };

  return (
    <>
      <div className="px-6 pt-2 pb-6">
        <div className="flex items-baseline gap-1">
          {/* Clickable Currency Selector - Arrow then Symbol */}
          <button
            onClick={handleCurrencyClick}
            className="flex items-center gap-1.5 group active:scale-95 transition-transform"
            type="button"
          >
            <ChevronDown size={20} className="text-neutral-400 group-active:text-neutral-600" strokeWidth={2.5} />
            <span className="text-3xl text-neutral-400 group-active:text-neutral-600">{currencySymbol}</span>
          </button>
          
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            pattern="[0-9]*\.?[0-9]*"
            value={formatDisplayValue(value)}
            onChange={handleChange}
            placeholder="0"
            className="bg-transparent text-neutral-900 text-4xl font-bold outline-none flex-1 min-w-0 tabular-nums"
          />

          {rightSlot && <div className="flex-shrink-0 self-center">{rightSlot}</div>}
        </div>
      </div>

      {/* Currency Selector Modal */}
      {showCurrencySelector && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
          onClick={closeCurrency}
          style={{ transform: 'translateZ(0)' }}
        >
          <div
            className="bg-white rounded-t-3xl w-full max-w-[430px] p-6 pb-8 shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
            style={
              // In the searchable "Others" view, use a tall sheet so the search
              // bar sits near the top and results stay above the keyboard.
              showAllCurrencies
                ? { transform: 'translateZ(0)', height: '88vh', maxHeight: '88vh' }
                : { transform: 'translateZ(0)', maxHeight: '72vh' }
            }
          >
            {!showAllCurrencies ? (
              <>
                <h3 className="text-lg font-semibold text-neutral-900 mb-4">{t('add.selectCurrency')}</h3>
                <div className="bg-white rounded-2xl overflow-hidden">
                  {MAIN_CURRENCY_CODES.map((code, i) => renderCurrencyRow(code, i < MAIN_CURRENCY_CODES.length - 1))}
                </div>
                <button
                  onClick={() => setShowAllCurrencies(true)}
                  className="w-full flex items-center justify-between px-5 py-4 mt-3 rounded-2xl bg-neutral-50 active:bg-neutral-100 transition-colors"
                >
                  <span className="font-medium text-neutral-700" style={{ fontSize: '16px' }}>{t('add.otherCurrencies')}</span>
                  <ChevronRight className="w-5 h-5 text-neutral-400" />
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => { setShowAllCurrencies(false); setCurrencySearch(''); }}
                    className="p-1 -ml-1 rounded-lg active:bg-neutral-100"
                    aria-label="Back"
                  >
                    <ChevronLeft className="w-6 h-6 text-neutral-500" />
                  </button>
                  <div className="flex-1 relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input
                      value={currencySearch}
                      onChange={(e) => setCurrencySearch(e.target.value)}
                      placeholder={t('add.searchCurrency')}
                      autoFocus
                      // 16px (text-base) prevents iOS Safari from auto-zooming
                      // when the field is focused.
                      className="w-full pl-9 pr-3 py-2.5 bg-neutral-50 rounded-xl text-base outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="bg-white rounded-2xl overflow-y-auto flex-1 min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>
                  {allCurrencyCodes.length === 0 ? (
                    <div className="text-center py-8 text-neutral-400 text-sm">{t('add.noCurrency')}</div>
                  ) : (
                    allCurrencyCodes.map((code, i) => renderCurrencyRow(code, i < allCurrencyCodes.length - 1))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}