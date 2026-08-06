import { useSyncExternalStore } from 'react';
import { en } from './en';
import { it } from './it';
import { getLanguage, subscribeLanguage, type Language } from './store';

export * from './store';

export type MessageKey = keyof typeof en;

const TABLES: Record<Language, Record<MessageKey, string>> = { en, it };

/**
 * Look up a UI string in the current language. {name}-style placeholders are
 * replaced from `params`.
 *
 * Components that call this must re-render when the language changes - either
 * because they sit under the key={language} remount in App (everything in the
 * main app does), or by calling useLanguage() themselves (the pre-app screens:
 * onboarding, sign-in, carousel).
 */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let s = TABLES[getLanguage()][key] ?? en[key];
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      s = s.replace(`{${name}}`, String(value));
    }
  }
  return s;
}

/** The current language, as a subscription - re-renders the caller on change. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribeLanguage, getLanguage);
}
