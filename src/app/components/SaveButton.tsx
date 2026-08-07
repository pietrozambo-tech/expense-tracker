import { t } from '../i18n';

interface SaveButtonProps {
  onClick: () => void;
  disabled: boolean;
  isEditing?: boolean;
  transactionType: 'expense' | 'income';
}

export function SaveButton({ onClick, disabled, isEditing = false, transactionType }: SaveButtonProps) {
  const transactionLabel = transactionType === 'expense' ? t('add.expense') : t('add.income');
  const buttonText = isEditing
    ? t('save.update', { type: transactionLabel })
    : t('save.new', { type: transactionLabel });

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-white from-60% via-white/80 to-transparent pt-8 pb-6 z-30 pointer-events-none max-w-[430px] mx-auto">
      <div className="px-6 pointer-events-auto">
        <button
          onClick={onClick}
          disabled={disabled}
          className="w-full py-4 rounded-2xl font-medium text-center transition-all active:scale-[0.98]"
          style={{
            backgroundColor: disabled ? '#E5E5E5' : '#4F74F3',
            color: disabled ? '#9CA3AF' : '#FFFFFF',
            boxShadow: disabled ? 'none' : '0 10px 25px rgba(59, 130, 246, 0.2)',
            cursor: disabled ? 'not-allowed' : 'pointer'
          }}
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
}
