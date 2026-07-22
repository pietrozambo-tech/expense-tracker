import { X } from 'lucide-react';

interface PeriodTypeModalProps {
  isOpen: boolean;
  selectedPeriodType: 'month' | 'quarter' | 'year';
  onClose: () => void;
  onSelectPeriodType: (periodType: 'month' | 'quarter' | 'year') => void;
}

export function PeriodTypeModal({ 
  isOpen, 
  selectedPeriodType, 
  onClose, 
  onSelectPeriodType 
}: PeriodTypeModalProps) {
  if (!isOpen) return null;

  const periodTypes: Array<{ value: 'month' | 'quarter' | 'year'; label: string }> = [
    { value: 'month', label: 'Month' },
    { value: 'quarter', label: 'Quarter' },
    { value: 'year', label: 'Year' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" />
      
      {/* Modal */}
      <div 
        className="relative w-full bg-white rounded-t-3xl shadow-xl max-w-[430px] mx-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-neutral-100">
          <h2 className="font-semibold text-neutral-900">Select Period Type</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 transition-colors"
          >
            <X size={20} className="text-neutral-500" />
          </button>
        </div>

        {/* Period Type List */}
        <div className="overflow-y-auto px-6 py-4" style={{ maxHeight: 'calc(85vh - 80px)' }}>
          {periodTypes.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => {
                onSelectPeriodType(value);
                onClose();
              }}
              className="w-full flex items-center justify-between py-3.5 transition-colors hover:bg-neutral-50 rounded-lg px-3 -mx-3"
            >
              <span className={`text-sm ${selectedPeriodType === value ? 'font-medium text-blue-600' : 'text-neutral-900'}`}>
                {label}
              </span>
              {selectedPeriodType === value && (
                <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                  <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                    <path d="M1 5L4.5 8.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
