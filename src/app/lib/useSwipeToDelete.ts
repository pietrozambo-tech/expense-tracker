import { useEffect, useRef, useState } from 'react';

// Reveal width of the delete action and the drag distance needed to keep it open.
const OPEN_WIDTH = 80;
const SNAP_THRESHOLD = 40;
const AXIS_LOCK = 8; // px of movement before we commit the gesture to an axis

/**
 * Swipe-to-reveal-delete for a list row.
 *
 * The row keeps `touch-action: pan-y` so the list still scrolls vertically by
 * default. On the first move we lock the gesture to one axis: a vertical lock
 * is left to the browser (the list scrolls), a horizontal lock calls
 * preventDefault on the (non-passive) touchmove so the page does NOT scroll
 * up/down while you swipe the row sideways.
 */
export function useSwipeToDelete() {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [translateX, setTranslateX] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Mutable gesture state kept in a ref so the listeners can stay stable.
  const tx = useRef(0);
  const g = useRef({ x: 0, y: 0, offset: 0, axis: 'none' as 'none' | 'x' | 'y', moved: false, active: false });

  const apply = (v: number) => {
    tx.current = v;
    setTranslateX(v);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const begin = (x: number, y: number) => {
      g.current = { x, y, offset: tx.current, axis: 'none', moved: false, active: true };
      setDragging(true);
    };

    const drag = (x: number, y: number, e: Event) => {
      if (!g.current.active) return;
      const dx = x - g.current.x;
      const dy = y - g.current.y;

      if (g.current.axis === 'none') {
        if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return;
        g.current.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      if (g.current.axis !== 'x') return; // vertical gesture -> let the list scroll

      if (e.cancelable) e.preventDefault(); // horizontal gesture -> block vertical scroll
      g.current.moved = true;
      apply(Math.max(-OPEN_WIDTH, Math.min(0, g.current.offset + dx)));
    };

    const finish = () => {
      if (!g.current.active) return;
      g.current.active = false;
      setDragging(false);
      if (g.current.axis === 'x') apply(tx.current < -SNAP_THRESHOLD ? -OPEN_WIDTH : 0);
    };

    const onTouchStart = (e: TouchEvent) => begin(e.touches[0].clientX, e.touches[0].clientY);
    const onTouchMove = (e: TouchEvent) => drag(e.touches[0].clientX, e.touches[0].clientY, e);
    const onMouseDown = (e: MouseEvent) => begin(e.clientX, e.clientY);
    const onMouseMove = (e: MouseEvent) => drag(e.clientX, e.clientY, e);

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', finish);
    el.addEventListener('touchcancel', finish);
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', finish);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', finish);
      el.removeEventListener('touchcancel', finish);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', finish);
    };
  }, []);

  const close = () => apply(0);

  // Wrap a row's tap handler: swallow the click that ends a drag, and let a tap
  // on an open row just close it instead of activating.
  const handleTap = (onTap: () => void) => {
    if (g.current.moved) {
      g.current.moved = false;
      return;
    }
    if (tx.current < 0) {
      close();
      return;
    }
    onTap();
  };

  return {
    ref,
    translateX,
    dragging,
    isOpen: translateX < 0,
    close,
    handleTap,
    rowStyle: { touchAction: 'pan-y' as const },
  };
}
