import type { Source } from '../types';

interface SourceLogoProps {
  source?: Source | null;
  size?: number; // px, the tile is square
  className?: string;
}

// A small brand-coloured tile standing in for a bank/cash logo. Draws a white
// monogram, or a banknote glyph for cash. Falls back to a neutral tile when the
// source is unknown (e.g. a deleted source on an old transaction).
export function SourceLogo({ source, size = 22, className }: SourceLogoProps) {
  const radius = Math.round(size * 0.28);
  const fg = source?.fg || '#FFFFFF';

  if (!source) {
    return (
      <span
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: 'var(--line)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: 'var(--ink-2)',
          fontWeight: 800,
          fontSize: Math.round(size * 0.5)
        }}
        aria-hidden="true"
      >
        ?
      </span>
    );
  }

  const isBanknote = source.mark === 'banknote';
  const monogram = source.monogram || source.name.slice(0, 1).toUpperCase();

  return (
    <span
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: source.brand,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: fg,
        fontWeight: 800,
        letterSpacing: monogram.length > 1 ? '-0.02em' : 0,
        fontSize: Math.round(size * (monogram.length > 1 ? 0.4 : 0.5)),
        lineHeight: 1
      }}
      aria-hidden="true"
    >
      {isBanknote ? (
        <svg width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} viewBox="0 0 24 24" fill="none" stroke={fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M6 12h.01M18 12h.01" />
        </svg>
      ) : (
        monogram
      )}
    </span>
  );
}
