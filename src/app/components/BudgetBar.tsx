import { useState } from 'react';
import { X, Target } from 'lucide-react';
import { formatAbbreviatedAmount, CURRENCIES } from '../utils/currency';
import { t } from '../i18n';
import { AmountText } from './AmountText';
import { FitText } from './FitText';

// Softer than the iOS system colours the rest of the app uses for accents. A
// full-width bar is a lot more pixels than an icon, so #FF3B30/#30D158 at full
// saturation shout from a white card. Each state pairs a muted fill with a
// deeper, darker text tone - which also gets the 12px status line to ~5:1 on
// white, where the vivid colours sat at 2:1 and were genuinely hard to read.
const TONES = {
  good: { fill: '#5FC08C', text: '#2C7A54' },
  warn: { fill: '#EFB264', text: '#96631A' },
  over: { fill: '#E8837A', text: '#B44A40' },
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
          <span className="flex-shrink-0" style={{ color: '#1C1C1E', fontSize: 13, fontWeight: 600 }}>
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
                  <span style={{ color: over ? tone.text : '#1C1C1E', fontWeight: 600 }}>
                    <AmountText amount={spent} currency={currency} decimals={0} abbreviate="fit" />
                  </span>
                  {` ${t('budget.of')} `}
                  <AmountText amount={budget} currency={currency} decimals={0} abbreviate="fit" />
                </>
              }
              className="tabular-nums"
              style={{ color: '#8E8E93' }}
            >
              <span style={{ color: over ? tone.text : '#1C1C1E', fontWeight: 600 }}>
                <AmountText amount={spent} currency={currency} decimals={0} />
              </span>
              {` ${t('budget.of')} `}
              <AmountText amount={budget} currency={currency} decimals={0} />
            </FitText>
          </div>
        </div>

        {/* Track */}
        <div className="relative h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#F2F1ED' }}>
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
            <span className="flex-shrink-0" style={{ color: '#8E8E93', fontSize: 12, fontWeight: 500 }}>
              {t('budget.pctUsed', { pct })}
            </span>
            {/* Status as a chip: the state gets a shape, not just a colour. */}
            <span
              className="truncate"
              style={{
                color: tone.text,
                backgroundColor: tone === TONES.good ? '#E7F4ED' : tone === TONES.warn ? '#FAF0DC' : '#FAE7E4',
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
            <span style={{ color: '#8E8E93', fontSize: 12 }}>
              {daysLeft === 0
                ? t('budget.lastDay')
                : t(daysLeft === 1 ? 'budget.dayLeft.one' : 'budget.dayLeft.other', { n: daysLeft })}
            </span>
          )}
        </div>
        {/* The actionable number: what the remaining budget allows per day.
            Shown only while following it is possible - it vanishes once the
            month is over budget, on the last day (nothing left to pace), and
            when the allowance falls under ~10% of the budget's own daily pace:
            "spend up to 1EUR/day" is arithmetic wearing a straight face, and
            the status chip already says how the month is going. Floored, not
            rounded - advice that says "up to" must not overshoot. */}
        {(() => {
          if (!isLive || over || (daysLeft as number) < 1) return null;
          const allowance = Math.floor((budget - spent) / (daysLeft as number));
          const daysInMonth = Math.round((daysLeft as number) / (1 - (monthProgress as number)));
          if (allowance < (budget / daysInMonth) * 0.1) return null;
          return (
            <div style={{ marginTop: 8, fontSize: 12, color: '#8E8E93' }}>
              {t('budget.perDayPre')}{' '}
              <span style={{ color: '#1C1C1E', fontWeight: 700 }}>
                <AmountText amount={allowance} currency={currency} decimals={0} />
              </span>{' '}
              {t('budget.perDayPost')}
            </div>
          );
        })()}

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
          'aria-label': t('budget.nudge.aria'),
          onClick: () => setEditing(true),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setEditing(true);
            }
          },
        })}
      >
        {/* The title only earns its line once there is a form under it. At
            rest this card is a single offer, and "Monthly Budget" above "Set a
            monthly limit..." was the same sentence twice. */}
        {editing && (
          <div className="flex items-center justify-between mb-2">
            <span style={{ color: '#1C1C1E', fontSize: 13, fontWeight: 600 }}>{t('budget.title')}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditing(false);
              }}
              aria-label={t('budget.nudge.cancel')}
              className="-m-1 p-1 rounded-full transition-colors"
              style={{ color: '#C7C7CC' }}
            >
              <X className="w-4 h-4" strokeWidth={2.5} />
            </button>
          </div>
        )}

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
                  placeholder={t('budget.nudge.placeholder')}
                  className="flex-1 min-w-0 py-2 bg-transparent outline-none tabular-nums"
                  // 16, not 15: below that iOS zooms the page in on focus. See
                  // the form-control floor in theme.css.
                  style={{ fontSize: 16, color: '#1C1C1E' }}
                />
              </div>
              <button
                onClick={save}
                disabled={!valid}
                className="px-4 py-2 rounded-xl font-medium transition-all active:scale-[0.97] flex-shrink-0"
                style={{
                  backgroundColor: valid ? '#4F74F3' : '#E5E5EA',
                  color: '#FFFFFF',
                  fontSize: 14,
                }}
              >
                {t('budget.nudge.save')}
              </button>
            </div>
            <p style={{ color: '#B0B0B5', fontSize: 12, marginTop: 6 }}>
              {t('budget.nudge.hint')}
            </p>
          </>
        ) : (
          // No empty track. A zero-length progress bar is a widget announcing
          // it has nothing to show, and it sat second on the home screen. One
          // line, a third of the height, reading as an offer rather than a gap.
          <div className="flex items-center gap-2.5">
            <span
              className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: '#EEF1FE' }}
            >
              <Target className="w-[18px] h-[18px]" style={{ color: '#4F74F3' }} strokeWidth={2.2} />
            </span>
            <span className="flex-1" style={{ color: '#1C1C1E', fontSize: 14, fontWeight: 600 }}>
              {t('budget.nudge.title')}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              aria-label={t('budget.nudge.hide')}
              className="-m-1 p-1 rounded-full transition-colors flex-shrink-0"
              style={{ color: '#C7C7CC' }}
            >
              <X className="w-4 h-4" strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
