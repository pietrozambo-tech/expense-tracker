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

/** '.' in English, ',' in Italian - what AmountText renders between units and cents. */
export function decimalSeparator(): string {
  return current === 'it' ? ',' : '.';
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
