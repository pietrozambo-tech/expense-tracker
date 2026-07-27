import { formatAmountListView } from '../utils/currency';

type Direction = 'expense' | 'income';
type PeriodType = 'month' | 'quarter' | 'year';

interface PaceCardProps {
  direction: Direction;
  periodType: PeriodType;
  /** Period total in the user's main currency. */
  amount: number;
  /** Explicit limit for the period, or null when the user has not set one. */
  budget: number | null;
  /** What this period usually looks like, from past months. Null without history. */
  usual: number | null;
  currency: string;
  /** Days remaining - only while the period is running. */
  daysLeft: number | null;
  /** 0-1 share of the period elapsed, drawn as the "expected pace" marker. */
  periodProgress: number | null;
}

const GREEN = '#30D158';
const AMBER = '#FF9F0A';
const RED = '#FF3B30';
const GREY = '#8E8E93';

// The card that sits between the Dashboard hero and the Expenses/Income toggle.
//
// It always renders, in every state, so the toggle and everything under it stay
// put when you switch direction - an expenses-only budget bar made the whole
// page jump by its own height. What it *says* adapts:
//
//   expenses + a budget  -> progress against the budget
//   expenses, no budget  -> this period against what you usually spend
//   income               -> this period against what you usually earn
//   no history yet       -> just the total, with the bar in a neutral state
//
// For spending, the pace marker is what makes this a decision aid rather than
// decoration: being at 60% of the budget is good on day 25 and bad on day 5, so
// we draw a tick where the period "should" be by today and phrase the status
// against it.
export function PaceCard({
  direction,
  periodType,
  amount,
  budget,
  usual,
  currency,
  daysLeft,
  periodProgress,
}: PaceCardProps) {
  const target = budget ?? usual;
  const isLive = typeof periodProgress === 'number' && typeof daysLeft === 'number';
  const ratio = target && target > 0 ? amount / target : 0;
  const pct = Math.round(ratio * 100);
  const gap = Math.abs(pct - 100);
  const barWidth = `${Math.min(100, Math.max(ratio * 100, amount > 0 ? 2 : 0))}%`;

  // Slack of 10 points so a single big Monday does not flip the wording.
  const aheadOfPace = isLive && ratio > (periodProgress as number) + 0.1;

  let label: string;
  let statusColor: string;
  let status: string;
  let fill = barWidth;
  let fillColor: string;
  let showTick = false;

  if (budget !== null) {
    label = periodType === 'month' ? 'Monthly budget' : periodType === 'quarter' ? 'Quarterly budget' : 'Yearly budget';
    const over = amount > budget;
    statusColor = over ? RED : aheadOfPace ? AMBER : GREEN;
    status = over
      ? `${pct}% used · Over by ${formatAmountListView(amount - budget, currency, 0)}`
      : !isLive
        ? `${pct}% of budget used`
        : aheadOfPace
          ? `${pct}% used · Spending faster than usual`
          : `${pct}% used · On track`;
    fillColor = statusColor;
    showTick = isLive && !over;
  } else if (usual !== null && direction === 'income') {
    // Income arrives in lumps - one salary on the 27th - so pacing it against
    // the calendar would cry wolf for most of the month. While the period runs
    // we only report how much has landed; the verdict waits until it is over.
    label = 'Income vs usual';
    if (ratio >= 1) {
      statusColor = GREEN;
      status = gap < 2 ? 'In line with your usual' : `${gap}% above your usual`;
    } else if (isLive) {
      statusColor = GREY;
      status = `${pct}% of your usual so far`;
    } else {
      statusColor = gap < 2 ? GREEN : AMBER;
      status = gap < 2 ? 'In line with your usual' : `${gap}% below your usual`;
    }
    fillColor = ratio >= 1 || isLive ? GREEN : statusColor;
  } else if (usual !== null) {
    // Spending without a budget: less is better, but there is no hard limit, so
    // this warns in amber and never in red.
    label = 'Spending vs usual';
    const above = ratio > 1;
    statusColor = above || aheadOfPace ? AMBER : GREEN;
    status = above
      ? gap < 2
        ? 'In line with your usual'
        : `${gap}% above your usual`
      : aheadOfPace
        ? 'Spending faster than usual'
        : isLive
          ? 'On track'
          : gap < 2
            ? 'In line with your usual'
            : `${gap}% below your usual`;
    fillColor = statusColor;
    showTick = isLive && !above;
  } else {
    // First period in the app: no budget, no history. Show the total and say so
    // rather than leaving the slot empty and moving everything below it.
    label = direction === 'income' ? 'Income' : 'Spending';
    statusColor = GREY;
    status = amount > 0 ? 'No history to compare with yet' : 'Nothing logged yet';
    fill = '100%';
    fillColor = direction === 'income' ? 'rgba(48,209,88,0.25)' : 'rgba(255,59,48,0.2)';
  }

  return (
    <div className="px-6 mb-4">
      <div className="rounded-2xl px-4 py-3.5 bg-white shadow-sm">
        <div className="flex items-baseline justify-between mb-2 gap-2">
          <span className="flex-shrink-0" style={{ color: '#1C1C1E', fontSize: 13, fontWeight: 600 }}>
            {label}
          </span>
          <span className="tabular-nums truncate" style={{ color: GREY, fontSize: 13 }}>
            <span style={{ color: budget !== null && amount > budget ? RED : '#1C1C1E', fontWeight: 600 }}>
              {formatAmountListView(amount, currency, 0)}
            </span>
            {budget !== null && ` of ${formatAmountListView(budget, currency, 0)}`}
            {budget === null && usual !== null && ` vs ~${formatAmountListView(usual, currency, 0)} usual`}
          </span>
        </div>

        {/* Track */}
        <div className="relative h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#F2F2F7' }}>
          <div className="h-full rounded-full transition-all" style={{ width: fill, backgroundColor: fillColor }} />
        </div>
        {/* Expected-pace marker, drawn outside the clipped track so it stays visible */}
        {showTick && (
          <div className="relative" style={{ height: 0 }}>
            <div
              className="absolute"
              style={{
                left: `${Math.min(100, (periodProgress as number) * 100)}%`,
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

        <div className="flex items-baseline justify-between mt-2 gap-2">
          <span className="truncate" style={{ color: statusColor, fontSize: 12, fontWeight: 600 }}>
            {status}
          </span>
          {isLive && (
            <span className="flex-shrink-0" style={{ color: GREY, fontSize: 12 }}>
              {daysLeft === 0 ? 'Last day' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
