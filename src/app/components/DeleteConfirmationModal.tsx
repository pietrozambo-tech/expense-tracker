import { AlertTriangle } from 'lucide-react';

interface DeleteConfirmationModalProps {
  type: 'category' | 'subcategory';
  categoryName: string;
  subcategoryName?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmationModal({
  type,
  categoryName,
  subcategoryName,
  onConfirm,
  onCancel
}: DeleteConfirmationModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6 max-w-[430px] mx-auto">
      <div className="bg-white rounded-2xl w-full max-w-sm">
        {/* Icon */}
        <div className="pt-6 px-6 flex justify-center">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 text-center">
          <h3 className="text-neutral-900 font-semibold text-lg mb-2">
            {type === 'category' ? 'Delete Category?' : 'Delete Subcategory?'}
          </h3>
          
          {type === 'category' ? (
            <p className="text-neutral-600 text-sm">
              Deleting "<span className="font-medium">{categoryName}</span>" will also delete all subcategories and unlink existing expenses from this category.
            </p>
          ) : (
            <p className="text-neutral-600 text-sm">
              Are you sure you want to delete "<span className="font-medium">{subcategoryName}</span>" from {categoryName}?
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex flex-col gap-2">
          <button
            onClick={onConfirm}
            className="w-full py-3 bg-red-500 text-white rounded-xl font-medium active:bg-red-600 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={onCancel}
            className="w-full py-3 bg-neutral-100 text-neutral-900 rounded-xl font-medium active:bg-neutral-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
