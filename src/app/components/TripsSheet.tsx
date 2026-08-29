import { useMemo, useState } from 'react';
import { X, Pencil, Plus, AlertTriangle } from 'lucide-react';
import { AmountText } from './AmountText';
import { t } from '../i18n';
import { monthsShort } from '../i18n/store';
import {
  addDays, freeExpenses, isTripName, tripBodyOf, tripCandidates, tripCandidateWindow,
  tripMergeTarget, MIN_TRIP_ROWS, type Trip,
} from '../lib/trips';
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
  /**
   * The whole edit, in the two writes the app already has: put these rows in
   * a trip called this, and take those out of one. Nothing else can change a
   * trip, because a trip is nothing but the name on the front of a
   * description.
   */
  onApply: (change: { assign: string[]; name: string; drop: string[] }) => void;
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
  onEdit,
}: {
  trip: Trip;
  travel: Category;
  currency: string;
  onOpen: () => void;
  onEdit: () => void;
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
            {/* Down here, not beside the total: what it opens is the trip's
                own contents, and the total is the number people came to read.
                Swipe was the other candidate and lost - in this app a swipe
                deletes, and one gesture may not mean two things. */}
            <button
              data-trip-rename={trip.key}
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              aria-label={t('trips.editAria', { name: trip.name })}
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
export function TripsSheet({ trips, travel, currency, transactions, amountOf, onOpen, onApply, onClose }: TripsSheetProps) {
  const total = trips.reduce((sum, tr) => sum + tr.total, 0);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [building, setBuilding] = useState(false);

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
              {trips.length === 0 ? t('trips.meta.none') : (
                <>
                  {t(trips.length === 1 ? 'trips.meta.one' : 'trips.meta.other', { n: trips.length })}
                  {' · '}
                  <AmountText amount={total} currency={currency} decimals={2} />
                  {' '}
                  {t('trips.inAll')}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Building a trip out of expenses you already have was only ever
                reachable by holding a row down in Activity and finding an
                aeroplane. Here is where somebody looking at their trips and
                wanting another one actually reaches. */}
            <button
              data-trips-new
              onClick={() => setBuilding(true)}
              aria-label={t('trips.newTitle')}
              className="w-9 h-9 flex items-center justify-center rounded-full active:bg-neutral-200"
              style={{ backgroundColor: 'var(--bg-inset)' }}
            >
              <Plus size={19} style={{ color: 'var(--ink)' }} strokeWidth={2.2} />
            </button>
            <button
              data-trips-close
              onClick={onClose}
              aria-label={t('common.done')}
              className="w-9 h-9 flex items-center justify-center rounded-full active:bg-neutral-200"
              style={{ backgroundColor: 'var(--bg-inset)' }}
            >
              <X size={18} style={{ color: 'var(--ink)' }} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3.5 pb-6 flex flex-col gap-2.5">
          {/* An empty list with a + in the corner says nothing about what a
              trip is or why anyone would want one. This is the only screen
              that ever gets to explain it, so it does. */}
          {trips.length === 0 && (
            <div data-trips-empty className="px-2 pt-2">
              <p style={{ color: 'var(--ink-2)', fontSize: 13.5, lineHeight: 1.5 }}>
                {t('trips.emptyBody')}
              </p>
              <button
                data-trips-empty-cta
                onClick={() => setBuilding(true)}
                className="mt-4 px-4 py-2.5 rounded-xl font-medium active:scale-[0.98] transition-transform"
                style={{ backgroundColor: '#4F74F3', color: '#FFFFFF', fontSize: 14.5 }}
              >
                {t('trips.emptyCta')}
              </button>
            </div>
          )}
          {trips.map((trip) => (
            <TripCard
              key={trip.key}
              trip={trip}
              travel={travel}
              currency={currency}
              onOpen={() => onOpen(trip)}
              onEdit={() => setEditing(trip)}
            />
          ))}
        </div>
      </div>

      {building && (
        <NewTrip
          travel={travel}
          transactions={transactions}
          currency={currency}
          amountOf={amountOf}
          onCancel={() => setBuilding(false)}
          onApply={(change) => {
            onApply(change);
            setBuilding(false);
          }}
        />
      )}

      {editing && (
        <EditTrip
          trip={editing}
          travel={travel}
          transactions={transactions}
          currency={currency}
          amountOf={amountOf}
          onCancel={() => setEditing(null)}
          onApply={(change) => {
            onApply(change);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}


/**
 * One expense on a tick list, in the four states it can be in.
 *
 * Module-level rather than nested, because the editor and the builder show
 * the same rows and a second copy of this would be a second chance for the
 * two screens to drift apart on what a struck-through row looks like.
 */
function TripRow({
  row,
  mark,
  onToggle,
  body,
  note,
  currency,
  amountOf,
}: {
  row: Transaction;
  /** in = in the trip, out = ticked out, off = could join, add = ticked in. */
  mark: 'in' | 'out' | 'off' | 'add';
  onToggle: () => void;
  body: string;
  note: string;
  currency: string;
  amountOf: (t: Transaction) => number;
}) {
  const faded = mark === 'out';
  return (
    <button
      data-trip-row={row.id}
      data-trip-row-mark={mark}
      onClick={onToggle}
      className="w-full flex items-center gap-3 py-2 text-left"
    >
      <span
        className="w-5 h-5 rounded-full flex-shrink-0 grid place-items-center"
        style={
          mark === 'in' ? { backgroundColor: '#4F74F3', color: '#fff' }
          : mark === 'add' ? { backgroundColor: '#2E7D52', color: '#fff' }
          : mark === 'out' ? { border: '1.5px solid var(--tone-over)', color: 'var(--tone-over)' }
          : { border: '1.5px solid var(--line)' }
        }
      >
        <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1 }}>
          {mark === 'in' ? '\u2713' : mark === 'add' ? '+' : mark === 'out' ? '\u2212' : ''}
        </span>
      </span>
      <span className="flex-1 min-w-0">
        <span
          className="block truncate"
          style={{
            fontSize: 13, fontWeight: 500,
            color: faded ? 'var(--disabled)' : 'var(--ink)',
            textDecoration: faded ? 'line-through' : undefined,
          }}
        >
          {body}
        </span>
        <span className="block truncate" style={{ fontSize: 11, color: 'var(--ink-2)' }}>{note}</span>
      </span>
      <span
        className="tabular-nums flex-shrink-0"
        style={{
          fontSize: 13, fontWeight: 600,
          color: faded ? 'var(--disabled)' : 'var(--ink)',
          textDecoration: faded ? 'line-through' : undefined,
        }}
      >
        <AmountText amount={Math.abs(amountOf(row))} currency={currency} decimals={2} />
      </span>
    </button>
  );
}

/** "13 Mar", in the user's own month names. */
const dayLabel = (date: string) =>
  `${Number(date.slice(8, 10))} ${monthsShort()[Number(date.slice(5, 7)) - 1] ?? ''}`;

/**
 * Edit a trip: its name, and who is in it.
 *
 * Both are the same write. A trip has no record of its own - it is the name on
 * the front of its expenses' descriptions - so renaming it, adding a row and
 * removing one are one operation with different arguments. That is why this is
 * one sheet rather than a rename here and a membership editor somewhere else:
 * splitting them would describe a distinction that does not exist underneath.
 *
 * NOTHING IS WRITTEN UNTIL SAVE. That is what makes the total at the top worth
 * having: it moves as you tick, so the trip you are about to end up with is on
 * screen before you commit to it, rather than something to discover afterwards
 * by comparing two numbers you never saw side by side.
 *
 * Two things it owes the user before the button does anything: whether the app
 * will still recognise the trip afterwards (the name), and whether the trip is
 * about to stop existing (the floor).
 */
const NEAR_PAD = 7;
/** Wide enough to reach a flight booked for a summer holiday in March. */
const WIDE_PAD = 180;
/**
 * How much of the trip is shown before "show all".
 *
 * Enough to recognise the trip, and no more: the rows already in it are
 * reference - the total above summarises them - while the short list of rows
 * that could JOIN is the part with something to do in it. Uncapped, a
 * fifty-six row holiday pushed that list three thousand pixels down a sheet
 * nobody scrolls, which is the same as not having built it.
 */
const FIRST_ROWS = 5;

function EditTrip({
  trip,
  travel,
  transactions,
  currency,
  amountOf,
  onCancel,
  onApply,
}: {
  trip: Trip;
  travel: Category;
  transactions: Transaction[];
  currency: string;
  amountOf: (t: Transaction) => number;
  onCancel: () => void;
  onApply: (change: { assign: string[]; name: string; drop: string[] }) => void;
}) {
  const [name, setName] = useState(trip.name);
  const [dropped, setDropped] = useState<Set<string>>(() => new Set());
  const [added, setAdded] = useState<Set<string>>(() => new Set());
  const [wide, setWide] = useState(false);
  // One-way: a row ticked out after expanding must not be hidden again by
  // collapsing, or the total would count something invisible.
  const [allRows, setAllRows] = useState(false);

  const clean = name.trim();
  const valid = isTripName(clean);
  const renamed = clean !== trip.name;
  const tripIds = useMemo(() => new Set(trip.rows.map((r) => r.id)), [trip]);
  // Only worth computing once the name would actually survive.
  const merge = valid && renamed ? tripMergeTarget(transactions, tripIds, clean, travel, amountOf) : null;

  const pad = wide ? WIDE_PAD : NEAR_PAD;
  const near = useMemo(() => tripCandidates(transactions, trip, pad), [transactions, trip, pad]);
  const window = tripCandidateWindow(trip, pad);

  // Anything ticked stays on screen even after the window narrows under it -
  // a row that vanished while still counted in the total would be a number
  // nobody could account for.
  const offered = useMemo(() => {
    const seen = new Set(near.map((r) => r.id));
    const strays = transactions.filter((r) => added.has(r.id) && !seen.has(r.id));
    return [...near, ...strays].sort((a, b) => b.date.localeCompare(a.date));
  }, [near, transactions, added]);

  const kept = trip.rows.filter((r) => !dropped.has(r.id));
  const joining = offered.filter((r) => added.has(r.id));
  const rows = [...kept, ...joining];
  const total = rows.reduce((sum, r) => sum + Math.abs(amountOf(r)), 0);
  const changed = renamed || dropped.size > 0 || added.size > 0;
  const belowFloor = rows.length < MIN_TRIP_ROWS;

  const toggle = (set: Set<string>, put: (s: Set<string>) => void) => (id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    put(next);
  };
  const toggleDrop = toggle(dropped, setDropped);
  const toggleAdd = toggle(added, setAdded);

  return (
    <div data-overlay className="fixed inset-0 z-[80] flex items-end justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        data-trip-edit-sheet
        className="relative w-full max-w-[430px] rounded-t-3xl animate-slide-up flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: 'var(--bg-page)', maxHeight: '92vh', minHeight: '70vh' }}
      >
        <div className="px-5 pt-5 pb-3 flex-shrink-0">
          <h3 style={{ color: 'var(--ink)', fontSize: 17, fontWeight: 700 }}>{t('trips.editTitle')}</h3>

          <input
            data-trip-rename-input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={t('trips.renameTitle')}
            className="w-full px-4 py-3 rounded-xl mt-2.5"
            style={{
              // 16px: below that iOS zooms the page in on focus.
              fontSize: 16,
              color: 'var(--ink)',
              backgroundColor: valid || !clean ? 'var(--bg-card)' : 'var(--wash-over)',
              border: '1px solid var(--line-2)',
              outline: 'none',
            }}
          />

          {/* Said only once it applies: a rename is not one row, it is every
              row the trip has. */}
          {renamed && valid && (
            <p data-trip-rename-note className="mt-2" style={{ color: 'var(--ink-2)', fontSize: 12, lineHeight: 1.4 }}>
              {t('trips.renameBody')}
            </p>
          )}
          {clean && !valid && (
            <p data-trip-rename-error className="mt-2 flex gap-1.5" style={{ color: 'var(--tone-over)', fontSize: 12, lineHeight: 1.4 }}>
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ marginTop: 1 }} strokeWidth={2.2} />
              <span>{t('trips.renameInvalid')}</span>
            </p>
          )}
          {/* Merging is a legitimate use of this - two spellings of one holiday
              - but it is not what most people mean, and renaming back does not
              undo it. Said before the tap, never after. */}
          {merge && (
            <p data-trip-rename-merge className="mt-2 flex gap-1.5" style={{ color: 'var(--ink-2)', fontSize: 12, lineHeight: 1.4 }}>
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ marginTop: 1, color: 'var(--tone-warn, var(--ink-2))' }} strokeWidth={2.2} />
              <span>{t('trips.renameMerge', { name: merge.name, month: monthLabel(merge.month) })}</span>
            </p>
          )}

          {/* The number the ticking is for. It moves as you go, so the trip
              you are about to have is on screen before you commit to it. */}
          <div data-trip-edit-total className="flex items-baseline gap-2 mt-3">
            {changed && (
              <>
                <span className="tabular-nums" style={{ fontSize: 14, color: 'var(--disabled)', textDecoration: 'line-through' }}>
                  <AmountText amount={trip.total} currency={currency} decimals={2} />
                </span>
                <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>→</span>
              </>
            )}
            <span className="tabular-nums" style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.4px', color: 'var(--ink)' }}>
              <AmountText amount={total} currency={currency} decimals={2} />
            </span>
            <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>
              {t(rows.length === 1 ? 'trips.rows.one' : 'trips.rows.other', { n: rows.length })}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          <div className="mt-1 mb-1" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--ink-3, var(--ink-2))' }}>
            {t('trips.inTrip')}
          </div>
          <div className="rounded-xl px-3.5 py-1" style={{ backgroundColor: 'var(--bg-card)' }}>
            {(allRows ? trip.rows : trip.rows.slice(0, FIRST_ROWS)).map((row) => (
              <TripRow
                key={row.id}
                row={row}
                mark={dropped.has(row.id) ? 'out' : 'in'}
                onToggle={() => toggleDrop(row.id)}
                body={tripBodyOf(row.description) || row.description}
                note={dropped.has(row.id)
                  ? t('trips.takenOut')
                  : `${row.subcategory ?? travel.name} · ${dayLabel(row.date)}`}
                currency={currency}
                amountOf={amountOf}
              />
            ))}
            {!allRows && trip.rows.length > FIRST_ROWS && (
              <button
                data-trip-show-all
                onClick={() => setAllRows(true)}
                className="w-full py-2.5 text-left"
                style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--accent-ink)' }}
              >
                {t('trips.showAll', { n: trip.rows.length - FIRST_ROWS })}
              </button>
            )}
          </div>

          <div className="mt-4 mb-1 flex items-baseline justify-between gap-3">
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--ink-3, var(--ink-2))' }}>
              {t('trips.nearby')}
            </span>
            {/* The window said out loud, so what is on offer is never a
                mystery - and a way to widen it, because a flight booked in
                March for an August trip falls nowhere near the holiday. */}
            <button
              data-trip-widen
              onClick={() => setWide((v) => !v)}
              style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--accent-ink)' }}
            >
              {wide ? t('trips.narrower') : t('trips.wider')}
            </button>
          </div>
          <div data-trip-window className="mb-1.5" style={{ fontSize: 11, color: 'var(--ink-2)' }}>
            {dayLabel(window.from)} – {dayLabel(window.to)}
          </div>

          {offered.length === 0 ? (
            <p data-trip-none className="px-1 py-3" style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.45 }}>
              {t('trips.noNearby')}
            </p>
          ) : (
            <div className="rounded-xl px-3.5 py-1" style={{ backgroundColor: 'var(--bg-card)' }}>
              {offered.map((row) => (
                <TripRow
                  key={row.id}
                  row={row}
                  mark={added.has(row.id) ? 'add' : 'off'}
                  onToggle={() => toggleAdd(row.id)}
                  body={row.description}
                  note={`${row.category?.name ?? ''} · ${dayLabel(row.date)}`}
                  currency={currency}
                  amountOf={amountOf}
                />
              ))}
            </div>
          )}
        </div>

        <div
          className="flex-shrink-0 px-5 pt-3"
          style={{ backgroundColor: 'var(--bg-page)', paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
        >
          {/* The cliff, said before the tap. It does not block: the rows keep
              their name and their category, so the trip comes back the moment
              one of them is put back - and deciding a weekend was not really a
              trip is a legitimate thing to want. */}
          {belowFloor && (
            <p data-trip-floor className="mb-2.5 flex gap-1.5 px-3 py-2.5 rounded-xl"
              style={{ backgroundColor: 'var(--wash-over)', color: 'var(--tone-over)', fontSize: 12, lineHeight: 1.4 }}>
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ marginTop: 1 }} strokeWidth={2.2} />
              <span>{t('trips.floor', { n: MIN_TRIP_ROWS })}</span>
            </p>
          )}
          <div className="flex gap-2.5">
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
              onClick={() => onApply({
                // A rename touches every row; adding one touches only what was
                // added. Rewriting all fifty-six to remove one would stamp
                // every one of them as changed for the next sync.
                assign: (renamed ? rows : joining).map((r) => r.id),
                name: clean,
                drop: [...dropped],
              })}
              className="flex-1 py-3 rounded-xl font-medium transition-all active:scale-[0.98]"
              style={{
                backgroundColor: valid && changed ? '#4F74F3' : 'var(--line)',
                color: valid && changed ? '#FFFFFF' : 'var(--disabled)',
                fontSize: 14.5,
              }}
            >
              {t('common.save')}
              {changed && (added.size > 0 || dropped.size > 0) && (
                <span style={{ opacity: 0.75, fontWeight: 400 }}>
                  {` · ${added.size ? `+${added.size}` : ''}${added.size && dropped.size ? ' ' : ''}${dropped.size ? `−${dropped.size}` : ''}`}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Build a trip out of expenses that are already in the ledger.
 *
 * This existed before, in the one place nobody would look for it: hold a row
 * down in Activity, tick some more, tap the aeroplane, "New trip...". Every
 * piece of it worked. It was reachable only by somebody who already knew.
 *
 * So it moves to the + beside the sheet's close button, where a person
 * looking at their trips and wanting another one would actually reach - and
 * it becomes the same screen as the editor rather than a name box: you name
 * it and pick its expenses in one go, watching the total build.
 *
 * The window is recent-first rather than a trip's own dates, because a trip
 * being built has no dates yet - the rows are what will give it any.
 */
const NEW_NEAR_DAYS = 60;
const NEW_WIDE_DAYS = 365;

function NewTrip({
  travel,
  transactions,
  currency,
  amountOf,
  onCancel,
  onApply,
}: {
  travel: Category;
  transactions: Transaction[];
  currency: string;
  amountOf: (t: Transaction) => number;
  onCancel: () => void;
  onApply: (change: { assign: string[]; name: string; drop: string[] }) => void;
}) {
  const [name, setName] = useState('');
  const [added, setAdded] = useState<Set<string>>(() => new Set());
  const [wide, setWide] = useState(false);

  const clean = name.trim();
  const valid = isTripName(clean);

  const today = new Date().toISOString().slice(0, 10);
  const from = addDays(today, -(wide ? NEW_WIDE_DAYS : NEW_NEAR_DAYS));
  const free = useMemo(
    () => freeExpenses(transactions, from, today, 60),
    [transactions, from, today],
  );
  // Ticked rows stay on screen after the window narrows under them, or the
  // total would count something invisible.
  const offered = useMemo(() => {
    const seen = new Set(free.map((r) => r.id));
    const strays = transactions.filter((r) => added.has(r.id) && !seen.has(r.id));
    return [...free, ...strays].sort((a, b) => b.date.localeCompare(a.date));
  }, [free, transactions, added]);

  const rows = offered.filter((r) => added.has(r.id));
  const total = rows.reduce((sum, r) => sum + Math.abs(amountOf(r)), 0);
  const belowFloor = rows.length > 0 && rows.length < MIN_TRIP_ROWS;
  // Naming a new trip after one that already sits in those weeks joins them.
  // The same surprise as renaming onto it, so the same sentence.
  const merge = useMemo(
    () => (valid && rows.length
      ? tripMergeTarget(transactions, new Set(rows.map((r) => r.id)), clean, travel, amountOf)
      : null),
    [valid, rows, transactions, clean, travel, amountOf],
  );

  const toggle = (id: string) => {
    const next = new Set(added);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAdded(next);
  };

  return (
    <div data-overlay className="fixed inset-0 z-[80] flex items-end justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        data-trip-new-sheet
        className="relative w-full max-w-[430px] rounded-t-3xl animate-slide-up flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: 'var(--bg-page)', maxHeight: '92vh', minHeight: '70vh' }}
      >
        <div className="px-5 pt-5 pb-3 flex-shrink-0">
          <h3 style={{ color: 'var(--ink)', fontSize: 17, fontWeight: 700 }}>{t('trips.newTitle')}</h3>

          <input
            data-trip-new-name
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('sel.tripNewPh')}
            aria-label={t('trips.newTitle')}
            className="w-full px-4 py-3 rounded-xl mt-2.5"
            style={{
              // 16px: below that iOS zooms the page in on focus.
              fontSize: 16,
              color: 'var(--ink)',
              backgroundColor: valid || !clean ? 'var(--bg-card)' : 'var(--wash-over)',
              border: '1px solid var(--line-2)',
              outline: 'none',
            }}
          />

          {clean && !valid && (
            <p data-trip-new-error className="mt-2 flex gap-1.5" style={{ color: 'var(--tone-over)', fontSize: 12, lineHeight: 1.4 }}>
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ marginTop: 1 }} strokeWidth={2.2} />
              <span>{t('trips.renameInvalid')}</span>
            </p>
          )}
          {merge && (
            <p data-trip-new-merge className="mt-2 flex gap-1.5" style={{ color: 'var(--ink-2)', fontSize: 12, lineHeight: 1.4 }}>
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ marginTop: 1, color: 'var(--tone-warn, var(--ink-2))' }} strokeWidth={2.2} />
              <span>{t('trips.renameMerge', { name: merge.name, month: monthLabel(merge.month) })}</span>
            </p>
          )}

          <div data-trip-new-total className="flex items-baseline gap-2 mt-3">
            <span className="tabular-nums" style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.4px', color: 'var(--ink)' }}>
              <AmountText amount={total} currency={currency} decimals={2} />
            </span>
            <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>
              {t(rows.length === 1 ? 'trips.rows.one' : 'trips.rows.other', { n: rows.length })}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          <div className="mt-1 mb-1 flex items-baseline justify-between gap-3">
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--ink-3, var(--ink-2))' }}>
              {t('trips.pick')}
            </span>
            <button
              data-trip-new-widen
              onClick={() => setWide((v) => !v)}
              style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--accent-ink)' }}
            >
              {wide ? t('trips.recent') : t('trips.wider')}
            </button>
          </div>
          <div data-trip-new-window className="mb-1.5" style={{ fontSize: 11, color: 'var(--ink-2)' }}>
            {dayLabel(from)} – {dayLabel(today)}
          </div>

          {offered.length === 0 ? (
            <p data-trip-new-none className="px-1 py-3" style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.45 }}>
              {t('trips.noNearby')}
            </p>
          ) : (
            <div className="rounded-xl px-3.5 py-1" style={{ backgroundColor: 'var(--bg-card)' }}>
              {offered.map((row) => (
                <TripRow
                  key={row.id}
                  row={row}
                  mark={added.has(row.id) ? 'add' : 'off'}
                  onToggle={() => toggle(row.id)}
                  body={row.description}
                  note={`${row.category?.name ?? ''} · ${dayLabel(row.date)}`}
                  currency={currency}
                  amountOf={amountOf}
                />
              ))}
            </div>
          )}
        </div>

        <div
          className="flex-shrink-0 px-5 pt-3"
          style={{ backgroundColor: 'var(--bg-page)', paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
        >
          {/* Same cliff as the editor's, said in advance rather than enforced:
              two expenses will not be read back as a trip, and the rows would
              sit there wearing a name that groups nothing. */}
          {belowFloor && (
            <p data-trip-new-floor className="mb-2.5 flex gap-1.5 px-3 py-2.5 rounded-xl"
              style={{ backgroundColor: 'var(--wash-over)', color: 'var(--tone-over)', fontSize: 12, lineHeight: 1.4 }}>
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ marginTop: 1 }} strokeWidth={2.2} />
              <span>{t('trips.floor', { n: MIN_TRIP_ROWS })}</span>
            </p>
          )}
          <div className="flex gap-2.5">
            <button
              onClick={onCancel}
              className="flex-1 py-3 rounded-xl font-medium"
              style={{ backgroundColor: 'var(--bg-inset)', color: 'var(--ink)', fontSize: 14.5 }}
            >
              {t('common.cancel')}
            </button>
            <button
              data-trip-new-save
              disabled={!valid || rows.length === 0}
              onClick={() => onApply({ assign: rows.map((r) => r.id), name: clean, drop: [] })}
              className="flex-1 py-3 rounded-xl font-medium transition-all active:scale-[0.98]"
              style={{
                backgroundColor: valid && rows.length ? '#4F74F3' : 'var(--line)',
                color: valid && rows.length ? '#FFFFFF' : 'var(--disabled)',
                fontSize: 14.5,
              }}
            >
              {t('common.save')}
              {rows.length > 0 && <span style={{ opacity: 0.75, fontWeight: 400 }}>{` · ${rows.length}`}</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
