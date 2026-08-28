import { X } from 'lucide-react';
import { AmountText } from './AmountText';
import { categoryTint } from './categoryColors';
import { t } from '../i18n';
import { monthsShort } from '../i18n/store';
import type { Trip } from '../lib/trips';
import type { Category } from '../types';

interface TripsSheetProps {
  trips: Trip[];
  travel: Category;
  currency: string;
  onOpen: (trip: Trip) => void;
  onClose: () => void;
}

/** At most this many bars; the rest is one segment, or a five-euro
 *  subcategory gets a sliver nobody can see and a legend entry anyway. */
const MAX_PARTS = 5;

/**
 * One hue, stepped. Every row in a trip is the SAME category, so five
 * unrelated colours would say five categories; the ramp says one thing seen in
 * parts.
 *
 * The floor is 0.34 rather than the 0.2 this started at because the tint is
 * alpha over the category's solid, composited against whatever is behind it:
 * on a dark card the faintest steps came out within a few units of the card
 * itself, and the last two segments - plus their legend dots - simply were not
 * there.
 */
const ALPHAS = [1, 0.82, 0.64, 0.48, 0.34];

function monthLabel(month: string): string {
  const [year, m] = month.split('-');
  return `${monthsShort()[Number(m) - 1] ?? ''} ${year}`;
}

function TripCard({ trip, travel, currency, onOpen }: { trip: Trip; travel: Category; currency: string; onOpen: () => void }) {
  // Everything past the fifth subcategory becomes one segment. Named rather
  // than hidden: a trip whose total does not match its own bars is worse than
  // a coarser breakdown.
  const head = trip.parts.slice(0, MAX_PARTS - 1);
  const tail = trip.parts.slice(MAX_PARTS - 1);
  const tailAmount = tail.reduce((sum, p) => sum + p.amount, 0);
  const parts = tail.length > 1
    ? [...head, { name: t('trips.other'), amount: tailAmount }]
    : trip.parts.slice(0, MAX_PARTS);

  return (
    <button
      data-trip-card={trip.key}
      onClick={onOpen}
      className="w-full text-left rounded-2xl px-4 py-3.5 flex flex-col gap-2.5 transition-transform active:scale-[0.99]"
      style={{ backgroundColor: 'var(--bg-card)' }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate" style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.3px', color: 'var(--ink)' }}>
            {trip.name}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--ink-2)', marginTop: 1 }}>
            {t(trip.rows.length === 1 ? 'trips.rows.one' : 'trips.rows.other', { n: trip.rows.length })}
            {' · '}
            {monthLabel(trip.month)}
          </div>
        </div>
        <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--ink)' }} className="tabular-nums flex-shrink-0">
          <AmountText amount={trip.total} currency={currency} decimals={2} />
        </div>
      </div>

      <div className="flex gap-[2px] h-2 rounded-full overflow-hidden">
        {parts.map((p, i) => (
          <span
            key={`${p.name}-${i}`}
            style={{
              width: `${trip.total > 0 ? (p.amount / trip.total) * 100 : 0}%`,
              backgroundColor: categoryTint(travel.color, ALPHAS[i] ?? 0.2),
            }}
          />
        ))}
      </div>

      <div className="flex flex-wrap" style={{ gap: '3px 12px', fontSize: 11, fontWeight: 500, color: 'var(--ink-2)' }}>
        {parts.map((p, i) => (
          <span key={`l-${p.name}-${i}`} className="inline-flex items-center gap-1.5">
            <i
              className="inline-block rounded-sm"
              style={{ width: 7, height: 7, backgroundColor: categoryTint(travel.color, ALPHAS[i] ?? 0.2) }}
            />
            {p.name ?? t('tcb.noSub')}{' '}
            <b style={{ color: 'var(--ink)', fontWeight: 600 }} className="tabular-nums">
              <AmountText amount={p.amount} currency={currency} decimals={2} />
            </b>
          </span>
        ))}
      </div>
    </button>
  );
}

/**
 * Every trip in the ledger, each one answering "how much, when, and made of
 * what" without a tap.
 *
 * Not period-scoped, and it cannot be: a trip's flights are booked months
 * before the trip is taken, so any month you picked would cut it in half.
 * That is also why this is a sheet reached from a menu rather than a card on a
 * screen that has a period selector at the top - two totals on one screen
 * measuring different spans read as a bug, whichever one is right.
 */
export function TripsSheet({ trips, travel, currency, onOpen, onClose }: TripsSheetProps) {
  const total = trips.reduce((sum, tr) => sum + tr.total, 0);

  return (
    <div data-overlay className="fixed inset-0 z-[70] flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        data-trips-sheet
        className="relative w-full max-w-[430px] mx-auto rounded-t-3xl shadow-xl animate-slide-up flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: 'var(--bg-page)', maxHeight: '86vh' }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 flex-shrink-0">
          <div className="min-w-0">
            <h2 style={{ color: 'var(--ink)', fontSize: 24, fontWeight: 800, letterSpacing: '-0.6px' }}>
              {t('trips.title')}
            </h2>
            <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginTop: 1 }}>
              {t(trips.length === 1 ? 'trips.meta.one' : 'trips.meta.other', { n: trips.length })}
              {' · '}
              <AmountText amount={total} currency={currency} decimals={2} />
              {' '}
              {t('trips.inAll')}
            </p>
          </div>
          <button
            data-trips-close
            onClick={onClose}
            aria-label={t('common.done')}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full active:bg-neutral-200"
            style={{ backgroundColor: 'var(--bg-inset)' }}
          >
            <X size={18} style={{ color: 'var(--ink)' }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3.5 pb-6 flex flex-col gap-2.5">
          {trips.map((trip) => (
            <TripCard key={trip.key} trip={trip} travel={travel} currency={currency} onOpen={() => onOpen(trip)} />
          ))}
        </div>
      </div>
    </div>
  );
}
