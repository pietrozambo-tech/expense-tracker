import { Fragment } from 'react';
import { t } from '../i18n';
import { X } from 'lucide-react';
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
  // Subcategories for the selected category, shown inline right below its row
  subcategories?: string[];
  selectedSubcategory?: string | null;
  onSelectSubcategory?: (subcategory: string | null) => void;
}

export function CategorySelector({
  selectedCategory,
  onSelectCategory,
  categories,
  subcategories = [],
  selectedSubcategory = null,
  onSelectSubcategory
}: CategorySelectorProps) {
  // Show categories alphabetically; re-sorts live as categories are added/removed.
  const sortedCategories = [...categories].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );

  // Insert the subcategory panel right after the row that holds the selected
  // category. With a 2-column grid, that row ends at the odd index of the pair.
  const selectedIndex = sortedCategories.findIndex((c) => c.id === selectedCategory);
  const panelAfterIndex =
    selectedIndex === -1
      ? -1
      : Math.min(Math.floor(selectedIndex / 2) * 2 + 1, sortedCategories.length - 1);
  const showSubcategoryPanel = selectedIndex !== -1 && subcategories.length > 0;

  return (
    <div className="px-6 pb-6">
      <h3 className="text-neutral-700 font-semibold mb-2.5">{t('add.category')}</h3>

      <div className="grid grid-cols-2 gap-2.5">
        {sortedCategories.map((category, index) => {
          const Icon = getCategoryIcon(category.icon);
          const isSelected = selectedCategory === category.id;

          return (
            <Fragment key={category.id}>
              <button
                onClick={() => onSelectCategory(category.id)}
                className={`flex items-center gap-3 py-2.5 px-3 rounded-xl min-h-[52px] ${
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
                  className={`text-[13px] text-left leading-tight line-clamp-2 ${isSelected ? 'text-neutral-900 font-medium' : 'text-neutral-600'}`}
                  style={{
                    transform: 'translateZ(0)',
                    backfaceVisibility: 'hidden'
                  }}
                >
                  {category.name}
                </span>
              </button>

              {/* Subcategory panel — spans the full width, sits right below the
                  selected category's row */}
              {showSubcategoryPanel && index === panelAfterIndex && (
                <div
                  className="col-span-2 rounded-xl px-3.5 py-3"
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #ECECEF',
                    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.05)'
                  }}
                >
                  {/* Fixed-height header so the panel doesn't resize when the
                      clear (X) button appears on subcategory selection */}
                  <div className="flex items-center justify-between mb-2 h-6">
                    <span
                      className="text-[11px] font-semibold"
                      style={{ color: '#8E8E93', letterSpacing: '0.06em' }}
                    >
                      {t('add.subcategory')}
                    </span>
                    <button
                      onClick={() => onSelectSubcategory?.(null)}
                      className="w-6 h-6 -mr-1 flex items-center justify-center rounded-full active:bg-neutral-100"
                      aria-label={t('add.clearSub')}
                      style={{
                        visibility: selectedSubcategory ? 'visible' : 'hidden',
                        pointerEvents: selectedSubcategory ? 'auto' : 'none'
                      }}
                    >
                      <X className="w-4 h-4" style={{ color: '#8E8E93' }} />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {subcategories.map((subcategory) => {
                      const subSelected = selectedSubcategory === subcategory;
                      return (
                        <button
                          key={subcategory}
                          onClick={() =>
                            onSelectSubcategory?.(subSelected ? null : subcategory)
                          }
                          className={`px-3.5 py-1.5 rounded-lg text-sm border ${
                            subSelected
                              ? 'bg-blue-50 text-blue-600 border-blue-200'
                              : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
                          }`}
                          style={{
                            transition: 'background-color 0.15s ease, color 0.15s ease',
                            transform: 'translateZ(0)',
                            WebkitFontSmoothing: 'antialiased',
                            backfaceVisibility: 'hidden'
                          }}
                        >
                          <span style={{ transform: 'translateZ(0)', display: 'inline-block' }}>
                            {subcategory}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
