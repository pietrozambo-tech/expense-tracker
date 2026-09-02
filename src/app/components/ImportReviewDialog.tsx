import { useState } from 'react';
import { t } from '../i18n';
import { Check, Layers } from 'lucide-react';
import type { ImportResult, ProposedSubcategory } from '../lib/importData';
import { proposalKey } from '../lib/importData';
import { useBackClose } from '../lib/useBackClose';

// Shown BEFORE an import commits, when the file references subcategories the
// user doesn't have. The import may propose taxonomy, never commit it: every
// name here becomes a chip only if it leaves this sheet checked. Unchecked
// ones still import their rows - categorised, just without the subcategory.
export function ImportReviewDialog({
  result,
  onConfirm,
  onCancel,
}: {
  result: ImportResult;
  onConfirm: (approvedKeys: Set<string>) => void;
  onCancel: () => void;
}) {
  useBackClose(true, onCancel);
  const proposals = result.proposedSubcategories;
  // Nothing starts checked. It used to be the reverse ("approving the lot
  // stays one tap"), and that default is how a deleted subcategory kept
  // coming back: a trip file asking for "Hotel" landed here pre-ticked, and
  // one tap on Import re-added the chip its owner had deliberately removed -
  // on every import, for ever. Growing the user's own taxonomy is an opt-in,
  // not a toll on the way past; the rows import either way, just without the
  // unapproved subcategory.
  const [approved, setApproved] = useState<Set<string>>(() => new Set());

  const toggle = (p: ProposedSubcategory) => {
    const k = proposalKey(p);
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6 max-w-[430px] mx-auto">
      <div className="bg-white rounded-2xl w-full max-w-sm flex flex-col" style={{ maxHeight: '80vh' }}>
        <div className="pt-6 px-6 flex justify-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--wash-accent2)' }}>
            <Layers className="w-8 h-8" style={{ color: '#3D5BE0' }} strokeWidth={2} />
          </div>
        </div>

        <div className="px-6 pt-4 pb-1 text-center">
          <h3 className="text-neutral-900 font-bold text-lg">
            {proposals.length === 1
              ? t('imp.newSub.one')
              : t('imp.newSub.other', { n: proposals.length })}
          </h3>
          <p className="text-neutral-500 text-[13px] leading-relaxed mt-1.5">
            {t('imp.newSubBody')}
          </p>
        </div>

        <div className="px-4 py-3 overflow-y-auto">
          {proposals.map((p) => {
            const on = approved.has(proposalKey(p));
            return (
              <button
                key={proposalKey(p)}
                onClick={() => toggle(p)}
                data-import-proposal={on ? 'on' : 'off'}
                className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-left transition-colors"
              >
                <span
                  className="flex items-center justify-center flex-shrink-0 transition-all"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 7,
                    backgroundColor: on ? '#4F74F3' : 'var(--bg-card)',
                    border: on ? '1px solid #4F74F3' : '1.5px solid var(--ghost-2)',
                  }}
                >
                  {on && <Check className="w-3.5 h-3.5" style={{ color: '#FFFFFF' }} strokeWidth={3} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-medium truncate" style={{ color: 'var(--ink)' }}>
                    {p.name}
                  </span>
                  <span className="block text-[12px]" style={{ color: 'var(--ink-2)' }}>
                    {t(p.rows === 1 ? 'imp.proposalMeta.one' : 'imp.proposalMeta.other', { cat: p.categoryName, n: p.rows })}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="px-4 pb-4 pt-1 flex flex-col gap-1">
          <button
            onClick={() => onConfirm(approved)}
            className="w-full py-3.5 rounded-xl font-medium text-[15px] transition-all active:scale-[0.98]"
            style={{ backgroundColor: '#4F74F3', color: '#FFFFFF' }}
          >
            {t(result.added === 1 ? 'imp.importCta.one' : 'imp.importCta.other', { n: result.added })}
          </button>
          <button onClick={onCancel} className="w-full py-2.5 text-[14px] font-medium" style={{ color: 'var(--ink-2)' }}>{t('imp.cancelImport')}</button>
        </div>
      </div>
    </div>
  );
}
