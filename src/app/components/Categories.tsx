import { useState } from 'react';
import { t } from '../i18n';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { getCategoryIcon } from './categoryIcons';
import { AddCategoryModal } from './AddCategoryModal';
import { AddSubcategoryModal } from './AddSubcategoryModal';
import { EditCategoryModal } from './EditCategoryModal';
import { EditSubcategoryModal } from './EditSubcategoryModal';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  bgColor: string;
  selectedBg: string;
  subcategories?: string[];
}

interface CategoriesProps {
  categories: Category[];
  onAddCategory: (category: Omit<Category, 'id'>) => void;
  onEditCategory: (id: string, category: Omit<Category, 'id'>) => void;
  onDeleteCategory: (id: string) => void;
  onAddSubcategory: (categoryId: string, subcategoryName: string) => void;
  onEditSubcategory: (categoryId: string, oldName: string, newName: string) => void;
  onDeleteSubcategory: (categoryId: string, subcategoryName: string) => void;
  onModalOpenChange: (isOpen: boolean) => void;
  type?: 'expense' | 'income';
}

export function Categories({
  categories,
  onAddCategory,
  onEditCategory,
  onDeleteCategory,
  onAddSubcategory,
  onEditSubcategory,
  onDeleteSubcategory,
  onModalOpenChange,
  type = 'expense'
}: CategoriesProps) {
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddSubcategory, setShowAddSubcategory] = useState(false);
  const [showEditCategory, setShowEditCategory] = useState(false);
  const [showEditSubcategory, setShowEditSubcategory] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deleteType, setDeleteType] = useState<'category' | 'subcategory'>('category');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [swipedItem, setSwipedItem] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleCategoryExpansion = (categoryId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  // Sort categories alphabetically
  const sortedCategories = [...categories].sort((a, b) => a.name.localeCompare(b.name));

  const handleAddSubcategory = (category: Category) => {
    setSelectedCategory(category);
    setShowAddSubcategory(true);
    onModalOpenChange(true);
  };

  const handleEditCategory = (category: Category) => {
    setSelectedCategory(category);
    setShowEditCategory(true);
    onModalOpenChange(true);
  };

  const handleEditSubcategory = (category: Category, subcategoryName: string) => {
    setSelectedCategory(category);
    setSelectedSubcategory(subcategoryName);
    setShowEditSubcategory(true);
    onModalOpenChange(true);
  };

  const handleDeleteCategory = (category: Category) => {
    setSelectedCategory(category);
    setDeleteType('category');
    setShowDeleteConfirmation(true);
    onModalOpenChange(true);
  };

  const handleDeleteSubcategory = (category: Category, subcategoryName: string) => {
    setSelectedCategory(category);
    setSelectedSubcategory(subcategoryName);
    setDeleteType('subcategory');
    setShowDeleteConfirmation(true);
    onModalOpenChange(true);
  };

  const confirmDelete = () => {
    if (!selectedCategory) return;

    if (deleteType === 'category') {
      onDeleteCategory(selectedCategory.id);
    } else if (selectedSubcategory) {
      onDeleteSubcategory(selectedCategory.id, selectedSubcategory);
    }

    setShowDeleteConfirmation(false);
    setSelectedCategory(null);
    setSelectedSubcategory(null);
    setSwipedItem(null);
    onModalOpenChange(false);
  };

  return (
    <div style={{ backgroundColor: '#F6F5F2' }}>
      {/* Empty State */}
      {categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-6">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: '#F2F1ED' }}>
            <Plus className="w-8 h-8" style={{ color: '#8E8E93' }} />
          </div>
          <h2 style={{ color: '#1C1C1E', fontWeight: '600', fontSize: '18px', marginBottom: '8px' }}>{t('mgmt.noCategories')}</h2>
          <p style={{ color: '#8E8E93', fontSize: '14px', textAlign: 'center', marginBottom: '24px' }}>
            {t('mgmt.noCategoriesHint')}
          </p>
          <button
            onClick={() => {
              setShowAddCategory(true);
              onModalOpenChange(true);
            }}
            className="px-6 py-3 rounded-xl font-medium transition-colors"
            style={{ backgroundColor: '#1C1C1E', color: '#FFFFFF' }}
          >
            {t('mgmt.addFirstCategory')}
          </button>
        </div>
      ) : (
        <>
          {/* Categories List */}
          <div className="px-6 space-y-2">
            {sortedCategories.map((category) => {
              const Icon = getCategoryIcon(category.icon);
              const isExpanded = expandedCategories.has(category.id);

              return (
                <div key={category.id} className="rounded-xl overflow-hidden" style={{ 
                  backgroundColor: '#FFFFFF',
                  boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)'
                }}>
                  {/* Category Row */}
                  <div className="px-4 py-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 flex-1">
                        <div className={`w-8 h-8 rounded-full ${category.bgColor} flex items-center justify-center flex-shrink-0`}>
                          <Icon className={`w-4 h-4 ${category.color}`} />
                        </div>
                        <button
                          onClick={() => toggleCategoryExpansion(category.id)}
                          className="flex-1 text-left"
                        >
                          <div style={{ color: '#1C1C1E', fontWeight: '500', fontSize: '15px' }}>{category.name}</div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span style={{ color: '#8E8E93', fontSize: '11px' }}>
                              {t(
                                (category.subcategories?.length || 0) === 1
                                  ? 'set.subcatCount.one'
                                  : 'set.subcatCount.other',
                                { n: category.subcategories?.length || 0 },
                              )}
                            </span>
                            {isExpanded ? (
                              <ChevronDown className="w-3 h-3" style={{ color: '#8E8E93' }} />
                            ) : (
                              <ChevronRight className="w-3 h-3" style={{ color: '#8E8E93' }} />
                            )}
                          </div>
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditCategory(category)}
                          className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                          style={{ backgroundColor: 'transparent' }}
                          aria-label={t('mgmt.editCategory', { name: category.name })}
                        >
                          <Pencil className="w-3.5 h-3.5" style={{ color: '#8E8E93' }} />
                        </button>
                        {/* Grey, not red. One red trash is a warning; nine of
                            them stacked down the screen is just noise, and the
                            row is not the destructive moment anyway - nothing
                            is deleted until the confirm sheet, which already
                            carries a red icon and a red button. Keeping the
                            alarm at the decision point rather than on every
                            row lets the list read as a list. */}
                        <button
                          onClick={() => handleDeleteCategory(category)}
                          className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                          style={{ backgroundColor: 'transparent' }}
                          aria-label={t('mgmt.deleteCategory', { name: category.name })}
                        >
                          <Trash2 className="w-3.5 h-3.5" style={{ color: '#8E8E93' }} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Subcategories - Only show when expanded */}
                  {isExpanded && category.subcategories && category.subcategories.length > 0 && (
                    <div className="bg-neutral-50">
                      {category.subcategories.map((subcategory) => (
                        <div
                          key={subcategory}
                          className="px-6 py-3 border-b border-neutral-100 last:border-b-0 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <div className="w-10 flex-shrink-0" />
                            <div className="text-neutral-700 text-sm">   {subcategory}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEditSubcategory(category, subcategory)}
                              className="w-8 h-8 rounded-full flex items-center justify-center active:bg-neutral-200 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5 text-neutral-500" />
                            </button>
                            <button
                              onClick={() => handleDeleteSubcategory(category, subcategory)}
                              className="w-8 h-8 rounded-full flex items-center justify-center active:bg-neutral-200 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-neutral-500" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Subcategory Button - Only show when expanded */}
                  {isExpanded && (
                    <button
                      onClick={() => handleAddSubcategory(category)}
                      className="w-full px-6 py-3 flex items-center gap-2 text-blue-600 text-sm font-medium active:bg-neutral-50 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      {t('mgmt.addSubcategory')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add Category Button */}
          <div className="px-6 py-4" style={{ paddingBottom: '120px' }}>
            <button
              onClick={() => {
                setShowAddCategory(true);
                onModalOpenChange(true);
              }}
              className="w-full py-3 bg-blue-500 text-white rounded-xl font-medium active:bg-blue-600 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              {t('mgmt.addCategory')}
            </button>
          </div>
        </>
      )}

      {/* Modals */}
      {showAddCategory && (
        <AddCategoryModal
          onSave={onAddCategory}
          onClose={() => {
            setShowAddCategory(false);
            onModalOpenChange(false);
          }}
        />
      )}

      {showAddSubcategory && selectedCategory && (
        <AddSubcategoryModal
          category={selectedCategory}
          onSave={(name) => onAddSubcategory(selectedCategory.id, name)}
          onClose={() => {
            setShowAddSubcategory(false);
            setSelectedCategory(null);
            onModalOpenChange(false);
          }}
        />
      )}

      {showEditCategory && selectedCategory && (
        <EditCategoryModal
          category={selectedCategory}
          onSave={(updated) => onEditCategory(selectedCategory.id, updated)}
          onClose={() => {
            setShowEditCategory(false);
            setSelectedCategory(null);
            onModalOpenChange(false);
          }}
        />
      )}

      {showEditSubcategory && selectedCategory && selectedSubcategory && (
        <EditSubcategoryModal
          category={selectedCategory}
          subcategoryName={selectedSubcategory}
          onSave={(newName) => onEditSubcategory(selectedCategory.id, selectedSubcategory, newName)}
          onClose={() => {
            setShowEditSubcategory(false);
            setSelectedCategory(null);
            setSelectedSubcategory(null);
            onModalOpenChange(false);
          }}
        />
      )}

      {showDeleteConfirmation && selectedCategory && (
        <DeleteConfirmationModal
          type={deleteType}
          categoryName={selectedCategory.name}
          subcategoryName={selectedSubcategory || undefined}
          onConfirm={confirmDelete}
          onCancel={() => {
            setShowDeleteConfirmation(false);
            setSelectedCategory(null);
            setSelectedSubcategory(null);
            onModalOpenChange(false);
          }}
        />
      )}
    </div>
  );
}