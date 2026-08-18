import { isIOSWeb } from '../lib/haptics';

// A real, invisible switch under the finger.
//
// Apple removed programmatic web haptics in iOS 26.5; what survives - on
// every iOS since 17.4 - is the system tick a native switch plays when a
// FINGER toggles it. So a few tap targets render one of these on top of
// themselves: the tap lands on the switch (haptic, by the platform's own
// hand), and the click bubbles on to the control's real handler underneath.
//
// HARD RULE: only on surfaces that do not scroll. A native iOS switch
// toggles by SLIDING as well as tapping, so on a scrollable surface a
// vertical scroll that merely starts on the control reads as an
// interaction and the click bubbles into the handler. That is exactly what
// happened when the Add screen's category chips wore one: scrolling the
// grid kept selecting categories. Today the overlay lives on the dock (the
// tabs and the +) and the dev panel's Tap-me diagnostic - nothing else.
// Chips, list rows and settings switches stay bare; on iOS they simply
// have no haptic, which beats a control that fires while you scroll.
//
// The host element must be position:relative. Deliberately kept native in
// appearance (appearance:none might unhook the very behaviour we are here
// for) and hidden with opacity alone. aria-hidden and tabIndex keep it out
// of the accessibility tree and the tab order - to everything but a finger,
// it does not exist.
//
// Renders nothing off iOS: Android taps vibrate through lib/haptics.ts, and
// a desktop pointer needs no buzz.
export function HapticOverlay() {
  if (!isIOSWeb()) return null;
  return (
    <input
      type="checkbox"
      // @ts-expect-error - the switch flavour is a Safari extension the React
      // types do not know; the attribute must still reach the DOM.
      switch=""
      aria-hidden="true"
      tabIndex={-1}
      data-haptic-overlay
      className="absolute inset-0 w-full h-full"
      style={{ opacity: 0, margin: 0, cursor: 'inherit', zIndex: 1 }}
    />
  );
}
