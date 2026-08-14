import { ArrowLeftRight, X } from 'lucide-react';
import { t } from '../i18n';
import { dateLocale } from '../i18n/store';
import { AmountText } from './AmountText';
import { getCategoryIcon } from './categoryIcons';
import { homeAmount, mineAmount } from '../utils/currency';
import { paidByPartner } from '../lib/sharedSync';
import type { Person, Settlement, Transaction } from '../types';

// The transactions behind a bar in the shared view.
//
// The household card answers "what do we spend on"; this answers "on what,
// exactly, and who fronted it" - the question you actually have when a figure
// looks wrong. Same sheet shape as the personal Dashboard's drilldown, but the
// rows carry what only this view can say: the FULL amount, whose money it was,
// and your share underneath it.
export interface SharedDrilldownProps {
  title: string;
  /** Period, or the category a subcategory belongs to - context for the title. */
  subtitle?: string;
  transactions: Transaction[];
  /**
   * Money that moved between you, in the same period. Only the whole-period
   * view passes any: a settlement belongs to no category, so it has no place
   * in a category drilldown (spec 6.2).
   *
   * Until this, a settlement could be recorded and then never seen again -
   * it moved the balance and left no trace you could read.
   */
  settlements?: Settlement[];
  currency: string;
  partner: Person;
  userName: string;
  onClose: () => void;
}

export function SharedDrilldown({
  title,
  subtitle,
  transactions,
  settlements = [],
  currency,
  partner,
  userName,
  onClose,
}: SharedDrilldownProps) {
  const rows = [...transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const total = rows.reduce((sum, txn) => sum + homeAmount(txn, currency), 0);
  const mine = rows.reduce((sum, txn) => sum + mineAmount(txn, currency), 0);
  const settled = [...settlements].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const avatar = (name: string, color: string) => (
    <span
      aria-hidden="true"
      style={{
        width: 20, height: 20, borderRadius: 999, background: color, color: '#FFFFFF',
        fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0,
      }}
    >
      {(name[0] ?? '?').toUpperCase()}
    </span>
  );

  return (
    <div data-overlay className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm">
      <div
        className="w-full max-w-[430px] h-[85vh] sm:h-[700px] rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300"
        style={{ backgroundColor: 'var(--bg-card)' }}
      >
        <div className="flex-shrink-0" style={{ borderBottom: '1px solid var(--line-2)' }}>
          <div className="px-6 pt-8 pb-1 flex items-center justify-end">
            <button
              onClick={onClose}
              aria-label={t('common.close')}
              className="w-9 h-9 flex items-center justify-center rounded-full text-white active:scale-90 transition-all"
              style={{ backgroundColor: '#3A3A3C' }}
            >
              <X size={18} />
            </button>
          </div>
          <div className="px-6 pb-5 pt-1">
            <h3 style={{ color: 'var(--ink)', fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{title}</h3>
            {subtitle && (
              <div className="mt-1" style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>{subtitle}</div>
            )}
            <div className="mt-3 flex items-baseline gap-3">
              <span className="tabular-nums" style={{ color: 'var(--ink)', fontSize: 26, fontWeight: 800 }}>
                <AmountText amount={total} currency={currency} decimals={total % 1 ? 2 : 0} />
              </span>
              <span style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>
                {t(rows.length === 1 ? 'shared.drill.count.one' : 'shared.drill.count.other', { n: rows.length })}
              </span>
            </div>
            {/* The household figure is the headline here, so the personal one
                has to be stated rather than assumed - it is the number that
                shows up on every other screen. */}
            <div className="mt-1" style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>
              {t('shared.drill.yours')}{' '}
              <span className="tabular-nums" style={{ fontWeight: 600 }}>
                <AmountText amount={mine} currency={currency} decimals={mine % 1 ? 2 : 0} />
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-2">
          {rows.length === 0 && settled.length === 0 && (
            <div className="py-10 text-center" style={{ color: 'var(--ink-2)', fontSize: 13.5 }}>
              {t('shared.emptyPeriod')}
            </div>
          )}
          {settled.map((s, i) => (
            <div
              key={s.id}
              className="flex items-center gap-3 py-3"
              style={i > 0 || rows.length ? { borderTop: '1px solid var(--line-2)' } : undefined}
            >
              <div
                className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--bg-inset)' }}
              >
                <ArrowLeftRight className="w-4 h-4" style={{ color: 'var(--ink-2)' }} strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate" style={{ color: 'var(--ink)', fontSize: 14.5, fontWeight: 500 }}>
                  {t('shared.drill.settled', { name: partner.name })}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {avatar(s.amount >= 0 ? partner.name : userName || 'P', s.amount >= 0 ? partner.color : '#3C3C46')}
                  <span style={{ color: 'var(--ink-2)', fontSize: 11.5 }}>
                    {new Date(s.date + 'T00:00:00').toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              </div>
              {/* Neutral, never green: green means income in this app, and a
                  settlement is neither spending nor income. */}
              <div className="tabular-nums flex-shrink-0" style={{ color: 'var(--ink-2)', fontSize: 15, fontWeight: 700 }}>
                <AmountText amount={Math.abs(s.amount)} currency={currency} decimals={2} />
              </div>
            </div>
          ))}
          {rows.map((txn, i) => {
            const Icon = getCategoryIcon(txn.category?.icon ?? 'MoreHorizontal');
            // Who was out of pocket, which is not always who entered it.
            const theirs = paidByPartner(txn);
            const full = homeAmount(txn, currency);
            const share = mineAmount(txn, currency);
            return (
              <div
                key={txn.id}
                className="flex items-center gap-3 py-3"
                style={i > 0 || settled.length ? { borderTop: '1px solid var(--line-2)' } : undefined}
              >
                <div
                  className={`w-[34px] h-[34px] rounded-[10px] ${txn.category?.bgColor ?? 'bg-neutral-100'} flex items-center justify-center flex-shrink-0`}
                >
                  <Icon className={`w-4 h-4 ${txn.category?.color ?? 'text-neutral-500'}`} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate" style={{ color: 'var(--ink)', fontSize: 14.5, fontWeight: 500 }}>
                    {txn.description}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {avatar(theirs ? partner.name : userName || 'P', theirs ? partner.color : '#3C3C46')}
                    <span style={{ color: 'var(--ink-2)', fontSize: 11.5 }}>
                      {new Date(txn.date + 'T00:00:00').toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })}
                      {txn.subcategory ? ` · ${txn.subcategory}` : ''}
                    </span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="tabular-nums" style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 700 }}>
                    <AmountText amount={full} currency={currency} decimals={full % 1 ? 2 : 0} />
                  </div>
                  <div className="tabular-nums" style={{ color: 'var(--ink-2)', fontSize: 11 }}>
                    <AmountText amount={share} currency={currency} decimals={share % 1 ? 2 : 0} />
                  </div>
                </div>
              </div>
            );
          })}
          <div className="h-4" />
        </div>
      </div>
    </div>
  );
}
