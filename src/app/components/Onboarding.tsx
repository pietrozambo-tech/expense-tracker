import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { CURRENCIES, MAIN_CURRENCY_CODES } from '../utils/currency';
import { CurrencySearchList } from './CurrencySearchList';
import { t, setLanguage, useLanguage, type Language } from '../i18n';
import { TracklyLogo } from './TracklyLogo';

interface OnboardingProps {
  onComplete: (userName: string, currency: string, language: Language) => void;
  initialName?: string; // pre-fill (e.g. first name from a Google account)
  /** Leave guest mode and return to sign-in. Absent when already signed in. */
  onSignIn?: () => void;
}

const LANGUAGE_OPTIONS: { code: Language; flag: string; label: string }[] = [
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'it', flag: '🇮🇹', label: 'Italiano' },
];

// One border width whether a card is picked or not: swapping 1px for 2px on
// selection resized the card's content box, so every tap nudged the row and
// the grid twitched. The selected state is a colour and a ring instead.
const pickStyle = (selected: boolean): React.CSSProperties => ({
  backgroundColor: selected ? 'var(--bg-inset)' : 'var(--bg-card)',
  border: `1px solid ${selected ? '#4F74F3' : 'var(--line)'}`,
  boxShadow: selected ? '0 0 0 3px rgba(0, 122, 255, 0.10)' : '0 1px 3px rgba(0, 0, 0, 0.04)',
  minHeight: 52,
});

export function Onboarding({ onComplete, initialName = '', onSignIn }: OnboardingProps) {
  const [name, setName] = useState(initialName);
  const [currency, setCurrency] = useState('EUR');
  const [showAllCurrencies, setShowAllCurrencies] = useState(false);
  // Pre-selected from the device language (set in main.tsx for fresh installs);
  // tapping a flag flips the whole screen immediately, which doubles as the
  // preview of what the choice means.
  const language = useLanguage();
  // A non-main pick (e.g. CHF) is surfaced on the "Others" card itself
  const nonMainPick = MAIN_CURRENCY_CODES.includes(currency) ? null : CURRENCIES[currency];

  const handleGetStarted = () => {
    onComplete(name.trim(), currency, language);
  };

  return (
    // Fixed viewport height with the form scrolling inside it, not
    // min-h-screen: the language step made this screen tall enough that on a
    // shorter phone the CTA fell below the fold with nothing to say so.
    <div className="flex flex-col max-w-[430px] mx-auto" style={{ height: '100dvh', backgroundColor: 'var(--bg-page)' }}>
      {/* Content */}
      <div
        className="flex-1 min-h-0 overflow-y-auto flex flex-col px-5"
        style={{ paddingTop: 'max(28px, env(safe-area-inset-top))' }}
      >
        {/* Top-aligned, deliberately. Centring this block looked balanced in
            a screenshot and wrong on a phone: the title is the first thing to
            read, and floating it into the middle of the screen with dead
            space above reads as a rendering accident. Space left over goes
            below, where a fixed CTA already lives. */}
        <div className="w-full">
        {/* The brand moment, on the true first screen. The tour used to open
            with a logo slide, which meant a second "Welcome" immediately after
            this one - two greetings for someone who had just typed their name
            here. The mark belongs where the app is first met. */}
        <div className="flex items-center gap-2.5 mb-4">
          <TracklyLogo size={40} />
          <div>
            <div style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              TracklyLab
            </div>
            <div style={{ color: 'var(--accent-ink)', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.02em' }}>
              Your Expense Lens
            </div>
          </div>
        </div>

        <h1 style={{
          color: 'var(--ink)',
          fontSize: '28px',
          fontWeight: '600',
          letterSpacing: '-0.5px',
          marginBottom: '6px',
          lineHeight: 1.15,
        }}>
          {t('onboarding.title')}
        </h1>
        <p style={{ color: 'var(--ink-2)', fontSize: '14.5px', lineHeight: '1.4' }}>
          {t('onboarding.subtitle')}
        </p>

        {/* Language - first, so the rest of the setup already speaks it */}
        <div className="mt-6">
          <label
            className="block mb-1.5"
            style={{ color: 'var(--ink-2)', fontSize: 12.5, fontWeight: 600, letterSpacing: 0.2 }}
          >
            {t('onboarding.language')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {LANGUAGE_OPTIONS.map((option) => {
              const isSelected = language === option.code;
              return (
                <button
                  key={option.code}
                  onClick={() => setLanguage(option.code)}
                  className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-left outline-none transition-all"
                  style={pickStyle(isSelected)}
                >
                  <span style={{ fontSize: '20px' }}>{option.flag}</span>
                  <span
                    style={{
                      color: isSelected ? '#4F74F3' : 'var(--ink)',
                      fontSize: '15px',
                      fontWeight: '600'
                    }}
                  >
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Name */}
        <div className="mt-6">
          <label
            className="block mb-1.5"
            style={{ color: 'var(--ink-2)', fontSize: 12.5, fontWeight: 600, letterSpacing: 0.2 }}
          >
            {t('onboarding.name')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('onboarding.namePlaceholder')}
            autoComplete="given-name"
            className="w-full px-3.5 py-3.5 rounded-xl text-base outline-none transition-all"
            style={{
              backgroundColor: 'var(--bg-card)',
              color: 'var(--ink)',
              border: '1px solid var(--line)',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
            }}
            onFocus={(e) => {
              e.target.style.border = '1.5px solid #4F74F3';
              e.target.style.boxShadow = '0 0 0 3px rgba(0, 122, 255, 0.08)';
            }}
            onBlur={(e) => {
              e.target.style.border = '1px solid var(--line)';
              e.target.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.04)';
            }}
          />
        </div>

        {/* Currency */}
        <div className="mt-6">
          <label
            className="block mb-1.5"
            style={{ color: 'var(--ink-2)', fontSize: 12.5, fontWeight: 600, letterSpacing: 0.2 }}
          >
            {t('onboarding.currency')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {MAIN_CURRENCY_CODES.map((code) => CURRENCIES[code]).map((option) => {
              const isSelected = currency === option.code;
              return (
                <button
                  key={option.code}
                  onClick={() => setCurrency(option.code)}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-left outline-none transition-all"
                  style={pickStyle(isSelected)}
                >
                  <span style={{ fontSize: '20px' }}>{option.flag}</span>
                  <div className="flex flex-col min-w-0">
                    <span
                      style={{
                        color: isSelected ? '#4F74F3' : 'var(--ink)',
                        fontSize: '15px',
                        fontWeight: '600',
                        lineHeight: 1.25,
                      }}
                    >
                      {option.code}
                    </span>
                    <span className="truncate" style={{ color: 'var(--ink-2)', fontSize: '12px', lineHeight: 1.3 }}>
                      {option.name}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Every other currency, searchable */}
          <button
            onClick={() => setShowAllCurrencies(true)}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 mt-2.5 rounded-xl text-left outline-none transition-all"
            style={pickStyle(!!nonMainPick)}
          >
            {nonMainPick ? (
              <>
                <span style={{ fontSize: '20px' }}>{nonMainPick.flag}</span>
                <div className="flex flex-col flex-1 min-w-0">
                  <span style={{ color: 'var(--accent-ink)', fontSize: '15px', fontWeight: '600', lineHeight: 1.25 }}>{nonMainPick.code}</span>
                  <span className="truncate" style={{ color: 'var(--ink-2)', fontSize: '12px', lineHeight: 1.3 }}>{nonMainPick.name}</span>
                </div>
              </>
            ) : (
              <span className="flex-1 py-1" style={{ color: 'var(--ink)', fontSize: '15px', fontWeight: '600' }}>{t('onboarding.otherCurrencies')}</span>
            )}
            <ChevronRight className="w-4.5 h-4.5" style={{ color: 'var(--ghost)' }} />
          </button>
        </div>
        </div>
        <div className="h-4 flex-shrink-0" />
      </div>

      {/* Full currency list - tall sheet so results clear the keyboard */}
      {showAllCurrencies && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
          onClick={() => setShowAllCurrencies(false)}
        >
          <div
            className="w-full max-w-[430px] rounded-t-3xl p-5 pb-8 flex flex-col"
            style={{ backgroundColor: 'var(--bg-page)', height: '88vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-neutral-900 mb-3">{t('onboarding.selectCurrency')}</h3>
            <CurrencySearchList
              selected={currency}
              onSelect={(code) => {
                setCurrency(code);
                setShowAllCurrencies(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Fixed Bottom CTA */}
      {/* The CTA keeps clear of the home indicator on a modern iPhone, where
          a flat pb-8 put it right on the bar. */}
      <div
        className="px-5 pt-3 flex-shrink-0"
        style={{ paddingBottom: 'max(24px, calc(env(safe-area-inset-bottom) + 12px))' }}
      >
        <button
          onClick={handleGetStarted}
          disabled={!name.trim()}
          className="w-full py-3.5 rounded-xl font-medium text-base transition-all active:scale-[0.98]"
          style={{
            backgroundColor: !name.trim() ? 'var(--line)' : '#4F74F3',
            color: '#FFFFFF',
            boxShadow: !name.trim() ? 'none' : '0 2px 8px rgba(0, 122, 255, 0.25)',
            cursor: !name.trim() ? 'not-allowed' : 'pointer'
          }}
        >
          {t('onboarding.cta')}
        </button>
        {/* The way back. A device in guest mode never sees the sign-in screen
            again - the gate is "not signed in AND not a guest" - so someone
            whose local state said guest, with an account holding all their
            data, had no route to it from here. This is that route, and it is
            deliberately on the first screen rather than buried in Settings,
            which is on the other side of an onboarding they should not have
            to complete first. */}
        {onSignIn && (
          <button
            data-onboarding-signin
            onClick={onSignIn}
            className="w-full mt-3 py-2 text-center"
            style={{ color: 'var(--accent-ink)', fontSize: 14, fontWeight: 600 }}
          >
            {t('onboarding.haveAccount')}
          </button>
        )}
      </div>
    </div>
  );
}
