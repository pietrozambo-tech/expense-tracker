import { useRef, useState } from 'react';
import {
  ArrowUp, ArrowDown, Wallet, Percent, Calendar, Repeat, ChevronDown, ChevronRight,
  ShoppingCart, Car, Home, Clapperboard, PiggyBank, TrendingUp, Landmark, Layers,
} from 'lucide-react';
import type { Source } from '../types';
import { SourceLogo } from './SourceLogo';
import { DEFAULT_SOURCES } from './sources';

// A small line chart (line + soft area + endpoint dot), matching the app style
function Spark({ values, labels, color }: { values: number[]; labels: string[]; color: string }) {
  const W = 300, H = 116, pad = 10;
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
  onSetupSources: () => void; // finish and jump to Settings › Sources
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

function DashboardIllustration() {
  const metrics = [
    { label: 'Spending', value: '1,039€', Icon: ArrowUp, tint: 'rgba(255,105,97,0.16)', color: '#FF6961' },
    { label: 'Income', value: '3,380€', Icon: ArrowDown, tint: 'rgba(48,209,88,0.16)', color: '#30D158' },
    { label: 'Savings', value: '2,341€', Icon: Wallet, tint: 'rgba(100,160,255,0.16)', color: '#64A0FF', accent: '#30D158' },
    { label: 'Saving Rate', value: '69%', Icon: Percent, tint: 'rgba(100,160,255,0.16)', color: '#64A0FF', accent: '#30D158' },
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
        <div className="text-center mb-3.5 text-sm font-semibold" style={{ color: '#FFFFFF' }}>July 2026</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3.5">
          {metrics.map((m) => (
            <div key={m.label} className="flex items-center gap-2.5">
              <span className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 999, background: m.tint }}>
                <m.Icon className="w-4 h-4" style={{ color: m.color }} strokeWidth={2.5} />
              </span>
              <div>
                <div className="text-[11px]" style={{ color: 'rgba(235,235,245,0.6)' }}>{m.label}</div>
                <div className="text-[16px] font-bold tabular-nums" style={{ color: m.accent || '#FFFFFF' }}>{m.value}</div>
              </div>
            </div>
          ))}
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
  const labels = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
  const cumulative = [22, 30, 26, 40, 52, 60];       // overall, ascending
  const groceries = [140, 110, 175, 130, 205, 180];  // one category, up and down

  return (
    <div className="flex flex-col gap-3">
      {/* Cumulative spending (line) */}
      <div className="rounded-2xl px-4 pt-4 pb-3" style={{ background: '#FFFFFF', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid #EEEEF1' }}>
        <div className="text-sm font-semibold mb-3" style={{ color: '#1C1C1E' }}>Cumulative spending</div>
        <Spark values={cumulative} labels={labels} color="#007AFF" />
      </div>

      {/* Per-category monthly line */}
      <div className="rounded-2xl px-4 pt-4 pb-3" style={{ background: '#FFFFFF', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid #EEEEF1' }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center justify-center flex-shrink-0" style={{ width: 22, height: 22, borderRadius: 7, background: '#E7F6EC' }}>
            <ShoppingCart className="w-3.5 h-3.5" style={{ color: '#2E9E5B' }} />
          </span>
          <span className="text-sm font-semibold" style={{ color: '#1C1C1E' }}>Groceries · monthly</span>
        </div>
        <Spark values={groceries} labels={labels} color="#2E9E5B" />
      </div>
    </div>
  );
}

function SavingsIllustration() {
  // Sample monthly savings — dips below zero one month, like the real Savings view
  const vals = [1940, 1958, 1741, 1722, -2591, 1906, 2341];
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
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
            <span className="text-[11px]" style={{ color: '#8E8E93' }}>Saving rate</span>
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

function SettingsIllustration() {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid #EEEEF1' }}>
      {/* Sources row with the default banks */}
      <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid #F2F2F7' }}>
        <span className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 9, background: '#F2F2F7' }}>
          <Landmark className="w-4 h-4" style={{ color: '#8E8E93' }} />
        </span>
        <span className="flex-1 text-[15px] font-medium" style={{ color: '#1C1C1E' }}>Sources</span>
        <div className="flex" style={{ gap: 0 }}>
          {DEFAULT_SOURCES.map((s, i) => (
            <span key={s.id} style={{ marginLeft: i === 0 ? 0 : -6, boxShadow: '0 0 0 2px #FFFFFF', borderRadius: 6 }}>
              <SourceLogo source={s} size={20} />
            </span>
          ))}
        </div>
        <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: '#C7C7CC' }} />
      </div>
      {/* Categories row */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 9, background: '#F2F2F7' }}>
          <Layers className="w-4 h-4" style={{ color: '#8E8E93' }} />
        </span>
        <span className="flex-1 text-[15px] font-medium" style={{ color: '#1C1C1E' }}>Categories</span>
        <span className="text-[14px]" style={{ color: '#8E8E93' }}>18</span>
        <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: '#C7C7CC' }} />
      </div>
    </div>
  );
}

export function WelcomeCarousel({ userName, onDone, onSetupSources }: WelcomeCarouselProps) {
  const slides = [
    {
      illustration: (
        <div className="flex flex-col items-center justify-center" style={{ minHeight: 220 }}>
          <div className="flex items-center justify-center rounded-3xl mb-2" style={{ width: 96, height: 96, background: '#FFFFFF', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', fontSize: 52 }}>💸</div>
        </div>
      ),
      title: userName ? `Welcome, ${userName} 👋` : 'Welcome 👋',
      desc: 'A quick look at what you can do — it takes 20 seconds.',
    },
    {
      illustration: <AddIllustration />,
      title: 'Add in seconds',
      desc: 'Enter an amount, choose a category and subcategory, then set how often it repeats and which account it came from.',
    },
    {
      illustration: <DashboardIllustration />,
      title: 'Your money at a glance',
      desc: 'The dashboard shows spending, income and savings — with breakdowns by category and source.',
    },
    {
      illustration: <TrendIllustration />,
      title: 'Spot the trends',
      desc: 'See cumulative spending, and how any category splits out month over month.',
    },
    {
      illustration: <SavingsIllustration />,
      title: 'Grow your savings',
      desc: 'Track savings and your saving rate over time — the app flags your best and worst months.',
    },
    {
      illustration: <SettingsIllustration />,
      title: 'Make it yours',
      desc: 'The app comes with sample banks and categories — swap in your own accounts and tweak categories anytime in Settings.',
    },
  ];

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const isLast = index >= slides.length - 1;

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
              onClick={onSetupSources}
              className="w-full py-4 rounded-xl font-medium text-base transition-all active:scale-[0.98]"
              style={{ backgroundColor: '#007AFF', color: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,122,255,0.25)' }}
            >
              Set up my sources
            </button>
            <button onClick={onDone} className="py-2.5 text-[15px] font-medium" style={{ color: '#8E8E93' }}>
              I'll do it later
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
