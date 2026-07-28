import { useLayoutEffect, useRef, useState } from 'react';

interface FitTextProps {
  children: React.ReactNode;
  /** Preferred size, used whenever the text fits. */
  max: number;
  /** Never shrink past this - below it, the text ellipsises instead. */
  min: number;
  className?: string;
  style?: React.CSSProperties;
}

// Shrinks its text just enough to fit the width it is given.
//
// Amounts are the one thing in the app whose length we do not control: a
// currency rendered as a symbol is one character ("4,252€") but as a code it is
// four ("4,252 CHF"), and a bad month adds a digit and a minus sign on top. At a
// fixed size those overflow and get cut to "-4,252 C...", which is worse than
// small text - the number is the whole point of the card.
//
// Measured rather than guessed from character counts, because glyph widths vary
// (a comma is not a digit) and the available width depends on the viewport.
export function FitText({ children, max, min, className = '', style }: FitTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(max);

  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    let cancelled = false;

    const fit = () => {
      if (cancelled) return;
      const available = box.clientWidth;
      if (!available) return;

      // The span is overflow-hidden, so scrollWidth is exactly the text width.
      el.style.fontSize = `${max}px`;
      const wanted = el.scrollWidth;
      if (wanted <= available) {
        setSize(max);
        return;
      }

      // Width scales close enough to linearly with font size to land in one
      // step; the loop then only ever nudges half a pixel for rounding.
      let next = Math.max(min, Math.floor(((max * available) / wanted) * 2) / 2);
      el.style.fontSize = `${next}px`;
      let guard = 8;
      while (next > min && el.scrollWidth > available && guard-- > 0) {
        next -= 0.5;
        el.style.fontSize = `${next}px`;
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
  }, [children, max, min]);

  return (
    <span
      ref={ref}
      className={`block truncate ${className}`}
      style={{ ...style, fontSize: size }}
    >
      {children}
    </span>
  );
}
