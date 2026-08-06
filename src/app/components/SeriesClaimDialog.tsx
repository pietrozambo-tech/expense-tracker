import { useState } from 'react';
import { Check, Repeat } from 'lucide-react';
import type { SeriesClaim } from '../lib/recurrence';
import { AmountText } from './AmountText';

// Older transactions that look like the history of series the user already
// has. A checklist rather than a single yes/no, because the match is no longer
// only "same wording": a bill named "Affitto" is claimed by a monthly rent
// series on the strength of its category, amount and cadence, and a claim made
// on those grounds has to be visible before it is accepted.
//
// Everything starts checked, so the common case stays one tap; unchecking is
// itself an answer, and the caller remembers it.
export function SeriesClaimDialog({
  claims,
  currency,
  onConfirm,
  onCancel,
}: {
  claims: SeriesClaim[];
  currency: string;
  onConfirm: (approved: SeriesClaim[]) => void;
  onCancel: () => void;
}) {
  const [approved, setApproved] = useState<Set<number>>(() => new Set(claims.map((_, i) => i)));

  const toggle = (i: number) =>
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const total = claims.reduce((sum, c, i) => (approved.has(i) ? sum + c.rows.length : sum), 0);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6 max-w-[430px] mx-auto">
      <div className="bg-white rounded-2xl w-full max-w-sm flex flex-col" style={{ maxHeight: '80vh' }}>
        <div className="pt-6 px-6 flex justify-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#EFF6FF' }}>
            <Repeat className="w-8 h-8" style={{ color: '#2563EB' }} strokeWidth={2} />
          </div>
        </div>

        <div className="px-6 pt-4 pb-1 text-center">
          <h3 className="text-neutral-900 font-bold text-lg">Mark past transactions as recurring?</h3>
          <p className="text-neutral-500 text-[13px] leading-relaxed mt-1.5">
            These older transactions look like history of series you already have. Marking
            them only labels the past - your schedules stay exactly as they are.
          </p>
        </div>

        <div className="px-4 py-3 overflow-y-auto">
          {claims.map((c, i) => {
            const on = approved.has(i);
            const seriesName = c.rule.template.description ?? 'your series';
            const sameWording = c.confidence === 'exact';
            return (
              <button
                key={`${c.rule.id}|${c.label}`}
                onClick={() => toggle(i)}
                className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-left transition-colors"
              >
                <span
                  className="flex items-center justify-center flex-shrink-0 transition-all"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 7,
                    backgroundColor: on ? '#3B82F6' : '#FFFFFF',
                    border: on ? '1px solid #3B82F6' : '1.5px solid #D1D1D6',
                  }}
                >
                  {on && <Check className="w-3.5 h-3.5" style={{ color: '#FFFFFF' }} strokeWidth={3} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-medium truncate" style={{ color: '#1C1C1E' }}>
                    {c.label}
                  </span>
                  <span className="block text-[12px]" style={{ color: '#8E8E93' }}>
                    {c.rows.length} transaction{c.rows.length === 1 ? '' : 's'} · typically{' '}
                    <AmountText amount={c.medianAmount} currency={currency} decimals={0} />
                  </span>
                  {/* Say WHY, so a claim on a differently worded bill can be
                      judged rather than just trusted. */}
                  {/* Wraps rather than truncates: a claim made on shape has to
                      be readable in full to be judged. */}
                  <span className="block text-[12px] leading-snug" style={{ color: sameWording ? '#8E8E93' : '#C77700' }}>
                    {sameWording ? `joins "${seriesName}"` : `joins "${seriesName}" - same category, similar amount, monthly`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="px-4 pb-4 pt-1 flex flex-col gap-1">
          <button
            onClick={() => onConfirm(claims.filter((_, i) => approved.has(i)))}
            disabled={total === 0}
            className="w-full py-3.5 rounded-xl font-medium text-[15px] transition-all active:scale-[0.98]"
            style={{
              backgroundColor: total === 0 ? '#E5E5EA' : '#3B82F6',
              color: total === 0 ? '#9CA3AF' : '#FFFFFF',
            }}
          >
            {total === 0 ? 'Nothing selected' : `Mark ${total} transaction${total === 1 ? '' : 's'} recurring`}
          </button>
          <button onClick={onCancel} className="w-full py-2.5 text-[14px] font-medium" style={{ color: '#8E8E93' }}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
