import { formatAmountListView } from '../utils/currency';

interface BudgetBarProps {
  spent: number; // period spending, already in the user's main currency
  budget: number; // monthly limit, in the user's main currency
  currency: string;
  /** Days left in the month - only meaningful while the month is running. */
  daysLeft?: number | null;
  /** 0-1 share of the month elapsed, drawn as the "expected pace" marker. */
  monthProgress?: number | null;
}

// Monthly budget progress, shown under the Dashboard hero.
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
