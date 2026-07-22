import { X } from 'lucide-react';

interface MonthFilterModalProps {
  isOpen: boolean;
  selectedMonth: string;
  availableMonths: string[]; // Months that have actual expense data for the selected year
  onClose: () => void;
  onSelectMonth: (month: string) => void;
}

export function MonthFilterModal({ 
  isOpen, 
  selectedMonth,
  availableMonths, 
  onClose, 
  onSelectMonth 
}: MonthFilterModalProps) {
  if (!isOpen) return null;

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
          <h2 className="font-semibold text-neutral-900">Select Month</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 transition-colors"
          >
            <X size={20} className="text-neutral-500" />
          </button>
        </div>

        {/* Month List */}
        <div className="overflow-y-auto px-6 py-4" style={{ maxHeight: 'calc(85vh - 80px)' }}>
          {availableMonths.length === 0 ? (
            <div className="py-8 text-center text-neutral-400 text-sm">
              No months with expense data for this year
            </div>
          ) : (
            <div className="space-y-1.5">
              {/* Full Year Option */}
              <button
                onClick={() => {
                  onSelectMonth('Full Year');
                  onClose();
                }}
                className="w-full flex items-center justify-between py-2.5 px-3.5 transition-all rounded-lg bg-white border border-neutral-100"
                style={{
                  boxShadow: selectedMonth === 'Full Year' 
                    ? '0 2px 8px rgba(59, 130, 246, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1)' 
                    : '0 1px 3px rgba(0, 0, 0, 0.05)',
                  borderColor: selectedMonth === 'Full Year' ? '#3B82F6' : '#E5E5E5'
                }}
              >
                <span className={`${selectedMonth === 'Full Year' ? 'font-semibold text-blue-600' : 'font-medium text-neutral-900'}`} style={{ fontSize: '14px' }}>
                  Full Year
                </span>
                {selectedMonth === 'Full Year' && (
                  <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center">
                    <svg width="10" height="8" viewBox="0 0 12 10" fill="none">
                      <path d="M1 5L4.5 8.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </button>
              
              {/* Individual Months */}
              {availableMonths.map((month) => (
                <button
                  key={month}
                  onClick={() => {
                    onSelectMonth(month);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between py-2.5 px-3.5 transition-all rounded-lg bg-white border border-neutral-100"
                  style={{
                    boxShadow: selectedMonth === month 
                      ? '0 2px 8px rgba(59, 130, 246, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1)' 
                      : '0 1px 3px rgba(0, 0, 0, 0.05)',
                    borderColor: selectedMonth === month ? '#3B82F6' : '#E5E5E5'
                  }}
                >
                  <span className={`${selectedMonth === month ? 'font-semibold text-blue-600' : 'font-medium text-neutral-900'}`} style={{ fontSize: '14px' }}>
                    {month}
                  </span>
                  {selectedMonth === month && (
                    <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center">
                      <svg width="10" height="8" viewBox="0 0 12 10" fill="none">
                        <path d="M1 5L4.5 8.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}