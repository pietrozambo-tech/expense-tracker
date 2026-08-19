import { useState } from 'react';
import type { AdminStats, AdminDay } from '../lib/adminStats';

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

  const days = [...stats.days].reverse(); // oldest -> newest, so time runs right
  const peak = Math.max(1, ...days.map((d) => d.active));
  const colour = (k: keyof typeof SERIES) => (dark ? SERIES[k].dark : SERIES[k].light);

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
        <Tile label="New, 30 days" value={stats.totals.new30} sub={`${stats.totals.accounts} accounts total`} />
      </div>

      {/* Legend - never colour alone. */}
      <div className="flex items-center gap-3 mb-1.5">
        {(['returning', 'new'] as const).map((k) => (
          <span key={k} className="flex items-center gap-1.5" style={{ fontSize: 11, ...ink('--ink-2') }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: colour(k) }} />
            {SERIES[k].label}
          </span>
        ))}
        <span className="ml-auto" style={{ fontSize: 11, ...ink('--ink-3') }}>peak {peak}</span>
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
            No opens recorded yet. Days start filling in from the moment the
            activity table exists - it cannot be backfilled.
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

function Tile({ label, value, sub, accent }: { label: string; value: number; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ backgroundColor: 'var(--bg-inset)' }}>
      <div className="flex items-center gap-1.5">
        {accent && <span style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: accent }} />}
        <span style={{ fontSize: 11, ...ink('--ink-2') }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.15, ...ink('--ink') }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, ...ink('--ink-3') }}>{sub}</div>}
    </div>
  );
}
