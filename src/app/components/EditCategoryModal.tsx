import { useState } from 'react';
import { X } from 'lucide-react';
import { getCategoryIcon, iconsList, IconName } from './categoryIcons';

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  bgColor: string;
  selectedBg: string;
  subcategories?: string[];
}

interface EditCategoryModalProps {
  category: Category;
  onSave: (category: {
    name: string;
    icon: string;
    color: string;
    bgColor: string;
    selectedBg: string;
    subcategories: string[];
  }) => void;
  onClose: () => void;
}

const colorOptions = [
  { name: 'Amber', color: 'text-amber-600', bgColor: 'bg-amber-50', selectedBg: 'bg-amber-100', preview: 'bg-amber-600' },
  { name: 'Orange', color: 'text-orange-500', bgColor: 'bg-orange-50', selectedBg: 'bg-orange-100', preview: 'bg-orange-500' },
  { name: 'Rose', color: 'text-rose-500', bgColor: 'bg-rose-50', selectedBg: 'bg-rose-100', preview: 'bg-rose-500' },
  { name: 'Emerald', color: 'text-emerald-500', bgColor: 'bg-emerald-50', selectedBg: 'bg-emerald-100', preview: 'bg-emerald-500' },
  { name: 'Red', color: 'text-red-500', bgColor: 'bg-red-50', selectedBg: 'bg-red-100', preview: 'bg-red-500' },
  { name: 'Blue', color: 'text-blue-600', bgColor: 'bg-blue-50', selectedBg: 'bg-blue-100', preview: 'bg-blue-600' },
  { name: 'Purple', color: 'text-purple-500', bgColor: 'bg-purple-50', selectedBg: 'bg-purple-100', preview: 'bg-purple-500' },
  { name: 'Pink', color: 'text-pink-500', bgColor: 'bg-pink-50', selectedBg: 'bg-pink-100', preview: 'bg-pink-500' },
  { name: 'Green', color: 'text-green-600', bgColor: 'bg-green-50', selectedBg: 'bg-green-100', preview: 'bg-green-600' },
  { name: 'Indigo', color: 'text-indigo-500', bgColor: 'bg-indigo-50', selectedBg: 'bg-indigo-100', preview: 'bg-indigo-500' },
  { name: 'Slate', color: 'text-slate-600', bgColor: 'bg-slate-50', selectedBg: 'bg-slate-100', preview: 'bg-slate-600' },
  { name: 'Sky', color: 'text-sky-500', bgColor: 'bg-sky-50', selectedBg: 'bg-sky-100', preview: 'bg-sky-500' },
  { name: 'Neutral', color: 'text-neutral-500', bgColor: 'bg-neutral-50', selectedBg: 'bg-neutral-100', preview: 'bg-neutral-500' },
  { name: 'Teal', color: 'text-teal-500', bgColor: 'bg-teal-50', selectedBg: 'bg-teal-100', preview: 'bg-teal-500' },
  { name: 'Violet', color: 'text-violet-500', bgColor: 'bg-violet-50', selectedBg: 'bg-violet-100', preview: 'bg-violet-500' },
];

export function EditCategoryModal({ category, onSave, onClose }: EditCategoryModalProps) {
  const [name, setName] = useState(category.name);
  const [selectedIcon, setSelectedIcon] = useState<IconName>(category.icon as IconName);
  
  // Find the current color option
  const initialColor = colorOptions.find(c => c.color === category.color) || colorOptions[0];
  const [selectedColor, setSelectedColor] = useState(initialColor);

  // Track if anything changed
  const hasChanges = 
    name.trim() !== category.name ||
    selectedIcon !== category.icon ||
    selectedColor.color !== category.color;

  const handleSave = () => {
    if (!name.trim() || !hasChanges) return;

    onSave({
      name: name.trim(),
      icon: selectedIcon,
      color: selectedColor.color,
      bgColor: selectedColor.bgColor,
      selectedBg: selectedColor.selectedBg,
      subcategories: category.subcategories || []
    });

    onClose();
  };

  const Icon = getCategoryIcon(selectedIcon);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center max-w-[430px] mx-auto">
      <div className="bg-white rounded-t-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between flex-shrink-0">
          <h2 className="text-neutral-900 font-semibold text-lg">Edit Category</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full active:bg-neutral-100 transition-colors"
          >
            <X size={20} className="text-neutral-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Live Preview */}
          <div className="mb-6 p-6 bg-neutral-50 rounded-2xl">
            <div className="text-neutral-500 text-xs mb-3">Preview</div>
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-full ${selectedColor.bgColor} flex items-center justify-center`}>
                <Icon className={`w-6 h-6 ${selectedColor.color}`} />
              </div>
              <div className="text-neutral-900 font-medium">
                {name.trim() || 'Category Name'}
              </div>
            </div>
          </div>

          {/* Name Input */}
          <div className="mb-6">
            <label className="block text-neutral-700 font-medium text-sm mb-2">
              Category Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Entertainment"
              className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Icon Picker */}
          <div className="mb-6">
            <label className="block text-neutral-700 font-medium text-sm mb-3">
              Icon
            </label>
            <div className="grid grid-cols-6 gap-2">
              {iconsList.map((iconName) => {
                const IconComponent = getCategoryIcon(iconName);
                const isSelected = selectedIcon === iconName;
                return (
                  <button
                    key={iconName}
                    onClick={() => setSelectedIcon(iconName)}
                    className={`w-full aspect-square rounded-xl flex items-center justify-center transition-all ${
                      isSelected
                        ? `${selectedColor.bgColor} ring-2 ring-blue-500`
                        : 'bg-neutral-50 active:bg-neutral-100'
                    }`}
                  >
                    <IconComponent
                      className={`w-5 h-5 ${isSelected ? selectedColor.color : 'text-neutral-600'}`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color Picker */}
          <div className="mb-6">
            <label className="block text-neutral-700 font-medium text-sm mb-3">
              Color
            </label>
            <div className="grid grid-cols-5 gap-2">
              {colorOptions.map((colorOption) => {
                const isSelected = selectedColor.name === colorOption.name;
                return (
                  <button
                    key={colorOption.name}
                    onClick={() => setSelectedColor(colorOption)}
                    className={`w-full aspect-square rounded-xl flex items-center justify-center transition-all ${
                      isSelected
                        ? 'ring-2 ring-blue-500'
                        : ''
                    } ${colorOption.preview}`}
                  >
                    {isSelected && (
                      <div className="w-3 h-3 rounded-full bg-white" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-100 flex gap-3 flex-shrink-0">
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
