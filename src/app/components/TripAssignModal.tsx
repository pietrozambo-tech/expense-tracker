import { useState } from 'react';
import { Check, Plane, Plus, Slash } from 'lucide-react';
import { t } from '../i18n';
import type { Category } from '../types';
import { useBackClose } from '../lib/useBackClose';

interface TripAssignModalProps {
  count: number;
  /** The trips in the ledger, in the order the caller wants them read.
   *  The hint is what tells two of them apart when the names do not - a
   *  list showing "Formentera" twice says nothing, the same list showing
   *  "1-5 Aug" and "16-26 Aug" needs no explaining. */
  options: { name: string; hint?: string }[];
  /** Where trip rows are filed, named in the note so the category move is not
   *  a surprise. */
  travel: Category;
  onApply: (name: string | null) => void;
  onClose: () => void;
}

/**
 * Where a selection joins a trip, leaves one, or moves between two.
 *
 * One sheet covers all three because they are the same edit: the name on the
 * front of the description is the whole of a trip's identity, so writing it,
 * replacing it and removing it are one operation with three arguments. That is
 * also why merging two trips needs no feature of its own - select the rows of
 * "Azzorre", pick "Azores", done.
 */
export function TripAssignModal({ count, options, travel, onApply, onClose }: TripAssignModalProps) {
  useBackClose(true, onClose);
  const [creating, setCreating] = useState(options.length === 0);
  const [draft, setDraft] = useState('');
  const clean = draft.trim();

  const row = (
    key: string,
    icon: React.ReactNode,
    label: string,
    onClick: () => void,
    tone?: string,
    hint?: string,
  ) => (
    <button
      key={key}
      data-trip-option={key}
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left active:bg-neutral-100"
      style={{ backgroundColor: 'var(--bg-card)' }}
    >
      <span className="flex-shrink-0 w-8 h-8 rounded-lg grid place-items-center" style={{ backgroundColor: 'var(--bg-inset)' }}>
        {icon}
      </span>
      <span style={{ fontSize: 14.5, fontWeight: 500, color: tone ?? 'var(--ink)' }} className="truncate flex-1 min-w-0">
        {label}
      </span>
      {hint && (
        <span className="flex-shrink-0" style={{ fontSize: 11.5, color: 'var(--ink-3, var(--ink-2))' }}>{hint}</span>
      )}
    </button>
  );

  return (
    <div data-overlay className="fixed inset-0 z-[70] flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        data-trip-assign
        className="relative w-full max-w-[430px] mx-auto rounded-t-3xl shadow-xl animate-slide-up flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: 'var(--bg-page)', maxHeight: '85vh' }}
      >
        <div className="px-5 pt-5 pb-3 flex-shrink-0">
          <h2 style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 700 }}>
            {t(count === 1 ? 'sel.tripTitle.one' : 'sel.tripTitle.other', { n: count })}
          </h2>
          <p style={{ color: 'var(--ink-2)', fontSize: 12.5, marginTop: 3, lineHeight: 1.45 }}>
            {t('sel.tripNote', { cat: travel.name })}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-3.5 pb-6 flex flex-col gap-2">
          {creating ? (
            <div className="flex gap-2 items-center px-1">
              <input
                data-trip-new-name
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && clean) onApply(clean);
                }}
                placeholder={t('sel.tripNewPh')}
                className="flex-1 min-w-0 px-4 py-3 rounded-xl outline-none"
                // No fontSize: the floor in theme.css keeps it at 16px, below
                // which iOS zooms the page in the moment the field takes focus.
                style={{
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--line-2)',
                  color: 'var(--ink)',
                }}
              />
              <button
                data-trip-new-apply
                disabled={!clean}
                onClick={() => clean && onApply(clean)}
                className="flex-shrink-0 w-11 h-11 rounded-xl grid place-items-center transition-opacity"
                style={{ backgroundColor: '#4F74F3', opacity: clean ? 1 : 0.4 }}
              >
                <Check size={19} className="text-white" strokeWidth={2.6} />
              </button>
            </div>
          ) : (
            row(
              'new',
              <Plus size={16} style={{ color: 'var(--accent-ink)' }} />,
              t('sel.tripNew'),
              () => setCreating(true),
              'var(--accent-ink)',
            )
          )}

          {options.map(({ name, hint }) =>
            row(
              name,
              <Plane size={15} style={{ color: 'var(--ink-2)' }} />,
              name,
              () => onApply(name),
              undefined,
              hint,
            ),
          )}

          {/* Taking rows out is the same edit with no name, so it belongs on
              the same sheet rather than hiding behind a separate control. */}
          {row(
            'none',
            <Slash size={15} style={{ color: 'var(--ink-2)' }} />,
            t('sel.tripNone'),
            () => onApply(null),
          )}
        </div>
      </div>
    </div>
  );
}
