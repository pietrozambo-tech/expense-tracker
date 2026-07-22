import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DashboardPeriodModalProps {
  isOpen: boolean;
  selectedPeriod: string;
  onClose: () => void;
  onSelectPeriod: (period: string) => void;
}

const periods = ['Last Week', 'This Month', 'Last Month', 'This Year', 'Custom Range'];

export function DashboardPeriodModal({ isOpen, selectedPeriod, onClose, onSelectPeriod }: DashboardPeriodModalProps) {
  const handleSelect = (period: string) => {
    if (period !== 'Custom Range') {
      onSelectPeriod(period);
      onClose();
    }
    // TODO: Implement custom date range picker
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 z-40"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 max-w-[430px] mx-auto"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-neutral-200 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
              <h2 className="text-neutral-900 font-semibold">Select Period</h2>
              <button
                onClick={onClose}
                className="p-2 -mr-2 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-neutral-400" />
              </button>
            </div>

            {/* Period List */}
            <div className="px-6 py-4 pb-8">
              {periods.map((period) => (
                <button
                  key={period}
                  onClick={() => handleSelect(period)}
                  className={`w-full flex items-center justify-between py-4 border-b border-neutral-100 last:border-0 ${
                    period === 'Custom Range' ? 'opacity-40' : ''
                  }`}
                  disabled={period === 'Custom Range'}
                >
                  <span className={`${
                    selectedPeriod === period
                      ? 'text-neutral-900 font-medium'
                      : 'text-neutral-600'
                  }`}>
                    {period}
                  </span>
                  {selectedPeriod === period && (
                    <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
