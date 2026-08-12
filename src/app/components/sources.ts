import type { Source } from '../types';
import type { Language } from '../i18n/store';

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

// The starter set in the onboarding language. Bank names are brands and don't
// translate; only Cash does. Seeded once - after onboarding, source names are
// the user's data and a language switch never renames them.
export function defaultSourcesFor(lang: Language): Source[] {
  if (lang !== 'it') return DEFAULT_SOURCES;
  return DEFAULT_SOURCES.map((s) => (s.id === 'cash' ? { ...s, name: 'Contanti' } : s));
}

// Both directions default to Revolut out of the box (user can change either).
export const DEFAULT_SOURCE_EXPENSE = 'revolut';
export const DEFAULT_SOURCE_INCOME = 'revolut';

// A small library of well-known banks, offered as quick-picks when adding a
// source. These are brand-colour + initials tiles (NOT official logos), so the
// major banks stay recognisable without embedding any trademarked artwork.
// Users can still add a fully custom source and pick any colour.
export const BANK_LIBRARY: { name: string; brand: string; monogram: string }[] = [
  { name: 'Revolut', brand: '#0B0B0D', monogram: 'R' },
  { name: 'Santander', brand: '#EC0000', monogram: 'S' },
  { name: 'Intesa Sanpaolo', brand: '#00854A', monogram: 'IS' },
  { name: 'BBVA', brand: '#072146', monogram: 'BB' },
  { name: 'CaixaBank', brand: '#007DC5', monogram: 'CX' },
  { name: 'Wise', brand: '#163300', monogram: 'W' },
  { name: 'N26', brand: '#48AC98', monogram: 'N' },
  { name: 'HSBC', brand: '#DB0011', monogram: 'H' },
  { name: 'Barclays', brand: '#00AEEF', monogram: 'B' },
  { name: 'Deutsche Bank', brand: '#0018A8', monogram: 'DB' },
  { name: 'BNP Paribas', brand: '#00915A', monogram: 'BN' },
  { name: 'UniCredit', brand: '#E2001A', monogram: 'UC' },
  { name: 'ING', brand: '#FF6200', monogram: 'IN' },
  { name: 'Monzo', brand: '#FF3464', monogram: 'M' },
];

// A colour palette offered when creating a custom source.
export const SOURCE_COLORS = [
  '#0B0B0D', '#EC0000', '#00854A', '#2FA84F', '#0A84FF',
  '#5E5CE6', '#FF9F0A', '#FF375F', '#14B8A6', 'var(--ink-2)',
];

// Build a 1–2 letter monogram from a source name (e.g. "Intesa Sanpaolo" → "IS").
export function monogramFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
