import { useState } from 'react';
import { ChevronDown, Sparkles, TrendingUp } from 'lucide-react';
import { CURRENCIES } from '../utils/currency';

interface OnboardingProps {
  onComplete: (userName: string, currency: string, useSampleData: boolean) => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [startOption, setStartOption] = useState<'fresh' | 'sample' | null>(null);

  const handleGetStarted = () => {
    onComplete('Pietro', 'EUR', startOption === 'sample');
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5F5F7' }}>
      {/* Content */}
      <div className="flex-1 flex flex-col px-6 pt-20">
        <h1 style={{ 
          color: '#1C1C1E', 
          fontSize: '32px', 
          fontWeight: '600', 
          letterSpacing: '-0.7px',
          marginBottom: '8px'
        }}>
          How would you like to start?
        </h1>
        
        <div className="mt-12 space-y-4">
          {/* Sample Data Option */}
          <button
            onClick={() => setStartOption('sample')}
            className="w-full p-5 rounded-xl text-left outline-none transition-all"
            style={{
              backgroundColor: startOption === 'sample' ? '#F2F2F7' : '#FFFFFF',
              border: startOption === 'sample' ? '2px solid #007AFF' : '1px solid #E5E5EA',
              boxShadow: startOption === 'sample' 
                ? '0 0 0 3px rgba(0, 122, 255, 0.08)' 
                : '0 1px 3px rgba(0, 0, 0, 0.04)'
            }}
          >
            <div className="flex items-start gap-3">
              <div 
                className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: startOption === 'sample' ? '#E3F2FF' : '#F2F2F7'
                }}
              >
                <TrendingUp 
                  size={20} 
                  style={{ 
                    color: startOption === 'sample' ? '#007AFF' : '#8E8E93'
                  }} 
                />
              </div>
              <div className="flex-1">
                <div 
                  className="font-semibold mb-1"
                  style={{ 
                    color: '#1C1C1E',
                    fontSize: '17px'
                  }}
                >
                  Use sample data
                </div>
                <div 
                  style={{ 
                    color: '#8E8E93',
                    fontSize: '14px',
                    lineHeight: '1.4'
                  }}
                >
                  Explore the app with example transactions and charts
                </div>
              </div>
            </div>
          </button>

          {/* Fresh Start Option */}
          <button
            onClick={() => setStartOption('fresh')}
            className="w-full p-5 rounded-xl text-left outline-none transition-all"
            style={{
              backgroundColor: startOption === 'fresh' ? '#F2F2F7' : '#FFFFFF',
              border: startOption === 'fresh' ? '2px solid #007AFF' : '1px solid #E5E5EA',
              boxShadow: startOption === 'fresh' 
                ? '0 0 0 3px rgba(0, 122, 255, 0.08)' 
                : '0 1px 3px rgba(0, 0, 0, 0.04)'
            }}
          >
            <div className="flex items-start gap-3">
              <div 
                className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: startOption === 'fresh' ? '#E3F2FF' : '#F2F2F7'
                }}
              >
                <Sparkles 
                  size={20} 
                  style={{ 
                    color: startOption === 'fresh' ? '#007AFF' : '#8E8E93'
                  }} 
                />
              </div>
              <div className="flex-1">
                <div 
                  className="font-semibold mb-1"
                  style={{ 
                    color: '#1C1C1E',
                    fontSize: '17px'
                  }}
                >
                  Fresh & clean
                </div>
                <div 
                  style={{ 
                    color: '#8E8E93',
                    fontSize: '14px',
                    lineHeight: '1.4'
                  }}
                >
                  Start with an empty app and add your own transactions
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Fixed Bottom CTA */}
      <div className="px-6 pb-8 pt-6">
        <button
          onClick={handleGetStarted}
          disabled={startOption === null}
          className="w-full py-4 rounded-xl font-medium text-base transition-all active:scale-[0.98]"
          style={{
            backgroundColor: startOption === null ? '#E5E5EA' : '#007AFF',
            color: '#FFFFFF',
            boxShadow: startOption === null ? 'none' : '0 2px 8px rgba(0, 122, 255, 0.25)',
            cursor: startOption === null ? 'not-allowed' : 'pointer'
          }}
        >
          Get started
        </button>
      </div>
    </div>
  );
}