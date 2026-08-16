import { useCallback, useMemo, useState } from 'react';
import { ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, TrendingDown, TrendingUp, X } from 'lucide-react';
import { t } from '../i18n';
import { monthsFull } from '../i18n/store';
import { AmountText } from './AmountText';
import { ConfirmDialog } from './ConfirmDialog';
import { SharedDrilldown } from './SharedDrilldown';
import { getCategoryIcon } from './categoryIcons';
import { formatFullDate } from '../lib/dates';
import { DARK_SURFACE } from './surfaces';
import { homeAmount, mineAmount, formatAmountListView, CURRENCIES } from '../utils/currency';
import { asWas, isShared, newsBalanceDelta, newsShareDelta, runningBalance } from '../lib/shared';
import type { SharedNews } from '../lib/shared';
import { paidBy } from '../lib/sharedSync';
import type { Household, Person, Settlement, Transaction } from '../types';

// Ring geometry, and the two colours that stand for the two of you.
//
// You are the neutral one and they are the coloured one, the same way the
// avatars work everywhere else - and on this dark card neutral has to mean
// near-white, not the near-black the switcher uses on a light background.
const DONUT = 64;
const RING_W = 10;
const RING_R = (DONUT - RING_W) / 2;
const CIRC = 2 * Math.PI * RING_R;
const YOU_COLOR = 'rgba(255,255,255,0.92)';
// Past this gap (in the home currency) the balance caption suggests dinner
// instead of explaining the running total. 100 was chosen for EUR-scale
// currencies; it is a nudge threshold, not accounting, so being wrong in
// JPY costs a joke told early, nothing more.
const NUDGE_GAP = 100;
// How many of their changes the card lists before summarising the rest. Four
// covers an ordinary evening apart; a longer list stops being a nudge and
// becomes the item sheet, which already exists one tap away.
const NEWS_ROWS = 4;

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
  /** Open the account of how the balance got here. Tapping the number is the
   *  obvious way to ask, and until now it did nothing. */
  onOpenHistory: () => void;
  /**
   * What they changed while you were away, frozen by App on the way in.
   *
   * Null when there is nothing, which is the normal state - this card exists
   * to be absent. Held still rather than derived here on purpose: arriving is
   * what marks it read, so a live list would empty itself in the frame it
   * rendered.
   */
  news?: SharedNews | null;
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
  onOpenHistory,
  news = null,
  period,
  periodLabel,
  atLatest,
  onPrevPeriod,
  onNextPeriod,
  onPickPeriod,
}: SharedViewProps) {
  const [confirmSettle, setConfirmSettle] = useState(false);
  // Closing the card is a local act: the clock was already stamped on arrival,
  // so this only decides whether you keep looking at it.
  const [newsDismissed, setNewsDismissed] = useState(false);
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

  // Does a YYYY-MM-DD fall in the period the header names? One definition,
  // because three lists and a summary line all have to agree on what "August"
  // means or the card can contradict the table under it.
  const inPeriod = useCallback(
    (date: string) => {
      const y = Number(date.slice(0, 4));
      const m = Number(date.slice(5, 7)) - 1;
      if (y !== year) return false;
      if (periodType === 'year') return true;
      if (periodType === 'quarter') return Math.floor(m / 3) === quarter;
      return m === month;
    },
    [month, quarter, year, periodType],
  );

  // Shared expenses of the visible period, at full value.
  const periodShared = useMemo(
    () =>
      transactions.filter(
        (txn) => isShared(txn) && txn.type !== 'income' && inPeriod(txn.date),
      ),
    [transactions, inPeriod],
  );

  // Settlements of the visible period, for the all-items sheet. The BALANCE
  // still ignores periods entirely - a debt does not reset on the 1st.
  const periodSettlements = useMemo(
    () =>
      settlements.filter((s) => household.memberIds.includes(s.personId) && inPeriod(s.date)),
    [settlements, household, inPeriod],
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

  // Their changes as one list, newest first, whatever kind each one is - the
  // question being answered is "what happened", and sorting by kind would make
  // you read three lists to find out.
  const newsRows = useMemo(() => {
    if (!news) return [];
    const rows = [
      ...news.added.map((txn) => ({
        key: txn.id, tag: 'new' as const, description: txn.description, date: txn.date,
        amount: homeAmount(txn, currency), was: null as number | null,
      })),
      ...news.edited.map((txn) => {
        const before = asWas(txn);
        return {
          key: txn.id, tag: 'updated' as const, description: txn.description, date: txn.date,
          amount: homeAmount(txn, currency),
          was: before ? homeAmount(before, currency) : null,
        };
      }),
      ...news.removed.map((r) => ({
        key: r.id, tag: 'removed' as const, description: r.description, date: r.date,
        amount: homeAmount(r as unknown as Transaction, currency), was: null as number | null,
      })),
    ];
    return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [news, currency]);

  const newsHeadline = news
    ? news.added.length === news.count
      ? t(news.count === 1 ? 'shared.news.added.one' : 'shared.news.added.other', {
          name: partner.name, n: String(news.count),
        })
      : t(news.count === 1 ? 'shared.news.changed.one' : 'shared.news.changed.other', {
          name: partner.name, n: String(news.count),
        })
    : '';

  // What it did to your numbers, which is the whole point of saying anything.
  //
  // Your share only appears when it actually moved: an item they marked as
  // wholly theirs is news, but reporting "+0 in your August" beside it would
  // be a line that says nothing twice.
  const newsDetail = (() => {
    if (!news) return '';
    const parts: string[] = [];
    const share = newsShareDelta(news, currency, inPeriod);
    if (Math.abs(share) >= 0.005) {
      parts.push(
        t('shared.news.inYour', {
          amt: `${share > 0 ? '+' : '-'}${formatAmountListView(Math.abs(share), currency, 2)}`,
          period: periodShort,
        }),
      );
    }
    if (household.trackBalance) {
      parts.push(
        Math.abs(owed) < 0.005
          ? t('shared.news.evenNow')
          : t(owed > 0 ? 'shared.news.owesYouNow' : 'shared.news.youOweNow', {
              name: partner.name,
              amt: formatAmountListView(Math.abs(owed), currency, 2),
            }),
      );
      const moved = newsBalanceDelta(news, currency);
      if (Math.abs(moved) >= 0.005) {
        parts.push(
          t('shared.news.wasBal', {
            amt: formatAmountListView(Math.abs(owed - moved), currency, 2),
          }),
        );
      }
    }
    return parts.join(' · ');
  })();

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
      {/* The same material as the personal hero, spread from the one
          definition - this card had its own flat gradient, no bloom, no
          hairline and half the shadow, so switching subjects changed what the
          hero seemed to be made of. */}
      <div className="rounded-3xl px-5 pt-4 pb-4" style={DARK_SURFACE}>
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
        <div className="flex items-stretch mb-3">
          <div className="flex-1 text-center">
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11.5, marginBottom: 4 }}>
              {t('shared.weSpent')}
            </div>
            {/* 20px, not 30: the personal hero caps its metrics at 17px, and
                these two sat at nearly double that - the loudest numbers in
                the app for holding the same rank as Spending/Income. One step
                above 17 keeps them the headline of this card without shouting
                across the tab. */}
            <div className="tabular-nums" style={{ color: '#FFFFFF', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
              <AmountText amount={together} currency={currency} decimals={together % 1 ? 2 : 0} />
            </div>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.08)' }} />
          <div className="flex-1 text-center">
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11.5, marginBottom: 4 }}>
              {t('shared.yourShare')}
            </div>
            <div className="tabular-nums" style={{ color: 'rgba(255,255,255,0.92)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
              <AmountText amount={yourShare} currency={currency} decimals={yourShare % 1 ? 2 : 0} />
            </div>
          </div>
        </div>

        {/* Who fronted it, as a ring rather than two boxes: the question is a
            proportion ("are we carrying this evenly?") and a proportion is
            what an arc shows at a glance. The figures stay, because a chart
            you cannot read the numbers off is decoration. Same donut geometry
            as the One-off vs Recurring card. */}
        <div className="flex items-center gap-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
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
                style={{ paddingTop: i ? 7 : 0 }}
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

      {/* What they did while you were away.
          The toast that used to be the only account of this was gone in 2.6
          seconds and left the ledger looking like it had always said that.
          This is the same news with somewhere to sit: it survives the app
          being closed, it names what changed, and - the part a toast could
          never do - it says what the change did to YOUR numbers, which is the
          only reason any of it matters to the person reading.

          Never a prompt: nothing here to approve or accept, only to close. */}
      {newsRows.length > 0 && !newsDismissed && (
        <div
          className="mt-4 rounded-2xl px-5 pt-3.5 pb-2"
          style={{ backgroundColor: 'var(--bg-card)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  style={{ width: 7, height: 7, borderRadius: 999, background: '#4F74F3', flexShrink: 0 }}
                />
                <span style={{ color: 'var(--ink-2)', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }}>
                  {t('shared.news.title').toUpperCase()}
                </span>
              </div>
              {/* Batched: three entries are one sentence, not three lines. */}
              <div className="mt-1.5" style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 600 }}>
                {newsHeadline}
              </div>
              {/* The balance always travels with the news, with what it was
                  beside it - a new figure alone is a fact you cannot place. */}
              {newsDetail && (
                <div className="mt-0.5" style={{ color: 'var(--ink-2)', fontSize: 11.5 }}>{newsDetail}</div>
              )}
            </div>
            <button
              onClick={() => setNewsDismissed(true)}
              aria-label={t('common.close')}
              className="flex-shrink-0 -mr-1.5 -mt-1 w-8 h-8 flex items-center justify-center rounded-full active:opacity-60 transition-opacity"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <X className="w-3.5 h-3.5" style={{ color: 'var(--ghost)' }} strokeWidth={2.5} />
            </button>
          </div>
          <div className="mt-2">
            {newsRows.slice(0, NEWS_ROWS).map((row, i) => (
              <div
                key={row.key}
                className="flex items-center gap-3 py-2"
                style={i > 0 ? { borderTop: '1px solid var(--line-2)' } : undefined}
              >
                <div className="flex-1 min-w-0">
                  <div
                    className="truncate"
                    style={{
                      color: 'var(--ink)',
                      fontSize: 13.5,
                      // A deletion is shown struck rather than simply absent:
                      // the point of the row is that the thing is gone.
                      textDecoration: row.tag === 'removed' ? 'line-through' : undefined,
                      opacity: row.tag === 'removed' ? 0.65 : 1,
                    }}
                  >
                    {row.description}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      style={{
                        color: row.tag === 'removed' ? 'var(--ink-2)' : 'var(--accent-ink)',
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                      }}
                    >
                      {t(`shared.news.tag.${row.tag}`).toUpperCase()}
                    </span>
                    <span className="truncate" style={{ color: 'var(--ink-2)', fontSize: 11 }}>
                      {formatFullDate(row.date)}
                    </span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="tabular-nums" style={{ color: 'var(--ink)', fontSize: 13.5, fontWeight: 700 }}>
                    <AmountText amount={row.amount} currency={currency} decimals={row.amount % 1 ? 2 : 0} />
                  </div>
                  {/* The figure it replaced, so a correction reads as a
                      correction instead of as a number that was always this. */}
                  {row.was !== null && (
                    <div className="tabular-nums" style={{ color: 'var(--ink-2)', fontSize: 10.5 }}>
                      {t('shared.news.was', { amt: formatAmountListView(row.was, currency, row.was % 1 ? 2 : 0) })}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {newsRows.length > NEWS_ROWS && (
              <div className="py-2" style={{ borderTop: '1px solid var(--line-2)', color: 'var(--ink-2)', fontSize: 11.5 }}>
                {t('shared.news.more', { n: String(newsRows.length - NEWS_ROWS) })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* The balance - running, and deliberately outside the month's reach.
          One line of label+amount, one line of caption: this card holds a
          single number, and it was spending 125px of the screen to say it -
          stacked label, jumbo figure, a divider and a footnote. The label and
          amount now share a baseline, and the divider is gone.

          Past NUDGE_GAP apart, the footnote stops explaining the mechanism
          and starts closing the gap: "let them get the next dinner" turns a
          number into something a couple actually does about it, which also
          keeps settling optional - dinner IS a settlement. */}
      {household.trackBalance && (
        <div
          className="mt-4 rounded-2xl px-5 py-3.5"
          style={{ backgroundColor: 'var(--bg-card)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenHistory}
              aria-label={t('bal.title')}
              className="flex-1 min-w-0 text-left active:opacity-60 transition-opacity"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <div className="flex items-baseline gap-2 flex-wrap">
                <span style={{ color: 'var(--ink-2)', fontSize: 13 }}>
                  {Math.abs(owed) < 0.005
                    ? t('shared.even')
                    : owed > 0
                      ? t('shared.owesYou', { name: partner.name })
                      : t('shared.youOwe', { name: partner.name })}
                </span>
                {Math.abs(owed) >= 0.005 && (
                  <span className="tabular-nums" style={{ color: 'var(--ink)', fontSize: 17, fontWeight: 700 }}>
                    <AmountText amount={Math.abs(owed)} currency={currency} decimals={2} />
                  </span>
                )}
              </div>
              <div className="mt-1" style={{ color: 'var(--ink-2)', fontSize: 11.5 }}>
                {Math.abs(owed) >= NUDGE_GAP
                  ? owed > 0
                    ? t('shared.balance.dinnerThem', { name: partner.name })
                    : t('shared.balance.dinnerYou')
                  : t('shared.running')}
              </div>
            </button>
            {/* Either direction. The button used to appear only when they owed
                YOU, which left the other half of the feature with a number and
                no way to act on it: the app told you that you owed 84€ and
                offered nothing to close it. Everything under the button was
                already two-way - handleSettle takes the signed balance and
                swaps from/to, the amount is stored signed, the drilldown picks
                the avatar off the sign - so this was the one place the
                direction was assumed. */}
            {Math.abs(owed) > 0.005 && (
              <button
                onClick={() => setConfirmSettle(true)}
                className="rounded-xl active:scale-[0.98] transition-transform flex-shrink-0"
                style={{ padding: '8px 14px', backgroundColor: '#4F74F3', color: '#FFFFFF', fontSize: 13.5, fontWeight: 600 }}
              >
                {t('shared.settleUp')}
              </button>
            )}
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
                  style={{ color: 'var(--accent-ink)', fontSize: 13, fontWeight: 600, WebkitTapHighlightColor: 'transparent' }}
                >
                  {t('shared.drill.allOf', { name })}
                </button>
              )}
            </div>
          );
        })}

        {/* The way into the whole list, under the breakdown it summarises
            rather than beside the heading. It reads as the last row of the
            table now - the natural place to end up after scanning the
            categories and wanting the detail behind them - instead of
            competing with the title and the sort control for the top line. */}
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
            className="w-full flex items-center justify-center gap-1.5 py-3 mt-1 active:opacity-60 transition-opacity"
            style={{ borderTop: '1px solid var(--line-2)', WebkitTapHighlightColor: 'transparent' }}
          >
            <span style={{ color: 'var(--accent-ink)', fontSize: 13.5, fontWeight: 600 }}>{t('shared.seeAll')}</span>
            <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>
              {t(periodShared.length === 1 ? 'shared.drill.count.one' : 'shared.drill.count.other', { n: periodShared.length })}
            </span>
            <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--ghost)' }} strokeWidth={2.5} />
          </button>
        )}
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
          message={t(owed > 0 ? 'shared.settleBody.them' : 'shared.settleBody.you', {
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
