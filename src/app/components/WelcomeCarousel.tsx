import { useRef, useState, type ReactNode } from 'react';
import { monthsFull, getLanguage } from '../i18n/store';
import { t } from '../i18n';
import {
  Minus, Plus, Wallet, Gauge, Calendar, Repeat, ChevronDown, ChevronRight, TrendingDown,
  ShoppingCart, Car, Home, Clapperboard, Landmark, Layers,
  FlaskConical, Trash2, FileSpreadsheet, Palmtree, UtensilsCrossed,
} from 'lucide-react';
import type { Source } from '../types';
import { SourceLogo } from './SourceLogo';
import { TracklyLogo } from './TracklyLogo';
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
        {labels.map((l) => <span key={l} className="text-[10px]" style={{ color: '#B0B0B5' }}>{l}</span>)}
      </div>
    </>
  );
}

interface WelcomeCarouselProps {
  userName?: string;
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
  return (
    <span className={className} style={style}>
      {int}
      {frac && <span style={quiet}>.{frac}</span>}
      <span style={quiet}>{symbol}</span>
    </span>
  );
}

function AddIllustration() {
  const cats = [
    { name: 'Groceries', Icon: ShoppingCart, bg: '#E7F6EC', fg: '#2E9E5B', on: true },
    { name: 'Transport', Icon: Car, bg: '#E3EDFF', fg: '#3B6FE0', on: false },
    { name: 'Housing', Icon: Home, bg: '#EDE9FE', fg: '#7C5CE0', on: false },
    { name: 'Leisure', Icon: Clapperboard, bg: '#FDE7F1', fg: '#D6459A', on: false },
  ];
  return (
    <div className="rounded-2xl px-4 py-4" style={{ background: '#FFFFFF', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid #EEEEF1' }}>
      {/* Amount + source */}
      <div className="flex items-center justify-between mb-3">
        <MockAmount
          value="24.90"
          style={{ color: '#1C1C1E', fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}
        />
        <span className="flex items-center gap-1 rounded-full pl-1 pr-1.5 py-1" style={{ background: '#F2F1ED' }}>
          <SourceLogo source={SAMPLE_REVOLUT} size={22} />
          <ChevronDown className="w-3.5 h-3.5" style={{ color: '#8E8E93' }} strokeWidth={2.5} />
        </span>
      </div>
      {/* Date + recurrence chips */}
      <div className="flex items-center gap-2 mb-3">
        <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium" style={{ background: '#F2F2F5', color: '#3C3C43' }}>
          <Calendar className="w-3.5 h-3.5" style={{ color: '#8E8E93' }} /> Today
        </span>
        <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium" style={{ background: '#F2F2F5', color: '#3C3C43' }}>
          <Repeat className="w-3.5 h-3.5" style={{ color: '#8E8E93' }} /> Monthly
          <ChevronDown className="w-3 h-3" style={{ color: '#8E8E93' }} />
        </span>
      </div>
      {/* Category grid — the selected category (Groceries) reveals its
          subcategories inline, right below its row */}
      <div className="grid grid-cols-2 gap-2">
        {cats.slice(0, 2).map(({ name, Icon, bg, fg, on }) => (
          <div key={name} className="flex items-center gap-2 rounded-xl px-2.5 py-2"
            style={{ background: on ? '#FFFFFF' : '#FAFAFB', boxShadow: on ? '0 0 0 2px #3B82F6' : 'inset 0 0 0 1px #ECECEF' }}>
            <span className="flex items-center justify-center flex-shrink-0" style={{ width: 26, height: 26, borderRadius: 8, background: bg }}>
              <Icon className="w-4 h-4" style={{ color: fg }} />
            </span>
            <span className="text-sm" style={{ color: '#1C1C1E', fontWeight: on ? 600 : 500 }}>{name}</span>
          </div>
        ))}

        {/* Subcategory panel for the selected Groceries */}
        <div className="col-span-2 rounded-xl px-3 py-2.5" style={{ background: '#FFFFFF', border: '1px solid #ECECEF', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="text-[10px] font-semibold mb-1.5" style={{ color: '#8E8E93', letterSpacing: '0.06em' }}>SUBCATEGORY</div>
          <div className="flex gap-2">
            <span className="rounded-lg px-2.5 py-1 text-xs border" style={{ background: '#EFF6FF', color: '#2563EB', borderColor: '#BFDBFE' }}>Supermarket</span>
            <span className="rounded-lg px-2.5 py-1 text-xs border" style={{ background: '#FFFFFF', color: '#4B5563', borderColor: '#E5E7EB' }}>Market</span>
          </div>
        </div>

        {cats.slice(2).map(({ name, Icon, bg, fg, on }) => (
          <div key={name} className="flex items-center gap-2 rounded-xl px-2.5 py-2"
            style={{ background: on ? '#FFFFFF' : '#FAFAFB', boxShadow: on ? '0 0 0 2px #3B82F6' : 'inset 0 0 0 1px #ECECEF' }}>
            <span className="flex items-center justify-center flex-shrink-0" style={{ width: 26, height: 26, borderRadius: 8, background: bg }}>
              <Icon className="w-4 h-4" style={{ color: fg }} />
            </span>
            <span className="text-sm" style={{ color: '#1C1C1E', fontWeight: on ? 600 : 500 }}>{name}</span>
          </div>
        ))}
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

/** "Aug" - what the Dashboard's category trends are measured against. */
function previousMonthLabel(): string {
  const now = new Date();
  return monthShortNames[new Date(now.getFullYear(), now.getMonth() - 1, 1).getMonth()];
}

function DashboardIllustration() {
  const metrics = [
    // Match the real hero: a red "−" for Spending and a green "+" for Income.
    { label: 'Spending', value: '1,039€', Icon: Minus, tint: 'rgba(255,105,97,0.16)', color: '#FF6961', sw: 3 },
    { label: 'Income', value: '3,380€', Icon: Plus, tint: 'rgba(48,209,88,0.16)', color: '#30D158', sw: 3 },
    { label: 'Savings', value: '2,341€', Icon: Wallet, tint: 'rgba(100,160,255,0.16)', color: '#64A0FF', accent: '#30D158', sw: 2.5 },
    { label: 'Saving Rate', value: '69%', Icon: Gauge, tint: 'rgba(100,160,255,0.16)', color: '#64A0FF', accent: '#30D158', sw: 2.5 },
  ];
  // `trend` mirrors the real rows: flat when the month matches the last one,
  // an arrow when it does not, and the word when there is no earlier figure to
  // compare against at all.
  const rows = [
    { name: 'Housing', Icon: Home, bg: '#E3EDFF', fg: '#3B6FE0', pct: 87, amt: '900€', trend: 'flat' as const },
    { name: 'Groceries', Icon: ShoppingCart, bg: '#E7F6EC', fg: '#2E9E5B', pct: 8, amt: '84€', trend: 'down' as const },
    { name: 'Transport', Icon: Car, bg: '#E3EDFF', fg: '#4589D6', pct: 5, amt: '55€', trend: 'new' as const },
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
        {/* The line the app writes under the hero: a finished period says how
            it compared with the user's own months, in words. */}
        <div className="h-px mt-3" style={{ background: 'rgba(255,255,255,0.07)' }} />
        <div className="pt-2.5">
          <div className="text-[11px] leading-snug" style={{ color: 'rgba(235,235,245,0.6)' }}>
            {getLanguage() === 'it' ? 'Spesa ha trainato il mese: 2x il solito (+180€).' : 'Groceries drove the month, 2x usual (+180€).'}
          </div>
          <div className="text-[11px] leading-snug mt-0.5" style={{ color: 'rgba(235,235,245,0.45)' }}>
            {getLanguage() === 'it' ? 'Trasporti: 40% sotto il solito (55€).' : 'Transport was 40% below usual (55€).'}
          </div>
        </div>
      </div>

      {/* Monthly budget - the bar sits here on the real Dashboard too, between
          the hero and the categories. */}
      <div className="rounded-2xl px-4 py-3" style={{ background: '#FFFFFF', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid #EEEEF1' }}>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[13px] font-semibold" style={{ color: '#1C1C1E' }}>Monthly Budget</span>
          <span className="text-[13px] tabular-nums" style={{ color: '#8E8E93' }}>
            <MockAmount value="1,039" className="font-semibold" style={{ color: '#1C1C1E' }} /> of <MockAmount value="1,500" />
          </span>
        </div>
        <div className="relative h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#F2F1ED' }}>
          <div className="h-full rounded-full" style={{ width: '69%', background: 'linear-gradient(90deg, #5FC08C, #2BB3A3)' }} />
        </div>
        <div className="relative" style={{ height: 0 }}>
          <div className="absolute" style={{ left: '78%', top: -12, width: 2, height: 12, backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 1 }} />
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="flex items-center gap-1.5">
            <span className="text-[12px] font-medium" style={{ color: '#8E8E93' }}>69% used</span>
            <span
              className="text-[11px] font-semibold"
              style={{ color: '#2C7A54', backgroundColor: '#E7F4ED', padding: '2px 8px', borderRadius: 999 }}
            >
              On track
            </span>
          </span>
          <span className="text-[12px]" style={{ color: '#8E8E93' }}>7 days left</span>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="rounded-2xl px-4 py-3" style={{ background: '#FFFFFF', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid #EEEEF1' }}>
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-sm font-semibold" style={{ color: '#1C1C1E' }}>Categories</span>
          {/* Sits over the last column, as it does in the app - it labels the
              trend markers and nothing else. The chevron is the whole tell that
              the baseline can be changed, so the illustration carries it too. */}
          <span className="flex items-center gap-0.5">
            <span className="text-[9px]" style={{ color: '#A0A0A8' }}>vs. {previousMonthLabel()}</span>
            <ChevronDown className="w-2 h-2" style={{ color: '#C7C7CC' }} strokeWidth={2.5} />
          </span>
        </div>
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-2.5 py-1.5">
            <span className="flex items-center justify-center flex-shrink-0" style={{ width: 28, height: 28, borderRadius: 8, background: r.bg }}>
              <r.Icon className="w-4 h-4" style={{ color: r.fg }} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium mb-1" style={{ color: '#1C1C1E' }}>{r.name}</div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
                <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: r.fg, opacity: 0.45 }} />
              </div>
            </div>
            <span className="text-[11px] tabular-nums" style={{ color: '#B0B0B5' }}>{r.pct}%</span>
            <MockAmount value={r.amt.replace('\u20AC', '')} className="text-[13px] font-bold tabular-nums w-12 text-right" style={{ color: '#1C1C1E' }} />
            <span className="w-7 flex items-center justify-center flex-shrink-0">
              {r.trend === 'down' && <TrendingDown className="w-3.5 h-3.5" style={{ color: '#34C759' }} strokeWidth={2.5} />}
              {r.trend === 'flat' && <Minus className="w-3.5 h-3.5" style={{ color: '#8E8E93' }} strokeWidth={2.5} />}
              {r.trend === 'new' && <span className="text-[9px] font-semibold" style={{ color: '#6B6B75' }}>New</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ImportIllustration() {
  // Mirrors the real Import screen's two use-case cards, then shows the
  // outcome: rows landing in Activity, already categorised.
  const rows = [
    { name: 'Ferry a/r', cat: 'Travel', amt: '-61.60€', Icon: Palmtree, tint: '#E1F0FF', ink: '#0A84FF' },
    { name: 'Esselunga', cat: 'Groceries', amt: '-21.04€', Icon: ShoppingCart, tint: '#E7F6EC', ink: '#2E9E5B' },
    { name: 'Cena', cat: 'Food & Drinks', amt: '-83.00€', Icon: UtensilsCrossed, tint: '#FFF1E2', ink: '#C77700' },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl px-4 py-3.5" style={{ background: '#FFFFFF', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid #EEEEF1' }}>
          <span className="flex items-center justify-center mb-2" style={{ width: 34, height: 34, borderRadius: 11, background: '#E7F6EC' }}>
            <FileSpreadsheet className="w-4.5 h-4.5" style={{ color: '#2E9E5B', width: 18, height: 18 }} />
          </span>
          <div className="text-[13px] font-bold leading-tight" style={{ color: '#1C1C1E' }}>Banks &amp; spreadsheets</div>
          <div className="text-[11px] mt-1 leading-snug" style={{ color: '#8E8E93' }}>Statements, Excel, even screenshots</div>
        </div>
        <div className="rounded-2xl px-4 py-3.5" style={{ background: '#FFFFFF', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid #EEEEF1' }}>
          <span className="flex items-center justify-center mb-2" style={{ width: 34, height: 34, borderRadius: 11, background: '#E1F0FF' }}>
            <Palmtree style={{ color: '#0A84FF', width: 18, height: 18 }} />
          </span>
          <div className="text-[13px] font-bold leading-tight" style={{ color: '#1C1C1E' }}>Trips &amp; splits</div>
          <div className="text-[11px] mt-1 leading-snug" style={{ color: '#8E8E93' }}>Splitwise lands as your share only</div>
        </div>
      </div>

      {/* The result: recognisable Activity rows, already categorised */}
      <div className="rounded-2xl px-4 py-3" style={{ background: '#FFFFFF', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid #EEEEF1' }}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] font-semibold" style={{ color: '#1C1C1E' }}>Activity</span>
          <span className="text-[10px] font-medium rounded-full px-2 py-0.5" style={{ background: '#F2F1ED', color: '#8E8E93' }}>Imported</span>
        </div>
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-2.5 py-1.5">
            <span className="flex items-center justify-center flex-shrink-0" style={{ width: 28, height: 28, borderRadius: 9, background: r.tint }}>
              <r.Icon style={{ color: r.ink, width: 14, height: 14 }} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium leading-tight" style={{ color: '#1C1C1E' }}>{r.name}</div>
              <div className="text-[10px]" style={{ color: '#B0B0B5' }}>{r.cat}</div>
            </div>
            <MockAmount value={r.amt.replace('\u20AC', '')} className="text-[13px] font-bold tabular-nums" style={{ color: '#1C1C1E' }} />
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
      <div className="relative rounded-2xl px-4 py-4" style={{ background: '#FFFFFF', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid #EEEEF1' }}>
        <span
          className="absolute flex items-center gap-1 rounded-full px-2 py-0.5"
          style={{ top: 12, right: 12, background: '#FEF3E2', color: '#C77700', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}
        >
          <FlaskConical className="w-3 h-3" /> SAMPLE
        </span>
        {/* Mini hero: Spending (−) and Income (+) */}
        <div className="flex items-center pr-16 mb-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="flex items-center justify-center flex-shrink-0" style={{ width: 28, height: 28, borderRadius: 999, background: 'rgba(255,105,97,0.16)' }}>
              <Minus className="w-3.5 h-3.5" style={{ color: '#FF6961' }} strokeWidth={3} />
            </span>
            <div className="min-w-0">
              <div className="text-[10px]" style={{ color: '#8E8E93' }}>Spending</div>
              <div className="text-[15px] font-bold tabular-nums" style={{ color: '#1C1C1E' }}>820€</div>
            </div>
          </div>
          <div className="w-px self-stretch mx-2" style={{ background: '#ECECEF' }} />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="flex items-center justify-center flex-shrink-0" style={{ width: 28, height: 28, borderRadius: 999, background: 'rgba(48,209,88,0.16)' }}>
              <Plus className="w-3.5 h-3.5" style={{ color: '#30D158' }} strokeWidth={3} />
            </span>
            <div className="min-w-0">
              <div className="text-[10px]" style={{ color: '#8E8E93' }}>Income</div>
              <div className="text-[15px] font-bold tabular-nums" style={{ color: '#1C1C1E' }}>2,400€</div>
            </div>
          </div>
        </div>
        <Spark values={spark} labels={labels} color="#3B82F6" />
      </div>

      {/* Reassurance: it's throwaway data */}
      <div className="flex items-center justify-center gap-1.5">
        <Trash2 className="w-3.5 h-3.5" style={{ color: '#8E8E93' }} />
        <span style={{ color: '#8E8E93', fontSize: 12.5 }}>Remove it all in one tap, anytime</span>
      </div>
    </div>
  );
}

function SettingsIllustration() {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid #EEEEF1' }}>
      {/* Categories row (the priority) */}
      <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid #F2F1ED' }}>
        <span className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 9, background: '#F2F1ED' }}>
          <Layers className="w-4 h-4" style={{ color: '#8E8E93' }} />
        </span>
        <span className="flex-1 text-[15px] font-medium" style={{ color: '#1C1C1E' }}>Categories</span>
        <span className="text-[14px]" style={{ color: '#8E8E93' }}>18</span>
        <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: '#C7C7CC' }} />
      </div>
      {/* Sources row with the default banks */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 9, background: '#F2F1ED' }}>
          <Landmark className="w-4 h-4" style={{ color: '#8E8E93' }} />
        </span>
        <span className="flex-1 text-[15px] font-medium" style={{ color: '#1C1C1E' }}>Sources</span>
        <div className="flex items-center" style={{ gap: 5 }}>
          {DEFAULT_SOURCES.map((s) => (
            <SourceLogo key={s.id} source={s} size={22} />
          ))}
        </div>
        <ChevronRight className="w-4 h-4 flex-shrink-0 ml-2" style={{ color: '#C7C7CC' }} />
      </div>
    </div>
  );
}

export function WelcomeCarousel({ userName, onDone, onSetupCategories, onLoadDemo }: WelcomeCarouselProps) {
  const slides: Array<{ illustration: ReactNode; title: string; desc: string; cta?: 'demo' }> = [
    {
      illustration: (
        <div className="flex flex-col items-center justify-center" style={{ minHeight: 220 }}>
          <TracklyLogo size={92} />
          <h2 style={{ color: '#1C1C1E', fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', marginTop: 18 }}>TracklyLab</h2>
          <p style={{ color: '#3B82F6', fontSize: 15, fontWeight: 600, marginTop: 4, letterSpacing: '0.02em' }}>Your Expense Lens</p>
        </div>
      ),
      title: userName
        ? (getLanguage() === 'it' ? `Benvenuto, ${userName} 👋` : `Welcome, ${userName} 👋`)
        : getLanguage() === 'it' ? 'Benvenuto su TracklyLab 👋' : 'Welcome to TracklyLab 👋',
      desc: getLanguage() === 'it'
        ? 'Uno sguardo veloce a cosa puoi fare - ci vogliono 20 secondi.'
        : 'A quick look at what you can do - it takes 20 seconds.',
    },
    {
      illustration: <AddIllustration />,
      title: getLanguage() === 'it' ? 'Aggiungi in pochi secondi' : 'Add in seconds',
      desc: getLanguage() === 'it'
        ? "Inserisci un importo, scegli categoria e sottocategoria, poi imposta ogni quanto si ripete e da quale conto arriva."
        : 'Enter an amount, choose a category and subcategory, then set how often it repeats and which account it came from.',
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
      desc: getLanguage() === 'it'
        ? 'Spese, entrate e risparmi a colpo d’occhio - e a mese concluso, una riga che ti dice in parole semplici com’è andato rispetto al tuo solito.'
        : 'Spending, income and savings at a glance - and once a month is done, a line telling you in plain words how it compared with your own usual.',
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
      desc: getLanguage() === 'it'
        ? 'Parti dalle categorie - adattale a come spendi. Aggiungi le tue banche come fonti ed esporta un backup completo quando vuoi.'
        : 'Start with your categories - tailor them to how you spend. Add your banks as sources, and export a full backup of everything whenever you like.',
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
    <div className="flex flex-col max-w-[430px] mx-auto" style={{ height: '100dvh', backgroundColor: '#F6F5F2' }}>
      {/* Skip - the row keeps its height on the last slide so nothing shifts */}
      <div className="flex justify-end items-center px-5 flex-shrink-0" style={{ height: 40 }}>
        {!isLast && (
          <button onClick={onDone} className="px-2 py-1 text-sm font-medium" style={{ color: '#8E8E93' }}>
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
          <div key={i} className="flex-shrink-0 w-full overflow-y-auto px-7" style={{ scrollSnapAlign: 'center' }}>
            {/* min-h-full, not justify-center on the scroller: centring a
                container that overflows clips the top of the content. This
                centres while it fits and grows downwards when it doesn't. */}
            <div className="min-h-full flex flex-col justify-center py-1">
              <div className="mb-6">{slide.illustration}</div>
              <h2 style={{ color: '#1C1C1E', fontSize: 26, fontWeight: 700, letterSpacing: '-0.4px', marginBottom: 10, textWrap: 'balance' } as any}>
                {slide.title}
              </h2>
              <p style={{ color: '#8E8E93', fontSize: 16, lineHeight: 1.45 }}>{slide.desc}</p>
            </div>
          </div>
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
                background: i === index ? '#3B82F6' : '#D1D1D6',
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
              style={{ backgroundColor: '#3B82F6', color: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,122,255,0.25)' }}
            >
              {getLanguage() === 'it' ? 'Configura le mie categorie' : 'Set up my categories'}
            </button>
            <button onClick={onDone} className="py-2.5 text-[15px] font-medium" style={{ color: '#8E8E93' }}>
              {getLanguage() === 'it' ? 'Lo faccio dopo' : "I'll do it later"}
            </button>
          </div>
        ) : isDemoSlide ? (
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => { onLoadDemo(); next(); }}
              className="w-full py-4 rounded-xl font-medium text-base transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              style={{ backgroundColor: '#3B82F6', color: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,122,255,0.25)' }}
            >
              <FlaskConical className="w-4 h-4" /> {getLanguage() === 'it' ? 'Carica dati di esempio' : 'Load sample data'}
            </button>
            <button onClick={next} className="py-2.5 text-[15px] font-medium" style={{ color: '#8E8E93' }}>
              {getLanguage() === 'it' ? 'Magari dopo' : 'Maybe later'}
            </button>
          </div>
        ) : (
          <button
            onClick={next}
            className="w-full py-4 rounded-xl font-medium text-base transition-all active:scale-[0.98]"
            style={{ backgroundColor: '#3B82F6', color: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,122,255,0.25)' }}
          >{getLanguage() === 'it' ? 'Avanti' : 'Next'}</button>
        )}
      </div>
    </div>
  );
}
