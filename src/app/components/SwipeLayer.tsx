import { useRef, type ReactNode } from 'react';
import { SETTLE_MS, type SwipeBackDrag } from '../lib/useSwipeBackDrag';

// One level of the Settings navigation stack, as a real layer.
//
// The sub-pages used to REPLACE the root - one screen mounted at a time,
// which made the back gesture necessarily a cut, and made every return
// re-settle the root's scroll. Now the root stays mounted underneath and
// each open sub-page is one of these: fixed over the page area, below the
// dock, carrying the drag the finger is making.
//
// Only the TOPMOST layer receives `drag`; the ones beneath hold still, which
// is exactly what a stack under a page being peeled away should do.
//
// The transform is applied ONLY while the drag is live. A transformed
// ancestor becomes the containing block for position:fixed descendants, and
// the sheets and dialogs these pages open are fixed to the VIEWPORT - so at
// rest the layer must carry no transform at all. The drag hook already
// refuses to start over an open dialog, so the two states never overlap.
export function SwipeLayer({
  drag,
  children,
}: {
  drag: SwipeBackDrag | null;
  children: ReactNode;
}) {
  const live = drag && drag.phase !== 'idle';
  // Anchored where the window was scrolled when the layer opened. The window
  // is what scrolls the root list, and it is frozen (html overflow:hidden)
  // for as long as any layer is open, so this is stable for the layer's
  // whole life - and it is what keeps the root's scroll position untouched
  // underneath.
  const top = useRef<number | null>(null);
  if (top.current === null) top.current = Math.round(window.scrollY) + 8;
  return (
    <div
      data-swipe-layer
      // ABSOLUTE, not fixed, and with NO z-index - both deliberate, both for
      // the same reason: in Blink and WebKit position:fixed creates a
      // stacking context even at z-index:auto, which capped every sheet
      // inside a layer below the dock (z-40) - the add-source sheet became
      // untappable exactly where it overlaps the dock band. An absolute box
      // at z-auto creates no context in any engine: the layer stacks by DOM
      // order (after the isolated root), the dock's z-40 still floats over
      // it, and its inner fixed sheets keep their z-50+ in the ROOT context,
      // above the dock, exactly as they did when sub-pages were in-flow.
      // Anchoring inside the app column also stops layers spanning the whole
      // window on desktop, which the fixed version quietly did.
      className="absolute left-0 right-0"
      style={{
        top: top.current,
        height: 'calc(100dvh - 8px)',
        backgroundColor: 'var(--bg-page)',
        ...(live
          ? {
              transform: `translateX(${drag.x}px)`,
              transition:
                drag.phase === 'dragging' ? 'none' : `transform ${SETTLE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
              // The peeled page casts onto what it is revealing.
              boxShadow: '-8px 0 24px rgba(0, 0, 0, 0.18)',
              willChange: 'transform',
            }
          : {}),
      }}
    >
      {children}
    </div>
  );
}
