import type { Source } from '../types';

// Starter set of payment sources. Users manage these in Settings › Sources.
// `brand` is each provider's approximate brand colour; the tile draws a white
// monogram (or a banknote for cash). Real SVG logos can replace the monograms
// later without changing this shape.
export const DEFAULT_SOURCES: Source[] = [
  { id: 'cash', name: 'Cash', kind: 'cash', brand: '#2FA84F', mark: 'banknote' },
  { id: 'revolut', name: 'Revolut', kind: 'bank', brand: '#0B0B0D', monogram: 'R', mark: 'monogram' },
  { id: 'intesa', name: 'Intesa Sanpaolo', kind: 'bank', brand: '#00854A', monogram: 'IS', mark: 'monogram' },
  { id: 'santander', name: 'Santander', kind: 'bank', brand: '#EC0000', monogram: 'S', mark: 'monogram' },
];

// Both directions default to Revolut out of the box (user can change either).
export const DEFAULT_SOURCE_EXPENSE = 'revolut';
export const DEFAULT_SOURCE_INCOME = 'revolut';

// A colour palette offered when creating a custom source.
export const SOURCE_COLORS = [
  '#0B0B0D', '#EC0000', '#00854A', '#2FA84F', '#0A84FF',
  '#5E5CE6', '#FF9F0A', '#FF375F', '#14B8A6', '#8E8E93',
];

// Build a 1–2 letter monogram from a source name (e.g. "Intesa Sanpaolo" → "IS").
export function monogramFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
