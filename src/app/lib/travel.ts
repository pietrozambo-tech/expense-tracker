import { CURRENCY_DEFS } from './currencyData';
import { countryOfZone } from './zones';

// Noticing that you are somewhere else, and offering the local currency for
// one entry.
//
// The whole design rests on one distinction: this compares where you are
// against where you USUALLY are, never against your home currency. Those are
// different facts and conflating them is what makes a feature like this a nag
// - somebody living in Dubai who keeps their books in euros would be told
// "travelling? use AED" every day of their life.
//
// Nothing here touches the network, asks a permission, or leaves the device.
// The signal is the timezone the phone already knows, which also makes it
// work in flight mode and immune to a VPN.

/** How many distinct days in a country before it counts as somewhere you live. */
const USUAL_DAYS = 8;
/** ...and across how many calendar months. A fortnight's holiday clears the
 *  day count on its own; spanning two months is what separates a long trip
 *  from an address. */
const USUAL_MONTHS = 2;
/** Consecutive dismissals in one country before the nudge gives up there.
 *  The fast path for an actual move, where the slow one would take weeks. */
const MAX_DISMISSALS = 3;
/** Days kept per country. Enough to satisfy the tests above many times over;
 *  a rolling window rather than a life history. */
const DAY_CAP = 60;

/** Somewhere this device has been, and what the nudge has learnt there. */
export interface CountryVisit {
  /** ISO 3166-1 alpha-2. */
  cc: string;
  /** Distinct YYYY-MM-DD seen in this country, oldest first. */
  days: string[];
  /** Was the flag that marked the first country ever seen as home, for good.
   *  Retired: see homeCountry() for why a single observation must not be
   *  permanent. Still declared so histories written before the change parse. */
  home?: boolean;
  /** Consecutive dismissals here. Cleared the moment one is accepted. */
  dismissed?: number;
}

/**
 * Country to currency.
 *
 * Most of it is already in the app: every row of CURRENCY_DEFS carries a flag
 * emoji, and a flag emoji IS its ISO country code - two regional-indicator
 * letters. So the map is derived from the currency list rather than being a
 * second list to keep in step with it.
 *
 * What the flags cannot say is which OTHER countries use a currency, because
 * a row has one flag: the euro wears 🇪🇺 and says nothing about Italy. That
 * gap is the supplementary table below, and it is the only part typed by hand.
 */
const EXTRA_COUNTRIES: Record<string, string> = {
  // The eurozone, plus the states that use the euro by agreement or unilaterally.
  AT: 'EUR', BE: 'EUR', HR: 'EUR', CY: 'EUR', EE: 'EUR', FI: 'EUR', FR: 'EUR',
  DE: 'EUR', GR: 'EUR', IE: 'EUR', IT: 'EUR', LV: 'EUR', LT: 'EUR', LU: 'EUR',
  MT: 'EUR', NL: 'EUR', PT: 'EUR', SK: 'EUR', SI: 'EUR', ES: 'EUR',
  AD: 'EUR', MC: 'EUR', SM: 'EUR', VA: 'EUR', ME: 'EUR', XK: 'EUR',
  // Dollarised economies.
  EC: 'USD', SV: 'USD', PA: 'USD', TL: 'USD', ZW: 'USD', PR: 'USD', GU: 'USD',
  VI: 'USD', AS: 'USD', MP: 'USD', UM: 'USD', MH: 'USD', FM: 'USD', PW: 'USD',
  BQ: 'USD', TC: 'USD', VG: 'USD',
  // Currency unions and shared issuers.
  BJ: 'XOF', BF: 'XOF', CI: 'XOF', GW: 'XOF', ML: 'XOF', NE: 'XOF', SN: 'XOF', TG: 'XOF',
  CM: 'XAF', CF: 'XAF', TD: 'XAF', CG: 'XAF', GQ: 'XAF', GA: 'XAF',
  AG: 'XCD', DM: 'XCD', GD: 'XCD', KN: 'XCD', LC: 'XCD', VC: 'XCD', AI: 'XCD', MS: 'XCD',
  // Small states and territories on a larger neighbour's money.
  LI: 'CHF', IM: 'GBP', JE: 'GBP', GG: 'GBP', GI: 'GBP',
  FO: 'DKK', GL: 'DKK',
  NR: 'AUD', KI: 'AUD', TV: 'AUD', CX: 'AUD', CC: 'AUD', NF: 'AUD',
  CK: 'NZD', NU: 'NZD', TK: 'NZD', PN: 'NZD',
  EH: 'MAD', BT: 'INR', SS: 'SSP',
};

/** ISO2 -> currency code, built once from the flags plus the table above. */
const COUNTRY_CURRENCY: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const supported = new Set(CURRENCY_DEFS.map((c) => c.code));
  for (const def of CURRENCY_DEFS) {
    // 🇵🇭 is U+1F1F5 U+1F1ED: two regional indicators, 'P' and 'H'.
    const cc = [...def.flag]
      .map((ch) => String.fromCharCode((ch.codePointAt(0) ?? 0) - 0x1f1e6 + 65))
      .join('');
    if (/^[A-Z]{2}$/.test(cc)) map[cc] = def.code;
  }
  for (const [cc, code] of Object.entries(EXTRA_COUNTRIES)) {
    // Never point at a currency the app cannot actually display or convert.
    if (supported.has(code)) map[cc] = code;
  }
  return map;
})();

/**
 * Every country the app can offer a currency for, sorted by ISO code.
 *
 * Exported for the developer screen's picker: the list of places worth
 * pretending to be is exactly the list where the nudge could ever fire, so it
 * is derived from the same map rather than typed out as a shortlist that would
 * quietly disagree with it.
 */
export const KNOWN_COUNTRIES: string[] = Object.keys(COUNTRY_CURRENCY).sort();

/** The currency of a country, or null when we do not know or do not carry it. */
export function currencyOfCountry(cc: string | null): string | null {
  if (!cc) return null;
  return COUNTRY_CURRENCY[cc] ?? null;
}

/** The flag we already hold for a currency, for the chip. */
export function flagOfCurrency(code: string): string {
  return CURRENCY_DEFS.find((c) => c.code === code)?.flag ?? '';
}

/**
 * The flag of a country, built from its ISO code.
 *
 * Not the same thing as the flag of its currency: Spain's currency flies the
 * European flag, and "currently in 🇪🇺 Spain" reads like a mistake. Flag emoji
 * are just the two letters of the code written as regional indicators, so the
 * country always has one even when we carry no currency for it.
 */
export function flagOfCountry(cc: string | null): string {
  if (!cc || !/^[A-Za-z]{2}$/.test(cc)) return '';
  return [...cc.toUpperCase()]
    .map((ch) => String.fromCodePoint(ch.charCodeAt(0) - 65 + 0x1f1e6))
    .join('');
}

/** The country this device is in right now, from its own clock settings. */
export function currentCountry(
  zone: string | null = typeof Intl !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : null,
): string | null {
  return countryOfZone(zone);
}

/**
 * Fold today's country into the history.
 *
 * Pure, and idempotent within a day: called on every launch, it only ever adds
 * a date that is not already there.
 */
export function observeCountry(
  history: CountryVisit[],
  cc: string | null,
  today: string,
): CountryVisit[] {
  if (!cc) return history;
  const known = history.find((v) => v.cc === cc);
  if (!known) return [...history, { cc, days: [today] }];
  if (known.days.includes(today)) return history;
  const days = [...known.days, today].sort().slice(-DAY_CAP);
  return history.map((v) => (v.cc === cc ? { ...v, days } : v));
}

/** How many separate calendar months this country has been seen in. */
const monthsOf = (v: CountryVisit) => new Set(v.days.map((d) => d.slice(0, 7))).size;

/**
 * Where you live, as far as the app can tell.
 *
 * The country seen in the most separate MONTHS, and the first-seen one wins a
 * tie. Months rather than days on purpose: a trip is a block of days squeezed
 * into one or two months, while a home keeps reappearing across them - so
 * counting days would hand the title to a fortnight's holiday the moment it
 * out-numbered a home the app had only been opened in three times.
 *
 * This used to be a flag stamped on the first country ever seen and never
 * revisited, which is how somebody who opened the app for the first time in
 * Manila was told, permanently, that they lived in the Philippines: every
 * other country nudged correctly and that one never would again. One
 * observation is not a life, so the answer is recomputed from the whole
 * history each time instead of being decided once.
 */
export function homeCountry(history: CountryVisit[]): string | null {
  let best: CountryVisit | null = null;
  let bestMonths = -1;
  // In order, with a strict >, so the earliest-seen country keeps a tie.
  for (const v of history) {
    const months = monthsOf(v);
    if (months > bestMonths) {
      best = v;
      bestMonths = months;
    }
  }
  return best?.cc ?? null;
}

/** A second address: not where you mostly are, but not somewhere you went. */
export function isUsual(visit: CountryVisit | undefined): boolean {
  if (!visit) return false;
  return visit.days.length >= USUAL_DAYS && monthsOf(visit) >= USUAL_MONTHS;
}

/** Record that the nudge was turned down here. */
export function dismissCountry(history: CountryVisit[], cc: string | null): CountryVisit[] {
  if (!cc) return history;
  return history.map((v) => (v.cc === cc ? { ...v, dismissed: (v.dismissed ?? 0) + 1 } : v));
}

/** Record that it was taken - which forgives every refusal before it. */
export function acceptCountry(history: CountryVisit[], cc: string | null): CountryVisit[] {
  if (!cc) return history;
  return history.map((v) => (v.cc === cc ? { ...v, dismissed: 0 } : v));
}

export interface TravelSuggestion {
  /** ISO2 of where you are. */
  cc: string;
  /** The currency to offer. */
  currency: string;
  /** Its flag, for the chip. */
  flag: string;
}

/**
 * The local currency worth offering for this entry - or null, which is the
 * normal answer and the one that keeps the screen unchanged for everybody who
 * is at home.
 *
 * Every condition below is a way of staying quiet:
 *
 * - we cannot place the timezone, or carry no currency for that country;
 * - it is where you live, or a second address, by the two tests above;
 * - you have already turned it down here three times running;
 * - the local currency is the one already selected, so there is nothing to
 *   offer - which is also why hopping around the eurozone says nothing.
 *
 * It never applies itself. The caller acts on a tap, and what it changes is
 * the currency of THIS entry, never the account's.
 */
export function travelSuggestion(
  history: CountryVisit[],
  selectedCurrency: string,
  cc: string | null = currentCountry(),
): TravelSuggestion | null {
  if (!cc) return null;
  if (cc === homeCountry(history)) return null;
  const visit = history.find((v) => v.cc === cc);
  if (isUsual(visit)) return null;
  if ((visit?.dismissed ?? 0) >= MAX_DISMISSALS) return null;
  const currency = currencyOfCountry(cc);
  if (!currency || currency === selectedCurrency) return null;
  return { cc, currency, flag: flagOfCurrency(currency) };
}
