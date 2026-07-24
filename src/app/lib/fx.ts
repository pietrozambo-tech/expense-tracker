// Foreign-exchange rates.
//
// Strategy (see the product decision): keep a table of rates expressed as
// "units of currency per 1 EUR" (EUR is the base). We ship approximate SEED
// rates so conversions are correct offline and on first run, then refresh them
// once a day from a free, keyless source (open.er-api.com, ECB-derived daily).
// Conversions are synchronous and read the in-memory table, so they never
// block rendering or require the network.

const CACHE_KEY = 'expense-tracker.v1.fxRates';
const API_URL = 'https://open.er-api.com/v6/latest/EUR';
const MAX_AGE_MS = 12 * 60 * 60 * 1000; // refresh if older than 12h

// Approximate EUR-based seed rates (units per 1 EUR). Used until a live refresh
// succeeds; keeps every currency sensible offline instead of falling back to 1:1.
const SEED_RATES: Record<string, number> = {
  EUR: 1, USD: 1.08, GBP: 0.85, AED: 3.97, JPY: 170, CHF: 0.96, CAD: 1.47,
  AUD: 1.63, NZD: 1.78, CNY: 7.8, HKD: 8.45, SGD: 1.46, INR: 90, KRW: 1450,
  THB: 39, MYR: 5.1, IDR: 17000, PHP: 62, VND: 27000, SEK: 11.4, NOK: 11.7,
  DKK: 7.46, ISK: 150, PLN: 4.3, CZK: 25, HUF: 395, RON: 4.97, TRY: 35,
  RUB: 98, BRL: 5.9, MXN: 20, ARS: 970, CLP: 1030, COP: 4300, ZAR: 20,
  SAR: 4.05, QAR: 3.93, ILS: 4.0, EGP: 52, MAD: 10.8,
};

// Live, mutable table (EUR-based). Starts on the seed values.
let rates: Record<string, number> = { ...SEED_RATES };
let fetchedAt = 0;

interface CachedRates {
  base: 'EUR';
  rates: Record<string, number>;
  fetchedAt: number;
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as CachedRates;
    if (parsed && parsed.base === 'EUR' && parsed.rates && parsed.rates.EUR === 1) {
      rates = { ...SEED_RATES, ...parsed.rates };
      fetchedAt = parsed.fetchedAt || 0;
    }
  } catch {
    /* ignore corrupt cache */
  }
}

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ base: 'EUR', rates, fetchedAt } satisfies CachedRates));
  } catch {
    /* ignore */
  }
}

// Fetch fresh EUR-based rates. Best-effort: on any failure we keep what we have.
export async function refreshRates(): Promise<void> {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) return;
    const data = await res.json();
    if (data?.result !== 'success' || !data.rates || typeof data.rates.EUR !== 'number') return;
    // Keep only sane positive numbers; merge over the seed so we never lose codes.
    const next: Record<string, number> = { ...SEED_RATES };
    for (const [code, value] of Object.entries(data.rates)) {
      if (typeof value === 'number' && isFinite(value) && value > 0) next[code] = value;
    }
    rates = next;
    fetchedAt = (data.time_last_update_unix ? data.time_last_update_unix * 1000 : Date.now());
    saveCache();
  } catch {
    /* offline or blocked — keep cached/seed rates */
  }
}

// Load cache and refresh in the background if stale. Call once at startup.
export function initFx(): void {
  loadCache();
  const stale = Date.now() - fetchedAt > MAX_AGE_MS;
  if (stale && typeof navigator !== 'undefined' && navigator.onLine !== false) {
    // Fire and forget; conversions work off the current table meanwhile.
    void refreshRates();
  }
}

// Units of `code` per 1 EUR (falls back to 1 only for a truly unknown code).
export function getRate(code: string): number {
  const r = rates[code];
  return typeof r === 'number' && r > 0 ? r : 1;
}

// Convert an amount between any two supported currencies via the EUR base.
export function convert(amount: number, from: string, to: string): number {
  if (from === to) return amount;
  const eur = amount / getRate(from); // to EUR
  return eur * getRate(to); // to target
}
