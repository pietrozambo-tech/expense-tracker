import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { t } from '../i18n';
import type { ImportResult } from '../lib/importData';
import { useBackClose } from '../lib/useBackClose';

// Shown after an import when something needs the user: transactions that
// landed without a real category, or rows that couldn't be read at all. The
// headline is the count waiting for categories, and the primary action takes
// the user straight to them (Activity, "Imported" filter).
//
// Deliberately silent about zero-amount rows - skipping those is bookkeeping,
// not news.
export function ImportSummaryDialog({
  result,
  onClose,
  onReview,
}: {
  result: ImportResult;
  onClose: () => void;
  onReview?: () => void;
}) {
  useBackClose(true, onClose);
  const { added, uncategorized, skipped } = result;
  const realSkips = skipped.filter((s) => s.reason !== 'zero amount');
  const failed = added === 0;
  const showReview = !failed && uncategorized > 0 && !!onReview;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6 max-w-[430px] mx-auto">
      <div className="bg-white rounded-2xl w-full max-w-sm">
        <div className="pt-6 px-6 flex justify-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: failed ? 'var(--wash-red)' : 'var(--wash-accent2)' }}
          >
            {failed ? (
              <AlertTriangle className="w-8 h-8" style={{ color: '#DC2626' }} strokeWidth={2} />
            ) : (
              <CheckCircle2 className="w-8 h-8" style={{ color: '#3D5BE0' }} strokeWidth={2} />
            )}
          </div>
        </div>

        <div className="px-6 pt-4 pb-1 text-center">
          <h3 className="text-neutral-900 font-bold text-lg">
            {failed ? t('imp.failed') : t(added === 1 ? 'imp.done.one' : 'imp.done.other', { n: added })}
          </h3>
        </div>

        <div className="px-6 pb-3 text-center flex flex-col gap-2">
          {uncategorized > 0 && !failed && (
            <>
              <p className="text-neutral-700 text-sm leading-relaxed">
                <span className="font-bold">{uncategorized}</span>{' '}
                {t('imp.uncatPost')}
              </p>
              <p className="text-neutral-500 text-[13px] leading-relaxed">
                {t('imp.reviewPre')} <span className="font-semibold">{t('act.type.imported')}</span>{' '}
                {t('imp.reviewPost')}
              </p>
            </>
          )}
          {(result.alreadyImported ?? 0) > 0 && (
            // Reassurance, not a warning: the dedupe recognised rows an
            // earlier import already brought in, and nothing double-counted.
            <p className="text-neutral-500 text-[13px] leading-relaxed">
              {t(result.alreadyImported === 1 ? 'imp.already.one' : 'imp.already.other', { n: result.alreadyImported })}
            </p>
          )}
          {realSkips.length > 0 && (
            <p className="text-neutral-400 text-xs leading-relaxed">
              {t(realSkips.length === 1 ? 'imp.skipped.one' : 'imp.skipped.other', { n: realSkips.length })}
            </p>
          )}
        </div>

        <div className="p-4 pt-2 flex flex-col gap-2">
          {showReview ? (
            <>
              <button
                onClick={onReview}
                className="w-full py-3 rounded-xl font-semibold text-white active:scale-[0.98] transition-transform"
                style={{ backgroundColor: '#4F74F3' }}
              >
                {t('imp.reviewCta')}
              </button>
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl font-medium text-neutral-500 active:bg-neutral-100 transition-colors"
              >
                {t('common.notNow')}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl font-semibold text-white active:scale-[0.98] transition-transform"
              style={{ backgroundColor: '#4F74F3' }}
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
