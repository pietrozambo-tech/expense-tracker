// Haptics for a web app, honestly - second edition, after a real iPhone
// stayed silent.
//
// The full picture, learned the hard way:
//
//   * iOS Safari has no vibration API and never has.
//   * Since iOS 17.4 a native switch control - <input type="checkbox" switch>
//     - plays the system tick when TOGGLED BY A FINGER. That is platform
//     behaviour and works on every version since, in Safari and installed
//     PWAs, respecting the system-level haptics setting.
//   * Programmatically clicking a hidden label around such a switch also
//     played the tick from iOS 17.4 until Apple patched it in iOS 26.5.
//     On current iPhones, JavaScript alone can no longer reach the Taptic
//     Engine. Full stop.
//
// So iOS haptics are split by WHEN they happen:
//
//   Tap moments on NON-SCROLLING surfaces (the dock's tabs and +) get a
//   real switch rendered invisibly OVER the control -
//   components/HapticOverlay.tsx. The finger genuinely toggles it (haptic,
//   every iOS version), and the click bubbles on to the control's own
//   handler. The overlay is banned from anything that scrolls: a native
//   switch also toggles by SLIDING, so on a scrollable grid or list a
//   vertical scroll starting on the control becomes a selection (the Add
//   screen's category chips proved it). fire() does NOT attempt
//   programmatic iOS output for 'select'/'tick': where the overlay exists
//   it owns those, attempting both double-buzzed devices still on <=26.4,
//   and where it does not, iOS stays silent by design.
//
//   Outcome moments (saved, settled, imported, deleted) cannot be a tap -
//   they happen after validation, sometimes with no tap at all. For these,
//   fire() clicks the hidden label: felt on 17.4-26.4, silent on 26.5+,
//   which is the most any web app can do there.
//
// Android has the real API, so every level vibrates with its own duration.
// When the Capacitor build lands, these semantic levels route to the real
// UIImpactFeedbackGenerator styles without touching a caller.
//
// Every attempted output also dispatches a DOM event carrying which engine
// ran - the sandbox has no motor, so the checks listen instead of feeling.

export type HapticKind = 'select' | 'tick' | 'success' | 'heavy';

export const HAPTIC_EVENT = 'tracklylab:haptic';

/** Android vibration patterns per level; iOS ignores these entirely. */
const PATTERNS: Record<HapticKind, number | number[]> = {
  select: 8, // the lightest touch - a picker detent, not a statement
  tick: 15,
  success: 30,
  heavy: [35, 60, 35],
};

/** Levels the programmatic iOS path may attempt. Tap-shaped levels are the
 *  overlay's job; attempting both double-buzzed devices still on <=26.4. */
const IOS_PROGRAMMATIC: Record<HapticKind, boolean> = {
  select: false,
  tick: false,
  success: true,
  heavy: true,
};

export const isIOSWeb = () =>
  typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent ?? '');

/** Whether this browser knows the switch flavour of checkbox at all. */
export function switchSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const probe = document.createElement('input');
  probe.type = 'checkbox';
  return 'switch' in probe;
}

/** The iOS major.minor from the UA, or null - the developer screen shows it
 *  because 26.5 is the line where programmatic haptics died. */
export function iosVersion(): string | null {
  const m = typeof navigator !== 'undefined' ? navigator.userAgent.match(/OS (\d+)[._](\d+)/) : null;
  return m ? `${m[1]}.${m[2]}` : null;
}

// The hidden label-wrapped switch for programmatic pulses, created once.
// Label + display:none is the canonical recipe the working libraries use;
// clicking the LABEL is what tickled the engine on 17.4-26.4.
let labelEl: HTMLLabelElement | null = null;
function iosLabelPulse(): void {
  if (!labelEl || !labelEl.isConnected) {
    labelEl = document.createElement('label');
    labelEl.setAttribute('aria-hidden', 'true');
    labelEl.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    labelEl.appendChild(input);
    document.body.appendChild(labelEl);
  }
  labelEl.click();
}

function announce(kind: HapticKind, engine: 'ios-click' | 'vibrate'): void {
  window.dispatchEvent(new CustomEvent(HAPTIC_EVENT, { detail: { kind, engine } }));
}

function fire(kind: HapticKind, forceIOS = false): void {
  if (typeof window === 'undefined') return;
  try {
    if (isIOSWeb()) {
      if (forceIOS || IOS_PROGRAMMATIC[kind]) {
        iosLabelPulse();
        announce(kind, 'ios-click');
      }
    } else if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(PATTERNS[kind]);
      announce(kind, 'vibrate');
    }
  } catch {
    // A haptic must never be the reason anything breaks.
  }
}

/** Picking one thing among peers - a category chip. The lightest level.
 *  On iOS this is the overlay's job; programmatically it only vibrates
 *  Android. */
export const hapticSelect = () => fire('select');
/** A small state change - a tab switch, a toggle flipping. Same split. */
export const hapticTick = () => fire('tick');
/** A commit moment - a transaction saved, a settlement recorded. */
export const hapticSuccess = () => fire('success');
/** Something destructive completed - a row deleted. */
export const hapticHeavy = () => fire('heavy');

/** The developer screen's feel-tester: always attempts output, so the levels
 *  can be pressed and judged on a real phone regardless of the routing table. */
export const hapticTest = (kind: HapticKind) => fire(kind, true);
