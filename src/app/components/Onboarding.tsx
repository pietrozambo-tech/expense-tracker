import { useState } from 'react';
import { CURRENCIES } from '../utils/currency';

interface OnboardingProps {
  onComplete: (userName: string, currency: string) => void;
  initialName?: string; // pre-fill (e.g. first name from a Google account)
}

export function Onboarding({ onComplete, initialName = '' }: OnboardingProps) {
  const [name, setName] = useState(initialName);
  const [currency, setCurrency] = useState('EUR');

  const handleGetStarted = () => {
    onComplete(name.trim(), currency);
  };

  return (
    <div className="min-h-screen flex flex-col max-w-[430px] mx-auto" style={{ backgroundColor: '#F5F5F7' }}>
      {/* Content */}
      <div className="flex-1 flex flex-col px-6 pt-20">
        <h1 style={{
          color: '#1C1C1E',
          fontSize: '32px',
          fontWeight: '600',
          letterSpacing: '-0.7px',
          marginBottom: '8px'
        }}>
          Welcome 👋
        </h1>
        <p style={{ color: '#8E8E93', fontSize: '15px', lineHeight: '1.4' }}>
          Track your expenses in seconds. Let's set things up.
        </p>

        {/* Name */}
        <div className="mt-10">
          <label
            className="block mb-2"
            style={{ color: '#1C1C1E', fontSize: '15px', fontWeight: '600' }}
          >
            What's your name?
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="given-name"
            className="w-full px-4 py-4 rounded-xl text-base outline-none transition-all"
            style={{
              backgroundColor: '#FFFFFF',
              color: '#1C1C1E',
              border: '1px solid #E5E5EA',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
            }}
            onFocus={(e) => {
              e.target.style.border = '1.5px solid #007AFF';
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
            Main currency
          </label>
          <div className="grid grid-cols-2 gap-3">
            {Object.values(CURRENCIES).map((option) => {
              const isSelected = currency === option.code;
              return (
                <button
                  key={option.code}
                  onClick={() => setCurrency(option.code)}
                  className="flex items-center gap-3 p-4 rounded-xl text-left outline-none transition-all"
                  style={{
                    backgroundColor: isSelected ? '#F2F2F7' : '#FFFFFF',
                    border: isSelected ? '2px solid #007AFF' : '1px solid #E5E5EA',
                    boxShadow: isSelected
                      ? '0 0 0 3px rgba(0, 122, 255, 0.08)'
                      : '0 1px 3px rgba(0, 0, 0, 0.04)'
                  }}
                >
                  <span style={{ fontSize: '22px' }}>{option.flag}</span>
                  <div className="flex flex-col">
                    <span
                      style={{
                        color: isSelected ? '#007AFF' : '#1C1C1E',
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
        </div>
      </div>

      {/* Fixed Bottom CTA */}
      <div className="px-6 pb-8 pt-6">
        <button
          onClick={handleGetStarted}
          disabled={!name.trim()}
          className="w-full py-4 rounded-xl font-medium text-base transition-all active:scale-[0.98]"
          style={{
            backgroundColor: !name.trim() ? '#E5E5EA' : '#007AFF',
            color: '#FFFFFF',
            boxShadow: !name.trim() ? 'none' : '0 2px 8px rgba(0, 122, 255, 0.25)',
            cursor: !name.trim() ? 'not-allowed' : 'pointer'
          }}
        >
          Get started
        </button>
      </div>
    </div>
  );
}
