import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ImportResult } from '../lib/importData';

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
            style={{ backgroundColor: failed ? '#FEF2F2' : '#EFF6FF' }}
          >
            {failed ? (
              <AlertTriangle className="w-8 h-8" style={{ color: '#DC2626' }} strokeWidth={2} />
            ) : (
              <CheckCircle2 className="w-8 h-8" style={{ color: '#2563EB' }} strokeWidth={2} />
            )}
          </div>
        </div>

        <div className="px-6 pt-4 pb-1 text-center">
          <h3 className="text-neutral-900 font-bold text-lg">
            {failed ? 'Nothing imported' : `${added} transaction${added === 1 ? '' : 's'} imported`}
          </h3>
        </div>

        <div className="px-6 pb-3 text-center flex flex-col gap-2">
          {uncategorized > 0 && !failed && (
            <>
              <p className="text-neutral-700 text-sm leading-relaxed">
                <span className="font-bold">{uncategorized}</span>{' '}
                couldn&apos;t be matched to your categories.
              </p>
              <p className="text-neutral-500 text-[13px] leading-relaxed">
                Review them in Activity with the <span className="font-semibold">Imported</span> filter
                and set the right category as you go.
              </p>
            </>
          )}
          {realSkips.length > 0 && (
            <p className="text-neutral-400 text-xs leading-relaxed">
              {realSkips.length} row{realSkips.length === 1 ? '' : 's'} couldn&apos;t be read and{' '}
              {realSkips.length === 1 ? 'was' : 'were'} left out.
            </p>
          )}
        </div>

        <div className="p-4 pt-2 flex flex-col gap-2">
          {showReview ? (
            <>
              <button
                onClick={onReview}
                className="w-full py-3 rounded-xl font-semibold text-white active:scale-[0.98] transition-transform"
                style={{ backgroundColor: '#3B82F6' }}
              >
                Review in Activity
              </button>
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl font-medium text-neutral-500 active:bg-neutral-100 transition-colors"
              >
                Not now
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl font-semibold text-white active:scale-[0.98] transition-transform"
              style={{ backgroundColor: '#3B82F6' }}
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
