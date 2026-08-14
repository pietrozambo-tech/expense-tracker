import { useMemo, useState } from 'react';
import { ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';
import { t } from '../i18n';
import { monthsFull } from '../i18n/store';
import { AmountText } from './AmountText';
import { ConfirmDialog } from './ConfirmDialog';
import { SharedDrilldown } from './SharedDrilldown';
import { getCategoryIcon } from './categoryIcons';
import { homeAmount, mineAmount, formatAmountListView, CURRENCIES } from '../utils/currency';
import { isShared, runningBalance } from '../lib/shared';
import { paidBy } from '../lib/sharedSync';
import type { Household, Person, Settlement, Transaction } from '../types';

// Ring geometry, and the two colours that stand for the two of you.
//
// You are the neutral one and they are the coloured one, the same way the
// avatars work everywhere else - and on this dark card neutral has to mean
// near-white, not the near-black the switcher uses on a light background.
const DONUT = 86;
const RING_W = 13;
const RING_R = (DONUT - RING_W) / 2;
const CIRC = 2 * Math.PI * RING_R;
const YOU_COLOR = 'rgba(255,255,255,0.92)';

/** "Jul", "Q2", "2025" - what the trend column is measured against. */
function priorLabel(
  type: 'month' | 'quarter' | 'year',
  p: { year: number; month: number; quarter: number },
): string {
  if (type === 'year') return String(p.year);
  if (type === 'quarter') return `Q${p.quarter + 1}`;
  return monthsFull()[p.month].slice(0, 3);
}

// The Dashboard's other subject: not "how am I doing" but "what do WE spend".
//
// Everything here shows FULL amounts - the household's money - because the
// personal view already shows your half and halving it again here would hide
// what living together actually costs. The one number that is not monthly is
// the balance: a debt does not reset on the 1st, so it sits in its own card
// labelled running while the hero and the category list follow the period the
// header's pill selects.
export interface SharedViewProps {
  transactions: Transaction[];
  settlements: Settlement[];
  household: Household;
  partner: Person;
  currency: string;
  userName: string;
  /** Record a settlement of the current balance. */
  onSettle: (amount: number) => void;
  /** The Dashboard tab's period cursor - month, quarter or year - not a copy
   *  of it. Both subjects read the one cursor, so the pill in the header keeps
   *  meaning the same thing and crossing between them keeps your place.
   *  `quarter` and `month` are both carried because the parent tracks them
   *  separately; only the one the lens names is read. */
  period: { type: 'month' | 'quarter' | 'year'; year: number; month: number; quarter: number };
  /** Rendered in the hero, produced by the parent so the two views can never
   *  name the same period differently. */
  periodLabel: string;
  /** True at the period containing today: the forward chevron stops there,
   *  because empty future months are not a view of anything. */
  atLatest: boolean;
  onPrevPeriod: () => void;
  onNextPeriod: () => void;
  /** Open the period picker - the same sheet the personal hero's title opens,
   *  owned by the parent because it writes the parent's cursor. */
  onPickPeriod: () => void;
}

export function SharedView({
  transactions,
  settlements,
  household,
  partner,
  currency,
  userName,
  onSettle,
  period,
  periodLabel,
  atLatest,
  onPrevPeriod,
  onNextPeriod,
  onPickPeriod,
}: SharedViewProps) {
  const [confirmSettle, setConfirmSettle] = useState(false);
  // Same two-state toggle the personal Categories card uses, and deliberately
  // the same two states: biggest-first to see where the money goes, A-Z to
  // find one category among many. Not persisted, like its counterpart.
  const [sortBy, setSortBy] = useState<'amount' | 'alphabetical'>('amount');
  // Which category is showing its subcategories, and which slice is open as a
  // list of transactions. Same two-step as the personal Dashboard.
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drilldown, setDrilldown] = useState<
    { title: string; subtitle?: string; items: Transaction[]; settled?: Settlement[] } | null
  >(null);
  const { type: periodType, year, month, quarter } = period;

  // The same period without repeating the year the hero already shows.
  const periodShort =
    periodType === 'year' ? String(year) : periodType === 'quarter' ? `Q${quarter + 1}` : monthsFull()[month];

  // Shared expenses of the visible period, at full value.
  const periodShared = useMemo(
    () =>
      transactions.filter((txn) => {
        if (!isShared(txn) || txn.type === 'income') return false;
        const y = Number(txn.date.slice(0, 4));
        const m = Number(txn.date.slice(5, 7)) - 1;
        if (y !== year) return false;
        if (periodType === 'year') return true;
        if (periodType === 'quarter') return Math.floor(m / 3) === quarter;
        return m === month;
      }),
    [transactions, month, quarter, year, periodType],
  );

  // Settlements of the visible period, for the all-items sheet. The BALANCE
  // still ignores periods entirely - a debt does not reset on the 1st.
  const periodSettlements = useMemo(
    () =>
      settlements.filter((s) => {
        if (!household.memberIds.includes(s.personId)) return false;
        const y = Number(s.date.slice(0, 4));
        const m = Number(s.date.slice(5, 7)) - 1;
        if (y !== year) return false;
        if (periodType === 'year') return true;
        if (periodType === 'quarter') return Math.floor(m / 3) === quarter;
        return m === month;
      }),
    [settlements, household, month, quarter, year, periodType],
  );

  const together = periodShared.reduce((sum, txn) => sum + homeAmount(txn, currency), 0);
  // Who was actually out of pocket. A replica is a row she authored, so she
  // paid the shop; everything else is mine. This read the household total on
  // my side and a hard zero on hers while pairing was still being built.
  const { mine: youPaid, theirs: partnerPaid } = paidBy(periodShared, (t) => homeAmount(t, currency));
  // What the household's spending actually cost YOU. Usually half, but the
  // split rule decides, so it is summed rather than halved.
  const yourShare = periodShared.reduce((sum, txn) => sum + mineAmount(txn, currency), 0);

  const paidSegments = (() => {
    if (together <= 0) return [];
    const mineLen = (youPaid / together) * CIRC;
    return [
      { key: 'me', color: YOU_COLOR, length: mineLen, offset: 0 },
      { key: 'them', color: partner.color, length: (partnerPaid / together) * CIRC, offset: mineLen },
    ].filter((seg) => seg.length > 0);
  })();

  // Grouped the way the personal Dashboard groups: category, then the
  // subcategories inside it, and the transactions themselves one tap further.
  // Keyed by name because that is what the row displays and what the two
  // accounts can disagree on the id of.
  const byCategory = useMemo(() => {
    const totals = new Map<
      string,
      { total: number; category: Transaction['category']; items: Transaction[] }
    >();
    for (const txn of periodShared) {
      const key = txn.category?.name ?? '?';
      const entry = totals.get(key);
      const value = homeAmount(txn, currency);
      if (entry) {
        entry.total += value;
        entry.items.push(txn);
      } else {
        totals.set(key, { total: value, category: txn.category, items: [txn] });
      }
    }
    return [...totals.values()];
  }, [periodShared, currency]);

  // The period before this one, as household totals per category name.
  //
  // Only the immediately preceding one, and no picker to choose another: the
  // personal card offers a menu because "versus the same month last year" is a
  // real question about your own habits, while the household question people
  // actually ask is "are we spending more than last month". Its label is plain
  // text there too whenever there is nothing to choose between.
  const priorByCategory = useMemo(() => {
    const p = { year, month, quarter };
    if (periodType === 'year') p.year = year - 1;
    else if (periodType === 'quarter') {
      p.quarter = quarter - 1;
      if (p.quarter < 0) { p.quarter = 3; p.year = year - 1; }
    } else {
      p.month = month - 1;
      if (p.month < 0) { p.month = 11; p.year = year - 1; }
    }
    const totals = new Map<string, number>();
    for (const txn of transactions) {
      if (!isShared(txn) || txn.type === 'income') continue;
      const y = Number(txn.date.slice(0, 4));
      const m = Number(txn.date.slice(5, 7)) - 1;
      if (y !== p.year) continue;
      if (periodType === 'quarter' && Math.floor(m / 3) !== p.quarter) continue;
      if (periodType === 'month' && m !== p.month) continue;
      const key = txn.category?.name ?? '?';
      totals.set(key, (totals.get(key) ?? 0) + homeAmount(txn, currency));
    }
    return { totals, label: priorLabel(periodType, p) };
  }, [transactions, currency, periodType, year, month, quarter]);

  // Sorted for display. Amount-sorted is the default because the first
  // question about a shared ledger is "what is costing us the most".
  const sortedCategories = useMemo(() => {
    const rows = [...byCategory];
    rows.sort((a, b) =>
      sortBy === 'alphabetical'
        ? (a.category?.name ?? '?').localeCompare(b.category?.name ?? '?')
        : b.total - a.total,
    );
    return rows;
  }, [byCategory, sortBy]);

  // Subcategories of one category, biggest first. `null` is the bucket for
  // items filed under no subcategory at all.
  const subsOf = (items: Transaction[]) => {
    const totals = new Map<string | null, { total: number; items: Transaction[] }>();
    for (const txn of items) {
      const key = txn.subcategory ?? null;
      const entry = totals.get(key);
      const value = homeAmount(txn, currency);
      if (entry) {
        entry.total += value;
        entry.items.push(txn);
      } else {
        totals.set(key, { total: value, items: [txn] });
      }
    }
    return [...totals.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total);
  };

  const balance = runningBalance(transactions, settlements, currency, household.memberIds);
  const owed = Math.round(balance * 100) / 100;

  const avatar = (name: string, color: string, size = 26) => (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: color,
        color: '#FFFFFF',
        fontSize: Math.round(size * 0.42),
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {(name[0] ?? '?').toUpperCase()}
    </span>
  );

  return (
    <div className="px-6 pb-2" style={{ backgroundColor: 'var(--bg-page)' }}>
      {/* Period hero - same dark surface and the same chevrons as the personal
          Dashboard, because periods must navigate the one way the app teaches:
          back freely, forward only as far as today. */}
      <div
        className="rounded-3xl px-5 pt-4 pb-5"
        style={{
          background: 'linear-gradient(160deg, #26262F 0%, #17171D 55%, #191A22 100%)',
          boxShadow: '0 6px 22px rgba(0, 0, 0, 0.16)',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={onPrevPeriod}
            aria-label={t('shared.prevPeriod')}
            className="p-2 -m-2 active:opacity-60 transition-opacity"
          >
            <ChevronLeft className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.55)' }} />
          </button>
          {/* The label is the way in to any other period, exactly as on the
              personal hero: stepping the chevrons back to October 2025 was
              eleven taps. Same sheet, same choice - it sets the one cursor
              both subjects read. */}
          <button
            onClick={onPickPeriod}
            aria-label={t('shared.choosePeriod')}
            className="flex items-center gap-1.5 px-2 -mx-2 py-1 rounded-lg active:opacity-60 transition-opacity"
            style={{ WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)' }}
          >
            <span style={{ color: '#FFFFFF', fontSize: 17, fontWeight: 700 }}>{periodLabel}</span>
            <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.55)' }} strokeWidth={3} />
          </button>
          {/* Dimmed and inert at the newest period rather than hidden: a
              chevron that disappears makes the row jump and re-centres the
              label mid-tap. */}
          <button
            onClick={onNextPeriod}
            disabled={atLatest}
            aria-label={t('shared.nextPeriod')}
            className={`p-2 -m-2 transition-opacity ${atLatest ? '' : 'active:opacity-60'}`}
            style={atLatest ? { opacity: 0.3, cursor: 'default' } : undefined}
          >
            <ChevronRight className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.55)' }} />
          </button>
        </div>
        {/* The household total and YOUR half, side by side.
            The big figure answers "what does living together cost"; the one
            beside it answers "what did that cost ME", which is the number
            every other screen in the app shows and the one you actually
            budget against. Usually half, but the split decides - so it is
            computed, never divided by two. */}
        <div className="flex items-stretch mb-4">
          <div className="flex-1 text-center">
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11.5, marginBottom: 5 }}>
              {t('shared.weSpent')}
            </div>
            <div className="tabular-nums" style={{ color: '#FFFFFF', fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
              <AmountText amount={together} currency={currency} decimals={together % 1 ? 2 : 0} />
            </div>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.08)' }} />
          <div className="flex-1 text-center">
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11.5, marginBottom: 5 }}>
              {t('shared.yourShare')}
            </div>
            <div className="tabular-nums" style={{ color: 'rgba(255,255,255,0.92)', fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
              <AmountText amount={yourShare} currency={currency} decimals={yourShare % 1 ? 2 : 0} />
            </div>
          </div>
        </div>

        {/* Who fronted it, as a ring rather than two boxes: the question is a
            proportion ("are we carrying this evenly?") and a proportion is
            what an arc shows at a glance. The figures stay, because a chart
            you cannot read the numbers off is decoration. Same donut geometry
            as the One-off vs Recurring card. */}
        <div className="flex items-center gap-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14 }}>
          <div style={{ position: 'relative', width: DONUT, height: DONUT, flexShrink: 0 }}>
            <svg width={DONUT} height={DONUT} aria-hidden="true">
              {/* The track, so an empty period still reads as a ring. */}
              <circle
                cx={DONUT / 2} cy={DONUT / 2} r={RING_R} fill="none"
                stroke="rgba(255,255,255,0.10)" strokeWidth={RING_W}
              />
              {paidSegments.map((seg) => (
                <circle
                  key={seg.key}
                  cx={DONUT / 2} cy={DONUT / 2} r={RING_R} fill="none"
                  stroke={seg.color} strokeWidth={RING_W}
                  strokeDasharray={`${seg.length} ${CIRC}`}
                  strokeDashoffset={-seg.offset}
                  strokeLinecap="butt"
                  style={{ transform: 'rotate(-90deg)', transformOrigin: `${DONUT / 2}px ${DONUT / 2}px` }}
                />
              ))}
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            {[
              { key: 'me', name: userName || 'P', color: YOU_COLOR, label: t('shared.youPaid'), value: youPaid },
              { key: 'them', name: partner.name, color: partner.color, label: t('shared.theyPaid', { name: partner.name }), value: partnerPaid },
            ].map((row, i) => (
              <div
                key={row.key}
                className="flex items-center gap-2.5"
                style={{ paddingTop: i ? 9 : 0 }}
              >
                <span
                  aria-hidden="true"
                  style={{ width: 9, height: 9, borderRadius: 3, background: row.color, flexShrink: 0 }}
                />
                <span className="flex-1 min-w-0 truncate" style={{ color: 'rgba(255,255,255,0.62)', fontSize: 12 }}>
                  {row.label}
                </span>
                <span className="tabular-nums flex-shrink-0" style={{ color: '#FFFFFF', fontSize: 14.5, fontWeight: 700 }}>
                  <AmountText amount={row.value} currency={currency} decimals={row.value % 1 ? 2 : 0} />
                </span>
                <span className="tabular-nums flex-shrink-0 text-right" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11.5, width: 34 }}>
                  {together > 0 ? `${Math.round((row.value / together) * 100)}%` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* The balance - running, and deliberately outside the month's reach. */}
      {household.trackBalance && (
        <div
          className="mt-4 rounded-2xl px-5 py-4"
          style={{ backgroundColor: 'var(--bg-card)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div style={{ color: 'var(--ink-2)', fontSize: 12, marginBottom: 3 }}>
                {Math.abs(owed) < 0.005
                  ? t('shared.even')
                  : owed > 0
                    ? t('shared.owesYou', { name: partner.name })
                    : t('shared.youOwe', { name: partner.name })}
              </div>
              <div className="tabular-nums" style={{ color: 'var(--ink)', fontSize: 22, fontWeight: 800 }}>
                <AmountText amount={Math.abs(owed)} currency={currency} decimals={2} />
              </div>
            </div>
            {owed > 0.005 && (
              <button
                onClick={() => setConfirmSettle(true)}
                className="rounded-xl active:scale-[0.98] transition-transform"
                style={{ padding: '10px 16px', backgroundColor: '#4F74F3', color: '#FFFFFF', fontSize: 14, fontWeight: 600 }}
              >
                {t('shared.settleUp')}
              </button>
            )}
          </div>
          <div
            className="mt-2.5 pt-2.5"
            style={{ borderTop: '1px solid var(--line-2)', color: 'var(--ink-2)', fontSize: 12 }}
          >
            {t('shared.running')}
          </div>
        </div>
      )}

      {/* Household totals by category, for the month in the hero. */}
      <div
        className="mt-4 rounded-2xl px-5 pt-4 pb-2"
        style={{ backgroundColor: 'var(--bg-card)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
      >
        <div className="flex items-center justify-between mb-1 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span style={{ color: 'var(--ink)', fontSize: 17, fontWeight: 700 }}>{t('shared.whatWeSpend')}</span>
            {/* Sort sits with the heading because it acts on the whole list -
                the same placement, control and two states as the personal
                Categories card, so the two lists are operated the same way. */}
            {byCategory.length > 1 && (
              <button
                onClick={() => setSortBy(sortBy === 'alphabetical' ? 'amount' : 'alphabetical')}
                className="flex items-center gap-1 px-2 py-1 rounded-lg flex-shrink-0 active:opacity-60 transition-opacity"
                style={{ backgroundColor: 'var(--bg-inset)' }}
                aria-label={t('shared.sortAria')}
              >
                <ArrowUpDown className="w-3 h-3" style={{ color: 'var(--ink-2)' }} />
                <span style={{ color: 'var(--ink-2)', fontSize: 11 }}>
                  {sortBy === 'alphabetical' ? 'A-Z' : CURRENCIES[currency]?.symbol ?? currency}
                </span>
              </button>
            )}
          </div>
          {/* The count is the way to the whole list. Until this existed there
              was nowhere at all to read the shared transactions themselves -
              only totals, with no way to check what was in them. */}
          {periodShared.length > 0 && (
            <button
              onClick={() =>
                setDrilldown({
                  title: t('shared.allShared'),
                  subtitle: periodLabel,
                  items: periodShared,
                  // Only here: money moving back belongs to the household's
                  // whole story, not to any one category.
                  settled: periodSettlements,
                })
              }
              className="active:opacity-60 transition-opacity"
              style={{ color: '#4F74F3', fontSize: 12, fontWeight: 600 }}
            >
              {t(periodShared.length === 1 ? 'shared.drill.count.one' : 'shared.drill.count.other', { n: periodShared.length })}
            </button>
          )}
        </div>
        <div className="flex items-baseline justify-between gap-3" style={{ marginBottom: 6 }}>
          <span className="min-w-0 truncate" style={{ color: 'var(--ink-2)', fontSize: 11.5 }}>
            {t('shared.fullAmounts')}
            {/* The card names its own period, and keeps doing so now that
                the comparison label shares the line. Dropping it for the month
                lens would have bought the space more cheaply, but scrolled
                past the hero this suffix is the only thing saying WHICH month
                these totals are - which is exactly what the period test
                pins. The subtitle got shorter instead. */}
            {periodShort !== periodLabel ? ` · ${periodShort}` : ''}
          </span>
          {/* What the arrows are measured against. Plain text, no chevron:
              there is one baseline here and a menu of one is just noise - the
              same rule the personal card follows when it has nothing to
              offer. Hidden entirely when the previous period was empty, so it
              never promises a comparison the rows cannot make. */}
          {priorByCategory.totals.size > 0 && (
            <span className="flex-shrink-0" style={{ color: 'var(--ink-2)', fontSize: 11.5 }}>
              {t('shared.vsPeriod', { period: priorByCategory.label })}
            </span>
          )}
        </div>
        {byCategory.length === 0 && (
          <div className="py-6 text-center" style={{ color: 'var(--ink-2)', fontSize: 13.5 }}>
            {t('shared.emptyPeriod')}
          </div>
        )}
        {sortedCategories.map(({ total, category, items }, i) => {
          const Icon = getCategoryIcon(category?.icon ?? 'MoreHorizontal');
          const name = category?.name ?? '?';
          const subs = subsOf(items);
          // One subcategory (or none at all) has nothing to expand INTO, so
          // the row goes straight to the transactions rather than opening a
          // list of one that says the same as the row above it.
          const expandable = subs.length > 1;
          const open = expanded === name;
          const pct = together > 0 ? (total / together) * 100 : 0;
          const was = priorByCategory.totals.get(name);
          // Only a category that existed in both periods can be compared. New
          // this month is not "up", and gone this month is not "down" - both
          // are a change of what the household buys, not of how much.
          const trend = was && was > 0 && total > 0 ? (total - was) / was : null;
          return (
            <div key={category?.id ?? i} style={i > 0 ? { borderTop: '1px solid var(--line-2)' } : undefined}>
              <button
                onClick={() =>
                  expandable
                    ? setExpanded(open ? null : name)
                    : setDrilldown({ title: name, subtitle: periodLabel, items })
                }
                className="w-full flex items-center gap-3 py-3 text-left active:opacity-60 transition-opacity"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <div
                  className={`w-[34px] h-[34px] rounded-[10px] ${category?.bgColor ?? 'bg-neutral-100'} flex items-center justify-center flex-shrink-0`}
                >
                  <Icon className={`w-4 h-4 ${category?.color ?? 'text-neutral-500'}`} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ color: 'var(--ink)', fontSize: 14.5, fontWeight: 500 }}>{name}</div>
                  <div
                    className="mt-1.5 rounded-full overflow-hidden"
                    style={{ height: 4, background: 'var(--bg-track)' }}
                  >
                    <div
                      className={`h-full rounded-full ${category?.color ?? 'text-neutral-500'}`}
                      style={{
                        // Share of the household total, matching the % beside
                        // it. It used to scale against the LARGEST category,
                        // which put the top row at a full bar whatever it was
                        // worth - fine alone, but next to a printed "84%" a
                        // bar that means something else is just two answers to
                        // one question.
                        width: `${Math.max(pct > 0 ? 2 : 0, pct)}%`,
                        background: 'currentColor',
                        opacity: 0.55,
                      }}
                    />
                  </div>
                </div>
                <div
                  className="tabular-nums text-right flex-shrink-0"
                  style={{ color: 'var(--ink-2)', fontSize: 11, width: 30 }}
                >
                  {pct.toFixed(0)}%
                </div>
                <div className="tabular-nums" style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 700 }}>
                  <AmountText amount={total} currency={currency} decimals={total % 1 ? 2 : 0} />
                </div>
                {/* Direction only, no number: the arrow answers "more or less
                    than last month" at a glance, and the figure it would print
                    is already one tap away in the drilldown. Colour follows
                    spending, so up is the warm one. */}
                <div className="flex-shrink-0" style={{ width: 14 }}>
                  {trend !== null && Math.abs(trend) >= 0.05 && (
                    trend > 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" style={{ color: '#FF6961' }} strokeWidth={2.5} />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" style={{ color: '#30D158' }} strokeWidth={2.5} />
                    )
                  )}
                </div>
                {expandable ? (
                  <ChevronDown
                    className="w-3.5 h-3.5 flex-shrink-0 transition-transform"
                    style={{ color: 'var(--ghost)', transform: open ? 'rotate(180deg)' : undefined }}
                    strokeWidth={2.5}
                  />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--ghost)' }} strokeWidth={2.5} />
                )}
              </button>

              {open &&
                subs.map((sub) => (
                  <button
                    key={sub.name ?? '__none__'}
                    onClick={() =>
                      setDrilldown({
                        title: sub.name ?? t('trend.other'),
                        subtitle: `${name} · ${periodLabel}`,
                        items: sub.items,
                      })
                    }
                    className="w-full flex items-center gap-3 py-2.5 pl-[46px] text-left active:opacity-60 transition-opacity"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--ink-2)', fontSize: 13.5 }}>
                      {sub.name ?? t('trend.other')}
                    </span>
                    {/* Share of the HOUSEHOLD total, not of the category above
                        it - the same basis as the category rows, so the column
                        reads as one scale down the card rather than resetting
                        to 100% inside every group. */}
                    <span
                      className="tabular-nums text-right flex-shrink-0"
                      style={{ color: 'var(--ink-3)', fontSize: 10.5, width: 30 }}
                    >
                      {together > 0 ? `${((sub.total / together) * 100).toFixed(0)}%` : ''}
                    </span>
                    <span className="tabular-nums" style={{ color: 'var(--ink-2)', fontSize: 13.5, fontWeight: 600 }}>
                      <AmountText amount={sub.total} currency={currency} decimals={sub.total % 1 ? 2 : 0} />
                    </span>
                    {/* Keeps the sub rows on the same column grid as the
                        parents, which carry a trend arrow here. */}
                    <span className="flex-shrink-0" style={{ width: 14 }} />
                    <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--ghost)' }} strokeWidth={2.5} />
                  </button>
                ))}
              {open && (
                <button
                  onClick={() => setDrilldown({ title: name, subtitle: periodLabel, items })}
                  className="w-full py-2.5 pl-[46px] text-left active:opacity-60 transition-opacity"
                  style={{ color: '#4F74F3', fontSize: 13, fontWeight: 600, WebkitTapHighlightColor: 'transparent' }}
                >
                  {t('shared.drill.allOf', { name })}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {drilldown && (
        <SharedDrilldown
          title={drilldown.title}
          subtitle={drilldown.subtitle}
          transactions={drilldown.items}
          settlements={drilldown.settled}
          currency={currency}
          partner={partner}
          userName={userName}
          onClose={() => setDrilldown(null)}
        />
      )}

      {confirmSettle && (
        <ConfirmDialog
          title={t('shared.settleTitle')}
          message={t('shared.settleBody', {
            name: partner.name,
            amt: formatAmountListView(Math.abs(owed), currency, 2),
          })}
          confirmLabel={t('shared.settleConfirm')}
          variant="neutral"
          onCancel={() => setConfirmSettle(false)}
          onConfirm={() => {
            onSettle(owed);
            setConfirmSettle(false);
          }}
        />
      )}
    </div>
  );
}
