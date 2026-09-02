import { useRef, useState } from 'react';
import { t } from '../i18n';
import { X } from 'lucide-react';
import { getCategoryIcon } from './categoryIcons';
import { useBackClose } from '../lib/useBackClose';

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
  useBackClose(true, onClose);
  const [name, setName] = useState(subcategoryName);

  const hasChanges = name.trim() !== subcategoryName;
  const nameRef = useRef<HTMLInputElement>(null);

  // Two reasons the Save greys out, two honest answers. An empty name is
  // something to fix, so the tap goes to the field. Nothing changed is not an
  // error at all - there is simply nothing to save - so the tap just closes,
  // the way Cancel would, leaving exactly the screen already on show.
  const blocked = !name.trim() || !hasChanges;
  const answerBlocked = () => {
    if (name.trim()) { onClose(); return; }
    nameRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    nameRef.current?.focus();
  };

  const handleSave = () => {
    if (!name.trim() || !hasChanges) return;
    onSave(name.trim());
    onClose();
  };

  const Icon = getCategoryIcon(category.icon);

  return (
    <div
      // The tap outside closes it, the way every picker and filter sheet in
      // the app already does - and the way the X does, discarding whatever
      // was typed. It was the only sheet family that answered an outside tap
      // with nothing at all, which reads as a stuck screen rather than a
      // protected one. The target check keeps taps INSIDE the card from
      // bubbling out and closing it.
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center max-w-[430px] mx-auto"
    >
      <div className="bg-white rounded-t-3xl w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
          <h2 className="text-neutral-900 font-semibold text-lg">{t('mgmt.editSubTitle')}</h2>
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
            <div className="text-neutral-500 text-xs mb-2">{t('mgmt.parentCategoryLocked')}</div>
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
              {t('mgmt.subName')} <span className="text-red-500">*</span>
            </label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('mgmt.subPlaceholder')}
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
            {t('common.cancel')}
          </button>
          <button
            onClick={blocked ? answerBlocked : handleSave}
            aria-disabled={blocked}
            className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
              name.trim() && hasChanges
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
