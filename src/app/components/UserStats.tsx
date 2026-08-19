import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AdminStats, AdminDay, AdminAccount } from '../lib/adminStats';

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

  if (roster) return <Roster accounts={stats.accounts} onBack={() => setRoster(false)} />;

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
  if (!iso) return 'never opened';
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 'unknown';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const joined = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'unknown';

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
function Roster({ accounts, onBack }: { accounts: AdminAccount[]; onBack: () => void }) {
  const seen = accounts.filter((a) => a.lastSeen);
  const never = accounts.filter((a) => !a.lastSeen);
  const line = (a: AdminAccount, i: number) => (
    <div key={`${a.email ?? 'anon'}-${i}`} data-roster-row className="py-2" style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line-2)' }}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate" style={{ fontSize: 13, fontWeight: 500, ...ink('--ink') }}>
          {a.email ?? '(no address)'}
        </span>
        <span className="flex-shrink-0" style={{ fontSize: 12, ...ink(a.lastSeen ? '--ink-2' : '--ink-3') }}>
          {ago(a.lastSeen)}
        </span>
      </div>
      <div style={{ fontSize: 11, ...ink('--ink-3') }}>joined {joined(a.createdAt)}</div>
    </div>
  );
  return (
    <div data-users-roster>
      <button data-users-roster-back onClick={onBack} className="flex items-center gap-1 mb-2 -ml-1 py-1">
        <ChevronLeft size={18} style={{ color: 'var(--accent-ink)' }} />
        <span style={{ color: 'var(--accent-ink)', fontSize: 13.5, fontWeight: 600 }}>Back to the chart</span>
      </button>
      <p className="mb-1" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.2, ...ink('--ink-2') }}>
        {accounts.length} ACCOUNTS · LAST OPENED
      </p>
      {seen.map(line)}
      {never.length > 0 && (
        <>
          <p className="mt-4 mb-1" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.2, ...ink('--ink-2') }}>
            NEVER OPENED SINCE TRACKING BEGAN ({never.length})
          </p>
          {never.map(line)}
        </>
      )}
      <p className="mt-3" style={{ fontSize: 11, lineHeight: 1.45, ...ink('--ink-3') }}>
        "Never opened" means no recorded visit - which includes everyone whose
        last visit predates the activity table, since those days cannot be
        recovered.
      </p>
    </div>
  );
}
