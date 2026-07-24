// Currency configuration and conversion utilities
import { convert as fxConvert } from '../lib/fx';

export interface Currency {
  code: string;
  symbol: string;
  position: 'before' | 'after'; // Symbol position relative to amount
  name: string;
  flag: string;
}

// The app's main currencies (shown first / in Settings + onboarding).
export const MAIN_CURRENCY_CODES = ['EUR', 'USD', 'GBP', 'AED'];

// Full set of supported currencies. The first four are the "main" ones; the
// rest are available under "Others" when adding a transaction (e.g. while
// travelling). Format helpers look currencies up here by code.
export const CURRENCIES: Record<string, Currency> = {
  EUR: { code: 'EUR', symbol: '€', position: 'after', name: 'Euro', flag: '🇪🇺' },
  USD: { code: 'USD', symbol: '$', position: 'before', name: 'US Dollar', flag: '🇺🇸' },
  GBP: { code: 'GBP', symbol: '£', position: 'before', name: 'British Pound', flag: '🇬🇧' },
  AED: { code: 'AED', symbol: 'AED', position: 'before', name: 'UAE Dirham', flag: '🇦🇪' },
  // Additional (travel) currencies.
  JPY: { code: 'JPY', symbol: '¥', position: 'before', name: 'Japanese Yen', flag: '🇯🇵' },
  CHF: { code: 'CHF', symbol: 'CHF', position: 'before', name: 'Swiss Franc', flag: '🇨🇭' },
  CAD: { code: 'CAD', symbol: '$', position: 'before', name: 'Canadian Dollar', flag: '🇨🇦' },
  AUD: { code: 'AUD', symbol: '$', position: 'before', name: 'Australian Dollar', flag: '🇦🇺' },
  NZD: { code: 'NZD', symbol: '$', position: 'before', name: 'New Zealand Dollar', flag: '🇳🇿' },
  CNY: { code: 'CNY', symbol: '¥', position: 'before', name: 'Chinese Yuan', flag: '🇨🇳' },
  HKD: { code: 'HKD', symbol: '$', position: 'before', name: 'Hong Kong Dollar', flag: '🇭🇰' },
  SGD: { code: 'SGD', symbol: '$', position: 'before', name: 'Singapore Dollar', flag: '🇸🇬' },
  INR: { code: 'INR', symbol: '₹', position: 'before', name: 'Indian Rupee', flag: '🇮🇳' },
  KRW: { code: 'KRW', symbol: '₩', position: 'before', name: 'South Korean Won', flag: '🇰🇷' },
  THB: { code: 'THB', symbol: '฿', position: 'before', name: 'Thai Baht', flag: '🇹🇭' },
  MYR: { code: 'MYR', symbol: 'RM', position: 'before', name: 'Malaysian Ringgit', flag: '🇲🇾' },
  IDR: { code: 'IDR', symbol: 'Rp', position: 'before', name: 'Indonesian Rupiah', flag: '🇮🇩' },
  PHP: { code: 'PHP', symbol: '₱', position: 'before', name: 'Philippine Peso', flag: '🇵🇭' },
  VND: { code: 'VND', symbol: '₫', position: 'after', name: 'Vietnamese Dong', flag: '🇻🇳' },
  SEK: { code: 'SEK', symbol: 'kr', position: 'after', name: 'Swedish Krona', flag: '🇸🇪' },
  NOK: { code: 'NOK', symbol: 'kr', position: 'after', name: 'Norwegian Krone', flag: '🇳🇴' },
  DKK: { code: 'DKK', symbol: 'kr', position: 'after', name: 'Danish Krone', flag: '🇩🇰' },
  ISK: { code: 'ISK', symbol: 'kr', position: 'after', name: 'Icelandic Króna', flag: '🇮🇸' },
  PLN: { code: 'PLN', symbol: 'zł', position: 'after', name: 'Polish Złoty', flag: '🇵🇱' },
  CZK: { code: 'CZK', symbol: 'Kč', position: 'after', name: 'Czech Koruna', flag: '🇨🇿' },
  HUF: { code: 'HUF', symbol: 'Ft', position: 'after', name: 'Hungarian Forint', flag: '🇭🇺' },
  RON: { code: 'RON', symbol: 'lei', position: 'after', name: 'Romanian Leu', flag: '🇷🇴' },
  TRY: { code: 'TRY', symbol: '₺', position: 'before', name: 'Turkish Lira', flag: '🇹🇷' },
  RUB: { code: 'RUB', symbol: '₽', position: 'after', name: 'Russian Ruble', flag: '🇷🇺' },
  BRL: { code: 'BRL', symbol: 'R$', position: 'before', name: 'Brazilian Real', flag: '🇧🇷' },
  MXN: { code: 'MXN', symbol: '$', position: 'before', name: 'Mexican Peso', flag: '🇲🇽' },
  ARS: { code: 'ARS', symbol: '$', position: 'before', name: 'Argentine Peso', flag: '🇦🇷' },
  CLP: { code: 'CLP', symbol: '$', position: 'before', name: 'Chilean Peso', flag: '🇨🇱' },
  COP: { code: 'COP', symbol: '$', position: 'before', name: 'Colombian Peso', flag: '🇨🇴' },
  ZAR: { code: 'ZAR', symbol: 'R', position: 'before', name: 'South African Rand', flag: '🇿🇦' },
  SAR: { code: 'SAR', symbol: 'SAR', position: 'before', name: 'Saudi Riyal', flag: '🇸🇦' },
  QAR: { code: 'QAR', symbol: 'QAR', position: 'before', name: 'Qatari Riyal', flag: '🇶🇦' },
  ILS: { code: 'ILS', symbol: '₪', position: 'before', name: 'Israeli Shekel', flag: '🇮🇱' },
  EGP: { code: 'EGP', symbol: 'E£', position: 'before', name: 'Egyptian Pound', flag: '🇪🇬' },
  MAD: { code: 'MAD', symbol: 'MAD', position: 'before', name: 'Moroccan Dirham', flag: '🇲🇦' },
};

export const convertAmount = (amount: number, fromCurrency: string, toCurrency: string): number => {
  if (fromCurrency === toCurrency) return amount;
  return fxConvert(amount, fromCurrency, toCurrency);
};

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