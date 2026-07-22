import { X } from 'lucide-react';
import { getCategoryIcon } from './categoryIcons';

interface CategoryFilterModalProps {
  isOpen: boolean;
  selectedCategory: string;
  onClose: () => void;
  onSelectCategory: (category: string) => void;
  transactionType?: 'expense' | 'income';
  categories: any[];
  incomeCategories: any[];
}

export function CategoryFilterModal({ 
  isOpen, 
  selectedCategory, 
  onClose, 
  onSelectCategory,
  transactionType = 'expense',
  categories,
  incomeCategories
}: CategoryFilterModalProps) {
  if (!isOpen) return null;

  const categoryList = transactionType === 'income' ? incomeCategories : categories;
  
  const allCategories = [
    { id: 'all', name: 'All', icon: 'MoreHorizontal', color: 'text-neutral-500', bgColor: 'bg-neutral-50' },
    ...categoryList
  ];

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
          <h3 className="text-neutral-900 font-semibold">Filter by Category</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>
        
        {/* Category Options */}
        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            {allCategories.map((category) => {
              const isSelected = selectedCategory === category.name;
              const Icon = getCategoryIcon(category.icon);
              
              return (
                <button
                  key={category.id}
                  onClick={() => {
                    onSelectCategory(category.name);
                  }}
                  className={`flex items-center gap-3 p-4 rounded-xl h-[60px] ${
                    isSelected
                      ? 'bg-blue-50 ring-2 ring-blue-500'
                      : `${category.bgColor} hover:bg-neutral-100`
                  }`}
                  style={{ 
                    transition: 'background-color 0.15s ease',
                    transform: 'translateZ(0)'
                  }}
                >
                  <div className="flex-shrink-0" style={{ transform: 'translateZ(0)' }}>
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-blue-600' : category.color}`} strokeWidth={2} />
                  </div>
                  <span 
                    className={`text-sm text-left leading-tight ${
                      isSelected ? 'text-blue-600 font-medium' : 'text-neutral-600'
                    }`}
                    style={{ transform: 'translateZ(0)' }}
                  >
                    {category.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}