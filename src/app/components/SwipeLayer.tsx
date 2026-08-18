import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { SwipeBackRef } from '../lib/useSwipeBackDrag';

// One level of the Settings navigation stack, as a real layer.
//
// The sub-pages used to REPLACE the root - one screen mounted at a time,
// which made the back gesture necessarily a cut and made every return
// re-settle the root's scroll. Now the root stays mounted underneath and each
// open sub-page is one of these.
//
// ABSOLUTE, and carrying no z-index. Both deliberate, both for the same
// reason: position:fixed creates a stacking context unconditionally, which
// traps the sheets a sub-page opens (z-50, z-80) inside the layer and caps
// them BELOW the dock - the add-source sheet became untappable exactly where
// it overlaps the dock band. An absolute box at z-auto creates no context: the
// layer paints by DOM order (after the isolated root), the dock's z-40 still
// floats over it, and inner fixed sheets keep beating the dock from the root
// context, exactly as they did when sub-pages were in-flow. (A transform DOES
// make a context - but only while a drag is live, and the gesture refuses to
// start with a dialog open, so the two never coincide.)
//
// It covers THE WHOLE VIEWPORT, and that is the point of this file.
//
// Two earlier versions each tried to be clever about where the page area
// begins - `window.scrollY + 8`, then the top inset's measured bottom - and a
// real iPhone showed the Settings list bleeding through a band along the top
// of every sub-page. Any formula that reasons about scroll offsets, safe
// areas or status bars is a formula that can be wrong on a device I cannot
// hold. So there is no formula: the layer's top edge is pinned to viewport y
// = 0 (expressed in its offset parent's coordinates, since it is absolute)
// and its height is the viewport's. Covering the 8px top inset as well costs
// nothing - it is the same background colour - and in exchange a gap is not
// something this component can express.
//
// Re-measured whenever the geometry it depends on could have changed: a frame
// later (a bouncing scroll settling), on resize and orientation change, and
// on scroll - so even if some engine moves the page under an open layer, the
// layer follows instead of drifting.
export function SwipeLayer({
  dragRef,
  children,
}: {
  dragRef: SwipeBackRef | null;
  children: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = hostRef.current;
      const parent = el?.offsetParent as HTMLElement | null;
      if (!el || !parent) return;
      // Where viewport y=0 falls inside the offset parent. Negative parent
      // top (a scrolled page) becomes a positive offset, and vice versa.
      const top = -parent.getBoundingClientRect().top;
      const height = window.innerHeight;
      setBox((prev) =>
        prev && Math.abs(prev.top - top) < 0.5 && Math.abs(prev.height - height) < 0.5
          ? prev
          : { top, height }
      );
    };
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    window.addEventListener('scroll', measure, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      window.removeEventListener('scroll', measure);
    };
  }, []);

  return (
    <div
      data-swipe-layer
      ref={(el) => {
        hostRef.current = el;
        dragRef?.(el);
      }}
      className="absolute left-0 right-0"
      style={{
        top: box?.top ?? 0,
        height: box ? box.height : '100dvh',
        // The background reaches viewport y=0 so no gap can exist; the
        // CONTENT still starts 8px down, exactly where .app-top-inset put it
        // before, so nothing shifts under the status bar.
        paddingTop: 8,
        boxSizing: 'border-box',
        backgroundColor: 'var(--bg-page)',
        // The page beneath must not scroll while this covers it: contained
        // overscroll is what replaces the old html-level scroll freeze, which
        // iOS honoured by snapping the page to the top.
        overscrollBehavior: 'contain',
        // Nothing else here: the drag writes transform, transition, shadow and
        // will-change straight onto this node (see useSwipeBackDrag) so a
        // moving finger never re-renders React.
      }}
    >
      {children}
    </div>
  );
}
