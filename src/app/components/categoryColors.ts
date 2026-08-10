// Shared category colour palette used by the Add/Edit category modals.
// Each entry carries the Tailwind classes for the icon (text), the tinted tile
// (bgColor / selectedBg) and the picker swatch (preview). Classes are written
// as literal strings so Tailwind includes them in the build.
//
// NOTE: keep the `color` values stable — existing categories are matched back
// to a swatch by their stored `color` class when editing.
export interface CategoryColor {
  name: string;
  color: string;
  bgColor: string;
  selectedBg: string;
  preview: string;
}

export const colorOptions: CategoryColor[] = [
  { name: 'Red', color: 'text-red-500', bgColor: 'bg-red-50', selectedBg: 'bg-red-100', preview: 'bg-red-500' },
  { name: 'Orange', color: 'text-orange-500', bgColor: 'bg-orange-50', selectedBg: 'bg-orange-100', preview: 'bg-orange-500' },
  { name: 'Amber', color: 'text-amber-600', bgColor: 'bg-amber-50', selectedBg: 'bg-amber-100', preview: 'bg-amber-600' },
  { name: 'Yellow', color: 'text-yellow-500', bgColor: 'bg-yellow-50', selectedBg: 'bg-yellow-100', preview: 'bg-yellow-500' },
  { name: 'Lime', color: 'text-lime-600', bgColor: 'bg-lime-50', selectedBg: 'bg-lime-100', preview: 'bg-lime-600' },
  { name: 'Green', color: 'text-green-600', bgColor: 'bg-green-50', selectedBg: 'bg-green-100', preview: 'bg-green-600' },
  { name: 'Emerald', color: 'text-emerald-500', bgColor: 'bg-emerald-50', selectedBg: 'bg-emerald-100', preview: 'bg-emerald-500' },
  { name: 'Teal', color: 'text-teal-500', bgColor: 'bg-teal-50', selectedBg: 'bg-teal-100', preview: 'bg-teal-500' },
  { name: 'Cyan', color: 'text-cyan-500', bgColor: 'bg-cyan-50', selectedBg: 'bg-cyan-100', preview: 'bg-cyan-500' },
  { name: 'Sky', color: 'text-sky-500', bgColor: 'bg-sky-50', selectedBg: 'bg-sky-100', preview: 'bg-sky-500' },
  { name: 'Blue', color: 'text-blue-600', bgColor: 'bg-blue-50', selectedBg: 'bg-blue-100', preview: 'bg-blue-600' },
  { name: 'Indigo', color: 'text-indigo-500', bgColor: 'bg-indigo-50', selectedBg: 'bg-indigo-100', preview: 'bg-indigo-500' },
  { name: 'Violet', color: 'text-violet-500', bgColor: 'bg-violet-50', selectedBg: 'bg-violet-100', preview: 'bg-violet-500' },
  { name: 'Purple', color: 'text-purple-500', bgColor: 'bg-purple-50', selectedBg: 'bg-purple-100', preview: 'bg-purple-500' },
  { name: 'Fuchsia', color: 'text-fuchsia-500', bgColor: 'bg-fuchsia-50', selectedBg: 'bg-fuchsia-100', preview: 'bg-fuchsia-500' },
  { name: 'Pink', color: 'text-pink-500', bgColor: 'bg-pink-50', selectedBg: 'bg-pink-100', preview: 'bg-pink-500' },
  { name: 'Rose', color: 'text-rose-500', bgColor: 'bg-rose-50', selectedBg: 'bg-rose-100', preview: 'bg-rose-500' },
  { name: 'Slate', color: 'text-slate-600', bgColor: 'bg-slate-50', selectedBg: 'bg-slate-100', preview: 'bg-slate-600' },
  { name: 'Gray', color: 'text-gray-500', bgColor: 'bg-gray-50', selectedBg: 'bg-gray-100', preview: 'bg-gray-500' },
  { name: 'Zinc', color: 'text-zinc-500', bgColor: 'bg-zinc-50', selectedBg: 'bg-zinc-100', preview: 'bg-zinc-500' },
  { name: 'Neutral', color: 'text-neutral-500', bgColor: 'bg-neutral-50', selectedBg: 'bg-neutral-100', preview: 'bg-neutral-500' },
  { name: 'Stone', color: 'text-stone-500', bgColor: 'bg-stone-50', selectedBg: 'bg-stone-100', preview: 'bg-stone-500' },
];

// The saturated hex behind each `text-*` class, for places that need the
// category's colour as paint rather than as a Tailwind class - the tinted
// share bars on the Dashboard, chiefly. Both the picker's shades and the
// -500/-600 variants older stored categories carry.
const TEXT_HEX: Record<string, string> = {
  'text-red-500': '#EF4444', 'text-red-600': '#DC2626',
  'text-orange-500': '#F97316', 'text-orange-600': '#EA580C',
  'text-amber-500': '#F59E0B', 'text-amber-600': '#D97706',
  'text-yellow-500': '#EAB308', 'text-yellow-600': '#CA8A04',
  'text-lime-500': '#84CC16', 'text-lime-600': '#65A30D',
  'text-green-500': '#22C55E', 'text-green-600': '#16A34A',
  'text-emerald-500': '#10B981', 'text-emerald-600': '#059669',
  'text-teal-500': '#14B8A6', 'text-teal-600': '#0D9488',
  'text-cyan-500': '#06B6D4', 'text-cyan-600': '#0891B2',
  'text-sky-500': '#0EA5E9', 'text-sky-600': '#0284C7',
  'text-blue-500': '#3B82F6', 'text-blue-600': '#2563EB',
  'text-indigo-500': '#6366F1', 'text-indigo-600': '#4F46E5',
  'text-violet-500': '#8B5CF6', 'text-violet-600': '#7C3AED',
  'text-purple-500': '#A855F7', 'text-purple-600': '#9333EA',
  'text-fuchsia-500': '#D946EF', 'text-fuchsia-600': '#C026D3',
  'text-pink-500': '#EC4899', 'text-pink-600': '#DB2777',
  'text-rose-500': '#F43F5E', 'text-rose-600': '#E11D48',
  'text-slate-500': '#64748B', 'text-slate-600': '#475569',
  'text-gray-500': '#6B7280', 'text-gray-600': '#4B5563',
  'text-zinc-500': '#71717A', 'text-zinc-600': '#52525B',
  'text-neutral-500': '#737373', 'text-neutral-600': '#525252',
  'text-stone-500': '#78716C', 'text-stone-600': '#57534E',
};

export const categoryHex = (colorClass?: string): string => TEXT_HEX[colorClass ?? ''] ?? '#8E8E93';

/**
 * The category's solid, softened - paint, never a class name.
 *
 * The tinted `bg-<hue>-50` a category carries is too pale to read as a fill on
 * a light track: at 2px high against bg-neutral-100 it is not there. And the
 * obvious way to soften a colour in markup, `bg-opacity-*`, was removed in
 * Tailwind v4, so the class silently did nothing wherever it was still written.
 * Alpha over the solid gives a fill that stays visible at any weight.
 */
export const categoryTint = (colorClass: string | undefined, alpha: number): string => {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, '0');
  return `${categoryHex(colorClass)}${a}`;
};

// The segmented Expense/Income/Savings switches carry their meaning-colour in
// the thumb's SHADOW rather than its fill: a white thumb keeps the active
// label crisp, and the glow underneath says which side you are on without
// putting a coloured block on the card. Savings is a result, not a direction,
// so it glows neutral.
//
// Three layers, because one soft shadow at 30% was invisible on a real phone:
// a hairline ring that draws the thumb's edge in the meaning-colour, a tight
// contact shadow that lifts it off the track, and a wide glow that carries the
// tint far enough to read at arm's length. The ring is what actually makes it
// perceptible - a blur alone spreads too thin against a near-white card.
export function switchGlow(type: 'expense' | 'income' | 'savings' | 'all'): string {
  const neutral = type === 'savings' || type === 'all';
  const [r, g, b] = type === 'income' ? [31, 122, 67] : neutral ? [28, 28, 30] : [194, 53, 43];
  const rgba = (a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;
  // Savings and All are results rather than directions, so their neutral tint
  // is held back a touch - the same shape, quieter.
  const k = neutral ? 0.8 : 1;
  return [
    `0 0 0 1px ${rgba(0.30 * k)}`,
    `0 1px 3px ${rgba(0.24 * k)}`,
    `0 4px 12px ${rgba(0.36 * k)}`,
  ].join(', ');
}
