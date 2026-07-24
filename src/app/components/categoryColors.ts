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
