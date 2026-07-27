import { useState } from 'react';
import { X } from 'lucide-react';
import { formatAmountListView, CURRENCIES } from '../utils/currency';

interface BudgetBarProps {
  spent: number; // period spending, already in the user's main currency
  budget: number; // monthly limit, in the user's main currency
  currency: string;
  /** Days left in the month - only meaningful while the month is running. */
  daysLeft?: number | null;
  /** 0-1 share of the month elapsed, drawn as the "expected pace" marker. */
  monthProgress?: number | null;
}

// Monthly budget progress. Sits under the Expenses/Income toggle, not above it,
// so that switching direction (where the bar has no meaning and is hidden)
// leaves the toggle itself exactly where it was.
//
// The pace marker is what makes this a decision aid rather than decoration:
// being at 60% of the budget is good on day 25 and bad on day 5, so we draw a
// tick where spending "should" be by today and phrase the status against it.
export function BudgetBar({ spent, budget, currency, daysLeft, monthProgress }: BudgetBarProps) {
  if (!budget || budget <= 0) return null;

  const ratio = spent / budget;
  const pct = Math.round(ratio * 100);
  const over = spent > budget;
  const isLive = typeof monthProgress === 'number' && typeof daysLeft === 'number';

  // On pace = spending no faster than the month is passing (with a little slack).
  const aheadOfPace = isLive && ratio > (monthProgress as number) + 0.1;

  const color = over ? '#FF3B30' : aheadOfPace ? '#FF9F0A' : '#30D158';
  const status = over
    ? `Over by ${formatAmountListView(spent - budget, currency, 0)}`
    : !isLive
      ? `${pct}% of budget`
      : aheadOfPace
        ? 'Spending faster than usual'
        : 'On track';

  return (
    <div className="px-6 mb-4">
      <div className="rounded-2xl px-4 py-3.5 bg-white shadow-sm">
        <div className="flex items-baseline justify-between mb-2">
          <span style={{ color: '#1C1C1E', fontSize: 13, fontWeight: 600 }}>Monthly budget</span>
          <span className="tabular-nums" style={{ color: '#8E8E93', fontSize: 13 }}>
            <span style={{ color: over ? '#FF3B30' : '#1C1C1E', fontWeight: 600 }}>
              {formatAmountListView(spent, currency, 0)}
            </span>
            {' of '}
            {formatAmountListView(budget, currency, 0)}
          </span>
        </div>

        {/* Track */}
        <div className="relative h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#F2F2F7' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(100, Math.max(ratio * 100, spent > 0 ? 2 : 0))}%`, backgroundColor: color }}
          />
        </div>
        {/* Expected-pace marker, drawn outside the clipped track so it stays visible */}
        {isLive && !over && (
          <div className="relative" style={{ height: 0 }}>
            <div
              className="absolute"
              style={{
                left: `${Math.min(100, (monthProgress as number) * 100)}%`,
                top: -12,
                width: 2,
                height: 12,
                backgroundColor: 'rgba(0,0,0,0.28)',
                borderRadius: 1,
              }}
              aria-hidden="true"
            />
          </div>
        )}

        <div className="flex items-baseline justify-between mt-2">
          <span style={{ color, fontSize: 12, fontWeight: 600 }}>
            {pct}% used · {status}
          </span>
          {isLive && (
            <span style={{ color: '#8E8E93', fontSize: 12 }}>
              {daysLeft === 0 ? 'Last day' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface BudgetNudgeProps {
  currency: string;
  onSave: (value: number) => void;
  onDismiss: () => void;
}

// Shown in the bar's place until the user has a budget: an empty track that
// invites a tap. Setting the limit happens inline rather than in a modal - the
// card is already below the toggle, so expanding it only pushes the categories
// down, and there is no overlay to fight the Dashboard's stacking contexts.
//
// Dismissing hides it for good; the bar comes back on its own the moment a
// budget exists, whether it was set here or in Settings > Profile.
export function BudgetNudge({ currency, onSave, onDismiss }: BudgetNudgeProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');

  const parsed = parseFloat(value.trim().replace(',', '.'));
  const valid = isFinite(parsed) && parsed > 0;

  const save = () => {
    if (!valid) return;
    onSave(parsed);
  };

  return (
    <div className="px-6 mb-4">
      <div
        className="rounded-2xl px-4 py-3.5 bg-white shadow-sm"
        {...(!editing && {
          role: 'button',
          tabIndex: 0,
          'aria-label': 'Set a monthly budget',
          onClick: () => setEditing(true),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setEditing(true);
            }
          },
        })}
      >
        <div className="flex items-center justify-between mb-2">
          <span style={{ color: '#1C1C1E', fontSize: 13, fontWeight: 600 }}>Monthly budget</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (editing) setEditing(false);
              else onDismiss();
            }}
            aria-label={editing ? 'Cancel' : 'Hide budget suggestion'}
            className="-m-1 p-1 rounded-full transition-colors"
            style={{ color: '#C7C7CC' }}
          >
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>

        {editing ? (
          <>
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-1.5 px-3 rounded-xl flex-1 min-w-0"
                style={{ border: '1px solid #E5E5EA' }}
              >
                <span style={{ color: '#8E8E93', fontSize: 15 }}>{CURRENCIES[currency]?.symbol ?? ''}</span>
                <input
                  autoFocus
                  type="text"
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => {
                    const v = e.target.value.replace(',', '.');
                    if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setValue(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') save();
                  }}
                  placeholder="How much per month?"
                  className="flex-1 min-w-0 py-2 bg-transparent outline-none tabular-nums"
                  style={{ fontSize: 15, color: '#1C1C1E' }}
                />
              </div>
              <button
                onClick={save}
                disabled={!valid}
                className="px-4 py-2 rounded-xl font-medium transition-all active:scale-[0.97] flex-shrink-0"
                style={{
                  backgroundColor: valid ? '#007AFF' : '#E5E5EA',
                  color: '#FFFFFF',
                  fontSize: 14,
                }}
              >
                Save
              </button>
            </div>
            <p style={{ color: '#B0B0B5', fontSize: 12, marginTop: 6 }}>
              Change it anytime in Settings - Profile.
            </p>
          </>
        ) : (
          <>
            <div className="h-2 rounded-full" style={{ backgroundColor: '#F2F2F7' }} />
            <div className="mt-2">
              <span style={{ color: '#007AFF', fontSize: 12, fontWeight: 600 }}>
                Set a monthly limit to track how you're doing
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
