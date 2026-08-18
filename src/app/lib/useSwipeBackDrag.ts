import { useEffect, useRef, useState } from 'react';

// The edge swipe, grown up: the page under the finger MOVES.
//
// The first version of this gesture (useEdgeSwipeBack) fired the close the
// moment the finger had travelled 70px - a trigger, not a drag. Stopping
// mid-gesture showed nothing, finishing it produced an instant cut, and the
// cut ended with the list visibly re-settling its scroll. The fix for all
// three is the same fix: the sub-page follows the finger over a still-mounted
// parent, exactly like every native iOS screen.
//
// The gesture rules are inherited unchanged from the first version, because
// they were right: start within EDGE px of the left edge, declare a direction
// only after DEADZONE px, flatter than 45 degrees or it is a scroll, one
// decision per touch, and a dialog over the page owns its own gestures.
//
// What is new is what happens after: the hook publishes x (how far the page
// has been dragged) and a phase. While 'dragging', the SwipeLayer places the
// page at x with no transition and this hook cancels the browser's own
// scrolling (the touchmove listener is passive:false for exactly that).
// On release, past THRESHOLD_FRACTION of the screen - or flicked faster than
// FLICK px/ms - the phase turns 'closing': the layer glides off, and after
// the glide the close lands as a plain state change, no view transition on
// top of an animation that already happened. Short of the threshold it turns
// 'cancelling' and glides home. Reduced motion skips the glides.

const EDGE = 28;
const DEADZONE = 10;
const THRESHOLD_FRACTION = 0.35;
const FLICK = 0.5; // px per ms, measured over the last move
export const SETTLE_MS = 240;

export type SwipePhase = 'idle' | 'dragging' | 'closing' | 'cancelling';

export interface SwipeBackDrag {
  x: number;
  phase: SwipePhase;
}

export function useSwipeBackDrag(active: boolean, onClose: () => void): SwipeBackDrag {
  const [x, setX] = useState(0);
  const [phase, setPhase] = useState<SwipePhase>('idle');
  // The latest closer, so the release handler never closes yesterday's layer.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!active) return;

    let startX = 0;
    let startY = 0;
    let tracking = false; // touch began at the edge, not yet declared
    let dragging = false; // declared horizontal: the page is in hand
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    let settleTimer = 0;

    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    const settle = (closing: boolean) => {
      const finish = () => {
        if (closing) closeRef.current();
        setPhase('idle');
        setX(0);
      };
      if (reduced) {
        finish();
        return;
      }
      setPhase(closing ? 'closing' : 'cancelling');
      setX(closing ? window.innerWidth : 0);
      settleTimer = window.setTimeout(finish, SETTLE_MS + 40);
    };

    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch || e.touches.length > 1) {
        tracking = false;
        return;
      }
      const target = e.target as Element | null;
      if (target?.closest?.('[data-overlay], [role="dialog"]')) {
        tracking = false;
        return;
      }
      startX = touch.clientX;
      startY = touch.clientY;
      lastX = startX;
      lastT = e.timeStamp;
      tracking = startX <= EDGE;
      dragging = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      if (!dragging) {
        if (Math.abs(dx) < DEADZONE && Math.abs(dy) < DEADZONE) return;
        if (dx <= 0 || Math.abs(dy) > Math.abs(dx)) {
          tracking = false;
          return;
        }
        dragging = true;
        setPhase('dragging');
      }

      // The page is in hand: the browser must not also scroll it.
      e.preventDefault();
      const now = e.timeStamp;
      if (now > lastT) velocity = (touch.clientX - lastX) / (now - lastT);
      lastX = touch.clientX;
      lastT = now;
      setX(Math.max(0, dx));
    };

    const onEnd = () => {
      if (!dragging) {
        tracking = false;
        return;
      }
      tracking = false;
      dragging = false;
      const dx = Math.max(0, lastX - startX);
      settle(dx > window.innerWidth * THRESHOLD_FRACTION || velocity > FLICK);
    };

    // touchmove is passive:false ON PURPOSE - see e.preventDefault above.
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.clearTimeout(settleTimer);
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
      setPhase('idle');
      setX(0);
    };
  }, [active]);

  return { x, phase };
}
