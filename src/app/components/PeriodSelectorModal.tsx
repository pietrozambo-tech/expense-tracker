import { X } from 'lucide-react';

interface PeriodSelectorModalProps {
  isOpen: boolean;
  selectedPeriod: string;
  onClose: () => void;
  onSelectPeriod: (period: string) => void;
}

const periods = [
  'This Month',
  'Last Month',
  'Last 3 Months',
  'Last 6 Months',
  'This Year',
  'All Time'
];

export function PeriodSelectorModal({ 
  isOpen, 
  selectedPeriod, 
  onClose, 
  onSelectPeriod 
}: PeriodSelectorModalProps) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-[430px] bg-white rounded-t-3xl shadow-2xl animate-slide-up relative z-10"
        onClick={(e) => e.stopPropagation()}
        style={{ transform: 'translateZ(0)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 relative z-10">
          <h3 className="text-neutral-900 font-semibold">Select Period</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>
        
        {/* Period Options */}
        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          {periods.map((period) => (
            <button
              key={period}
              onClick={() => {
                onSelectPeriod(period);
              }}
              className={`w-full text-left px-4 py-3 rounded-xl mb-2 ${
                selectedPeriod === period
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'hover:bg-neutral-50 text-neutral-700'
              }`}
              style={{ 
                transition: 'background-color 0.15s ease',
                transform: 'translateZ(0)'
              }}
            >
              {period}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}