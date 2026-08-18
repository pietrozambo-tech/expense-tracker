import { isIOSWeb } from '../lib/haptics';

// A real, invisible switch under the finger.
//
// Apple removed programmatic web haptics in iOS 26.5; what survives - on
// every iOS since 17.4 - is the system tick a native switch plays when a
// FINGER toggles it. So the key tap targets render one of these on top of
// themselves: the tap lands on the switch (haptic, by the platform's own
// hand), and the click bubbles on to the control's real handler underneath.
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
