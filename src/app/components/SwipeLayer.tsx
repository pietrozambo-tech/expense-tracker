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
// Where the layer sits is MEASURED, never computed from window.scrollY. The
// first version placed it at `scrollY + 8` and a real iPhone showed a band of
// the page above the sub-page: on a device with a status bar, a rubber-banding
// scroll, or a standalone display mode, that arithmetic is not where the page
// content actually starts. So the layer asks the page: the top inset's bottom
// edge is the content line, its own offset parent gives the column origin, and
// the difference is the answer on any device. Re-measured a frame later, when
// a bouncing scroll has settled.
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
      const inset = document.querySelector('.app-top-inset');
      const startY = inset ? inset.getBoundingClientRect().bottom : 8;
      const top = startY - parent.getBoundingClientRect().top;
      const height = Math.max(0, window.innerHeight - startY);
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
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
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
        top: box?.top ?? 8,
        height: box ? box.height : 'calc(100dvh - 8px)',
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
