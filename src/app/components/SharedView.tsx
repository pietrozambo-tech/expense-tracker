import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { t } from '../i18n';
import { dateLocale } from '../i18n/store';
import { AmountText } from './AmountText';
import { ConfirmDialog } from './ConfirmDialog';
import { getCategoryIcon } from './categoryIcons';
import { homeAmount, formatAmountListView } from '../utils/currency';
import { isShared, runningBalance } from '../lib/shared';
import type { Household, Person, Settlement, Transaction } from '../types';

// The Dashboard's other subject: not "how am I doing" but "what do WE spend".
//
// Everything here shows FULL amounts - the household's money - because the
// personal view already shows your half and halving it again here would hide
// what living together actually costs. The one number that is not monthly is
// the balance: a debt does not reset on the 1st, so it sits in its own card
// labelled running while the hero and the category list follow the month.
export interface SharedViewProps {
  transactions: Transaction[];
  settlements: Settlement[];
  household: Household;
  partner: Person;
  currency: string;
  userName: string;
  /** Record a settlement of the current balance. */
  onSettle: (amount: number) => void;
}

export function SharedView({
  transactions,
  settlements,
  household,
  partner,
  currency,
  userName,
  onSettle,
}: SharedViewProps) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [confirmSettle, setConfirmSettle] = useState(false);

  const move = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setMonth(d.getMonth());
    setYear(d.getFullYear());
  };

  const monthLabel = new Date(year, month, 1).toLocaleDateString(dateLocale(), {
    month: 'long',
    year: 'numeric',
  });

  // Shared expenses of the visible month, at full value.
  const monthShared = useMemo(
    () =>
      transactions.filter((txn) => {
        if (!isShared(txn) || txn.type === 'income') return false;
        const d = txn.date;
        return (
          Number(d.slice(0, 4)) === year && Number(d.slice(5, 7)) === month + 1
        );
      }),
    [transactions, month, year],
  );

  const together = monthShared.reduce((sum, txn) => sum + homeAmount(txn, currency), 0);
  // Until account pairing exists every local transaction was paid by the
  // user, so the partner's column is what pairing will fill in - shown at
  // zero rather than hidden, because the split of who-fronted-what is the
  // question this hero answers.
  const youPaid = together;
  const partnerPaid = 0;

  const byCategory = useMemo(() => {
    const totals = new Map<string, { total: number; category: Transaction['category'] }>();
    for (const txn of monthShared) {
      const key = txn.category?.name ?? '?';
      const entry = totals.get(key);
      const value = homeAmount(txn, currency);
      if (entry) entry.total += value;
      else totals.set(key, { total: value, category: txn.category });
    }
    return [...totals.values()].sort((a, b) => b.total - a.total);
  }, [monthShared, currency]);
  const maxCategory = byCategory[0]?.total ?? 0;

  const balance = runningBalance(transactions, settlements, currency);
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
      {/* Month hero - same dark surface and the same chevrons as the personal
          Dashboard, because months must navigate the one way the app teaches. */}
      <div
        className="rounded-3xl px-5 pt-4 pb-5"
        style={{
          background: 'linear-gradient(160deg, #26262F 0%, #17171D 55%, #191A22 100%)',
          boxShadow: '0 6px 22px rgba(0, 0, 0, 0.16)',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => move(-1)}
            aria-label={t('shared.prevMonth')}
            className="p-2 -m-2 active:opacity-60 transition-opacity"
          >
            <ChevronLeft className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.55)' }} />
          </button>
          <span style={{ color: '#FFFFFF', fontSize: 17, fontWeight: 700 }}>{monthLabel}</span>
          <button
            onClick={() => move(1)}
            aria-label={t('shared.nextMonth')}
            className="p-2 -m-2 active:opacity-60 transition-opacity"
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
          <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>
            {new Date(year, month, 1).toLocaleDateString(dateLocale(), { month: 'long' })}
          </span>
        </div>
        <div style={{ color: 'var(--ink-2)', fontSize: 11.5, marginBottom: 6 }}>{t('shared.fullAmounts')}</div>
        {byCategory.length === 0 && (
          <div className="py-6 text-center" style={{ color: 'var(--ink-2)', fontSize: 13.5 }}>
            {t('shared.emptyMonth')}
          </div>
        )}
        {byCategory.map(({ total, category }, i) => {
          const Icon = getCategoryIcon(category?.icon ?? 'MoreHorizontal');
          return (
            <div
              key={category?.id ?? i}
              className="flex items-center gap-3 py-3"
              style={i > 0 ? { borderTop: '1px solid var(--line-2)' } : undefined}
            >
              <div
                className={`w-[34px] h-[34px] rounded-[10px] ${category?.bgColor ?? 'bg-neutral-100'} flex items-center justify-center flex-shrink-0`}
              >
                <Icon className={`w-4 h-4 ${category?.color ?? 'text-neutral-500'}`} strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <div style={{ color: 'var(--ink)', fontSize: 14.5, fontWeight: 500 }}>{category?.name}</div>
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
            </div>
          );
        })}
      </div>

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
