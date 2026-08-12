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
    <div className="fixed bottom-0 left-0 right-0 pt-8 pb-6 z-30 pointer-events-none max-w-[430px] mx-auto"
      // The fade was from-white, which in dark painted a white band across
      // the bottom of the sheet. It fades from whatever the sheet actually is.
      style={{ background: 'linear-gradient(to top, var(--bg-card) 60%, color-mix(in srgb, var(--bg-card) 80%, transparent) 80%, transparent)' }}>
      <div className="px-6 pointer-events-auto">
        <button
          onClick={onClick}
          disabled={disabled}
          className="w-full py-4 rounded-2xl font-medium text-center transition-all active:scale-[0.98]"
          style={{
            backgroundColor: disabled ? 'var(--line)' : '#4F74F3',
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
