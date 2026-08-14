import { useEffect } from 'react';

// Drag in from the left edge to go back, the way every iOS screen does.
//
// A sub-page that can only be left by hitting a 24px chevron in the far corner
// is a sub-page you leave less often than you meant to - the thumb holding the
// phone is nowhere near that corner. The gesture is the one people already
// have in their hands from every other app on the device.
//
// Deliberately narrow, because this competes with real content:
//
//   * it must START within EDGE px of the left edge. Anywhere else is a scroll,
//     a swipe-to-delete on a transaction row, or a carousel;
//   * it must travel THRESHOLD px right, and stay flatter than 45 degrees, so a
//     diagonal that is really a vertical scroll is left alone;
//   * one decision per gesture. Once a touch is disqualified it stays
//     disqualified until the finger lifts, so a scroll that happens to drift
//     rightwards later cannot trip it.
//
// Nothing is animated: this fires the same close the chevron fires. An
// interactive, finger-following transition needs the page to be a real
// navigation stack, which this app deliberately is not.

const EDGE = 28;
const THRESHOLD = 70;
// Contact jitter is not a direction. The first touchmove of a real drag often
// reports dx = 0, or a pixel the wrong way, and judging the angle on it threw
// the gesture away before it had begun - the finger moved 190px right and
// nothing happened, every time.
const DEADZONE = 10;

export function useEdgeSwipeBack(active: boolean, onBack: () => void) {
  useEffect(() => {
    if (!active) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch || e.touches.length > 1) {
        tracking = false;
        return;
      }
      // A dialog over the page owns the gesture; going back underneath it would
      // dismiss two things at once, one of them invisibly.
      const target = e.target as Element | null;
      if (target?.closest?.('[data-overlay], [role="dialog"]')) {
        tracking = false;
        return;
      }
      startX = touch.clientX;
      startY = touch.clientY;
      tracking = startX <= EDGE;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      // Not yet moved far enough to have declared itself.
      if (Math.abs(dx) < DEADZONE && Math.abs(dy) < DEADZONE) return;
      // Steeper than 45 degrees, or heading left: this was a scroll.
      if (dx <= 0 || Math.abs(dy) > Math.abs(dx)) {
        tracking = false;
        return;
      }
      if (dx >= THRESHOLD) {
        tracking = false;
        onBack();
      }
    };

    const stop = () => {
      tracking = false;
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', stop, { passive: true });
    window.addEventListener('touchcancel', stop, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', stop);
      window.removeEventListener('touchcancel', stop);
    };
  }, [active, onBack]);
}
