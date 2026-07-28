// Currency configuration and conversion utilities
import { convert as fxConvert } from '../lib/fx';
import { CURRENCY_DEFS } from '../lib/currencyData';

export interface Currency {
  code: string;
  symbol: string;
  position: 'before' | 'after'; // Symbol position relative to amount
  name: string;
  flag: string;
}

// The app's main currencies (shown first / in Settings + onboarding).
export const MAIN_CURRENCY_CODES = ['EUR', 'USD', 'GBP', 'AED'];

// Full set of supported currencies (~150 world currencies), derived from the
// shared CURRENCY_DEFS so the display metadata and FX seed rates never drift.
// The first four are the "main" ones; the rest are available under "Others"
// when adding a transaction (e.g. while travelling) and are searchable by code
// or name. Format helpers look currencies up here by code.
export const CURRENCIES: Record<string, Currency> = Object.fromEntries(
  CURRENCY_DEFS.map((c) => [
    c.code,
    { code: c.code, symbol: c.symbol, position: c.position, name: c.name, flag: c.flag },
  ]),
);

export const convertAmount = (amount: number, fromCurrency: string, toCurrency: string): number => {
  if (fromCurrency === toCurrency) return amount;
  return fxConvert(amount, fromCurrency, toCurrency);
};

// Base currency used to lock a transaction's FX value (see Transaction.baseAmount).
export const BASE_CURRENCY = 'EUR';

// The value of a transaction in the user's home currency.
// - Same currency as home: the amount as-is (exact, no rounding).
// - Otherwise: prefer the locked EUR value captured at save time so historical
//   transactions don't re-value as rates move; fall back to a live conversion
//   for older/imported entries that predate the lock.
export function homeAmount(
  txn: { amount: number; currency?: string; baseAmount?: number },
  homeCurrency: string
): number {
  const from = txn.currency || homeCurrency;
  if (from === homeCurrency) return txn.amount;
  if (typeof txn.baseAmount === 'number' && isFinite(txn.baseAmount)) {
    return fxConvert(txn.baseAmount, BASE_CURRENCY, homeCurrency);
  }
  return fxConvert(txn.amount, from, homeCurrency);
}

export const formatAmount = (amount: number, currencyCode: string, decimals: number = 2): string => {
  // Handle null/undefined amounts
  if (amount === null || amount === undefined) {
    amount = 0;
  }
  
  const currency = CURRENCIES[currencyCode] || CURRENCIES.EUR;

  // Format the number with locale
  const formattedNumber = amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });

  // Multi-letter symbols (e.g. AED) read better with a space
  const sep = currency.symbol.length > 1 ? ' ' : '';
  return currency.position === 'before'
    ? `${currency.symbol}${sep}${formattedNumber}`
    : `${formattedNumber}${sep}${currency.symbol}`;
};

export const formatCompactAmount = (amount: number, currencyCode: string): string => {
  // Handle null/undefined amounts
  if (amount === null || amount === undefined) {
    amount = 0;
  }
  
  const currency = CURRENCIES[currencyCode] || CURRENCIES.EUR;
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  
  let formattedNumber: string;
  
  // 1 million or more: use MM
  if (absAmount >= 1000000) {
    const millions = absAmount / 1000000;
    formattedNumber = `${millions.toFixed(1)}MM`;
  }
  // 100,000 or more (6+ digits): use K
  else if (absAmount >= 100000) {
    const thousands = absAmount / 1000;
    formattedNumber = `${Math.round(thousands)}K`;
  }
  // Less than 100,000: use normal formatting
  else {
    formattedNumber = absAmount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
  
  const withSign = `${sign}${formattedNumber}`;
  
  const sep = currency.symbol.length > 1 ? ' ' : '';
  return currency.position === 'before'
    ? `${currency.symbol}${sep}${withSign}`
    : `${withSign}${sep}${currency.symbol}`;
};

export const formatSummaryAmount = (amount: number, currencyCode: string): string => {
  // Handle null/undefined amounts
  if (amount === null || amount === undefined) {
    amount = 0;
  }
  
  const currency = CURRENCIES[currencyCode] || CURRENCIES.EUR;
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  
  let formattedNumber: string;
  
  // 1 million or more: use MM
  if (absAmount >= 1000000) {
    const millions = absAmount / 1000000;
    formattedNumber = `${millions.toFixed(1)}MM`;
  }
  // 100,000 or more (6+ digits): use K
  else if (absAmount >= 100000) {
    const thousands = absAmount / 1000;
    formattedNumber = `${Math.round(thousands)}K`;
  }
  // Less than 100,000: use whole number formatting
  else {
    formattedNumber = Math.round(absAmount).toLocaleString('en-US');
  }
  
  const withSign = `${sign}${formattedNumber}`;
  
  const sep = currency.symbol.length > 1 ? ' ' : '';
  return currency.position === 'before'
    ? `${currency.symbol}${sep}${withSign}`
    : `${withSign}${sep}${currency.symbol}`;
};

// The shortest honest rendering of an amount: "86.4K CHF", "1.2MM CHF".
//
// Only for the fallback in FitText, when the full number cannot fit the space
// available - abbreviating loses precision, so it is never the first choice.
// "MM" for millions matches the Trend tab's existing notation.
export const formatAbbreviatedAmount = (amount: number, currencyCode: string): string => {
  if (amount === null || amount === undefined) amount = 0;

  const abs = Math.abs(amount);
  if (abs < 10000) return formatAmountListView(amount, currencyCode, 0);

  const currency = CURRENCIES[currencyCode] || CURRENCIES.EUR;
  const [scaled, suffix] = abs >= 1000000 ? [amount / 1000000, 'MM'] : [amount / 1000, 'K'];
  // One decimal, but "86.0K" reads worse than "86K".
  const number = scaled.toFixed(1).replace(/\.0$/, '');
  const sep = currency.symbol.length > 1 ? ' ' : '';
  return `${number}${suffix}${sep}${currency.symbol}`;
};

// Format amount with currency symbol ALWAYS after the number (for list views)
export const formatAmountListView = (amount: number, currencyCode: string, decimals: number = 2): string => {
  // Handle null/undefined amounts
  if (amount === null || amount === undefined) {
    amount = 0;
  }
  
  const currency = CURRENCIES[currencyCode] || CURRENCIES.EUR;
  
  // Format the number with locale
  const formattedNumber = amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  
  // Always position symbol after the number for list views
  const sep = currency.symbol.length > 1 ? ' ' : '';
  return `${formattedNumber}${sep}${currency.symbol}`;
};