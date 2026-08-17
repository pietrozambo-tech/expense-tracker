import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { monthsFull, getLanguage } from '../i18n/store';
import { t } from '../i18n';
import {
  Minus, Plus, Wallet, Gauge, Calendar, Repeat, ChevronDown, ChevronRight,
  ShoppingCart, Car, Home, Clapperboard, Landmark, Layers, Pencil,
  FlaskConical, Trash2, FileSpreadsheet, Palmtree, UtensilsCrossed, Tv, Split,
} from 'lucide-react';
import type { Source } from '../types';
import { SourceLogo } from './SourceLogo';
import { DEFAULT_SOURCES } from './sources';

// A small line chart (line + soft area + endpoint dot), matching the app style
function Spark({ values, labels, color, h = 116 }: { values: number[]; labels: string[]; color: string; h?: number }) {
  const W = 300, H = h, pad = 10;
  const max = Math.max(...values) * 1.15;
  const x = (i: number) => pad + (i * (W - pad * 2)) / (values.length - 1);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(values.length - 1)} ${H} L ${x(0)} ${H} Z`;
  const gid = 'sp' + color.replace('#', '');
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === values.length - 1 ? 4 : 2.5} fill={color} />
        ))}
      </svg>
      <div className="flex justify-between mt-1 px-1">
        {labels.map((l) => <span key={l} className="text-[10px]" style={{ color: 'var(--faint)' }}>{l}</span>)}
      </div>
    </>
  );
}

interface WelcomeCarouselProps {
  onDone: () => void; // finish and enter the app
  onSetupCategories: () => void; // finish and jump to Settings › Categories
  onLoadDemo: () => void; // load sample data in place (stays in the carousel)
}

// A sample source used purely for the illustrations
const SAMPLE_REVOLUT: Source = { id: 'revolut', name: 'Revolut', kind: 'bank', brand: '#0B0B0D', monogram: 'R', mark: 'monogram' };

// ── Slide illustrations (populated with sample data so nothing looks empty) ──

// The mock amounts are typeset like the real ones: units carry the line, the
// symbol and cents step back. Local rather than the shared AmountText because
// these are strings in a picture, not values.
function MockAmount({ value, symbol = '\u20AC', className, style }: { value: string; symbol?: string; className?: string; style?: React.CSSProperties }) {
  const [int, frac] = value.split('.');
  const quiet: React.CSSProperties = { fontSize: '0.72em', fontWeight: 500, opacity: 0.6 };
  // The mock values are written en-US ("1,039.50"); an Italian screenshot
  // must show Italian separators or the illustration contradicts the app
  // it's illustrating.
  const it = getLanguage() === 'it';
  const intText = it ? int.replace(/,/g, '.') : int;
  return (
    <span className={className} style={style}>
      {intText}
      {frac && <span style={quiet}>{it ? ',' : '.'}{frac}</span>}
      <span style={quiet}>{symbol}</span>
    </span>
  );
}

function AddIllustration() {
  const cats = [
    { name: getLanguage() === 'it' ? 'Spesa' : 'Groceries', Icon: ShoppingCart, bg: 'var(--wash-green)', fg: '#2E9E5B', on: true },
    { name: getLanguage() === 'it' ? 'Trasporti' : 'Transport', Icon: Car, bg: '#E3EDFF', fg: '#3B6FE0', on: false },
    { name: getLanguage() === 'it' ? 'Casa' : 'Housing', Icon: Home, bg: '#EDE9FE', fg: '#7C5CE0', on: false },
    { name: getLanguage() === 'it' ? 'Tempo Libero' : 'Leisure', Icon: Clapperboard, bg: '#FDE7F1', fg: '#D6459A', on: false },
  ];
  return (
    <div className="rounded-2xl px-4 py-4" style={{ background: 'var(--bg-card)', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid var(--line-2)' }}>
      {/* Amount + source */}
      <div className="flex items-center justify-between mb-3">
        <MockAmount
          value="24.90"
          style={{ color: 'var(--ink)', fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}
        />
        <span className="flex items-center gap-1 rounded-full pl-1 pr-1.5 py-1" style={{ background: 'var(--bg-inset)' }}>
          <SourceLogo source={SAMPLE_REVOLUT} size={22} />
          <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--ink-2)' }} strokeWidth={2.5} />
        </span>
      </div>
      {/* Sharing, where the real screen puts it: its own line directly under
          the amount, because it qualifies the amount rather than sitting
          alongside the date. The wording comes from the app's own key, so the
          tour cannot drift from the chip it is drawing - and half of 24.90 is
          12.45, arithmetic the reader can do, which is what makes a mock read
          as a screenshot instead of a diagram. */}
      <div className="flex mb-2.5">
        <span
          className="inline-flex items-center gap-1.5 rounded-full"
          style={{ padding: '4px 9px 4px 8px', background: 'var(--bg-inset)', color: 'var(--ink-2)', fontSize: 12, fontWeight: 500 }}
        >
          <Split className="w-3.5 h-3.5" strokeWidth={2} />
          <span>{t('shared.chip.on', { amt: getLanguage() === 'it' ? '12,45€' : '12.45€' })}</span>
        </span>
      </div>

      {/* Date + recurrence chips */}
      <div className="flex items-center gap-2 mb-3">
        <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium" style={{ background: 'var(--bg-inset)', color: 'var(--ink-2)' }}>
          <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--ink-2)' }} /> {t('date.today')}
        </span>
        <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium" style={{ background: 'var(--bg-inset)', color: 'var(--ink-2)' }}>
          <Repeat className="w-3.5 h-3.5" style={{ color: 'var(--ink-2)' }} /> {getLanguage() === 'it' ? 'Mensile' : 'Monthly'}
          <ChevronDown className="w-3 h-3" style={{ color: 'var(--ink-2)' }} />
        </span>
      </div>
      {/* Category grid — the selected category (Groceries) reveals its
          subcategories inline, right below its row */}
      <div className="grid grid-cols-2 gap-2">
        {cats.slice(0, 2).map(({ name, Icon, bg, fg, on }) => (
          <div key={name} className="flex items-center gap-2 rounded-xl px-2.5 py-2"
            style={{ background: 'var(--bg-card)', boxShadow: on ? '0 0 0 2px #4F74F3' : 'inset 0 0 0 1px var(--line-2)' }}>
            <span className="flex items-center justify-center flex-shrink-0" style={{ width: 26, height: 26, borderRadius: 8, background: bg }}>
              <Icon className="w-4 h-4" style={{ color: fg }} />
            </span>
            <span className="text-sm" style={{ color: 'var(--ink)', fontWeight: on ? 600 : 500 }}>{name}</span>
          </div>
        ))}

        {/* Subcategory panel for the selected Groceries */}
        <div className="col-span-2 rounded-xl px-3 py-2.5" style={{ background: 'var(--bg-card)', border: '1px solid var(--line-2)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="text-[10px] font-semibold mb-1.5" style={{ color: 'var(--ink-2)', letterSpacing: '0.06em' }}>{t('add.subcategory')}</div>
          <div className="flex gap-2">
            <span className="rounded-lg px-2.5 py-1 text-xs border" style={{ background: 'var(--wash-accent2)', color: 'var(--accent-ink)', borderColor: 'var(--wash-accent3)' }}>{getLanguage() === 'it' ? 'Supermercato' : 'Supermarket'}</span>
            <span className="rounded-lg px-2.5 py-1 text-xs border" style={{ background: 'var(--bg-card)', color: 'var(--ink-2)', borderColor: 'var(--line-2)' }}>{getLanguage() === 'it' ? 'Mercato' : 'Market'}</span>
          </div>
        </div>

        {cats.slice(2).map(({ name, Icon, bg, fg, on }) => (
          <div key={name} className="flex items-center gap-2 rounded-xl px-2.5 py-2"
            style={{ background: 'var(--bg-card)', boxShadow: on ? '0 0 0 2px #4F74F3' : 'inset 0 0 0 1px var(--line-2)' }}>
            <span className="flex items-center justify-center flex-shrink-0" style={{ width: 26, height: 26, borderRadius: 8, background: bg }}>
              <Icon className="w-4 h-4" style={{ color: fg }} />
            </span>
            <span className="text-sm" style={{ color: 'var(--ink)', fontWeight: on ? 600 : 500 }}>{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecurringIllustration() {
  const it = getLanguage() === 'it';
  // Dates move with the calendar like every other illustration here.
  const now = new Date();
  const fmt = (daysAhead: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead)
      .toLocaleDateString(it ? 'it-IT' : 'en-GB', { weekday: 'short', day: 'numeric' });
  return (
    <div className="flex flex-col gap-3">
      {/* A schedule as the Recurring screen shows it: editable, stoppable */}
      <div className="rounded-2xl px-4 py-3.5" style={{ background: 'var(--bg-card)', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid var(--line-2)' }}>
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center flex-shrink-0" style={{ width: 34, height: 34, borderRadius: 11, background: '#EDE9FE' }}>
            <Tv className="w-4 h-4" style={{ color: '#7C5CE0' }} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-medium" style={{ color: 'var(--ink)' }}>Netflix</div>
            <div className="text-[11px]" style={{ color: 'var(--ink-2)' }}>{it ? 'Ogni mese' : 'Every month'}</div>
          </div>
          <MockAmount value="-12.99" className="text-[15px] font-bold tabular-nums" style={{ color: 'var(--ink)' }} />
        </div>
        <div className="flex items-center justify-between mt-2.5 pt-2.5" style={{ borderTop: '1px solid var(--bg-inset)' }}>
          <span className="text-[12px] font-semibold" style={{ color: 'var(--accent-ink)' }}>
            {it ? 'Prossima' : 'Next'} {fmt(3)}
          </span>
          <span className="flex items-center gap-3">
            <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--ink-2)' }} />
            <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--ink-2)' }} />
          </span>
        </div>
      </div>

      {/* The coming-up strip those schedules feed on the Dashboard */}
      <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--bg-card)', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid var(--line-2)' }}>
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[11.5px] font-semibold" style={{ color: 'var(--ink-2)', letterSpacing: '0.2px' }}>{t('rec.comingUp')}</span>
          <span className="text-[12px] font-semibold" style={{ color: 'var(--accent-ink)' }}>{t('rec.manage')}</span>
        </div>
        {[
          { day: fmt(2), name: it ? 'Affitto' : 'Rent', amt: '-800' },
          { day: fmt(3), name: 'Netflix', amt: '-12.99' },
        ].map((r) => (
          <div key={r.name} className="flex items-baseline gap-2 py-1">
            <span className="flex-shrink-0 text-[12.5px]" style={{ color: 'var(--ink-2)', minWidth: 52 }}>{r.day}</span>
            <span className="flex-1 text-[13px] font-medium truncate" style={{ color: 'var(--ink)' }}>{r.name}</span>
            <MockAmount value={r.amt} className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--ink)' }} />
          </div>
        ))}
      </div>

      {/* The point, in one line */}
      <div className="flex items-center justify-center gap-1.5">
        <Repeat className="w-3.5 h-3.5" style={{ color: 'var(--ink-2)' }} />
        <span style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>
          {it ? 'Ogni addebito si registra da solo, alla data giusta' : 'Every charge records itself, on its date'}
        </span>
      </div>
    </div>
  );
}

// The illustrations mimic real screens, so their dates have to move with the
// calendar - a tour that says "July 2026" to someone signing up in September
// looks like a stale screenshot of someone else's app.
const monthShortNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The last `count` month abbreviations, ending with the current one. */
function recentMonthLabels(count: number): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return monthShortNames[d.getMonth()];
  });
}

/** "September 2026" for the month we are in. */
function currentMonthLabel(): string {
  return `${monthsFull()[new Date().getMonth()]} ${new Date().getFullYear()}`;
}

function DashboardIllustration() {
  const metrics = [
    // Match the real hero: a red "−" for Spending and a green "+" for Income.
    { label: t('dash.spending'), value: '1,039€', Icon: Minus, tint: 'rgba(255,105,97,0.16)', color: '#FF6961', sw: 3 },
    { label: t('dash.income'), value: '3,380€', Icon: Plus, tint: 'rgba(48,209,88,0.16)', color: '#30D158', sw: 3 },
    { label: t('dash.savings'), value: '2,341€', Icon: Wallet, tint: 'rgba(100,160,255,0.16)', color: '#64A0FF', accent: '#30D158', sw: 2.5 },
    { label: t('dash.savingRate'), value: '69%', Icon: Gauge, tint: 'rgba(100,160,255,0.16)', color: '#64A0FF', accent: '#30D158', sw: 2.5 },
  ];
  return (
    <div className="flex flex-col gap-3">
      {/* Hero summary */}
      <div className="px-5 py-4" style={{ borderRadius: 24, background: 'radial-gradient(120% 120% at 90% -20%, rgba(99,102,241,0.30) 0%, rgba(59,130,246,0.12) 42%, rgba(28,28,30,0) 68%), radial-gradient(100% 100% at 6% 118%, rgba(59,130,246,0.10) 0%, rgba(99,102,241,0.04) 45%, rgba(28,28,30,0) 72%), linear-gradient(150deg, #2E2E32 0%, #1C1C1E 100%)', boxShadow: '0 12px 30px rgba(28,28,30,0.28)' }}>
        <div className="text-center mb-3.5 text-sm font-semibold" style={{ color: '#FFFFFF' }}>{currentMonthLabel()}</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3.5">
          {metrics.map((m) => (
            <div key={m.label} className="flex items-center gap-2.5">
              <span className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 999, background: m.tint }}>
                <m.Icon className="w-4 h-4" style={{ color: m.color }} strokeWidth={m.sw} />
              </span>
              <div>
                <div className="text-[11px]" style={{ color: 'rgba(235,235,245,0.6)' }}>{m.label}</div>
                <div className="text-[16px] font-bold tabular-nums" style={{ color: m.accent || '#FFFFFF' }}>
                  {m.value.endsWith('%') ? m.value : <MockAmount value={m.value.replace('\u20AC', '')} />}
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* The hero used to carry two lines of narrative here. They moved to
            the Summary card when that was built, so a tour still showing them
            was advertising a screen the app no longer draws - and this mock is
            headed by the CURRENT month, which never had them even before. */}
      </div>

      {/* Monthly budget - the bar sits here on the real Dashboard too, between
          the hero and the categories. */}
      <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--bg-card)', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid var(--line-2)' }}>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>{t('budget.title')}</span>
          <span className="text-[13px] tabular-nums" style={{ color: 'var(--ink-2)' }}>
            <MockAmount value="1,039" className="font-semibold" style={{ color: 'var(--ink)' }} /> {t('budget.of')} <MockAmount value="1,500" />
          </span>
        </div>
        <div className="relative h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-inset)' }}>
          <div className="h-full rounded-full" style={{ width: '69%', background: 'linear-gradient(90deg, #5FC08C, #2BB3A3)' }} />
        </div>
        <div className="relative" style={{ height: 0 }}>
          <div className="absolute" style={{ left: '78%', top: -12, width: 2, height: 12, backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 1 }} />
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="flex items-center gap-1.5">
            <span className="text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>{t('budget.pctUsed', { pct: 69 })}</span>
            <span
              className="text-[11px] font-semibold"
              style={{ color: '#2C7A54', backgroundColor: 'var(--wash-green)', padding: '2px 8px', borderRadius: 999 }}
            >
              {t('budget.onTrack')}
            </span>
          </span>
          <span className="text-[12px]" style={{ color: 'var(--ink-2)' }}>{t('budget.dayLeft.other', { n: 7 })}</span>
        </div>
        {/* The card's most persuasive line, same keys as the real one. 65 is
            the mock's own arithmetic: (1,500 - 1,039) / 7, floored. */}
        <div className="mt-2 text-[12px]" style={{ color: 'var(--ink-2)' }}>
          {t('budget.perDayPre')} <span className="font-bold" style={{ color: 'var(--ink)' }}>65€</span> {t('budget.perDayPost')}
        </div>
      </div>

    </div>
  );
}

function ImportIllustration() {
  // Mirrors the real Import screen's two use-case cards, then shows the
  // outcome: rows landing in Activity, already categorised.
  const rows = [
    { name: 'Ferry a/r', cat: getLanguage() === 'it' ? 'Viaggi' : 'Travel', amt: '-61.60€', Icon: Palmtree, tint: 'var(--wash-accent3)', ink: '#0A84FF' },
    { name: 'Esselunga', cat: getLanguage() === 'it' ? 'Spesa' : 'Groceries', amt: '-21.04€', Icon: ShoppingCart, tint: 'var(--wash-green)', ink: '#2E9E5B' },
    { name: 'Cena', cat: getLanguage() === 'it' ? 'Cibo & Bevande' : 'Food & Drinks', amt: '-83.00€', Icon: UtensilsCrossed, tint: '#FFF1E2', ink: '#C77700' },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl px-4 py-3.5" style={{ background: 'var(--bg-card)', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid var(--line-2)' }}>
          <span className="flex items-center justify-center mb-2" style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--wash-green)' }}>
            <FileSpreadsheet className="w-4.5 h-4.5" style={{ color: '#2E9E5B', width: 18, height: 18 }} />
          </span>
          <div className="text-[13px] font-bold leading-tight" style={{ color: 'var(--ink)' }}>{getLanguage() === 'it' ? 'Banche e fogli di calcolo' : 'Banks & spreadsheets'}</div>
          <div className="text-[11px] mt-1 leading-snug" style={{ color: 'var(--ink-2)' }}>{getLanguage() === 'it' ? 'Estratti conto, Excel, persino screenshot' : 'Statements, Excel, even screenshots'}</div>
        </div>
        <div className="rounded-2xl px-4 py-3.5" style={{ background: 'var(--bg-card)', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid var(--line-2)' }}>
          <span className="flex items-center justify-center mb-2" style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--wash-accent3)' }}>
            <Palmtree style={{ color: '#0A84FF', width: 18, height: 18 }} />
          </span>
          <div className="text-[13px] font-bold leading-tight" style={{ color: 'var(--ink)' }}>{getLanguage() === 'it' ? 'Viaggi e spese condivise' : 'Trips & splits'}</div>
          <div className="text-[11px] mt-1 leading-snug" style={{ color: 'var(--ink-2)' }}>{getLanguage() === 'it' ? 'Splitwise arriva come sola tua quota' : 'Splitwise lands as your share only'}</div>
        </div>
      </div>

      {/* The result: recognisable Activity rows, already categorised */}
      <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--bg-card)', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid var(--line-2)' }}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] font-semibold" style={{ color: 'var(--ink)' }}>{t('act.title')}</span>
          <span className="text-[10px] font-medium rounded-full px-2 py-0.5" style={{ background: 'var(--bg-inset)', color: 'var(--ink-2)' }}>{t('act.type.imported')}</span>
        </div>
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-2.5 py-1.5">
            <span className="flex items-center justify-center flex-shrink-0" style={{ width: 28, height: 28, borderRadius: 9, background: r.tint }}>
              <r.Icon style={{ color: r.ink, width: 14, height: 14 }} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium leading-tight" style={{ color: 'var(--ink)' }}>{r.name}</div>
              <div className="text-[10px]" style={{ color: 'var(--faint)' }}>{r.cat}</div>
            </div>
            <MockAmount value={r.amt.replace('\u20AC', '')} className="text-[13px] font-bold tabular-nums" style={{ color: 'var(--ink)' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function DemoIllustration() {
  const spark = [12, 18, 15, 24, 21, 30];
  const labels = recentMonthLabels(6);
  return (
    <div className="flex flex-col gap-3">
      {/* A sample dashboard preview with a "Sample" badge */}
      <div className="relative rounded-2xl px-4 py-4" style={{ background: 'var(--bg-card)', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid var(--line-2)' }}>
        <span
          className="absolute flex items-center gap-1 rounded-full px-2 py-0.5"
          style={{ top: 12, right: 12, background: '#FEF3E2', color: '#C77700', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}
        >
          <FlaskConical className="w-3 h-3" />{' '}{getLanguage() === 'it' ? 'ESEMPIO' : 'SAMPLE'}
        </span>
        {/* Mini hero: Spending (−) and Income (+) */}
        <div className="flex items-center pr-16 mb-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="flex items-center justify-center flex-shrink-0" style={{ width: 28, height: 28, borderRadius: 999, background: 'rgba(255,105,97,0.16)' }}>
              <Minus className="w-3.5 h-3.5" style={{ color: '#FF6961' }} strokeWidth={3} />
            </span>
            <div className="min-w-0">
              <div className="text-[10px]" style={{ color: 'var(--ink-2)' }}>{t('dash.spending')}</div>
              <div className="text-[15px] font-bold tabular-nums" style={{ color: 'var(--ink)' }}>820€</div>
            </div>
          </div>
          <div className="w-px self-stretch mx-2" style={{ background: 'var(--line-2)' }} />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="flex items-center justify-center flex-shrink-0" style={{ width: 28, height: 28, borderRadius: 999, background: 'rgba(48,209,88,0.16)' }}>
              <Plus className="w-3.5 h-3.5" style={{ color: '#30D158' }} strokeWidth={3} />
            </span>
            <div className="min-w-0">
              <div className="text-[10px]" style={{ color: 'var(--ink-2)' }}>{t('dash.income')}</div>
              <div className="text-[15px] font-bold tabular-nums" style={{ color: 'var(--ink)' }}>2,400€</div>
            </div>
          </div>
        </div>
        <Spark values={spark} labels={labels} color="#4F74F3" />
      </div>

      {/* Reassurance: it's throwaway data */}
      <div className="flex items-center justify-center gap-1.5">
        <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--ink-2)' }} />
        <span style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>{getLanguage() === 'it' ? 'Rimuovi tutto con un tocco, quando vuoi' : 'Remove it all in one tap, anytime'}</span>
      </div>
    </div>
  );
}

function SettingsIllustration() {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid var(--line-2)' }}>
      {/* Categories row (the priority) */}
      <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid var(--bg-inset)' }}>
        <span className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--bg-inset)' }}>
          <Layers className="w-4 h-4" style={{ color: 'var(--ink-2)' }} />
        </span>
        <span className="flex-1 text-[15px] font-medium" style={{ color: 'var(--ink)' }}>{t('cat.title')}</span>
        <span className="text-[14px]" style={{ color: 'var(--ink-2)' }}>18</span>
        <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ghost)' }} />
      </div>
      {/* Sources row with the default banks */}
      <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid var(--bg-inset)' }}>
        <span className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--bg-inset)' }}>
          <Landmark className="w-4 h-4" style={{ color: 'var(--ink-2)' }} />
        </span>
        <span className="flex-1 text-[15px] font-medium" style={{ color: 'var(--ink)' }}>{t('set.sources')}</span>
        <div className="flex items-center" style={{ gap: 5 }}>
          {DEFAULT_SOURCES.map((s) => (
            <SourceLogo key={s.id} source={s} size={22} />
          ))}
        </div>
        <ChevronRight className="w-4 h-4 flex-shrink-0 ml-2" style={{ color: 'var(--ghost)' }} />
      </div>
      {/* Shared, drawn as the real row draws it - partner's name in the value
          slot, and the same mark the row carries in the app. The tour points
          at where the feature lives rather than teaching it: it is new enough
          that a slide explaining it would be rewritten within the month. */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--bg-inset)' }}>
          <Split className="w-4 h-4" style={{ color: 'var(--ink-2)' }} />
        </span>
        <span className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-[15px] font-medium" style={{ color: 'var(--ink)' }}>{t('set.shared')}</span>
          <span
            style={{
              color: 'var(--accent-ink)', background: 'var(--wash-accent2)', fontSize: 9,
              fontWeight: 700, letterSpacing: '0.04em', padding: '1px 5px', borderRadius: 999,
            }}
          >
            {t('set.shared.beta')}
          </span>
        </span>
        <span className="text-[14px]" style={{ color: 'var(--ink-2)' }}>
          {getLanguage() === 'it' ? 'Giulia' : 'Alex'}
        </span>
        <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ghost)' }} />
      </div>
    </div>
  );
}

// One slide, sized to the space it actually has.
//
// The illustrations are fixed-height mock UI and the copy runs to four lines;
// on a shorter phone the pair overflowed and the scroller quietly cut the last
// line of the description in half - the words were reachable, but nothing said
// so, and a tour slide that looks broken is worse than one that is small.
//
// The text always gets the room it needs; the illustration takes what is left,
// scaled down to fit. offsetHeight ignores transforms, so both measurements
// are of the UNSCALED layout and one pass settles it.
function Slide({ illustration, title, desc }: { illustration: ReactNode; title: string; desc: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [art, setArt] = useState<{ scale: number; height: number }>({ scale: 1, height: 0 });

  useLayoutEffect(() => {
    const fit = () => {
      const box = boxRef.current, a = artRef.current, txt = textRef.current;
      if (!box || !a || !txt) return;
      const natural = a.offsetHeight;
      if (!natural) return;
      const GAP = 24; // the mb-6 between picture and words
      const PADDING = 8; // py-1 on the column below
      const ROUNDING = 2; // sub-pixel line boxes; a hair of slack beats a clip
      const room = box.clientHeight - txt.offsetHeight - GAP - PADDING - ROUNDING;
      // Below ~62% the mock UI stops reading as a screenshot and starts
      // reading as a thumbnail; past that point let the slide scroll.
      const scale = room >= natural ? 1 : Math.max(0.62, room / natural);
      setArt((prev) =>
        Math.abs(prev.scale - scale) < 0.005 && prev.height === natural ? prev : { scale, height: natural },
      );
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (boxRef.current) ro.observe(boxRef.current);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => ro.disconnect();
  }, [illustration, desc]);

  return (
    <div
      ref={boxRef}
      className="flex-shrink-0 w-full overflow-y-auto px-7"
      style={{ scrollSnapAlign: 'center' }}
    >
      {/* min-h-full, not justify-center on the scroller: centring a container
          that overflows clips the TOP of the content. This centres while it
          fits and grows downwards when it doesn't. */}
      <div className="min-h-full flex flex-col justify-center py-1">
        <div
          className="mb-6"
          style={{ height: art.height ? art.height * art.scale : undefined, overflow: 'hidden' }}
        >
          <div ref={artRef} style={{ transform: `scale(${art.scale})`, transformOrigin: 'top center' }}>
            {illustration}
          </div>
        </div>
        <div ref={textRef}>
          <h2 style={{ color: 'var(--ink)', fontSize: 26, fontWeight: 700, letterSpacing: '-0.4px', marginBottom: 10, textWrap: 'balance' } as any}>
            {title}
          </h2>
          <p style={{ color: 'var(--ink-2)', fontSize: 16, lineHeight: 1.45 }}>{desc}</p>
        </div>
      </div>
    </div>
  );
}

export function WelcomeCarousel({ onDone, onSetupCategories, onLoadDemo }: WelcomeCarouselProps) {
  const slides: Array<{ illustration: ReactNode; title: string; desc: string; cta?: 'demo' }> = [
    // No welcome slide. Onboarding's own screen already says "Welcome" and now
    // carries the logo, so opening the tour with a second greeting spent a
    // whole swipe on a word the user had just read. The tour starts on the
    // first thing it can actually teach.
    {
      illustration: <AddIllustration />,
      title: getLanguage() === 'it' ? 'Aggiungi in pochi secondi' : 'Add in seconds',
      desc: getLanguage() === 'it'
        ? "Inserisci un importo, scegli categoria e sottocategoria, poi imposta ogni quanto si ripete e da quale conto arriva."
        : 'Enter an amount, choose a category and subcategory, then set how often it repeats and which account it came from.',
    },
    {
      illustration: <RecurringIllustration />,
      title: getLanguage() === 'it' ? 'Imposta una volta sola' : 'Set it once',
      desc: getLanguage() === 'it'
        ? 'Affitto, abbonamenti, stipendio: programmali e ogni addebito arriva da solo. La dashboard mostra cosa sta per arrivare, e puoi modificare o fermare tutto quando vuoi.'
        : 'Rent, subscriptions, salary - schedule them and every charge lands by itself. The dashboard shows what is about to hit, and you can edit or stop any of it whenever.',
    },
    {
      illustration: <ImportIllustration />,
      title: getLanguage() === 'it' ? 'Porta qui il tuo storico' : 'Bring your history',
      desc: getLanguage() === 'it'
        ? 'Importa da un foglio di calcolo, estratti conto o un viaggio Splitwise 🏝️ - un assistente AI converte tutto, senza reinserire nulla a mano.'
        : 'Import from a spreadsheet, bank statements, or a Splitwise trip 🏝️ - an AI assistant converts it all, no manual re-entry.',
    },
    {
      illustration: <DashboardIllustration />,
      title: getLanguage() === 'it' ? 'I tuoi soldi a colpo d’occhio' : 'Your money at a glance',
      // Kept short on purpose: this slide carries the two tallest mocks in
      // the tour, and every line of copy is a line the illustration loses.
      // The long version pushed the art to 78% on a 667px phone in Italian.
      desc: getLanguage() === 'it'
        ? 'Spese, entrate e risparmi a colpo d’occhio - e a fine mese, un breve riepilogo di com’è andata rispetto al tuo solito.'
        : 'Spending, income and savings at a glance - and when the month ends, a short summary of how it went against your usual.',
    },
    {
      illustration: <DemoIllustration />,
      title: getLanguage() === 'it' ? 'Vuoi prima dare un’occhiata?' : 'Want to look around first?',
      desc: getLanguage() === 'it'
        ? 'Carica un set di transazioni di esempio ed esplora dashboard e trend con dati realistici. Rimuovi tutto con un tocco quando vuoi.'
        : 'Load a set of sample transactions and explore the dashboard and trends with real-looking data. Remove it all in one tap whenever you want.',
      cta: 'demo',
    },
    {
      illustration: <SettingsIllustration />,
      title: getLanguage() === 'it' ? 'Fallo tuo' : 'Make it yours',
      // The shared clause is a pointer, not a pitch: the feature is young and
      // a sentence selling it would be rewritten within the month, so the tour
      // only says where it lives.
      desc: getLanguage() === 'it'
        ? 'Parti dalle categorie - adattale a come spendi. Aggiungi le tue banche come conti, dividi le spese con chi vuoi ed esporta un backup completo quando vuoi.'
        : 'Start with your categories - tailor them to how you spend. Add your banks as sources, share expenses with someone, and export a full backup whenever you like.',
    },
  ];

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const isLast = index >= slides.length - 1;
  const isDemoSlide = slides[index]?.cta === 'demo';

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) setIndex(i);
  };

  const next = () => {
    const el = scrollerRef.current;
    if (!el) return;
    if (isLast) {
      onDone();
      return;
    }
    el.scrollTo({ left: (index + 1) * el.clientWidth, behavior: 'smooth' });
  };

  return (
    // The height is the viewport, not a minimum: with min-h-screen a tall slide
    // simply grew the page and pushed the button below the fold, and the only
    // way to reach it was to scroll. Fixed height + a slide that scrolls inside
    // itself keeps Skip and the button pinned where they belong on any device.
    <div className="flex flex-col max-w-[430px] mx-auto" style={{ height: '100dvh', backgroundColor: 'var(--bg-page)' }}>
      {/* Skip - the row keeps its height on the last slide so nothing shifts */}
      <div className="flex justify-end items-center px-5 flex-shrink-0" style={{ height: 40 }}>
        {!isLast && (
          <button onClick={onDone} className="px-2 py-1 text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
            {getLanguage() === 'it' ? 'Salta' : 'Skip'}
          </button>
        )}
      </div>

      {/* Swipeable slides */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 flex overflow-x-auto overflow-y-hidden"
        style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
      >
        {slides.map((slide, i) => (
          <Slide key={i} illustration={slide.illustration} title={slide.title} desc={slide.desc} />
        ))}
      </div>

      {/* Dots + CTA */}
      <div className="px-7 pt-3 flex-shrink-0" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
        <div className="flex justify-center gap-1.5 mb-4">
          {slides.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === index ? 20 : 7,
                height: 7,
                borderRadius: 999,
                background: i === index ? '#4F74F3' : 'var(--ghost-2)',
                transition: 'width 0.25s ease, background 0.25s ease',
              }}
            />
          ))}
        </div>
        {isLast ? (
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={onSetupCategories}
              className="w-full py-4 rounded-xl font-medium text-base transition-all active:scale-[0.98]"
              style={{ backgroundColor: '#4F74F3', color: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,122,255,0.25)' }}
            >
              {getLanguage() === 'it' ? 'Configura le mie categorie' : 'Set up my categories'}
            </button>
            <button onClick={onDone} className="py-2.5 text-[15px] font-medium" style={{ color: 'var(--ink-2)' }}>
              {getLanguage() === 'it' ? 'Lo faccio dopo' : "I'll do it later"}
            </button>
          </div>
        ) : isDemoSlide ? (
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => { onLoadDemo(); next(); }}
              className="w-full py-4 rounded-xl font-medium text-base transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              style={{ backgroundColor: '#4F74F3', color: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,122,255,0.25)' }}
            >
              <FlaskConical className="w-4 h-4" /> {getLanguage() === 'it' ? 'Carica dati di esempio' : 'Load sample data'}
            </button>
            <button onClick={next} className="py-2.5 text-[15px] font-medium" style={{ color: 'var(--ink-2)' }}>
              {getLanguage() === 'it' ? 'Magari dopo' : 'Maybe later'}
            </button>
          </div>
        ) : (
          <button
            onClick={next}
            className="w-full py-4 rounded-xl font-medium text-base transition-all active:scale-[0.98]"
            style={{ backgroundColor: '#4F74F3', color: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,122,255,0.25)' }}
          >{getLanguage() === 'it' ? 'Avanti' : 'Next'}</button>
        )}
      </div>
    </div>
  );
}
