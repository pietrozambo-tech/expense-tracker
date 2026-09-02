import { X } from 'lucide-react';
import { t } from '../i18n';
import { useBackClose } from '../lib/useBackClose';

interface SubcategoryFilterModalProps {
  isOpen: boolean;
  selectedSubcategory: string;
  onClose: () => void;
  onSelectSubcategory: (subcategory: string) => void;
  availableSubcategories: string[];
}

export function SubcategoryFilterModal({ 
  isOpen, 
  selectedSubcategory, 
  onClose, 
  onSelectSubcategory,
  availableSubcategories
}: SubcategoryFilterModalProps) {
  useBackClose(isOpen, onClose);
  if (!isOpen) return null;

  const allSubcategories = ['All', ...availableSubcategories];

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
          <h3 className="text-neutral-900 font-semibold">{t('fsub.title')}</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>
        
        {/* Subcategory Options */}
        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          {allSubcategories.length === 1 ? (
            <div className="text-center py-8 text-neutral-400 text-sm">
              {t('fsub.none')}
            </div>
          ) : (
            allSubcategories.map((subcategory) => (
              <button
                key={subcategory}
                onClick={() => {
                  onSelectSubcategory(subcategory);
                }}
                className={`w-full text-left px-4 py-3 rounded-xl mb-2 ${
                  selectedSubcategory === subcategory
                    ? 'bg-blue-50 text-blue-600 font-medium'
                    : 'hover:bg-neutral-50 text-neutral-700'
                }`}
                style={{ 
                  transition: 'background-color 0.15s ease',
                  transform: 'translateZ(0)'
                }}
              >
                {subcategory === 'All' ? t('act.type.all') : subcategory}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}