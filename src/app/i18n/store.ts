// The app's language, as a tiny external store.
//
// Deliberately not a React context: the current language is read by plain
// modules too - currency formatting, category seeding, the catch-all bucket -
// and threading a context value through every call site would turn each of
// them into a component concern. React components subscribe through
// useLanguage() (see ./react.ts); everything else calls getLanguage() and gets
// re-run anyway, because a language change remounts the app content wholesale
// (key={language} in App), which is what flushes every memo and cached string
// derived under the old language.
//
// This file must stay import-light: the node test harnesses bundle app modules
// (utils/currency, lib/dayOfWeek) that reach here, so no React and no JSX.

export type Language = 'en' | 'it';

let current: Language = 'en';
const listeners = new Set<() => void>();

export function getLanguage(): Language {
  return current;
}

export function setLanguage(lang: Language) {
  if (lang === current) return;
  current = lang;
  listeners.forEach((fn) => fn());
}

export function subscribeLanguage(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// What a device that has never chosen suggests. Only a suggestion: the
// onboarding step pre-selects it, the user confirms. An ONBOARDED user with no
// stored language is always English - that rule is what keeps existing
// accounts from flipping to Italian just because the phone is.
export function deviceLanguageGuess(): Language {
  try {
    const tags = [navigator.language, ...(navigator.languages ?? [])];
    return tags.some((l) => /^it\b/i.test(l ?? '')) ? 'it' : 'en';
  } catch {
    return 'en';
  }
}

// ── Locale data ─────────────────────────────────────────────────────────────
//
// Hand-written rather than Intl-derived so the English output stays
// byte-identical to what the app has always rendered ('Jan', 'Monday'), and so
// the Italian forms are the capitalised UI-label variants rather than the
// lowercase mid-sentence ones Intl returns ("gennaio").

const MONTHS_SHORT: Record<Language, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  it: ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'],
};

const MONTHS_FULL: Record<Language, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  it: ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'],
};

// Indexed by Date.getDay(): 0 = Sunday.
const DAYS_FULL: Record<Language, string[]> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  it: ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'],
};

const DAYS_SHORT: Record<Language, string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  it: ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'],
};

export const monthsShort = () => MONTHS_SHORT[current];
export const monthsFull = () => MONTHS_FULL[current];
export const daysFull = () => DAYS_FULL[current];
export const daysShort = () => DAYS_SHORT[current];

// ── Number and date locales ─────────────────────────────────────────────────

/** BCP 47 tag for toLocaleString / toLocaleDateString. */
export function numberLocale(): string {
  return current === 'it' ? 'it-IT' : 'en-US';
}
export const dateLocale = numberLocale;

// Intl's Italian (CLDR) only groups from five digits up - "1736" but
// "28.000" - which is typographically defensible and reads like a bug in a
// money app where the two sit in the same column. 'always' forces the
// separator from four digits in every language; English output is unchanged
// (en-US already grouped four digits), and engines too old for the string
// value coerce it to plain truthy grouping, which is the same thing.
export const GROUPED: Intl.NumberFormatOptions = { useGrouping: 'always' as unknown as boolean };

/** '.' in English, ',' in Italian - what AmountText renders between units and cents. */
export function decimalSeparator(): string {
  return current === 'it' ? ',' : '.';
}

// Intl formatters, built once per (locale, options) pair and kept.
//
// toLocaleString and toLocaleDateString construct a fresh Intl formatter on
// every call, and construction is the expensive half - a good fraction of a
// millisecond each. Nobody notices on a heading; the Activity list calls
// these once or twice PER ROW. Profiling a 3000-row ledger put the amount
// text at 43ms and the day-group dates at 27ms of formatter construction per
// repaint - together the largest app-owned slice of the tab-switch and
// filter-change stalls. Formatting through a kept instance is the same
// output at a small multiple of the cost of the format call alone.
//
// The cache cannot grow past a handful of entries: locales come from the two
// the app speaks, and options objects from the few literal shapes in the
// formatting helpers.
const NUMBER_FORMATS = new Map<string, Intl.NumberFormat>();
export function cachedNumberFormat(locale: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options ?? 0)}`;
  let f = NUMBER_FORMATS.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, options);
    NUMBER_FORMATS.set(key, f);
  }
  return f;
}

const DATE_FORMATS = new Map<string, Intl.DateTimeFormat>();
export function cachedDateFormat(locale: string, options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options ?? 0)}`;
  let f = DATE_FORMATS.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    DATE_FORMATS.set(key, f);
  }
  return f;
}

/** ',' in English, '.' in Italian. */
export function groupSeparator(): string {
  return current === 'it' ? '.' : ',';
}

// ── Recurrence display ──────────────────────────────────────────────────────
//
// Recurrence rules are STORED in canonical English ('Every month', ...) - they
// are keys the engine compares, synced across devices, present in years of
// data. Only the rendering translates. A rule this map doesn't know (imported
// data, future vocabulary) falls through untranslated, which is the honest
// fallback.

const RECURRENCE_IT: Record<string, string> = {
  'Never repeat': 'Non ripetere',
  'Every day': 'Ogni giorno',
  'Every work day': 'Ogni giorno lavorativo',
  'Every week': 'Ogni settimana',
  'Every second week': 'Ogni due settimane',
  'First day of the month': 'Primo del mese',
  'Every month': 'Ogni mese',
  'Every year': 'Ogni anno',
};

export function translateRecurrence(rule: string): string {
  if (current === 'en') return rule;
  return RECURRENCE_IT[rule] ?? rule;
}
