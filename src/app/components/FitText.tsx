import { useLayoutEffect, useRef, useState } from 'react';

interface FitTextProps {
  children: React.ReactNode;
  /** Preferred size, used whenever the text fits. */
  max: number;
  /** Never shrink past this - below it, `compact` takes over (or ellipsis). */
  min: number;
  /** Shorter rendering of the same value, e.g. "86.4K CHF" for "86,420 CHF". */
  compact?: string;
  /**
   * What to actually render once shortened, when the abbreviated form needs the
   * same typesetting as `children` (an <AmountText abbreviate="fit" />).
   * `compact` stays the plain string either way - it is what the effects below
   * key on, and a node's identity changes on every render.
   */
  compactNode?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

// Fits an amount into the width it is given, in that order of preference:
//
//   1. the full number at full size
//   2. the full number, shrunk - but only mildly
//   3. the abbreviated number ("86.4K CHF"), shrunk if it still needs it
//
// Amounts are the one thing in the app whose length we do not control: a
// currency rendered as a symbol is one character ("4,252€") but as a code it is
// four ("4,252 CHF"), and a bad month adds a digit and a minus sign on top.
// Below a certain size the number stops being readable, which defeats the
// purpose of the card - so past that point we drop precision instead of pixels.
//
// Measured rather than guessed from character counts, because glyph widths vary
// (a comma is not a digit) and the available width depends on the viewport.
export function FitText({ children, max, min, compact, compactNode, className = '', style }: FitTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  // Width of the full text at `max`, remembered so we can tell whether it would
  // fit again after a resize without having to render it to find out.
  const fullWidth = useRef<number | null>(null);
  const [size, setSize] = useState(max);
  const [abbreviated, setAbbreviated] = useState(false);

  // A new value invalidates everything we measured about the old one, and we
  // start again from the full text.
  //
  // Keyed on `compact` rather than `children`: children may be styled JSX whose
  // identity changes on every render, which would reset the flag that fitting
  // had just set and leave the two effects flipping it back and forth forever.
  // `compact` is a string derived from the same value, so it changes when - and
  // only when - the number does.
  useLayoutEffect(() => {
    fullWidth.current = null;
    setAbbreviated(false);
  }, [compact]);

  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    let cancelled = false;

    // Fractional width of the text as laid out. scrollWidth rounds to whole
    // pixels, so a tenth of a pixel of overflow reads back as "it fits" while
    // the browser goes right on drawing the ellipsis - and an amount built from
    // differently sized spans (the quiet currency symbol) lands on fractions
    // constantly. A Range over the contents measures what is actually there.
    const measure = () => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const width = range.getBoundingClientRect().width;
      range.detach();
      return width;
    };

    const fit = () => {
      if (cancelled) return;
      // clientWidth rounds too, and can round up - half a pixel of headroom
      // that does not exist. Spend it rather than clip.
      const available = box.clientWidth - 0.5;
      if (available <= 0) return;

      // `min` is the point at which shortening the number beats shrinking it.
      // Once shortened there is nothing further to fall back to, so let the
      // abbreviated form go smaller rather than clip it.
      const floor = abbreviated ? Math.min(min, 11) : min;

      el.style.fontSize = `${max}px`;
      const wanted = measure();

      if (abbreviated) {
        // Room for the full number again (wider screen, smaller total)? Width
        // scales with font size closely enough to answer without re-rendering.
        if (fullWidth.current && fullWidth.current * (min / max) <= available) {
          setAbbreviated(false);
          return;
        }
      } else {
        fullWidth.current = wanted;
      }

      if (wanted <= available) {
        setSize(max);
        return;
      }

      // Width scales close enough to linearly with font size to land in one
      // step; the loop then only ever nudges half a pixel for rounding.
      let next = Math.max(floor, Math.floor(((max * available) / wanted) * 2) / 2);
      el.style.fontSize = `${next}px`;
      let guard = 8;
      while (next > floor && measure() > available && guard-- > 0) {
        next -= 0.5;
        el.style.fontSize = `${next}px`;
      }

      // Still overflowing at the smallest size we are willing to use: shorten
      // the number rather than shrink it into illegibility.
      if (!abbreviated && compact && measure() > available) {
        setAbbreviated(true);
        return;
      }

      // Leave the measured size on the node. setSize keeps React in sync, but it
      // bails out when the value is unchanged - and then no render would come
      // along to re-apply a size we had cleared.
      setSize(next);
    };

    fit();
    // Re-fit on rotation / width changes, and once webfonts settle - metrics
    // measured against a fallback font would be wrong.
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [children, compact, abbreviated, max, min]);

  return (
    <span ref={ref} className={`block truncate ${className}`} style={{ ...style, fontSize: size }}>
      {abbreviated && compact ? compactNode ?? compact : children}
    </span>
  );
}
