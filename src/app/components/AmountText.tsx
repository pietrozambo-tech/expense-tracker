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
  className?: string;
  style?: React.CSSProperties;
}

export function AmountText({ amount, currency, decimals = 2, sign = '', className, style }: AmountTextProps) {
  const cur = CURRENCIES[currency] || CURRENCIES.EUR;
  const factor = 10 ** decimals;
  const rounded = Math.round((amount ?? 0) * factor) / factor;
  const abs = Math.abs(rounded);
  const showFrac = decimals > 0 && !Number.isInteger(rounded);
  const intText = Math.trunc(abs).toLocaleString('en-US');
  const fracText = showFrac ? abs.toFixed(decimals).split('.')[1] : null;
  // Multi-letter symbols (CHF) read better with a space, same as the formatter.
  const sep = cur.symbol.length > 1 ? ' ' : '';
  const quiet: React.CSSProperties = { fontSize: '0.72em', fontWeight: 500, opacity: 0.6 };

  return (
    <span className={className} style={style}>
      {sign || (rounded < 0 ? '-' : '')}
      {intText}
      {fracText && <span style={quiet}>.{fracText}</span>}
      <span style={quiet}>{sep}{cur.symbol}</span>
    </span>
  );
}
