import { useRef, useState } from 'react';
import {
  ArrowUp, ArrowDown, Wallet, Percent, Calendar, Repeat, ChevronDown,
  ShoppingCart, Car, Home, Clapperboard,
} from 'lucide-react';
import type { Source } from '../types';
import { SourceLogo } from './SourceLogo';

interface WelcomeCarouselProps {
  userName?: string;
  onDone: () => void;
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
      {/* Category grid */}
      <div className="grid grid-cols-2 gap-2">
        {cats.map(({ name, Icon, bg, fg, on }) => (
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
  return (
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
  );
}

function TrendIllustration() {
  // Sample monthly points (ascending-ish) drawn as a smooth line + area
  const pts = [22, 30, 26, 40, 52, 60];
  const labels = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
  const W = 300, H = 120, pad = 8;
  const max = 70;
  const x = (i: number) => pad + (i * (W - pad * 2)) / (pts.length - 1);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const line = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(pts.length - 1)} ${H} L ${x(0)} ${H} Z`;
  return (
    <div className="rounded-2xl px-4 pt-4 pb-3" style={{ background: '#FFFFFF', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid #EEEEF1' }}>
      <div className="text-sm font-semibold mb-3" style={{ color: '#1C1C1E' }}>Cumulative spending</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#007AFF" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#007AFF" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#tg)" />
        <path d={line} fill="none" stroke="#007AFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === pts.length - 1 ? 4 : 2.5} fill="#007AFF" />
        ))}
      </svg>
      <div className="flex justify-between mt-1 px-1">
        {labels.map((l) => <span key={l} className="text-[10px]" style={{ color: '#B0B0B5' }}>{l}</span>)}
      </div>
    </div>
  );
}

export function WelcomeCarousel({ userName, onDone }: WelcomeCarouselProps) {
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
      desc: 'Enter an amount, pick a category, then set how often it repeats and which account it came from.',
    },
    {
      illustration: <DashboardIllustration />,
      title: 'Your money at a glance',
      desc: 'The dashboard shows spending, income and savings — with breakdowns by category and source.',
    },
    {
      illustration: <TrendIllustration />,
      title: 'Spot the trends',
      desc: 'The Trend tab reveals how your spending and saving evolve month over month.',
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
        <button
          onClick={next}
          className="w-full py-4 rounded-xl font-medium text-base transition-all active:scale-[0.98]"
          style={{ backgroundColor: '#007AFF', color: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,122,255,0.25)' }}
        >
          {isLast ? 'Start tracking' : 'Next'}
        </button>
      </div>
    </div>
  );
}
