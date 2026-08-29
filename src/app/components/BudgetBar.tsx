import { useState } from 'react';
import { X, Target } from 'lucide-react';
import { formatAbbreviatedAmount, CURRENCIES } from '../utils/currency';
import { t } from '../i18n';
import { AmountText } from './AmountText';
import { FitText } from './FitText';
import { dailyAllowance } from '../lib/budget';

// Softer than the iOS system colours the rest of the app uses for accents. A
// full-width bar is a lot more pixels than an icon, so #FF3B30/#30D158 at full
// saturation shout from a white card. Each state pairs a muted fill with a
// deeper, darker text tone - which also gets the 12px status line to ~5:1 on
// white, where the vivid colours sat at 2:1 and were genuinely hard to read.
const TONES = {
  good: { fill: '#5FC08C', text: 'var(--tone-good)' },
  warn: { fill: '#EFB264', text: 'var(--tone-warn)' },
  over: { fill: '#E8837A', text: 'var(--tone-over)' },
};

interface BudgetBarProps {
  spent: number; // period spending, already in the user's main currency
  budget: number; // monthly limit, in the user's main currency
  currency: string;
  /** Days left in the month - only meaningful while the month is running. */
  daysLeft?: number | null;
  /** 0-1 share of the month elapsed, drawn as the "expected pace" marker. */
  monthProgress?: number | null;
  /** What this user had typically spent by this day of the month, averaged
   *  over their previous tracked months. Null with no history. */
  usualByNow?: number | null;
}

// Monthly budget progress. Sits under the Expenses/Income toggle, not above it,
// so that switching direction (where the bar has no meaning and is hidden)
// leaves the toggle itself exactly where it was.
//
// The pace marker is what makes this a decision aid rather than decoration:
// being at 60% of the budget is good on day 25 and bad on day 5, so we draw a
// tick where spending "should" be by today and phrase the status against it.
export function BudgetBar({ spent, budget, currency, daysLeft, monthProgress, usualByNow }: BudgetBarProps) {
  if (!budget || budget <= 0) return null;

  const ratio = spent / budget;
  const pct = Math.round(ratio * 100);
  const over = spent > budget;
  const isLive = typeof monthProgress === 'number' && typeof daysLeft === 'number';

  // "Usual" means this user's own previous months at the same day - not the
  // clock. Spending is not linear: rent on the 1st put anyone at "25% used" on
  // day one and the old time-based check (ratio > monthProgress + 0.1) scolded
  // them every single month for their most predictable expense. The slack is
  // multiplicative plus a slice of the budget, so a 20EUR coffee against a
  // 5EUR usual does not shout either. With no history yet, time is the only
  // yardstick there is - first months keep the old rule.
  const hasUsual = isLive && typeof usualByNow === 'number';
  const aheadOfPace = hasUsual
    ? spent > (usualByNow as number) * 1.1 + budget * 0.05
    : isLive && ratio > (monthProgress as number) + 0.1;

  // The tick marks where spending "should" be by today under the same yardstick
  // the status text uses - the user's own usual when known, time otherwise.
  const paceShare = hasUsual ? (usualByNow as number) / budget : (monthProgress as number);

  const tone = over ? TONES.over : aheadOfPace ? TONES.warn : TONES.good;
  // A finished month gets a verdict, not a forecast: "on track" is meaningless
  // once there is nothing left to track, and restating the percentage next to
  // "N% used" just says the same thing twice.
  const settled = Math.round(Math.abs(budget - spent)) === 0;
  const status = over ? (
    <>{t('budget.overBy')} <AmountText amount={spent - budget} currency={currency} decimals={0} /></>
  ) : settled ? (
    t('budget.onBudget')
  ) : !isLive ? (
    <>{t('budget.underBy')} <AmountText amount={budget - spent} currency={currency} decimals={0} /></>
  ) : aheadOfPace ? (
    t('budget.faster')
  ) : (
    t('budget.onTrack')
  );

  return (
    <div className="px-6 mb-4">
      <div className="rounded-2xl px-4 py-3.5 bg-white shadow-sm">
        <div className="flex items-baseline justify-between mb-2 gap-2">
          <span className="flex-shrink-0" style={{ color: 'var(--ink)', fontSize: 13, fontWeight: 600 }}>
            {t('budget.title')}
          </span>
          {/* Two amounts and a currency code can outgrow the row - let them
              shrink rather than ellipsise the number the card exists to show. */}
          <div className="min-w-0 flex-1 text-right">
            <FitText
              max={13}
              min={11}
              compact={`${formatAbbreviatedAmount(spent, currency)} ${t('budget.of')} ${formatAbbreviatedAmount(budget, currency)}`}
              compactNode={
                <>
                  <span style={{ color: over ? tone.text : 'var(--ink)', fontWeight: 600 }}>
                    <AmountText amount={spent} currency={currency} decimals={0} abbreviate="fit" />
                  </span>
                  {` ${t('budget.of')} `}
                  <AmountText amount={budget} currency={currency} decimals={0} abbreviate="fit" />
                </>
              }
              className="tabular-nums"
              style={{ color: 'var(--ink-2)' }}
            >
              <span style={{ color: over ? tone.text : 'var(--ink)', fontWeight: 600 }}>
                <AmountText amount={spent} currency={currency} decimals={0} />
              </span>
              {` ${t('budget.of')} `}
              <AmountText amount={budget} currency={currency} decimals={0} />
            </FitText>
          </div>
        </div>

        {/* Track */}
        <div className="relative h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-inset)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, Math.max(ratio * 100, spent > 0 ? 2 : 0))}%`,
              // Healthy spending gets a living green-to-teal sweep; the warning
              // and over states stay flat - a gradient would prettify exactly
              // the states that should feel plain.
              background: tone === TONES.good ? 'linear-gradient(90deg, #5FC08C, #2BB3A3)' : tone.fill,
            }}
          />
        </div>
        {/* Expected-pace marker, drawn outside the clipped track so it stays visible */}
        {isLive && !over && (
          <div className="relative" style={{ height: 0 }}>
            <div
              className="absolute"
              style={{
                left: `${Math.min(100, paceShare * 100)}%`,
                top: -12,
                width: 2,
                height: 12,
                backgroundColor: 'rgba(0,0,0,0.22)',
                borderRadius: 1,
              }}
              aria-hidden="true"
            />
          </div>
        )}

        <div className="flex items-center justify-between mt-2">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="flex-shrink-0" style={{ color: 'var(--ink-2)', fontSize: 12, fontWeight: 500 }}>
              {t('budget.pctUsed', { pct })}
            </span>
            {/* Status as a chip: the state gets a shape, not just a colour. */}
            <span
              className="truncate"
              style={{
                color: tone.text,
                backgroundColor: tone === TONES.good ? 'var(--wash-green)' : tone === TONES.warn ? 'var(--wash-warn)' : 'var(--wash-over)',
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              {status}
            </span>
          </span>
          {isLive && (
            <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>
              {daysLeft === 0
                ? t('budget.lastDay')
                : t(daysLeft === 1 ? 'budget.dayLeft.one' : 'budget.dayLeft.other', { n: daysLeft })}
            </span>
          )}
        </div>
        {/* The actionable number: what the remaining budget allows per day,
            when there is a point in saying it. Both the figure and that
            judgement live in lib/budget.ts - see dailyAllowance for why it is
            a band with two edges rather than a floor. */}
        {(() => {
          if (!isLive) return null;
          const allowance = dailyAllowance(spent, budget, daysLeft as number, monthProgress as number);
          if (allowance === null) return null;
          const line = `${t('budget.perDayPre')} ${formatAbbreviatedAmount(allowance, currency)} ${t('budget.perDayPost')}`;
          return (
            <div style={{ marginTop: 8 }}>
              {/* One line, always. The old copy ran to two on a 390pt phone,
                  which turned a footnote into a paragraph; it is shorter now,
                  and measured on top of that so a long currency code or a
                  wordier translation shrinks the sentence instead of wrapping
                  it. */}
              <FitText
                max={12}
                min={10.5}
                compact={line}
                style={{ color: 'var(--ink-2)' }}
              >
                {t('budget.perDayPre')}{' '}
                <span style={{ color: 'var(--ink)', fontWeight: 700 }}>
                  <AmountText amount={allowance} currency={currency} decimals={0} />
                </span>{' '}
                {t('budget.perDayPost')}
              </FitText>
            </div>
          );
        })()}

      </div>
    </div>
  );
}

// The "set a monthly budget" card that used to live here is gone. It was the
// second to-do card on the Dashboard - the setup checklist asked for
// categories and accounts at the top, this asked for a budget half a screen
// below, and the two read as unrelated chores. It is the third line of that
// checklist now, still answered inline (see NudgeCenter); the bar above, which
// reports a budget that already exists, is a different job and stays.
