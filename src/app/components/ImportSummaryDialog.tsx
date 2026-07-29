import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ImportResult } from '../lib/importData';

// Shown after an import that has anything worth reading: rows that fell back
// to the catch-all category, or rows that couldn't be imported at all. A
// clean import stays a toast - no dialog for "everything just worked".
//
// Same visual language as ConfirmDialog, but informational: one OK button.
export function ImportSummaryDialog({ result, onClose }: { result: ImportResult; onClose: () => void }) {
  const { added, defaulted, skipped } = result;
  const matched = added - defaulted;
  const failed = added === 0;

  // "unknown expense category "Bars"" x3 -> one line with a count.
  const reasonCounts = new Map<string, number>();
  for (const s of skipped) reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
  const reasons = [...reasonCounts.entries()].slice(0, 3);

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

        <div className="px-6 pt-4 pb-2 text-center">
          <h3 className="text-neutral-900 font-bold text-lg">
            {failed ? 'Nothing imported' : `${added} transaction${added === 1 ? '' : 's'} imported`}
          </h3>
        </div>

        <div className="px-6 pb-2 flex flex-col gap-2.5">
          {matched > 0 && defaulted > 0 && (
            <div className="flex items-baseline gap-2">
              <span className="text-neutral-900 font-semibold text-sm tabular-nums w-7 text-right flex-shrink-0">{matched}</span>
              <span className="text-neutral-600 text-sm">matched your categories</span>
            </div>
          )}
          {defaulted > 0 && (
            <div className="flex items-baseline gap-2">
              <span className="text-neutral-900 font-semibold text-sm tabular-nums w-7 text-right flex-shrink-0">{defaulted}</span>
              <span className="text-neutral-600 text-sm">
                had no matching category - filed under your catch-all, with the original name kept as a subcategory
              </span>
            </div>
          )}
          {skipped.length > 0 && (
            <div className="flex items-baseline gap-2">
              <span className="text-neutral-900 font-semibold text-sm tabular-nums w-7 text-right flex-shrink-0">{skipped.length}</span>
              <div className="text-neutral-600 text-sm">
                skipped
                <ul className="mt-1 text-neutral-400 text-xs">
                  {reasons.map(([reason, n]) => (
                    <li key={reason} className="truncate">
                      · {reason}{n > 1 ? ` (×${n})` : ''}
                    </li>
                  ))}
                  {reasonCounts.size > 3 && <li>· and {reasonCounts.size - 3} more</li>}
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 pt-3">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl font-semibold text-white active:scale-[0.98] transition-transform"
            style={{ backgroundColor: '#007AFF' }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
