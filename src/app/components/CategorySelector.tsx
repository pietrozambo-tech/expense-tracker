import { getCategoryIcon } from './categoryIcons';

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  bgColor: string;
  selectedBg: string;
  subcategories?: string[];
}

interface CategorySelectorProps {
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string) => void;
  categories: Category[];
}

export function CategorySelector({ selectedCategory, onSelectCategory, categories }: CategorySelectorProps) {
  return (
    <div className="px-6 pb-6">
      <h3 className="text-neutral-700 font-semibold mb-2.5">Category</h3>
      
      <div className="grid grid-cols-2 gap-2.5">
        {categories.map((category) => {
          const Icon = getCategoryIcon(category.icon);
          const isSelected = selectedCategory === category.id;
          
          return (
            <button
              key={category.id}
              onClick={() => onSelectCategory(category.id)}
              className={`flex items-center gap-3 py-2.5 px-3 rounded-xl h-[52px] ${
                isSelected 
                  ? 'bg-neutral-50 ring-2 ring-blue-500'
                  : 'bg-neutral-50/50 hover:bg-neutral-100'
              }`}
              style={{ 
                transition: 'background-color 0.15s ease',
                transform: 'translateZ(0)',
                WebkitFontSmoothing: 'antialiased',
                backfaceVisibility: 'hidden'
              }}
            >
              <div 
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isSelected ? category.selectedBg : category.bgColor
                }`}
                style={{ 
                  transform: 'translateZ(0)',
                  backfaceVisibility: 'hidden'
                }}
              >
                <Icon className={`w-4.5 h-4.5 ${isSelected ? category.color : 'text-neutral-400'}`} />
              </div>
              <span 
                className={`text-sm text-left leading-tight ${isSelected ? 'text-neutral-900 font-medium' : 'text-neutral-600'}`}
                style={{ 
                  transform: 'translateZ(0)',
                  display: 'inline-block',
                  backfaceVisibility: 'hidden'
                }}
              >
                {category.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}