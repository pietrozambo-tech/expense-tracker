import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { CURRENCIES, MAIN_CURRENCY_CODES } from '../utils/currency';
import { CurrencySearchList } from './CurrencySearchList';
import { t, setLanguage, useLanguage, type Language } from '../i18n';
import { TracklyLogo } from './TracklyLogo';

interface OnboardingProps {
  onComplete: (userName: string, currency: string, language: Language) => void;
  initialName?: string; // pre-fill (e.g. first name from a Google account)
}

const LANGUAGE_OPTIONS: { code: Language; flag: string; label: string }[] = [
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'it', flag: '🇮🇹', label: 'Italiano' },
];

export function Onboarding({ onComplete, initialName = '' }: OnboardingProps) {
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
    <div className="flex flex-col max-w-[430px] mx-auto" style={{ height: '100dvh', backgroundColor: '#F6F5F2' }}>
      {/* Content */}
      <div
        className="flex-1 min-h-0 overflow-y-auto flex flex-col px-6"
        style={{ paddingTop: 'max(32px, env(safe-area-inset-top))' }}
      >
        {/* The brand moment, on the true first screen. The tour used to open
            with a logo slide, which meant a second "Welcome" immediately after
            this one - two greetings for someone who had just typed their name
            here. The mark belongs where the app is first met. */}
        <div className="flex items-center gap-3 mb-5">
          <TracklyLogo size={44} />
          <div>
            <div style={{ color: '#1C1C1E', fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em' }}>
              TracklyLab
            </div>
            <div style={{ color: '#4F74F3', fontSize: 12.5, fontWeight: 600, letterSpacing: '0.02em' }}>
              Your Expense Lens
            </div>
          </div>
        </div>

        <h1 style={{
          color: '#1C1C1E',
          fontSize: '32px',
          fontWeight: '600',
          letterSpacing: '-0.7px',
          marginBottom: '8px'
        }}>
          {t('onboarding.title')}
        </h1>
        <p style={{ color: '#8E8E93', fontSize: '15px', lineHeight: '1.4' }}>
          {t('onboarding.subtitle')}
        </p>

        {/* Language - first, so the rest of the setup already speaks it */}
        <div className="mt-8">
          <label
            className="block mb-2"
            style={{ color: '#1C1C1E', fontSize: '15px', fontWeight: '600' }}
          >
            {t('onboarding.language')}
          </label>
          <div className="grid grid-cols-2 gap-3">
            {LANGUAGE_OPTIONS.map((option) => {
              const isSelected = language === option.code;
              return (
                <button
                  key={option.code}
                  onClick={() => setLanguage(option.code)}
                  className="flex items-center gap-3 p-4 rounded-xl text-left outline-none transition-all"
                  style={{
                    backgroundColor: isSelected ? '#F2F1ED' : '#FFFFFF',
                    border: isSelected ? '2px solid #4F74F3' : '1px solid #E5E5EA',
                    boxShadow: isSelected
                      ? '0 0 0 3px rgba(0, 122, 255, 0.08)'
                      : '0 1px 3px rgba(0, 0, 0, 0.04)'
                  }}
                >
                  <span style={{ fontSize: '22px' }}>{option.flag}</span>
                  <span
                    style={{
                      color: isSelected ? '#4F74F3' : '#1C1C1E',
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
        <div className="mt-8">
          <label
            className="block mb-2"
            style={{ color: '#1C1C1E', fontSize: '15px', fontWeight: '600' }}
          >
            {t('onboarding.name')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('onboarding.namePlaceholder')}
            autoComplete="given-name"
            className="w-full px-4 py-4 rounded-xl text-base outline-none transition-all"
            style={{
              backgroundColor: '#FFFFFF',
              color: '#1C1C1E',
              border: '1px solid #E5E5EA',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
            }}
            onFocus={(e) => {
              e.target.style.border = '1.5px solid #4F74F3';
              e.target.style.boxShadow = '0 0 0 3px rgba(0, 122, 255, 0.08)';
            }}
            onBlur={(e) => {
              e.target.style.border = '1px solid #E5E5EA';
              e.target.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.04)';
            }}
          />
        </div>

        {/* Currency */}
        <div className="mt-8">
          <label
            className="block mb-2"
            style={{ color: '#1C1C1E', fontSize: '15px', fontWeight: '600' }}
          >
            {t('onboarding.currency')}
          </label>
          <div className="grid grid-cols-2 gap-3">
            {MAIN_CURRENCY_CODES.map((code) => CURRENCIES[code]).map((option) => {
              const isSelected = currency === option.code;
              return (
                <button
                  key={option.code}
                  onClick={() => setCurrency(option.code)}
                  className="flex items-center gap-3 p-4 rounded-xl text-left outline-none transition-all"
                  style={{
                    backgroundColor: isSelected ? '#F2F1ED' : '#FFFFFF',
                    border: isSelected ? '2px solid #4F74F3' : '1px solid #E5E5EA',
                    boxShadow: isSelected
                      ? '0 0 0 3px rgba(0, 122, 255, 0.08)'
                      : '0 1px 3px rgba(0, 0, 0, 0.04)'
                  }}
                >
                  <span style={{ fontSize: '22px' }}>{option.flag}</span>
                  <div className="flex flex-col">
                    <span
                      style={{
                        color: isSelected ? '#4F74F3' : '#1C1C1E',
                        fontSize: '15px',
                        fontWeight: '600'
                      }}
                    >
                      {option.code}
                    </span>
                    <span style={{ color: '#8E8E93', fontSize: '12px' }}>{option.name}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Every other currency, searchable */}
          <button
            onClick={() => setShowAllCurrencies(true)}
            className="w-full flex items-center gap-3 p-4 mt-3 rounded-xl text-left outline-none transition-all"
            style={{
              backgroundColor: nonMainPick ? '#F2F1ED' : '#FFFFFF',
              border: nonMainPick ? '2px solid #4F74F3' : '1px solid #E5E5EA',
              boxShadow: nonMainPick
                ? '0 0 0 3px rgba(0, 122, 255, 0.08)'
                : '0 1px 3px rgba(0, 0, 0, 0.04)'
            }}
          >
            {nonMainPick ? (
              <>
                <span style={{ fontSize: '22px' }}>{nonMainPick.flag}</span>
                <div className="flex flex-col flex-1">
                  <span style={{ color: '#4F74F3', fontSize: '15px', fontWeight: '600' }}>{nonMainPick.code}</span>
                  <span style={{ color: '#8E8E93', fontSize: '12px' }}>{nonMainPick.name}</span>
                </div>
              </>
            ) : (
              <span className="flex-1" style={{ color: '#1C1C1E', fontSize: '15px', fontWeight: '600' }}>{t('onboarding.otherCurrencies')}</span>
            )}
            <ChevronRight className="w-5 h-5" style={{ color: '#C7C7CC' }} />
          </button>
        </div>
        <div className="h-6 flex-shrink-0" />
      </div>

      {/* Full currency list - tall sheet so results clear the keyboard */}
      {showAllCurrencies && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
          onClick={() => setShowAllCurrencies(false)}
        >
          <div
            className="w-full max-w-[430px] rounded-t-3xl p-5 pb-8 flex flex-col"
            style={{ backgroundColor: '#F6F5F2', height: '88vh' }}
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
        className="px-6 pt-5 flex-shrink-0"
        style={{ paddingBottom: 'max(24px, calc(env(safe-area-inset-bottom) + 12px))' }}
      >
        <button
          onClick={handleGetStarted}
          disabled={!name.trim()}
          className="w-full py-4 rounded-xl font-medium text-base transition-all active:scale-[0.98]"
          style={{
            backgroundColor: !name.trim() ? '#E5E5EA' : '#4F74F3',
            color: '#FFFFFF',
            boxShadow: !name.trim() ? 'none' : '0 2px 8px rgba(0, 122, 255, 0.25)',
            cursor: !name.trim() ? 'not-allowed' : 'pointer'
          }}
        >
          {t('onboarding.cta')}
        </button>
      </div>
    </div>
  );
}
