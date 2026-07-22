import { useState } from 'react';
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

interface EditSubcategoryModalProps {
  category: Category;
  subcategoryName: string;
  onSave: (newName: string) => void;
  onClose: () => void;
}

export function EditSubcategoryModal({ category, subcategoryName, onSave, onClose }: EditSubcategoryModalProps) {
  const [name, setName] = useState(subcategoryName);

  const hasChanges = name.trim() !== subcategoryName;

  const handleSave = () => {
    if (!name.trim() || !hasChanges) return;
    onSave(name.trim());
    onClose();
  };

  const Icon = getCategoryIcon(category.icon);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center max-w-[430px] mx-auto">
      <div className="bg-white rounded-t-3xl w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
          <h2 className="text-neutral-900 font-semibold text-lg">Edit Subcategory</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full active:bg-neutral-100 transition-colors"
          >
            <X size={20} className="text-neutral-600" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {/* Parent Category Display */}
          <div className="mb-6 p-4 bg-neutral-50 rounded-xl">
            <div className="text-neutral-500 text-xs mb-2">Parent Category (not editable)</div>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full ${category.bgColor} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${category.color}`} />
              </div>
              <div className="text-neutral-900 font-medium">{category.name}</div>
            </div>
          </div>

          {/* Name Input */}
          <div className="mb-6">
            <label className="block text-neutral-700 font-medium text-sm mb-2">
              Subcategory Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Netflix"
              className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-neutral-100 text-neutral-900 rounded-xl font-medium active:bg-neutral-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || !hasChanges}
            className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
              name.trim() && hasChanges
                ? 'bg-blue-500 text-white active:bg-blue-600'
                : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
            }`}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
