import { t } from '../i18n';

interface SaveButtonProps {
  onClick: () => void;
  disabled: boolean;
  isEditing?: boolean;
  transactionType: 'expense' | 'income';
  /** What a tap on the GREYED button should answer - see below. */
  onBlocked?: () => void;
}

export function SaveButton({ onClick, disabled, isEditing = false, transactionType, onBlocked }: SaveButtonProps) {
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
        {/* aria-disabled, not disabled: a truly disabled button swallows the
            tap and answers nothing, which is the "I pressed Save and the app
            ignored me" moment. It still LOOKS unavailable - same grey, no
            shadow - but a tap now takes the finger to whatever is missing
            (the empty amount, the unchosen category) instead of nowhere. No
            new copy, no dialog: the answer is the field itself. */}
        <button
          onClick={disabled ? onBlocked : onClick}
          aria-disabled={disabled}
          className="w-full py-4 rounded-2xl font-medium text-center transition-all active:scale-[0.98]"
          style={{
            backgroundColor: disabled ? 'var(--line)' : '#4F74F3',
            color: disabled ? 'var(--disabled)' : '#FFFFFF',
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
