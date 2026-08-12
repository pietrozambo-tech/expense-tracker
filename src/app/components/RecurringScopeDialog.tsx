import { Repeat } from 'lucide-react';
import { t } from '../i18n';

interface RecurringScopeDialogProps {
  title: string;
  message: string;
  onlyThisLabel: string;
  futureLabel: string;
  variant?: 'neutral' | 'danger'; // danger = delete flow
  onOnlyThis: () => void;
  onFuture: () => void;
  onCancel: () => void;
}

// The calendar-style scope chooser shown when saving or deleting a transaction
// that belongs to a recurring chain: apply to just this occurrence, or to this
// one and everything the schedule creates from here on.
export function RecurringScopeDialog({
  title,
  message,
  onlyThisLabel,
  futureLabel,
  variant = 'neutral',
  onOnlyThis,
  onFuture,
  onCancel,
}: RecurringScopeDialogProps) {
  const accent = variant === 'danger' ? 'var(--tone-danger)' : '#4F74F3';
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6 max-w-[430px] mx-auto">
      <div className="bg-white rounded-2xl w-full max-w-sm">
        <div className="pt-6 px-6 flex justify-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: variant === 'danger' ? 'var(--wash-red)' : 'var(--wash-accent2)' }}
          >
            <Repeat className="w-8 h-8" style={{ color: accent }} />
          </div>
        </div>

        <div className="px-6 py-4 text-center">
          <h3 className="text-neutral-900 font-semibold text-lg mb-2">{title}</h3>
          <p className="text-neutral-600 text-sm">{message}</p>
        </div>

        <div className="px-4 pb-4 flex flex-col gap-2">
          <button
            onClick={onOnlyThis}
            className="w-full py-3 rounded-xl font-medium text-base text-white transition-transform active:scale-[0.98]"
            style={{ backgroundColor: accent }}
          >
            {onlyThisLabel}
          </button>
          <button
            onClick={onFuture}
            className="w-full py-3 rounded-xl font-medium text-base transition-transform active:scale-[0.98]"
            style={{ backgroundColor: variant === 'danger' ? 'var(--wash-red)' : 'var(--wash-accent2)', color: accent }}
          >
            {futureLabel}
          </button>
          <button
            onClick={onCancel}
            className="w-full py-2.5 rounded-xl font-medium text-[15px]"
            style={{ color: 'var(--ink-2)' }}
          >{t('common.cancel')}</button>
        </div>
      </div>
    </div>
  );
}
