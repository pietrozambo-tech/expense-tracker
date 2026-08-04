import { useState } from 'react';
import { X } from 'lucide-react';

// Jump straight to any period instead of stepping the arrows there. Reaching
// October 2025 from August 2026 was eleven taps, which is not a way to look at
// last year.
//
// The picker also carries the period type, so "Q1 2025" is one gesture from a
// month view rather than switch-then-navigate. Choosing a type here keeps the
// year you are looking at; the Period dropdown above the card still resets to
// today, which is the right behaviour for that control and the wrong one here.

export type PeriodType = 'month' | 'quarter' | 'year';

export interface PeriodChoice {
  type: PeriodType;
  year: number;
  month: number;
  quarter: number;
}

interface PeriodPickerModalProps {
  type: PeriodType;
  year: number;
  month: number;
  quarter: number;
  /** Selectable years, ascending. */
  years: number[];
  /** `${year}-${month}` for every month holding at least one transaction. */
  activeMonths: Set<string>;
  onSelect: (choice: PeriodChoice) => void;
  onClose: () => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const QUARTER_RANGE = ['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'];

// One period, month or quarter or year. Module scope, not a closure inside the
// sheet: a component declared during render is a new type on every keystroke of
// state, so every cell would unmount and remount and the tap highlight would
// blink instead of fade.
function Cell({ label, sub, selected, disabled, hasData, onClick }: {
  label: string; sub?: string; selected: boolean; disabled: boolean; hasData: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl flex flex-col items-center justify-center disabled:opacity-30"
      style={{
        height: sub ? '58px' : '52px',
        backgroundColor: selected ? '#EFF6FF' : '#F7F7F8',
        boxShadow: selected ? 'inset 0 0 0 2px #3B82F6' : 'none',
        transition: 'background-color 0.15s ease',
        WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)',
      }}
    >
      <span
        className="text-sm tabular-nums leading-none"
        style={{ color: selected ? '#2563EB' : '#1C1C1E', fontWeight: selected ? 600 : 500 }}
      >
        {label}
      </span>
      {sub && (
        <span className="text-[10px] leading-none mt-1" style={{ color: selected ? '#60A5FA' : '#8E8E93' }}>
          {sub}
        </span>
      )}
      {/* Always present, so a dot appearing never shifts the label. It marks
          the periods worth opening - the ones that actually hold something. */}
      <span
        className="rounded-full mt-1.5"
        style={{
          width: '4px', height: '4px',
          backgroundColor: hasData ? (selected ? '#3B82F6' : '#C7C7CC') : 'transparent',
        }}
      />
    </button>
  );
}

export function PeriodPickerModal({
  type, year, month, quarter, years, activeMonths, onSelect, onClose,
}: PeriodPickerModalProps) {
  // A draft, committed only when a period is tapped: browsing 2025's quarters
  // must not move the dashboard until you have chosen one.
  const [draftType, setDraftType] = useState<PeriodType>(type);
  const [draftYear, setDraftYear] = useState<number>(year);

  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth();
  const curQ = Math.floor(curM / 3);

  const monthHasData = (y: number, m: number) => activeMonths.has(`${y}-${m}`);
  const quarterHasData = (y: number, q: number) =>
    [0, 1, 2].some((i) => monthHasData(y, q * 3 + i));
  const yearHasData = (y: number) => MONTHS.some((_, m) => monthHasData(y, m));

  // The arrows already stop at today; the picker must not offer a way past it.
  const monthAhead = (y: number, m: number) => y > curY || (y === curY && m > curM);
  const quarterAhead = (y: number, q: number) => y > curY || (y === curY && q > curQ);

  const commit = (choice: Partial<PeriodChoice>) =>
    onSelect({ type: draftType, year: draftYear, month, quarter, ...choice });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-[430px] bg-white rounded-t-3xl shadow-2xl animate-slide-up relative z-10"
        onClick={(e) => e.stopPropagation()}
        style={{ transform: 'translateZ(0)' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <h3 className="text-neutral-900 font-semibold">Jump to period</h3>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-xl transition-colors" aria-label="Close">
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        {/* The home indicator sits over the last row of cells otherwise. */}
        <div className="px-6 py-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 28px)' }}>
          {/* Month / Quarter / Year */}
          <div className="flex p-1 rounded-xl" style={{ backgroundColor: '#F2F2F7' }}>
            {(['month', 'quarter', 'year'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setDraftType(t)}
                className="flex-1 py-1.5 rounded-lg text-xs capitalize"
                style={{
                  backgroundColor: draftType === t ? '#FFFFFF' : 'transparent',
                  color: draftType === t ? '#1C1C1E' : '#8E8E93',
                  fontWeight: draftType === t ? 600 : 500,
                  boxShadow: draftType === t ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
                  transition: 'background-color 0.15s ease',
                  WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {draftType === 'year' ? (
            <div className="grid grid-cols-3 gap-2.5 mt-4">
              {years.map((y) => (
                <Cell
                  key={y}
                  label={String(y)}
                  selected={type === 'year' && y === year}
                  disabled={y > curY}
                  hasData={yearHasData(y)}
                  onClick={() => commit({ type: 'year', year: y })}
                />
              ))}
            </div>
          ) : (
            <>
              {/* Which year the grid below belongs to. One tap per year rather
                  than stepping: with a few years of history a chevron pair is
                  the same trap as the arrows this replaces. */}
              <div className="flex gap-2 mt-4 overflow-x-auto scrollbar-hide">
                {years.map((y) => {
                  const on = y === draftYear;
                  return (
                    <button
                      key={y}
                      onClick={() => setDraftYear(y)}
                      className="px-3.5 py-1.5 rounded-full text-xs tabular-nums flex-shrink-0"
                      style={{
                        backgroundColor: on ? '#1C1C1E' : '#F2F2F7',
                        color: on ? '#FFFFFF' : '#8E8E93',
                        fontWeight: on ? 600 : 500,
                        transition: 'background-color 0.15s ease',
                        WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)',
                      }}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>

              {draftType === 'month' ? (
                <div className="grid grid-cols-4 gap-2.5 mt-4">
                  {MONTHS.map((label, m) => (
                    <Cell
                      key={label}
                      label={label}
                      selected={type === 'month' && draftYear === year && m === month}
                      disabled={monthAhead(draftYear, m)}
                      hasData={monthHasData(draftYear, m)}
                      onClick={() => commit({ type: 'month', year: draftYear, month: m })}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 mt-4">
                  {[0, 1, 2, 3].map((q) => (
                    <Cell
                      key={q}
                      label={`Q${q + 1}`}
                      sub={QUARTER_RANGE[q]}
                      selected={type === 'quarter' && draftYear === year && q === quarter}
                      disabled={quarterAhead(draftYear, q)}
                      hasData={quarterHasData(draftYear, q)}
                      onClick={() => commit({ type: 'quarter', year: draftYear, quarter: q })}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
