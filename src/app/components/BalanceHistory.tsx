import { ArrowLeftRight, ChevronLeft } from 'lucide-react';
import { t } from '../i18n';
import { monthsFull } from '../i18n/store';
import { AmountText } from './AmountText';
import { formatAmountListView } from '../utils/currency';
import { DOCK_CLEARANCE } from './subpageLayout';
import { navTransition } from '../lib/navTransition';
import { formatFullDate } from '../lib/dates';
import { balanceStory } from '../lib/balanceStory';
import type { Person, Settlement, Transaction } from '../types';

// The balance, explained.
//
// The shared view says what the balance IS. This says how it got there: every
// event that moved it, in order, with the figure carried through them and the
// months as the sections it runs across. Settlements are not filtered out -
// they are the interesting part, the evening the line was cut back to zero, and
// until now recording one moved the number and left no trace you could read.
//
// Deliberately all-time rather than period-scoped, unlike every other list in
// the app: a debt does not reset on the 1st, so an account of one cannot
// either.
export interface BalanceHistoryProps {
  transactions: Transaction[];
  settlements: Settlement[];
  memberIds: string[];
  currency: string;
  partner: Person;
  onClose: () => void;
}

export function BalanceHistory({
  transactions,
  settlements,
  memberIds,
  currency,
  partner,
  onClose,
}: BalanceHistoryProps) {
  const months = balanceStory(transactions, settlements, currency, memberIds);
  const balance = months[0]?.running ?? 0;

  const monthName = (key: string) => {
    const [y, m] = key.split('-');
    const name = monthsFull()[Number(m) - 1] ?? key;
    return `${name} ${y}`;
  };

  // Blue raises what they owe you, grey brings it down - the spec's rule, and
  // the reason the sign is coloured at all: a column of numbers where half are
  // debts and half are repayments is unreadable without it.
  const deltaColor = (d: number) => (d > 0 ? 'var(--accent-ink)' : 'var(--ink-2)');
  const signed = (d: number) => (d > 0 ? '+' : d < 0 ? '-' : '');

  return (
    // Height is the mount's business, not this component's: it opens as a
    // layer over the Dashboard and as an ordinary sub-page inside Settings,
    // and those two want different geometry for the same screen.
    <div data-balance-screen className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-page)' }}>
      <div style={{ backgroundColor: 'var(--bg-page)' }}>
        <div className="px-6 pb-4 pt-0">
          <div className="flex items-center justify-center relative">
            <button
              onClick={() => navTransition('back', onClose)}
              aria-label={t('common.close')}
              className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
            >
              <ChevronLeft size={24} style={{ color: 'var(--accent-ink)' }} />
            </button>
            <h1 style={{ color: 'var(--ink)', fontSize: 20, fontWeight: 600, letterSpacing: '-0.3px' }}>
              {t('bal.title')}
            </h1>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6" style={{ paddingBottom: DOCK_CLEARANCE }}>
        {/* Where it stands, so the list below has something to land on. */}
        <div className="rounded-2xl px-5 py-4 mb-4" style={{ backgroundColor: 'var(--bg-card)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>
            {Math.abs(balance) < 0.005
              ? t('shared.even')
              : balance > 0
                ? t('shared.owesYou', { name: partner.name })
                : t('shared.youOwe', { name: partner.name })}
          </div>
          <div className="tabular-nums mt-0.5" style={{ color: 'var(--ink)', fontSize: 24, fontWeight: 800 }}>
            <AmountText amount={Math.abs(balance)} currency={currency} decimals={2} />
          </div>
          <div className="mt-1" style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>{t('bal.subtitle')}</div>
        </div>

        {months.length === 0 && (
          <div className="py-10 text-center" style={{ color: 'var(--ink-2)', fontSize: 13.5 }}>
            {t('bal.empty')}
          </div>
        )}

        {months.map((month) => (
          <div key={month.key} className="mb-4">
            {/* The month, and what it did on balance. The running figure beside
                it is what you carried OUT of that month, which is the number
                the next section starts from. */}
            <div className="flex items-baseline justify-between gap-3 px-1 mb-1.5">
              <span style={{ color: 'var(--ink-2)', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }}>
                {monthName(month.key).toUpperCase()}
                {month.settled ? ` · ${t('bal.settledMark')}` : ''}
              </span>
              <span className="tabular-nums" style={{ color: deltaColor(month.delta), fontSize: 11.5, fontWeight: 700 }}>
                {signed(month.delta)}
                <AmountText amount={Math.abs(month.delta)} currency={currency} decimals={2} />
              </span>
            </div>

            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              {month.entries.map((e, i) => (
                <div
                  key={e.id}
                  className="flex items-center gap-3 px-5 py-3"
                  style={i > 0 ? { borderTop: '1px solid var(--line-2)' } : undefined}
                >
                  {e.kind === 'settlement' && (
                    <div
                      className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--bg-inset)' }}
                    >
                      <ArrowLeftRight className="w-4 h-4" style={{ color: 'var(--ink-2)' }} strokeWidth={2} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="truncate" style={{ color: 'var(--ink)', fontSize: 14, fontWeight: e.kind === 'settlement' ? 600 : 500 }}>
                      {e.kind === 'settlement'
                        ? t(e.delta < 0 ? 'bal.theyPaidYou' : 'bal.youPaidThem', { name: partner.name })
                        : e.description}
                    </div>
                    {/* The arithmetic, always stated: a figure that moved the
                        balance by half of itself has to say so, or the column
                        looks wrong to anyone checking it. */}
                    <div className="truncate mt-0.5" style={{ color: 'var(--ink-2)', fontSize: 11 }}>
                      {formatFullDate(e.date)}
                      {e.kind === 'expense' && e.full !== undefined && e.mine !== undefined
                        ? ` · ${t(e.paidByThem ? 'bal.theyPaid' : 'bal.youPaid', {
                            name: partner.name,
                            amt: formatAmountListView(e.full, currency, 2),
                            share: formatAmountListView(e.mine, currency, 2),
                          })}`
                        : ''}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="tabular-nums" style={{ color: deltaColor(e.delta), fontSize: 14, fontWeight: 700 }}>
                      {signed(e.delta)}
                      <AmountText amount={Math.abs(e.delta)} currency={currency} decimals={2} />
                    </div>
                    {/* The balance as it stood right after - the column that
                        turns a list of movements into a story. */}
                    <div className="tabular-nums" style={{ color: 'var(--ink-3)', fontSize: 10.5 }}>
                      <AmountText amount={Math.abs(e.running)} currency={currency} decimals={2} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="h-2" />
      </div>
    </div>
  );
}
