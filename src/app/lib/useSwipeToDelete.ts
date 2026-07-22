import { useRef, useState } from 'react';

// Reveal width of the delete action and the drag distance needed to keep it open.
const OPEN_WIDTH = 80;
const SNAP_THRESHOLD = 40;
const DRAG_SLOP = 4; // px of horizontal movement before a gesture counts as a drag

/**
 * Swipe-to-reveal-delete for a list row.
 *
 * Uses Pointer Events with `touch-action: pan-y`, so the browser owns vertical
 * scrolling and only horizontal drags reach us. That removes the old jank where
 * any touch flashed the delete background before the row actually moved.
 */
export function useSwipeToDelete() {
  const [translateX, setTranslateX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startOffset = useRef(0);
  const didDrag = useRef(false);
  const activeId = useRef<number | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    activeId.current = e.pointerId;
    startX.current = e.clientX;
    startOffset.current = translateX;
    didDrag.current = false;
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (activeId.current !== e.pointerId) return;
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > DRAG_SLOP) didDrag.current = true;
    // Clamp between fully-open (left) and closed; no rightward overscroll
    setTranslateX(Math.max(-OPEN_WIDTH, Math.min(0, startOffset.current + dx)));
  };

  const finish = (e: React.PointerEvent) => {
    if (activeId.current !== e.pointerId) return;
    activeId.current = null;
    setDragging(false);
    setTranslateX((prev) => (prev < -SNAP_THRESHOLD ? -OPEN_WIDTH : 0));
  };

  const close = () => setTranslateX(0);

  // Wrap a row's tap handler: swallow the click that ends a drag, and let a tap
  // on an open row just close it instead of activating.
  const handleTap = (onTap: () => void) => {
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    if (translateX < 0) {
      close();
      return;
    }
    onTap();
  };

  return {
    translateX,
    dragging,
    isOpen: translateX < 0,
    close,
    handleTap,
    swipeHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      style: { touchAction: 'pan-y' as const },
    },
  };
}
