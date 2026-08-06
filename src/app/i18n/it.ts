import type { en } from './en';

// Italian catalogue. Typed against the English one, so a key added there
// without a translation here fails the typecheck instead of shipping English
// into the Italian app.

export const it: Record<keyof typeof en, string> = {
  // Tab bar. 'Dashboard' and 'Trend' are ordinary loanwords in Italian app UI;
  // translating them ('Cruscotto', 'Tendenza') would read stranger, not
  // clearer.
  'tab.dashboard': 'Dashboard',
  'tab.activity': 'Attività',
  'tab.trend': 'Trend',
  'tab.settings': 'Impostazioni',

  // Onboarding
  'onboarding.title': 'Benvenuto 👋',
  'onboarding.subtitle': 'Registra le tue spese in pochi secondi. Prepariamo tutto.',
  'onboarding.language': 'Lingua',
  'onboarding.name': 'Come ti chiami?',
  'onboarding.namePlaceholder': 'Il tuo nome',
  'onboarding.currency': 'Valuta principale',
  'onboarding.otherCurrencies': 'Altre',
  'onboarding.selectCurrency': 'Scegli la valuta',
  'onboarding.cta': 'Inizia',

  // Settings
  'settings.language': 'Lingua',

  // Dates
  'date.today': 'Oggi',
  'date.yesterday': 'Ieri',
};
