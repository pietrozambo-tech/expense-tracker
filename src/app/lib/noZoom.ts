// Keep the app at 1:1 the way a native screen is, instead of a web page that
// happens to be on a phone.
//
// There are THREE different zooms behind "I can pinch the app around", and they
// need three different fixes - which is why the viewport meta tag alone was
// never going to be enough:
//
//   1. Pinch-to-zoom.        iOS Safari has ignored `user-scalable=no` and
//                            `maximum-scale` since iOS 10, on purpose. The
//                            gesture* events below are the only thing that
//                            still stops it, and they are Safari-only (no other
//                            engine fires them, so elsewhere this is inert and
//                            the meta tag does the work).
//   2. Double-tap-to-zoom.   `touch-action` in theme.css - a value without
//                            `pinch-zoom` disables the double-tap gesture too.
//   3. Focus auto-zoom.      Not a gesture at all: iOS zooms the page in by
//                            itself when you tap a text field whose font-size
//                            is under 16px, and never zooms back out. This is
//                            almost certainly the one that gets noticed most,
//                            because it fires without anybody trying. Fixed by
//                            the 16px floor on form controls in theme.css.
//
// System accessibility zoom is unaffected: iOS Zoom (Settings > Accessibility)
// magnifies the whole screen above the browser, so a low-vision user keeps that
// however hard a page tries to lock itself down.

/** Safari's two-finger gesture events, absent everywhere else. */
const GESTURES = ['gesturestart', 'gesturechange', 'gestureend'] as const;

export function preventPinchZoom(): void {
  // passive: false, or preventDefault is ignored and this whole file is a lie.
  for (const type of GESTURES) {
    document.addEventListener(type, (e: Event) => e.preventDefault(), { passive: false });
  }

  // Belt and braces for the older iOS path, where a pinch arrives as a
  // touchmove carrying a `scale` other than 1 rather than as a gesture event.
  // Single-finger touches are left completely alone - swipe-to-delete and every
  // scroll in the app ride on those.
  document.addEventListener(
    'touchmove',
    (e: TouchEvent & { scale?: number }) => {
      if (e.touches.length > 1 || (e.scale !== undefined && e.scale !== 1)) e.preventDefault();
    },
    { passive: false },
  );
}
