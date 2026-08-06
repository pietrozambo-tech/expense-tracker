// Currency configuration and conversion utilities
import { convert as fxConvert } from '../lib/fx';
import { CURRENCY_DEFS } from '../lib/currencyData';
import { numberLocale, GROUPED } from '../i18n/store';

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

// Amounts are typeset by <AmountText> now (quiet symbol + cents), not by a
// string formatter, so the three helpers that used to live here -
// formatAmount, formatCompactAmount and formatSummaryAmount - are gone.
// formatAmountListView below is what AmountText mirrors, and is kept for the
// places that genuinely need a plain string: sentences, width measurement and
// the FitText fallback.

// A large number folded to a magnitude suffix, in the current locale:
// "86.4K" / "86,4K", "1.2MM" / "1,2MM". The single source both the string
// formatter below and <AmountText abbreviate> draw from, so the two can never
// disagree about what an abbreviated amount looks like.
//
// `mode` preserves two historically different behaviours:
//   'fit'     - FitText's fallback: kicks in at 10K, always drops ".0".
//   'summary' - the category-average style: whole numbers up to 100K, keeps
//               the ".0" on millions ("9.0MM").
export function abbreviateNumber(abs: number, mode: 'fit' | 'summary'): string {
  const loc = numberLocale();
  if (abs >= 1000000) {
    const n = abs / 1000000;
    return mode === 'summary'
      ? `${n.toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false })}MM`
      : `${n.toLocaleString(loc, { maximumFractionDigits: 1, useGrouping: false })}MM`;
  }
  if (mode === 'summary') {
    if (abs >= 100000) return `${Math.round(abs / 1000).toLocaleString(loc)}K`;
    return Math.round(abs).toLocaleString(loc, GROUPED);
  }
  if (abs >= 10000) {
    return `${(abs / 1000).toLocaleString(loc, { maximumFractionDigits: 1, useGrouping: false })}K`;
  }
  return Math.round(abs).toLocaleString(loc, GROUPED);
}

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
  const sign = amount < 0 ? '-' : '';
  const sep = currency.symbol.length > 1 ? ' ' : '';
  return `${sign}${abbreviateNumber(abs, 'fit')}${sep}${currency.symbol}`;
};

// Format amount with currency symbol ALWAYS after the number (for list views).
//
// `decimals` is a maximum, not a fixed width: cents that exist are information
// ("-40.32"), cents that don't are filler ("-54.00"), and a list repeats that
// filler on every row. Rounded first so a converted 53.999 shows as "54",
// not "54.00".
export const formatAmountListView = (amount: number, currencyCode: string, decimals: number = 2): string => {
  // Handle null/undefined amounts
  if (amount === null || amount === undefined) {
    amount = 0;
  }

  const currency = CURRENCIES[currencyCode] || CURRENCIES.EUR;
  const factor = 10 ** decimals;
  const rounded = Math.round(amount * factor) / factor;

  const formattedNumber = rounded.toLocaleString(numberLocale(), {
    ...GROUPED,
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : decimals,
    maximumFractionDigits: decimals
  });

  // Always position symbol after the number for list views
  const sep = currency.symbol.length > 1 ? ' ' : '';
  return `${formattedNumber}${sep}${currency.symbol}`;
};