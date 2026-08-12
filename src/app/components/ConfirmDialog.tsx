import { AlertTriangle, FlaskConical, type LucideIcon } from 'lucide-react';
import { t } from '../i18n';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  variant?: 'danger' | 'neutral';
  /** Neutral-variant icon override; the flask reads as "demo data", which is
   *  wrong for every other neutral question. */
  icon?: LucideIcon;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  variant = 'danger',
  icon,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const isDanger = variant === 'danger';
  const NeutralIcon = icon ?? FlaskConical;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6 max-w-[430px] mx-auto">
      <div className="bg-white rounded-2xl w-full max-w-sm">
        {/* Icon */}
        <div className="pt-6 px-6 flex justify-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: isDanger ? 'var(--wash-red)' : 'var(--wash-accent2)' }}
          >
            {isDanger ? (
              <AlertTriangle className="w-8 h-8 text-red-500" />
            ) : (
              <NeutralIcon className="w-8 h-8" style={{ color: '#4F74F3' }} />
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 text-center">
          <h3 className="text-neutral-900 font-semibold text-lg mb-2">{title}</h3>
          <p className="text-neutral-600 text-sm">{message}</p>
        </div>

        {/* Actions */}
        <div className="p-4 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl font-medium text-base transition-colors active:scale-[0.98]"
            style={{ backgroundColor: 'var(--bg-inset)', color: 'var(--ink)' }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl font-medium text-base text-white transition-colors active:scale-[0.98]"
            style={{ backgroundColor: isDanger ? '#EF4444' : '#4F74F3' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
