import { useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { t } from '../i18n';
import { monthsFull } from '../i18n/store';
import { AmountText } from './AmountText';
import { ConfirmDialog } from './ConfirmDialog';
import { SharedDrilldown } from './SharedDrilldown';
import { getCategoryIcon } from './categoryIcons';
import { homeAmount, formatAmountListView } from '../utils/currency';
import { isShared, runningBalance } from '../lib/shared';
import { paidBy } from '../lib/sharedSync';
import type { Household, Person, Settlement, Transaction } from '../types';

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
    return [...totals.values()].sort((a, b) => b.total - a.total);
  }, [periodShared, currency]);
  const maxCategory = byCategory[0]?.total ?? 0;

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
        <div className="text-center mb-4">
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12.5, marginBottom: 5 }}>
            {t('shared.weSpent')}
          </div>
          <div className="tabular-nums" style={{ color: '#FFFFFF', fontSize: 36, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
            <AmountText amount={together} currency={currency} decimals={together % 1 ? 2 : 0} />
          </div>
        </div>
        <div className="flex" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14 }}>
          <div className="flex-1 flex items-center justify-center gap-2.5">
            {avatar(userName || 'P', '#3C3C46')}
            <div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>{t('shared.youPaid')}</div>
              <div className="tabular-nums" style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 700 }}>
                <AmountText amount={youPaid} currency={currency} decimals={0} />
              </div>
            </div>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.08)' }} />
          <div className="flex-1 flex items-center justify-center gap-2.5">
            {avatar(partner.name, partner.color)}
            <div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
                {t('shared.theyPaid', { name: partner.name })}
              </div>
              <div className="tabular-nums" style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 700 }}>
                <AmountText amount={partnerPaid} currency={currency} decimals={0} />
              </div>
            </div>
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
        <div className="flex items-baseline justify-between mb-1">
          <span style={{ color: 'var(--ink)', fontSize: 17, fontWeight: 700 }}>{t('shared.whatWeSpend')}</span>
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
        <div style={{ color: 'var(--ink-2)', fontSize: 11.5, marginBottom: 6 }}>
          {t('shared.fullAmounts')}
          {periodShort !== periodLabel ? ` · ${periodShort}` : ''}
        </div>
        {byCategory.length === 0 && (
          <div className="py-6 text-center" style={{ color: 'var(--ink-2)', fontSize: 13.5 }}>
            {t('shared.emptyPeriod')}
          </div>
        )}
        {byCategory.map(({ total, category, items }, i) => {
          const Icon = getCategoryIcon(category?.icon ?? 'MoreHorizontal');
          const name = category?.name ?? '?';
          const subs = subsOf(items);
          // One subcategory (or none at all) has nothing to expand INTO, so
          // the row goes straight to the transactions rather than opening a
          // list of one that says the same as the row above it.
          const expandable = subs.length > 1;
          const open = expanded === name;
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
                        width: `${maxCategory ? Math.max(4, (total / maxCategory) * 100) : 0}%`,
                        background: 'currentColor',
                        opacity: 0.55,
                      }}
                    />
                  </div>
                </div>
                <div className="tabular-nums" style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 700 }}>
                  <AmountText amount={total} currency={currency} decimals={total % 1 ? 2 : 0} />
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
                    <span className="tabular-nums" style={{ color: 'var(--ink-2)', fontSize: 13.5, fontWeight: 600 }}>
                      <AmountText amount={sub.total} currency={currency} decimals={sub.total % 1 ? 2 : 0} />
                    </span>
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
