import { useCallback, useEffect, useRef } from 'react';

// The edge swipe, as a drag the finger actually carries.
//
// Two things this must get right, and the second one is why it does not use
// React state for the position:
//
//   1. The page follows the finger, stops where it stops, and on release
//      either completes or glides home. Rules inherited from the trigger
//      version because they were right: start within EDGE px of the left
//      edge, declare a direction only after DEADZONE px, flatter than 45
//      degrees or it is a scroll, one decision per touch, and a dialog over
//      the page owns its own gestures. Velocity is new: a fast flick
//      completes from anywhere.
//
//   2. It must not stutter. The first version put x in React state, so every
//      touchmove re-rendered the whole Settings tree - a component with
//      sixteen sub-screens and several thousand elements - sixty times a
//      second. That is the lag. The transform is now written STRAIGHT to the
//      node through a ref, coalesced into one write per animation frame, and
//      React renders exactly twice per gesture: not at all while dragging,
//      and once when a completed gesture closes the layer.
//
// translate3d, not translateX: it promotes the layer to its own compositor
// layer, so each frame is a GPU transform of an already-painted surface
// rather than a repaint of a full-screen page.

const EDGE = 28;
const DEADZONE = 10;
const THRESHOLD_FRACTION = 0.35;
const FLICK = 0.5; // px per ms over the last move
export const SETTLE_MS = 260;
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

/** Attach to the layer that should follow the finger; null for the rest. */
export type SwipeBackRef = (el: HTMLDivElement | null) => void;

export function useSwipeBackDrag(active: boolean, onClose: () => void): SwipeBackRef {
  const elRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!active) return;

    let startX = 0;
    let startY = 0;
    let tracking = false; // began at the edge, direction not yet declared
    let dragging = false; // declared horizontal: the page is in hand
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    let frame = 0;
    let pendingX = 0;
    let settleTimer = 0;

    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    const paint = () => {
      frame = 0;
      const el = elRef.current;
      if (el) el.style.transform = `translate3d(${pendingX}px,0,0)`;
    };

    const clearStyles = () => {
      const el = elRef.current;
      if (!el) return;
      el.style.transform = '';
      el.style.transition = '';
      el.style.boxShadow = '';
      el.style.willChange = '';
    };

    const settle = (closing: boolean) => {
      const el = elRef.current;
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      const finish = () => {
        // Order matters: clear the inline styles BEFORE React unmounts the
        // layer, so a cancelled gesture leaves no transform behind on a node
        // that stays on screen.
        clearStyles();
        if (closing) closeRef.current();
      };
      if (!el || reduced) {
        finish();
        return;
      }
      el.style.transition = `transform ${SETTLE_MS}ms ${EASE}`;
      el.style.transform = closing ? `translate3d(${window.innerWidth}px,0,0)` : 'translate3d(0,0,0)';
      settleTimer = window.setTimeout(finish, SETTLE_MS + 30);
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
      velocity = 0;
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
        const el = elRef.current;
        if (el) {
          el.style.transition = 'none';
          el.style.willChange = 'transform';
          el.style.boxShadow = '-10px 0 28px rgba(0, 0, 0, 0.16)';
        }
      }

      // The page is in hand: the browser must not also scroll it.
      e.preventDefault();
      const now = e.timeStamp;
      if (now > lastT) velocity = (touch.clientX - lastX) / (now - lastT);
      lastX = touch.clientX;
      lastT = now;
      pendingX = Math.max(0, dx);
      if (!frame) frame = requestAnimationFrame(paint);
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
      if (frame) cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
      clearStyles();
    };
  }, [active]);

  return useCallback((el: HTMLDivElement | null) => {
    elRef.current = el;
  }, []);
}
