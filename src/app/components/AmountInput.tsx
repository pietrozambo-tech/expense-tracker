import { useEffect, useRef, useState } from 'react';
import { CURRENCIES } from '../utils/currency';
import { ChevronDown } from 'lucide-react';

interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
  currency: string;
  onCurrencyChange?: (currency: string) => void;
  rightSlot?: React.ReactNode; // e.g. the source selector pill, aligned to the amount line
}

export function AmountInput({ value, onChange, currency, onCurrencyChange, rightSlot }: AmountInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showCurrencySelector, setShowCurrencySelector] = useState(false);
  const currencySymbol = CURRENCIES[currency]?.symbol || '€';

  useEffect(() => {
    // Auto-focus on mount
    inputRef.current?.focus();
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
    setShowCurrencySelector(false);
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
          onClick={() => setShowCurrencySelector(false)}
          style={{ transform: 'translateZ(0)' }}
        >
          <div 
            className="bg-white rounded-t-3xl w-full max-w-[430px] p-6 pb-8 shadow-xl" 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              transform: 'translateZ(0)',
              maxHeight: '50vh'
            }}
          >
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Select Currency</h3>
            <div className="bg-white rounded-2xl overflow-hidden">
              {Object.entries(CURRENCIES).map(([code, currencyData], index) => (
                <button
                  key={code}
                  onClick={() => handleCurrencySelect(code)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                  style={{
                    borderBottom: index < Object.keys(CURRENCIES).length - 1 ? '1px solid #F2F2F7' : 'none'
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{
                        backgroundColor: currency === code ? '#E3F2FF' : '#F2F2F7',
                        fontSize: '22px'
                      }}
                    >
                      {currencyData.flag}
                    </div>
                    <div className="flex flex-col items-start">
                      <span
                        className="font-medium"
                        style={{
                          color: currency === code ? '#007AFF' : '#1C1C1E',
                          fontSize: '16px'
                        }}
                      >
                        {code}
                      </span>
                      <span className="text-neutral-500 text-sm">{currencyData.name}</span>
                    </div>
                  </div>
                  {currency === code && (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: '#007AFF' }}
                    >
                      <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                        <path
                          d="M1 5L4.5 8.5L11 1.5"
                          stroke="white"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}