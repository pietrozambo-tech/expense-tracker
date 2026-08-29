import { useState } from 'react';
import { X, Pencil, AlertTriangle } from 'lucide-react';
import { AmountText } from './AmountText';
import { t } from '../i18n';
import { monthsShort } from '../i18n/store';
import { isTripName, tripBodyOf, tripMergeTarget, TRIP_SEP, type Trip } from '../lib/trips';
import type { Category, Transaction } from '../types';

interface TripsSheetProps {
  trips: Trip[];
  travel: Category;
  currency: string;
  /** The whole ledger - what a rename would merge with is answered by doing
   *  the rename on a copy and re-detecting, not by guessing. */
  transactions: Transaction[];
  amountOf: (t: Transaction) => number;
  onOpen: (trip: Trip) => void;
  /** The same write "assign to trip" makes: the name on the front of every
   *  one of this trip's descriptions. */
  onRename: (ids: string[], name: string) => void;
  onClose: () => void;
}

/** At most this many bars; the rest is one segment, or a five-euro
 *  subcategory gets a sliver nobody can see and a legend entry anyway. */
const MAX_PARTS = 5;

const SLOTS = 5;

/**
 * Which colour a subcategory wears - decided by the subcategory, never by how
 * much it happens to have cost.
 *
 * Taking the slots in amount order was the obvious thing and the wrong one:
 * Hotel would be blue on one trip and orange on the next, and adding a dinner
 * that overtook it would repaint both. The user's own subcategory order is
 * stable, means something to them, and gives Hotel the same colour on every
 * card in the sheet.
 *
 * A collision - two subcategories five apart in a long list - walks to the
 * next free slot, so within one card no two parts ever share a colour.
 */
function assignSlots(names: (string | null)[], order: string[]): Map<string, number> {
  const used = new Set<number>();
  const slots = new Map<string, number>();
  for (const name of names) {
    if (name === null || slots.has(name)) continue;
    const i = order.indexOf(name);
    let s = i >= 0
      ? i % SLOTS
      // Not one of the category's own subcategories (renamed, or arrived with
      // an import): a stable hash still beats a running counter, which would
      // shift every colour when a row above it changed.
      : [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7) % SLOTS;
    for (let guard = 0; guard < SLOTS && used.has(s); guard++) s = (s + 1) % SLOTS;
    used.add(s);
    slots.set(name, s);
  }
  return slots;
}

function monthLabel(month: string): string {
  const [year, m] = month.split('-');
  return `${monthsShort()[Number(m) - 1] ?? ''} ${year}`;
}

function TripCard({
  trip,
  travel,
  currency,
  onOpen,
  onRename,
}: {
  trip: Trip;
  travel: Category;
  currency: string;
  onOpen: () => void;
  onRename: () => void;
}) {
  // Everything past the fifth subcategory becomes one segment. Named rather
  // than hidden: a trip whose total does not match its own bars is worse than
  // a coarser breakdown.
  const head = trip.parts.slice(0, MAX_PARTS - 1);
  const tail = trip.parts.slice(MAX_PARTS - 1);
  const tailAmount = tail.reduce((sum, p) => sum + p.amount, 0);
  const folded = tail.length > 1;
  const parts = folded
    ? [...head, { name: null as string | null, amount: tailAmount }]
    : trip.parts.slice(0, MAX_PARTS);

  const slots = assignSlots(parts.map((p) => p.name), travel.subcategories ?? []);
  const paint = (name: string | null, isRest: boolean) =>
    name === null
      ? `var(--series-${isRest ? 'rest' : 'none'})`
      : `var(--series-${(slots.get(name) ?? 0) + 1})`;
  const label = (name: string | null, isRest: boolean) =>
    name === null ? (isRest ? t('trips.other') : t('tcb.noSub')) : name;

  return (
    // role=button rather than a real <button>, because the pencil inside is
    // one and a button cannot contain a button. Same shape the budget card
    // uses: click, Enter and Space all open the trip.
    <div
      data-trip-card={trip.key}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="w-full text-left rounded-2xl px-4 py-3.5 flex flex-col gap-2.5 transition-transform active:scale-[0.99]"
      style={{ backgroundColor: 'var(--bg-card)' }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate" style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.3px', color: 'var(--ink)' }}>
            {trip.name}
          </div>
          <div className="flex items-center gap-1.5" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--ink-2)', marginTop: 1 }}>
            <span className="truncate">
              {t(trip.rows.length === 1 ? 'trips.rows.one' : 'trips.rows.other', { n: trip.rows.length })}
              {' · '}
              {monthLabel(trip.month)}
            </span>
            {/* Down here, not beside the total: the name is what it edits, and
                the total is the number people came to read. Swipe was the
                other candidate and lost - in this app a swipe deletes, and one
                gesture may not mean two things. */}
            <button
              data-trip-rename={trip.key}
              onClick={(e) => { e.stopPropagation(); onRename(); }}
              aria-label={t('trips.renameAria', { name: trip.name })}
              className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform"
              style={{ backgroundColor: 'var(--bg-inset)' }}
            >
              <Pencil className="w-3 h-3" style={{ color: 'var(--ink-2)' }} strokeWidth={2.2} />
            </button>
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
              backgroundColor: paint(p.name, folded && i === parts.length - 1),
            }}
          />
        ))}
      </div>

      <div className="flex flex-wrap" style={{ gap: '3px 12px', fontSize: 11, fontWeight: 500, color: 'var(--ink-2)' }}>
        {parts.map((p, i) => (
          <span key={`l-${p.name}-${i}`} className="inline-flex items-center gap-1.5">
            <i
              className="inline-block rounded-sm"
              style={{ width: 7, height: 7, backgroundColor: paint(p.name, folded && i === parts.length - 1) }}
            />
            {label(p.name, folded && i === parts.length - 1)}{' '}
            <b style={{ color: 'var(--ink)', fontWeight: 600 }} className="tabular-nums">
              <AmountText amount={p.amount} currency={currency} decimals={2} />
            </b>
          </span>
        ))}
      </div>
    </div>
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
export function TripsSheet({ trips, travel, currency, transactions, amountOf, onOpen, onRename, onClose }: TripsSheetProps) {
  const total = trips.reduce((sum, tr) => sum + tr.total, 0);
  const [renaming, setRenaming] = useState<Trip | null>(null);

  return (
    <div data-overlay className="fixed inset-0 z-[70] flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      {/* Two thirds of the screen at least, and never the whole of it.
          With only a maxHeight the sheet hugged its content, so one trip drew
          a strip across the bottom third: the summary you opened sat in the
          smallest part of the screen while the transaction list you were
          leaving kept the rest, and attention stayed on the background.
          A floor fixes that. A floor of 85vh - the app's other big sheets -
          does not: a single trip is one card, and five card-heights of empty
          page below it is a different kind of wrong. Two thirds is enough to
          own the screen, and the third of Activity left above says where
          closing it lands. Beyond that the sheet grows with the trips and
          then scrolls. */}
      <div
        data-trips-sheet
        className="relative w-full max-w-[430px] mx-auto rounded-t-3xl shadow-xl animate-slide-up flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: 'var(--bg-page)', minHeight: '66vh', maxHeight: '88vh' }}
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
            <TripCard
              key={trip.key}
              trip={trip}
              travel={travel}
              currency={currency}
              onOpen={() => onOpen(trip)}
              onRename={() => setRenaming(trip)}
            />
          ))}
        </div>
      </div>

      {renaming && (
        <RenameTrip
          trip={renaming}
          travel={travel}
          transactions={transactions}
          amountOf={amountOf}
          onCancel={() => setRenaming(null)}
          onSave={(name) => {
            onRename(renaming.rows.map((r) => r.id), name);
            setRenaming(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Rename a trip - which means rewriting the name on the front of every one of
 * its descriptions, because that name is the only thing that makes those rows
 * a trip.
 *
 * Two things this sheet owes the user before the button does anything:
 * whether the app will still recognise the trip afterwards, and whether it is
 * about to be merged into another one.
 */
function RenameTrip({
  trip,
  travel,
  transactions,
  amountOf,
  onCancel,
  onSave,
}: {
  trip: Trip;
  travel: Category;
  transactions: Transaction[];
  amountOf: (t: Transaction) => number;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(trip.name);
  const clean = name.trim();
  const valid = isTripName(clean);
  const changed = clean !== trip.name;
  // Only worth computing once the name would actually survive.
  const merge = valid && changed ? tripMergeTarget(transactions, trip, clean, travel, amountOf) : null;
  // A real row, so the preview is the change rather than a description of it.
  const sample = tripBodyOf(trip.rows.find((r) => tripBodyOf(r.description))?.description);

  return (
    <div data-overlay className="fixed inset-0 z-[80] flex items-end justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        data-trip-rename-sheet
        className="relative w-full max-w-[430px] rounded-t-3xl px-5 pt-5 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: 'var(--bg-card)', paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
      >
        <h3 style={{ color: 'var(--ink)', fontSize: 17, fontWeight: 700 }}>{t('trips.renameTitle')}</h3>
        <p className="mt-0.5 mb-3" style={{ color: 'var(--ink-2)', fontSize: 12.5, lineHeight: 1.4 }}>
          {t('trips.renameBody')}
        </p>

        <input
          data-trip-rename-input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && valid && changed) onSave(clean); }}
          aria-label={t('trips.renameTitle')}
          className="w-full px-4 py-3 rounded-xl"
          style={{
            // 16px: below that iOS zooms the page in on focus.
            fontSize: 16,
            color: 'var(--ink)',
            backgroundColor: valid || !clean ? 'var(--bg-field)' : 'var(--wash-over)',
            border: 'none',
            outline: 'none',
          }}
        />

        {clean && !valid ? (
          <p data-trip-rename-error className="mt-2 flex gap-1.5" style={{ color: 'var(--tone-over)', fontSize: 12, lineHeight: 1.4 }}>
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ marginTop: 1 }} strokeWidth={2.2} />
            <span>{t('trips.renameInvalid')}</span>
          </p>
        ) : (
          <div className="mt-2.5 px-3.5 py-2.5 rounded-xl" style={{ backgroundColor: 'var(--bg-page)' }}>
            <div style={{ color: 'var(--ink-2)', fontSize: 11 }}>{t('trips.renamePreview')}</div>
            <div data-trip-rename-preview className="truncate" style={{ color: 'var(--ink)', fontSize: 13, fontWeight: 600, marginTop: 1 }}>
              {sample ? `${clean || trip.name}${TRIP_SEP}${sample}` : clean || trip.name}
            </div>
          </div>
        )}

        {/* Merging is a legitimate use of this - two spellings of one holiday -
            but it is not what most people mean, and renaming back does not
            undo it. Said before the tap, never after. */}
        {merge && (
          <p data-trip-rename-merge className="mt-2 flex gap-1.5" style={{ color: 'var(--ink-2)', fontSize: 12, lineHeight: 1.4 }}>
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ marginTop: 1, color: 'var(--tone-warn, var(--ink-2))' }} strokeWidth={2.2} />
            <span>{t('trips.renameMerge', { name: merge.name, month: monthLabel(merge.month) })}</span>
          </p>
        )}

        <div className="flex gap-2.5 mt-4">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl font-medium"
            style={{ backgroundColor: 'var(--bg-inset)', color: 'var(--ink)', fontSize: 14.5 }}
          >
            {t('common.cancel')}
          </button>
          <button
            data-trip-rename-save
            disabled={!valid || !changed}
            onClick={() => onSave(clean)}
            className="flex-1 py-3 rounded-xl font-medium transition-all active:scale-[0.98]"
            style={{
              backgroundColor: valid && changed ? '#4F74F3' : 'var(--line)',
              color: valid && changed ? '#FFFFFF' : 'var(--disabled)',
              fontSize: 14.5,
            }}
          >
            {t(trip.rows.length === 1 ? 'trips.renameCta.one' : 'trips.renameCta.other', { n: trip.rows.length })}
          </button>
        </div>
      </div>
    </div>
  );
}
