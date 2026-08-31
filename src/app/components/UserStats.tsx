import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { aiCostUsd } from '../lib/adminStats';
import type { AdminStats, AdminDay, AdminAccount, AiSpendDay } from '../lib/adminStats';

// The developer screen's user dashboard: a KPI row, thirty days of stacked
// bars, and the addresses behind them.
//
// The chart's one claim is that a day's bar IS that day's active users, split
// by whether each was new. New is a SUBSET of active (see aggregate.ts), so
// the two segments sum to the total rather than double-counting the newcomers
// - the only stacking that cannot mislead.
//
// Two series, so: a legend is always present, both segments are direct-
// labelled through the day list below, and the hues are the validated
// categorical slots 1 and 2 (blue #2a78d6 / orange #eb6834 on light, #3987e5 /
// #d95926 on dark - all six colour checks pass on both surfaces).

const SERIES = {
  returning: { light: '#2a78d6', dark: '#3987e5', label: 'Returning' },
  new: { light: '#eb6834', dark: '#d95926', label: 'New' },
};

const ink = (v: string) => ({ color: `var(${v})` });

/** A short label for a bucket: "19/8" - dense enough for thirty of them. */
const shortDay = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
};

export function UserStats({ stats, dark }: { stats: AdminStats; dark: boolean }) {
  // Tapping a bar names it, rather than hovering - this screen is read on a
  // phone, where there is no pointer to hover with.
  const [picked, setPicked] = useState<string | null>(null);
  // The roster takes over the whole screen rather than unfolding under the
  // chart: it is a list of every account, and inline it would bury the numbers
  // the screen exists for.
  const [roster, setRoster] = useState(false);

  if (roster) return <Roster accounts={stats.accounts} trackingSince={stats.trackingSince} onBack={() => setRoster(false)} />;

  const days = [...stats.days].reverse(); // oldest -> newest, so time runs right
  const peak = Math.max(1, ...days.map((d) => d.active));
  const colour = (k: keyof typeof SERIES) => (dark ? SERIES[k].dark : SERIES[k].light);
  // When the server answered. Without it a refresh that returns the same
  // numbers is indistinguishable from a refresh that never happened.
  const stamp = (() => {
    const t = Date.parse(stats.generatedAt);
    return Number.isFinite(t)
      ? new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '';
  })();

  // Geometry: a fixed viewBox the SVG scales into its box, so the card is the
  // same shape on a 320px phone and an iPad.
  const W = 320;
  const H = 84;
  const slot = W / days.length;
  const barW = Math.max(3, Math.min(9, slot - 2));

  const shown = picked ? days.find((d) => d.date === picked) ?? null : null;

  return (
    <div>
      {/* KPI row: the four numbers worth leading with. */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Tile label="Active today" value={stats.totals.activeToday} accent={colour('returning')} />
        <Tile label="New today" value={stats.totals.newToday} accent={colour('new')} />
        <Tile label="Active, 7 days" value={stats.totals.active7} sub="people, not visits" />
        <Tile
          label="New, 30 days"
          value={stats.totals.new30}
          sub={`${stats.totals.accounts} accounts total`}
          onClick={stats.accounts.length ? () => setRoster(true) : undefined}
        />
      </div>

      {/* Why a number might be smaller than expected, said out loud. An
          allow-listed account is excluded by default - which includes any
          second account of your own that you put on the list - and a blank
          chart otherwise looks like a broken feature rather than a filter. */}
      {!stats.includeSelf && stats.totals.excluded > 0 && (
        <p data-users-excluded className="mb-2" style={{ fontSize: 11.5, lineHeight: 1.45, ...ink('--ink-3') }}>
          Excluding {stats.totals.excluded} admin {stats.totals.excluded === 1 ? 'account' : 'accounts'} (yours).
          Tap "Not counting you" to include {stats.totals.excluded === 1 ? 'it' : 'them'}.
        </p>
      )}

      {/* Legend - never colour alone. */}
      <div className="flex items-center gap-3 mb-1.5">
        {(['returning', 'new'] as const).map((k) => (
          <span key={k} className="flex items-center gap-1.5" style={{ fontSize: 11, ...ink('--ink-2') }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: colour(k) }} />
            {SERIES[k].label}
          </span>
        ))}
        <span className="ml-auto" data-users-stamp style={{ fontSize: 11, ...ink('--ink-3') }}>
          peak {peak}{stamp ? ` · ${stamp}` : ''}
        </span>
      </div>

      <svg
        data-users-chart
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: 84, overflow: 'visible' }}
        role="img"
        aria-label={`Daily active users over ${days.length} days, split into new and returning`}
      >
        {/* A single baseline: recessive, and the only rule the bars need. */}
        <line x1={0} y1={H - 12} x2={W} y2={H - 12} stroke="var(--line-2)" strokeWidth={1} />
        {days.map((d, i) => {
          const x = i * slot + (slot - barW) / 2;
          const full = (d.active / peak) * (H - 20);
          const newH = d.active === 0 ? 0 : (d.new / peak) * (H - 20);
          const retH = Math.max(0, full - newH);
          const base = H - 12;
          const isPicked = picked === d.date;
          return (
            <g key={d.date} onClick={() => setPicked(isPicked ? null : d.date)} style={{ cursor: 'pointer' }}>
              {/* A full-height hit target: a 3px bar is not a tap target. */}
              <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
              {retH > 0 && (
                <rect
                  x={x} y={base - full} width={barW} height={retH}
                  rx={2} fill={colour('returning')} opacity={picked && !isPicked ? 0.35 : 1}
                />
              )}
              {newH > 0 && (
                // 2px of surface between the segments, so the split reads even
                // where the two hues meet.
                <rect
                  x={x} y={base - newH} width={barW} height={Math.max(0, newH - (retH > 0 ? 2 : 0))}
                  rx={2} fill={colour('new')} opacity={picked && !isPicked ? 0.35 : 1}
                />
              )}
              {isPicked && (
                <rect x={x - 1.5} y={base - full - 1.5} width={barW + 3} height={full + 3} rx={3}
                  fill="none" stroke="var(--ink-2)" strokeWidth={1} />
              )}
            </g>
          );
        })}
        {/* Only the ends carry a date: thirty labels would be a smear. */}
        <text x={0} y={H - 2} style={{ fontSize: 8 }} fill="var(--ink-3)">{shortDay(days[0]?.date ?? '')}</text>
        <text x={W} y={H - 2} textAnchor="end" style={{ fontSize: 8 }} fill="var(--ink-3)">
          {shortDay(days[days.length - 1]?.date ?? '')}
        </text>
      </svg>

      {shown && (
        <div data-users-picked className="mt-2 rounded-xl px-3 py-2" style={{ backgroundColor: 'var(--bg-inset)' }}>
          <DayLine day={shown} colour={colour} />
        </div>
      )}

      {/* What the AI import is costing. Absent entirely until the feature has
          spent its first token - a permanent zero would just be furniture.
          English like the rest of this screen: it is the owner's console. */}
      {stats.aiSpend.length > 0 && <AiSpendCard spend={stats.aiSpend} model={stats.aiModel} />}

      {/* The table view: every chart here has one, and on a phone it is often
          the part actually read. */}
      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--line-2)' }}>
        {days.filter((d) => d.active > 0).length === 0 ? (
          <p style={{ fontSize: 11.5, lineHeight: 1.5, ...ink('--ink-3') }}>
            No opens recorded yet. A device records one only when it is
            running a build that includes activity tracking - an app still
            serving a cached bundle writes nothing - and days cannot be
            backfilled, so history starts at the first launch after that.
          </p>
        ) : (
          [...days].reverse().filter((d) => d.active > 0).map((d) => (
            <div key={d.date} data-dev-user-day={d.date} className="py-1.5">
              <DayLine day={d} colour={colour} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * The AI import's bill, said in money.
 *
 * The server counts tokens (ai_import_usage, one row per user per UTC day);
 * this multiplies them by the priced model's list rates at display time - see
 * aiCostUsd for why the money is never computed server-side. "~" on every
 * figure because tokens-times-list-price is an estimate, not an invoice: the
 * real number is on the Anthropic console, and this exists so a surprise
 * there could never have been a surprise.
 */
function AiSpendCard({ spend, model }: { spend: AiSpendDay[]; model: string }) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = spend.find((d) => d.day === todayKey) ?? null;
  const total = spend.reduce(
    (acc, d) => ({
      conversions: acc.conversions + d.conversions,
      in: acc.in + d.tokensIn,
      out: acc.out + d.tokensOut,
    }),
    { conversions: 0, in: 0, out: 0 },
  );
  const usd = (tin: number, tout: number) => {
    const v = aiCostUsd(model, tin, tout);
    if (v === null) return null; // unpriced model: tokens speak for themselves
    return v > 0 && v < 0.01 ? '<$0.01' : `~$${v.toFixed(2)}`;
  };
  const tok = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}K` : String(n));
  const line = (label: string, row: { conversions: number; in: number; out: number }) => (
    <div className="flex items-baseline gap-2" style={{ fontSize: 11.5, ...ink('--ink-2') }}>
      <span style={{ width: 84, flexShrink: 0 }}>{label}</span>
      <span data-ai-conversions={row.conversions}>
        {row.conversions} conversion{row.conversions === 1 ? '' : 's'} · {tok(row.in)} in / {tok(row.out)} out
      </span>
      <span className="ml-auto" style={{ fontWeight: 600, ...ink('--ink') }}>
        {usd(row.in, row.out) ?? '—'}
      </span>
    </div>
  );

  return (
    <div data-ai-spend className="mt-3 rounded-xl px-3 py-2.5" style={{ backgroundColor: 'var(--bg-inset)' }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span style={{ fontSize: 11, fontWeight: 600, ...ink('--ink-2') }}>AI imports</span>
        <span className="ml-auto" style={{ fontSize: 10.5, ...ink('--ink-3') }}>{model}</span>
      </div>
      <div className="flex flex-col gap-1">
        {line('Today', today ? { conversions: today.conversions, in: today.tokensIn, out: today.tokensOut } : { conversions: 0, in: 0, out: 0 })}
        {line(`${spend.length} day${spend.length === 1 ? '' : 's'} total`, total)}
      </div>
    </div>
  );
}

function DayLine({ day, colour }: { day: AdminDay; colour: (k: 'new' | 'returning') => string }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span style={{ fontSize: 12.5, ...ink('--ink-2') }}>{day.date}</span>
        <span className="text-right" style={{ fontSize: 12.5, fontWeight: 600, ...ink('--ink') }}>
          {day.active} active
          {day.new > 0 && (
            <span style={{ color: colour('new') }}> · {day.new} new</span>
          )}
        </span>
      </div>
      {day.emails.length > 0 && (
        <p style={{ fontSize: 11.5, lineHeight: 1.5, wordBreak: 'break-word', ...ink('--ink-3') }}>
          {day.emails.map((e, i) => (
            <span key={e}>
              {i > 0 && ', '}
              {/* A new account's address is marked, not just coloured. */}
              <span style={day.newEmails.includes(e) ? { color: colour('new'), fontWeight: 600 } : undefined}>
                {day.newEmails.includes(e) ? '+ ' : ''}{e}
              </span>
            </span>
          ))}
        </p>
      )}
    </>
  );
}

function Tile({ label, value, sub, accent, onClick }: {
  label: string; value: number; sub?: string; accent?: string; onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-center gap-1.5">
        {accent && <span style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: accent }} />}
        <span style={{ fontSize: 11, ...ink('--ink-2') }}>{label}</span>
        {onClick && <ChevronRight className="ml-auto w-3.5 h-3.5" style={{ color: 'var(--ink-3)' }} />}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.15, ...ink('--ink') }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, ...ink('--ink-3') }}>{sub}</div>}
    </>
  );
  const style = { backgroundColor: 'var(--bg-inset)' };
  return onClick ? (
    <button data-users-roster-open onClick={onClick} className="rounded-xl px-3 py-2.5 text-left active:scale-[0.98] transition-transform" style={style}>
      {body}
    </button>
  ) : (
    <div className="rounded-xl px-3 py-2.5" style={style}>{body}</div>
  );
}

/** How long ago, in the coarsest unit that still says something useful. */
function ago(iso: string | null): string {
  if (!iso) return 'no sign of life';
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 'unknown';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** The moment itself. "3d ago" is scannable and "16 Aug, 14:22" is checkable;
 *  the roster carries both rather than making the reader pick. The year is
 *  printed only when it is not this one - on a list where every row shares it,
 *  it is four characters of nothing. */
const exact = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }),
    hour: '2-digit', minute: '2-digit',
  });
};

const joined = (iso: string | null) => {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
};

/**
 * Every account, most recently active first.
 *
 * The list answers a different question from the chart above it - not "how
 * many today" but "who are they, and are they still here" - so the two facts
 * it carries are the address and how long ago that account last opened the
 * app. Accounts that have never opened it sit at the bottom under their own
 * heading rather than being sorted in by their sign-up date, which would read
 * as an activity they do not have.
 */
function Roster({ accounts, trackingSince, onBack }: {
  accounts: AdminAccount[]; trackingSince: string | null; onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<AdminAccount | null>(null);

  if (open) return <Person account={open} trackingSince={trackingSince} onBack={() => setOpen(null)} />;

  // Grouped by how recently each account was around, because that is the
  // question the list is read to answer: who is still here. Twenty-five lines
  // sorted by date make the reader do that arithmetic themselves, one row at a
  // time; labelled bands answer it before they start.
  const dayIndex = (iso: string) => {
    const d = new Date(iso);
    return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 864e5);
  };
  const todayIndex = dayIndex(new Date().toISOString());
  const age = (a: AdminAccount): number => {
    if (!a.lastSeen) return Infinity;
    const t = Date.parse(a.lastSeen);
    // Calendar days apart, so "today" means today rather than "within 24h" -
    // an 11pm visit is still today at 9am, and a reader means the date.
    return Number.isFinite(t) ? todayIndex - dayIndex(a.lastSeen) : Infinity;
  };
  const BANDS: { key: string; label: string; hint: string; has: (d: number) => boolean }[] = [
    { key: 'today', label: 'TODAY', hint: '', has: (d) => d <= 0 },
    { key: 'week', label: 'ACTIVE THIS WEEK', hint: '', has: (d) => d > 0 && d <= 7 },
    { key: 'month', label: 'ACTIVE THIS MONTH', hint: '', has: (d) => d > 7 && d <= 30 },
    { key: 'dormant', label: 'DORMANT', hint: 'nothing for over a month', has: (d) => d > 30 && d < Infinity },
    { key: 'never', label: 'NEVER SIGNED IN', hint: 'account created, never used', has: (d) => d === Infinity },
  ];

  const q = query.trim().toLowerCase();
  const matching = q ? accounts.filter((a) => (a.email ?? '').toLowerCase().includes(q)) : accounts;

  const line = (a: AdminAccount, i: number) => {
    // Only the weakest evidence is qualified. A recorded launch and a data
    // change both mean the same thing to a reader - they were using the app -
    // so labelling every row with which one it was is noise dressed as
    // precision. A bare sign-in is different: it says they logged in and may
    // have done nothing since, and that IS worth a word.
    const weak = a.lastSeenSource === 'signin';
    return (
      <button
        key={`${a.email ?? 'anon'}-${i}`}
        data-roster-row
        onClick={() => setOpen(a)}
        className="w-full text-left py-2 flex items-center gap-2"
        style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line-2)' }}
      >
        <span className="flex-1 min-w-0">
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate" style={{ fontSize: 13, fontWeight: 500, ...ink('--ink') }}>
              {a.email ?? '(no address)'}
            </span>
            <span className="flex-shrink-0" style={{ fontSize: 12, fontWeight: 600, ...ink(a.lastSeen ? '--ink-2' : '--ink-3') }}>
              {ago(a.lastSeen)}
            </span>
          </span>
          <span className="block" style={{ fontSize: 11, ...ink('--ink-3') }}>
            {a.lastSeen && <>{exact(a.lastSeen)}{weak ? ' · signed in only' : ''} · </>}
            joined {joined(a.createdAt)}
          </span>
        </span>
        <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--ghost, var(--ink-3))' }} />
      </button>
    );
  };

  return (
    <div data-users-roster>
      <button data-users-roster-back onClick={onBack} className="flex items-center gap-1 mb-2 -ml-1 py-1">
        <ChevronLeft size={18} style={{ color: 'var(--accent-ink)' }} />
        <span style={{ color: 'var(--accent-ink)', fontSize: 13.5, fontWeight: 600 }}>Back to the chart</span>
      </button>

      {/* Twenty-five rows is already past the point of scrolling to find one
          address; it only grows from here. */}
      <input
        data-roster-search
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter by email"
        inputMode="email"
        autoCapitalize="off"
        autoCorrect="off"
        className="w-full px-3 py-2 mb-3 rounded-xl outline-none"
        style={{ backgroundColor: 'var(--bg-inset)', color: 'var(--ink)', fontSize: 16, border: '1px solid var(--line-2)' }}
      />

      {q ? (
        <div data-roster-band="search">
          <p className="mb-0.5" style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.3, ...ink('--ink') }}>
            {matching.length} {matching.length === 1 ? 'MATCH' : 'MATCHES'}
          </p>
          {matching.length === 0
            ? <p className="py-2" style={{ fontSize: 12, ...ink('--ink-3') }}>No address contains "{query.trim()}".</p>
            : matching.map(line)}
        </div>
      ) : (
        BANDS.map(({ key, label, hint, has }) => {
          const rows = accounts.filter((a) => has(age(a)));
          if (rows.length === 0) return null;
          return (
            <div key={key} data-roster-band={key} className="mb-4">
              <p className="mb-0.5" style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.3, ...ink('--ink') }}>
                {label} · {rows.length}
              </p>
              {hint && <p className="mb-0.5" style={{ fontSize: 10.5, ...ink('--ink-3') }}>{hint}</p>}
              {rows.map(line)}
            </div>
          );
        })
      )}

      <p className="mt-1" style={{ fontSize: 10.5, lineHeight: 1.45, ...ink('--ink-3') }}>
        {accounts.length} accounts. "Last using" is the most recent of: opening
        the app (recorded only since activity tracking began), changing any
        data, or - where there is nothing else - signing in, which those rows
        mark, since a sign-in alone does not mean they used it.
      </p>
    </div>
  );
}

/**
 * One account on its own.
 *
 * The roster answers "who is still here"; this answers "what does this one
 * person's use look like" - how many days they have shown up, how many of
 * those fall in the last week and month, and which days those were. The strip
 * is one cell per day rather than a bar chart because the underlying fact is
 * binary: they either opened it that day or they did not.
 */
function Person({ account, trackingSince, onBack }: {
  account: AdminAccount; trackingSince: string | null; onBack: () => void;
}) {
  const inLast = (n: number) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - n + 1);
    const from = cutoff.toISOString().slice(0, 10);
    return account.days.filter((d) => d >= from).length;
  };
  const last30 = (() => {
    const out: string[] = [];
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  })();
  const been = new Set(account.days);

  return (
    <div data-person>
      <button data-person-back onClick={onBack} className="flex items-center gap-1 mb-2 -ml-1 py-1">
        <ChevronLeft size={18} style={{ color: 'var(--accent-ink)' }} />
        <span style={{ color: 'var(--accent-ink)', fontSize: 13.5, fontWeight: 600 }}>All accounts</span>
      </button>

      <p className="break-all mb-0.5" style={{ fontSize: 15, fontWeight: 600, ...ink('--ink') }}>
        {account.email ?? '(no address)'}
      </p>
      <p className="mb-3" style={{ fontSize: 11.5, ...ink('--ink-3') }}>
        joined {joined(account.createdAt)} · last seen {ago(account.lastSeen)}
        {account.lastSeen ? ` (${exact(account.lastSeen)})` : ''}
      </p>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <Tile label="Days seen" value={account.visits} sub="all time" />
        <Tile label="Last 7 days" value={inLast(7)} sub="days" />
        <Tile label="Last 30 days" value={inLast(30)} sub="days" />
      </div>

      <p className="mb-1" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.2, ...ink('--ink-2') }}>
        LAST 30 DAYS
      </p>
      <div data-person-strip className="flex gap-[3px] mb-1">
        {last30.map((d) => (
          <span
            key={d}
            title={d}
            data-person-cell={been.has(d) ? 'on' : 'off'}
            className="flex-1 rounded-sm"
            style={{ height: 22, backgroundColor: been.has(d) ? '#2a78d6' : 'var(--bg-inset)' }}
          />
        ))}
      </div>
      <div className="flex justify-between mb-3" style={{ fontSize: 10, ...ink('--ink-3') }}>
        <span>{shortDay(last30[0])}</span><span>today</span>
      </div>

      {trackingSince && (
        <p data-person-provenance className="mb-2" style={{ fontSize: 10.5, lineHeight: 1.45, ...ink('--ink-3') }}>
          Launches have been recorded since {joined(trackingSince)}. Earlier days
          come from Supabase's own sign-in log, which is a good proxy and not a
          promise - a token can refresh in a tab nobody is looking at.
        </p>
      )}

      {account.days.length > 0 ? (
        <>
          <p className="mb-1" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.2, ...ink('--ink-2') }}>
            DAYS THEY OPENED IT
          </p>
          {account.days.map((d, i) => (
            <div key={d} data-person-day className="py-1.5"
              style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line-2)', fontSize: 12, ...ink('--ink-2') }}>
              {new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined,
                { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
          ))}
        </>
      ) : (
        <p style={{ fontSize: 11.5, lineHeight: 1.45, ...ink('--ink-3') }}>
          Nothing in this window - no recorded launch and no sign-in activity
          either. For an account that predates the auth log's retention, that
          is a gap in the record rather than a verdict on the person.
        </p>
      )}
    </div>
  );
}
