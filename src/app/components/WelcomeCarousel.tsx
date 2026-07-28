import { useRef, useState, type ReactNode } from 'react';
import {
  Minus, Plus, Wallet, Percent, Calendar, Repeat, ChevronDown, ChevronRight,
  ShoppingCart, Car, Home, Clapperboard, TrendingUp, Landmark, Layers,
  FlaskConical, Trash2, PiggyBank,
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
        <div className="flex items-baseline gap-1">
          <span style={{ color: '#8E8E93', fontSize: 20, fontWeight: 500 }}>€</span>
          <span style={{ color: '#1C1C1E', fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}>24.90</span>
        </div>
        <span className="flex items-center gap-1 rounded-full pl-1 pr-1.5 py-1" style={{ background: '#F2F2F7' }}>
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
            style={{ background: on ? '#FFFFFF' : '#FAFAFB', boxShadow: on ? '0 0 0 2px #007AFF' : 'inset 0 0 0 1px #ECECEF' }}>
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
            style={{ background: on ? '#FFFFFF' : '#FAFAFB', boxShadow: on ? '0 0 0 2px #007AFF' : 'inset 0 0 0 1px #ECECEF' }}>
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
  return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function DashboardIllustration() {
  const metrics = [
    // Match the real hero: a red "−" for Spending and a green "+" for Income.
    { label: 'Spending', value: '1,039€', Icon: Minus, tint: 'rgba(255,105,97,0.16)', color: '#FF6961', sw: 3 },
    { label: 'Income', value: '3,380€', Icon: Plus, tint: 'rgba(48,209,88,0.16)', color: '#30D158', sw: 3 },
    { label: 'Savings', value: '2,341€', Icon: Wallet, tint: 'rgba(100,160,255,0.16)', color: '#64A0FF', accent: '#30D158', sw: 2.5 },
    { label: 'Saving Rate', value: '69%', Icon: Percent, tint: 'rgba(100,160,255,0.16)', color: '#64A0FF', accent: '#30D158', sw: 2.5 },
  ];
  const rows = [
    { name: 'Housing', Icon: Home, bg: '#E3EDFF', fg: '#3B6FE0', pct: 87, amt: '900€' },
    { name: 'Groceries', Icon: ShoppingCart, bg: '#E7F6EC', fg: '#2E9E5B', pct: 8, amt: '84€' },
    { name: 'Transport', Icon: Car, bg: '#E3EDFF', fg: '#4589D6', pct: 5, amt: '55€' },
  ];
  return (
    <div className="flex flex-col gap-3">
      {/* Hero summary */}
      <div className="rounded-2xl px-5 py-4" style={{ background: 'linear-gradient(150deg, #2E2E32 0%, #1C1C1E 100%)', boxShadow: '0 12px 30px rgba(28,28,30,0.28)' }}>
        <div className="text-center mb-3.5 text-sm font-semibold" style={{ color: '#FFFFFF' }}>{currentMonthLabel()}</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3.5">
          {metrics.map((m) => (
            <div key={m.label} className="flex items-center gap-2.5">
              <span className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 999, background: m.tint }}>
                <m.Icon className="w-4 h-4" style={{ color: m.color }} strokeWidth={m.sw} />
              </span>
              <div>
                <div className="text-[11px]" style={{ color: 'rgba(235,235,245,0.6)' }}>{m.label}</div>
                <div className="text-[16px] font-bold tabular-nums" style={{ color: m.accent || '#FFFFFF' }}>{m.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly budget - the bar sits here on the real Dashboard too, between
          the hero and the categories. */}
      <div className="rounded-2xl px-4 py-3" style={{ background: '#FFFFFF', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid #EEEEF1' }}>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[13px] font-semibold" style={{ color: '#1C1C1E' }}>Monthly budget</span>
          <span className="text-[13px] tabular-nums" style={{ color: '#8E8E93' }}>
            <span className="font-semibold" style={{ color: '#1C1C1E' }}>1,039€</span> of 1,500€
          </span>
        </div>
        <div className="relative h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#F2F2F7' }}>
          <div className="h-full rounded-full" style={{ width: '69%', backgroundColor: '#5FC08C' }} />
        </div>
        <div className="relative" style={{ height: 0 }}>
          <div className="absolute" style={{ left: '78%', top: -12, width: 2, height: 12, backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 1 }} />
        </div>
        <div className="flex items-baseline justify-between mt-2">
          <span className="text-[12px] font-semibold" style={{ color: '#2C7A54' }}>69% used · On track</span>
          <span className="text-[12px]" style={{ color: '#8E8E93' }}>7 days left</span>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="rounded-2xl px-4 py-3" style={{ background: '#FFFFFF', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid #EEEEF1' }}>
        <div className="text-sm font-semibold mb-1.5" style={{ color: '#1C1C1E' }}>Categories</div>
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-2.5 py-1.5">
            <span className="flex items-center justify-center flex-shrink-0" style={{ width: 28, height: 28, borderRadius: 8, background: r.bg }}>
              <r.Icon className="w-4 h-4" style={{ color: r.fg }} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium mb-1" style={{ color: '#1C1C1E' }}>{r.name}</div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
                <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: r.fg }} />
              </div>
            </div>
            <span className="text-[11px] tabular-nums" style={{ color: '#B0B0B5' }}>{r.pct}%</span>
            <span className="text-[13px] font-bold tabular-nums w-12 text-right" style={{ color: '#1C1C1E' }}>{r.amt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendIllustration() {
  // Line Trend — mirrors the top of the real Trend tab (stat cards + line).
  const tLabels = recentMonthLabels(7);
  const trend = [4475, 3620, 3280, 3010, 2920, 3480, 3800];
  // Rounded bounds, as the real chart now uses.
  const yMax = 6000, yMin = 2000, yRange = yMax - yMin;
  const avg = 3533;
  const W = 320, H = 84;
  const px = (i: number) => (i / (trend.length - 1)) * W;
  const py = (v: number) => H - ((v - yMin) / yRange) * H;
  const linePath = trend
    .map((v, i) => {
      if (i === 0) return `M ${px(0)},${py(v)}`;
      const p = px(i - 1), c = px(i);
      return `C ${p + (c - p) / 3},${py(trend[i - 1])} ${p + ((c - p) * 2) / 3},${py(v)} ${c},${py(v)}`;
    })
    .join(' ');
  const areaPath = `M 0,${H} ${trend.map((v, i) => `L ${px(i)},${py(v)}`).join(' ')} L ${W},${H} Z`;
  const avgY = py(avg);

  const tiles = [
    { label: 'Total Spent', value: '24,731€', sub: '7 months' },
    { label: 'Monthly Avg', value: '3,533€', sub: '' },
    { label: 'Transactions', value: '405', sub: '7 months' },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Trend tab top: stat cards + Line Trend chart */}
      <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid #EEEEF1' }}>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-lg px-2 py-2" style={{ background: '#F5F5F7' }}>
              <div className="text-[9px] leading-tight" style={{ color: '#8E8E93' }}>{t.label}</div>
              <div className="text-[15px] font-bold tabular-nums leading-tight mt-0.5" style={{ color: '#1C1C1E' }}>{t.value}</div>
              {t.sub && <div className="text-[8px] mt-0.5" style={{ color: '#B0B0B5' }}>{t.sub}</div>}
            </div>
          ))}
        </div>

        <div className="text-[13px] font-semibold mb-2" style={{ color: '#1C1C1E' }}>Monthly Spending</div>
        <div className="flex">
          {/* Y-axis labels */}
          <div className="flex flex-col justify-between pr-2 text-[9px] tabular-nums font-medium" style={{ height: H, color: '#B0B0B5' }}>
            <span>6,000€</span>
            <span>4,000€</span>
            <span>2,000€</span>
          </div>
          <div className="flex-1 min-w-0">
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block' }}>
              <defs>
                <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.01" />
                </linearGradient>
              </defs>
              <line x1="0" y1="0.5" x2={W} y2="0.5" stroke="#F1F1F1" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="#F1F1F1" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} stroke="#F1F1F1" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <line x1="0" y1={avgY} x2={W} y2={avgY} stroke="#A3A3A3" strokeWidth="1" strokeDasharray="4 4" opacity="0.35" vectorEffect="non-scaling-stroke" />
              <path d={areaPath} fill="url(#trendGrad)" />
              <path d={linePath} fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="flex justify-between mt-1.5">
              {tLabels.map((l) => <span key={l} className="text-[9px]" style={{ color: '#B0B0B5' }}>{l}</span>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SavingsIllustration() {
  // Sample monthly savings — dips below zero one month, like the real Savings view
  const vals = [1940, 1958, 1741, 1722, -2591, 1906, 2341];
  const labels = recentMonthLabels(7);
  const W = 300, H = 120, pad = 12;
  const maxAbs = 2850;
  const zeroY = H / 2;
  const x = (i: number) => pad + (i * (W - pad * 2)) / (vals.length - 1);
  const y = (v: number) => zeroY - (v / maxAbs) * (H / 2 - pad);
  const line = vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

  return (
    <div className="flex flex-col gap-3">
      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl px-4 py-3" style={{ background: '#FFFFFF', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid #EEEEF1' }}>
          <div className="flex items-center gap-1.5 mb-1">
            <PiggyBank className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
            <span className="text-[11px]" style={{ color: '#8E8E93' }}>Total savings</span>
          </div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: '#10B981' }}>9,016€</div>
        </div>
        <div className="rounded-2xl px-4 py-3" style={{ background: '#FFFFFF', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid #EEEEF1' }}>
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
            <span className="text-[11px]" style={{ color: '#8E8E93' }}>Saving Rate</span>
          </div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: '#10B981' }}>38%</div>
        </div>
      </div>

      {/* Savings line trend (crosses zero) */}
      <div className="rounded-2xl px-4 pt-4 pb-3" style={{ background: '#FFFFFF', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid #EEEEF1' }}>
        <div className="text-sm font-semibold mb-3" style={{ color: '#1C1C1E' }}>Savings trend</div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
          {/* zero baseline */}
          <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY} stroke="#E5E5EA" strokeWidth="1" strokeDasharray="3 3" />
          <path d={line} fill="none" stroke="#007AFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {vals.map((v, i) => (
            <circle key={i} cx={x(i)} cy={y(v)} r={i === vals.length - 1 ? 4 : 2.5} fill={v < 0 ? '#FF6961' : '#007AFF'} />
          ))}
        </svg>
        <div className="flex justify-between mt-1 px-1">
          {labels.map((l) => <span key={l} className="text-[10px]" style={{ color: '#B0B0B5' }}>{l}</span>)}
        </div>
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
        <Spark values={spark} labels={labels} color="#007AFF" />
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
      <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid #F2F2F7' }}>
        <span className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 9, background: '#F2F2F7' }}>
          <Layers className="w-4 h-4" style={{ color: '#8E8E93' }} />
        </span>
        <span className="flex-1 text-[15px] font-medium" style={{ color: '#1C1C1E' }}>Categories</span>
        <span className="text-[14px]" style={{ color: '#8E8E93' }}>18</span>
        <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: '#C7C7CC' }} />
      </div>
      {/* Sources row with the default banks */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 9, background: '#F2F2F7' }}>
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
          <p style={{ color: '#007AFF', fontSize: 15, fontWeight: 600, marginTop: 4, letterSpacing: '0.02em' }}>Your Expense Lens</p>
        </div>
      ),
      title: userName ? `Welcome, ${userName} 👋` : 'Welcome to TracklyLab 👋',
      desc: 'A quick look at what you can do - it takes 20 seconds.',
    },
    {
      illustration: <AddIllustration />,
      title: 'Add in seconds',
      desc: 'Enter an amount, choose a category and subcategory, then set how often it repeats and which account it came from.',
    },
    {
      illustration: <DashboardIllustration />,
      title: 'Your money at a glance',
      desc: 'The dashboard shows spending, income and savings - with breakdowns by category and source.',
    },
    {
      illustration: <TrendIllustration />,
      title: 'Spot the trends',
      desc: 'See your monthly totals and average, and how your spending trend moves month over month.',
    },
    {
      illustration: <SavingsIllustration />,
      title: 'Grow your savings',
      desc: 'Track savings and your saving rate over time - the app flags your best and worst months.',
    },
    {
      illustration: <DemoIllustration />,
      title: 'Want to look around first?',
      desc: 'Load a set of sample transactions and explore the dashboard and trends with real-looking data. Remove it all in one tap whenever you want.',
      cta: 'demo',
    },
    {
      illustration: <SettingsIllustration />,
      title: 'Make it yours',
      desc: 'Start with your categories - tailor them to how you spend. Add your banks as sources, and export a full backup of everything whenever you like.',
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
    <div className="min-h-screen flex flex-col max-w-[430px] mx-auto" style={{ backgroundColor: '#F5F5F7' }}>
      {/* Skip */}
      <div className="flex justify-end px-6 pt-4" style={{ minHeight: 44 }}>
        {!isLast && (
          <button onClick={onDone} className="px-2 py-1 text-sm font-medium" style={{ color: '#8E8E93' }}>
            Skip
          </button>
        )}
      </div>

      {/* Swipeable slides */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex-1 flex overflow-x-auto"
        style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
      >
        {slides.map((slide, i) => (
          <div key={i} className="flex-shrink-0 w-full flex flex-col justify-center px-7" style={{ scrollSnapAlign: 'center' }}>
            <div className="mb-8">{slide.illustration}</div>
            <h2 style={{ color: '#1C1C1E', fontSize: 26, fontWeight: 700, letterSpacing: '-0.4px', marginBottom: 10, textWrap: 'balance' } as any}>
              {slide.title}
            </h2>
            <p style={{ color: '#8E8E93', fontSize: 16, lineHeight: 1.45 }}>{slide.desc}</p>
          </div>
        ))}
      </div>

      {/* Dots + CTA */}
      <div className="px-7 pb-8 pt-4">
        <div className="flex justify-center gap-1.5 mb-5">
          {slides.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === index ? 20 : 7,
                height: 7,
                borderRadius: 999,
                background: i === index ? '#007AFF' : '#D1D1D6',
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
              style={{ backgroundColor: '#007AFF', color: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,122,255,0.25)' }}
            >
              Set up my categories
            </button>
            <button onClick={onDone} className="py-2.5 text-[15px] font-medium" style={{ color: '#8E8E93' }}>
              I'll do it later
            </button>
          </div>
        ) : isDemoSlide ? (
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => { onLoadDemo(); next(); }}
              className="w-full py-4 rounded-xl font-medium text-base transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              style={{ backgroundColor: '#007AFF', color: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,122,255,0.25)' }}
            >
              <FlaskConical className="w-4 h-4" /> Load sample data
            </button>
            <button onClick={next} className="py-2.5 text-[15px] font-medium" style={{ color: '#8E8E93' }}>
              Maybe later
            </button>
          </div>
        ) : (
          <button
            onClick={next}
            className="w-full py-4 rounded-xl font-medium text-base transition-all active:scale-[0.98]"
            style={{ backgroundColor: '#007AFF', color: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,122,255,0.25)' }}
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
