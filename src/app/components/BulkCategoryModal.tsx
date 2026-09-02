import { useState } from 'react';
import { CategorySelector } from './CategorySelector';
import { t } from '../i18n';
import type { Category } from '../types';
import { useBackClose } from '../lib/useBackClose';

interface BulkCategoryModalProps {
  /** How many rows this will move - the only thing that makes the sheet feel
   *  different from the one in the add flow, so it leads the title. */
  count: number;
  categories: Category[];
  onApply: (category: Category, subcategory: string | null) => void;
  onClose: () => void;
}

/**
 * Where a selection gets filed.
 *
 * The same picker the add flow uses, in a sheet: one grid of categories with
 * the chosen one's subcategories opening underneath. Reused rather than
 * rebuilt so a category added in Settings shows up in both places, looking the
 * same, sorted the same.
 *
 * Nothing is applied on the tap that picks a category - a bulk move is not a
 * filter, and choosing "Travel" is only half of "Travel · Flights". The button
 * at the foot is the commitment, and it names the count again because by then
 * the list it applies to has scrolled out of sight.
 */
export function BulkCategoryModal({ count, categories, onApply, onClose }: BulkCategoryModalProps) {
  useBackClose(true, onClose);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const chosen = categories.find((c) => c.id === categoryId) ?? null;

  return (
    <div data-overlay className="fixed inset-0 z-[70] flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        data-bulk-category
        className="relative w-full max-w-[430px] mx-auto rounded-t-3xl shadow-xl animate-slide-up flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: 'var(--bg-card)', maxHeight: '85vh' }}
      >
        <div className="px-6 pt-6 pb-3 flex-shrink-0">
          <h2 style={{ color: 'var(--ink)', fontWeight: 600 }}>
            {t(count === 1 ? 'sel.catTitle.one' : 'sel.catTitle.other', { n: count })}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          <CategorySelector
            selectedCategory={categoryId}
            onSelectCategory={(id) => {
              setCategoryId(id);
              // A subcategory belongs to the category above it. Carrying the
              // old one across would file rows under a name the new category
              // has never heard of.
              setSubcategory(null);
            }}
            categories={categories}
            subcategories={chosen?.subcategories ?? []}
            selectedSubcategory={subcategory}
            onSelectSubcategory={setSubcategory}
          />
        </div>

        <div className="px-6 pb-6 pt-3 flex-shrink-0" style={{ borderTop: '1px solid var(--line-2)' }}>
          <button
            data-bulk-category-apply
            disabled={!chosen}
            onClick={() => chosen && onApply(chosen, subcategory)}
            className="w-full py-3.5 rounded-2xl font-semibold text-white transition-opacity active:opacity-80"
            // The brand fill every primary button in the app uses; --accent-ink
            // is the text token and lightens in dark mode, where white on it
            // stops being readable.
            style={{ backgroundColor: '#4F74F3', opacity: chosen ? 1 : 0.4 }}
          >
            {chosen
              ? `${t('sel.apply')} · ${chosen.name}${subcategory ? ` - ${subcategory}` : ''}`
              : t('sel.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}
