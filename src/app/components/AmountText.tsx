import { CURRENCIES } from '../utils/currency';

// An amount typeset the way money is worn, not printed: the units carry the
// line, the currency symbol and the cents step back. "1,039€" with every glyph
// at full weight is spreadsheet typography; the number is the information, the
// symbol is punctuation.
//
// Mirrors formatAmountListView's choices exactly - symbol always after,
// `decimals` a maximum with filler cents dropped - so a screen can switch a
// string to this component without the value reading differently.
interface AmountTextProps {
  amount: number;
  currency: string;
  /** Maximum decimals; whole numbers never show filler cents. */
  decimals?: number;
  /** Explicit sign to show ("+", "-"). Negatives render their own minus. */
  sign?: string;
  /**
   * Shorten large numbers, matching a string formatter exactly so a screen can
   * swap one for the other without the value reading differently:
   *   'fit'     - formatAbbreviatedAmount: 10K and up become "86.4K" / "1.2MM".
   *   'summary' - formatSummaryAmount: whole numbers to 100K, then "86K" / "1.2MM".
   * The magnitude suffix is part of the number, so it stays full size; only the
   * currency symbol steps back.
   */
  abbreviate?: 'fit' | 'summary';
  className?: string;
  style?: React.CSSProperties;
}

export function AmountText({
  amount,
  currency,
  decimals = 2,
  sign = '',
  abbreviate,
  className,
  style
}: AmountTextProps) {
  const cur = CURRENCIES[currency] || CURRENCIES.EUR;
  const factor = 10 ** decimals;
  const rounded = Math.round((amount ?? 0) * factor) / factor;
  const abs = Math.abs(rounded);
  const showFrac = decimals > 0 && !Number.isInteger(rounded);
  let intText = Math.trunc(abs).toLocaleString('en-US');
  let fracText = showFrac ? abs.toFixed(decimals).split('.')[1] : null;

  // Above each formatter's threshold the number collapses to a single
  // magnitude-suffixed figure, and there are no cents left to quiet.
  const threshold = abbreviate === 'summary' ? 100000 : abbreviate === 'fit' ? 10000 : Infinity;
  if (abs >= threshold) {
    fracText = null;
    intText =
      abs >= 1000000
        ? `${(abs / 1000000).toFixed(1)}MM`
        : abbreviate === 'summary'
          ? `${Math.round(abs / 1000).toLocaleString('en-US')}K`
          : `${(abs / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  } else if (abbreviate === 'summary') {
    // Below the threshold formatSummaryAmount is whole-number, whatever the
    // caller asked for in decimals.
    fracText = null;
    intText = Math.round(abs).toLocaleString('en-US');
  }

  // Multi-letter symbols (CHF) read better with a space, same as the formatter.
  const sep = cur.symbol.length > 1 ? ' ' : '';

  return (
    <span className={className} style={style}>
      {sign || (rounded < 0 ? '-' : '')}
      {intText}
      {fracText && <span style={QUIET}>.{fracText}</span>}
      <span style={QUIET}>{sep}{cur.symbol}</span>
    </span>
  );
}

/** The half-step back the symbol and cents take. */
const QUIET: React.CSSProperties = { fontSize: '0.72em', fontWeight: 500, opacity: 0.6 };

// The same typesetting for an amount that arrives already formatted, by
// formatAmountListView, as text. Not the path to prefer - AmountText knows the
// number and cannot misread it - but a sentence that measures its own length to
// choose its phrasing has to be assembled as a string, and the amounts inside
// it come back as text or not at all.
export function AmountFromText({ text }: { text: string }) {
  const parts = /^(-?[\d,]+)(\.\d+)?(.*)$/.exec(text);
  if (!parts) return <>{text}</>;
  const [, whole, cents, symbol] = parts;
  return (
    <>
      {whole}
      {cents && <span style={QUIET}>{cents}</span>}
      {symbol && <span style={QUIET}>{symbol}</span>}
    </>
  );
}
