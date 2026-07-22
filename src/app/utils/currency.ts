// Currency configuration and conversion utilities

export interface Currency {
  code: string;
  symbol: string;
  position: 'before' | 'after'; // Symbol position relative to amount
  name: string;
  flag: string;
}

export const CURRENCIES: Record<string, Currency> = {
  EUR: { code: 'EUR', symbol: '€', position: 'after', name: 'Euro', flag: '🇪🇺' },
  USD: { code: 'USD', symbol: '$', position: 'before', name: 'US Dollar', flag: '🇺🇸' },
  GBP: { code: 'GBP', symbol: '£', position: 'before', name: 'British Pound', flag: '🇬🇧' },
  AED: { code: 'AED', symbol: 'AED', position: 'before', name: 'UAE Dirham', flag: '🇦🇪' }
};

// Approximate conversion rates (in a real app, these would come from an API)
const CONVERSION_RATES: Record<string, Record<string, number>> = {
  EUR: { EUR: 1, USD: 1.09, GBP: 0.86, AED: 4.02 },
  USD: { EUR: 0.92, USD: 1, GBP: 0.79, AED: 3.67 },
  GBP: { EUR: 1.16, USD: 1.27, GBP: 1, AED: 4.67 },
  AED: { EUR: 0.25, USD: 0.27, GBP: 0.21, AED: 1 }
};

export const convertAmount = (amount: number, fromCurrency: string, toCurrency: string): number => {
  if (fromCurrency === toCurrency) return amount;
  
  const rate = CONVERSION_RATES[fromCurrency]?.[toCurrency] || 1;
  return amount * rate;
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
  
  // Position symbol before or after
  return currency.position === 'before' 
    ? `${currency.symbol}${formattedNumber}`
    : `${formattedNumber}${currency.symbol}`;
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
  
  return currency.position === 'before'
    ? `${currency.symbol}${withSign}`
    : `${withSign}${currency.symbol}`;
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
  
  return currency.position === 'before'
    ? `${currency.symbol}${withSign}`
    : `${withSign}${currency.symbol}`;
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
  return `${formattedNumber}${currency.symbol}`;
};