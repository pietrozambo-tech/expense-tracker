import { CURRENCIES, abbreviateNumber } from '../utils/currency';
import { cachedNumberFormat, numberLocale, decimalSeparator, groupSeparator, GROUPED } from '../i18n/store';

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
  // Through the kept formatter: this line runs once per visible row.
  let intText = cachedNumberFormat(numberLocale(), GROUPED).format(Math.trunc(abs));
  let fracText = showFrac ? abs.toFixed(decimals).split('.')[1] : null;

  // Above each mode's threshold the number collapses to a single
  // magnitude-suffixed figure, and there are no cents left to quiet.
  // abbreviateNumber is the same helper the string formatter uses, so the
  // component and the FitText fallback can never disagree.
  //
  // The `undefined` case is a floor, not "never": a caller that has not opted
  // in still gets protected past a trillion. Callers opt in because a column
  // is TIGHT; this is about an amount that has stopped being a number on a
  // screen and become a layout bug - one such value once stretched a donut's
  // centre label clean through the card. No realistic amount reaches it (a
  // trillion rupiah is ~$65M), so nothing legitimate is shortened by surprise,
  // and no screen anywhere can be broken by a number again.
  const threshold = abbreviate === 'summary' ? 0 : abbreviate === 'fit' ? 10000 : 1e12;
  if (abs >= threshold) {
    fracText = null;
    intText = abbreviateNumber(abs, abbreviate ?? 'fit');
  }

  // Multi-letter symbols (CHF) read better with a space, same as the formatter.
  const sep = cur.symbol.length > 1 ? ' ' : '';

  return (
    <span className={className} style={style}>
      {sign || (rounded < 0 ? '-' : '')}
      {intText}
      {fracText && <span style={QUIET}>{decimalSeparator()}{fracText}</span>}
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
  // The input comes from formatAmountListView in the CURRENT locale, so the
  // separators are known, not guessed: "1,234.56" in English, "1.234,56" in
  // Italian - the same glyphs with swapped jobs, which is exactly why this
  // cannot be one hard-coded pattern.
  const dec = decimalSeparator();
  const parts = new RegExp(`^(-?[\\d\\${groupSeparator()}]+)(\\${dec}\\d+)?(.*)$`).exec(text);
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
