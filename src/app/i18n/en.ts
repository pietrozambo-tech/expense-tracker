// The canonical string catalogue. Keys are added here as screens are
// converted; it.ts must cover every key (its type enforces that), so a new
// string cannot ship half-translated by accident.
//
// Placeholders are {name}-style and replaced by t(); keep them verbatim in
// every translation.

export const en = {
  // Tab bar
  'tab.dashboard': 'Dashboard',
  'tab.activity': 'Activity',
  'tab.trend': 'Trend',
  'tab.settings': 'Settings',

  // Onboarding
  'onboarding.title': 'Welcome 👋',
  'onboarding.subtitle': "Track your expenses in seconds. Let's set things up.",
  'onboarding.language': 'Language',
  'onboarding.name': "What's your name?",
  'onboarding.namePlaceholder': 'Your name',
  'onboarding.currency': 'Main currency',
  'onboarding.otherCurrencies': 'Others',
  'onboarding.selectCurrency': 'Select currency',
  'onboarding.cta': 'Get started',

  // Settings
  'settings.language': 'Language',

  // Dates
  'date.today': 'Today',
  'date.yesterday': 'Yesterday',
} as const;
