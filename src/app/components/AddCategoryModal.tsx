import { useState } from 'react';
import { t } from '../i18n';
import { X } from 'lucide-react';
import { getCategoryIcon, iconsList, IconName } from './categoryIcons';
import { colorOptions } from './categoryColors';

interface AddCategoryModalProps {
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

export function AddCategoryModal({ onSave, onClose }: AddCategoryModalProps) {
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState<IconName>('ShoppingBag');
  const [selectedColor, setSelectedColor] = useState(colorOptions[0]);

  const handleSave = () => {
    if (!name.trim()) return;

    onSave({
      name: name.trim(),
      icon: selectedIcon,
      color: selectedColor.color,
      bgColor: selectedColor.bgColor,
      selectedBg: selectedColor.selectedBg,
      subcategories: []
    });

    onClose();
  };

  const Icon = getCategoryIcon(selectedIcon);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center max-w-[430px] mx-auto">
      <div className="bg-white rounded-t-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between flex-shrink-0">
          <h2 className="text-neutral-900 font-semibold text-lg">{t('mgmt.addCategoryTitle')}</h2>
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
            <div className="text-neutral-500 text-xs mb-3">{t('mgmt.preview')}</div>
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-full ${selectedColor.bgColor} flex items-center justify-center`}>
                <Icon className={`w-6 h-6 ${selectedColor.color}`} />
              </div>
              <div className="text-neutral-900 font-medium">
                {name.trim() || t('mgmt.categoryName')}
              </div>
            </div>
          </div>

          {/* Name Input */}
          <div className="mb-6">
            <label className="block text-neutral-700 font-medium text-sm mb-2">
              {t('mgmt.categoryName')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('mgmt.catPlaceholder')}
              className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>

          {/* Icon Picker */}
          <div className="mb-6">
            <label className="block text-neutral-700 font-medium text-sm mb-3">
              {t('mgmt.icon')}
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
              {t('mgmt.color')}
            </label>
            <div className="grid grid-cols-6 gap-2">
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
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
              name.trim()
                ? 'bg-blue-500 text-white active:bg-blue-600'
                : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
            }`}
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
