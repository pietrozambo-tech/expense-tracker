// Haptics for a web app, honestly.
//
// There is no official vibration API on iOS Safari - navigator.vibrate has
// never existed there. What DOES exist, since iOS 17.4, is the system haptic
// that fires when a native switch control toggles: programmatically clicking
// a hidden <input type="checkbox" switch> inside a tap's call stack plays the
// light system tick, in Safari and installed PWAs alike. One flavour only, no
// intensity control, silently inert on older iOS, and it respects the
// system-level "System Haptics" setting - which is exactly the etiquette a
// web app should have.
//
// Android Chrome has the real API, with durations, so the semantic levels
// genuinely differ there. On iOS they all collapse into the one tick - which
// is why call sites speak in MEANING (select/tick/success/heavy), never in
// milliseconds: when the Capacitor build lands, these four route to the real
// UIImpactFeedbackGenerator styles without touching a single caller.
//
// Every fire also dispatches a DOM event, because the sandbox this code is
// tested in has no motor to feel: checks subscribe to the event, and the
// developer panel shows the last one fired.

export type HapticKind = 'select' | 'tick' | 'success' | 'heavy';

export const HAPTIC_EVENT = 'tracklylab:haptic';

/** Android vibration patterns per level; iOS ignores these entirely. */
const PATTERNS: Record<HapticKind, number | number[]> = {
  select: 8, // the lightest touch - a picker detent, not a statement
  tick: 15,
  success: 30,
  heavy: [35, 60, 35],
};

const isIOS = () =>
  typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent ?? '');

// The hidden switch, created once on first use and reused - building DOM on
// every haptic would cost more than the haptic. Visually hidden rather than
// display:none: iOS has been inconsistent about firing the haptic for
// controls it considers not rendered.
let switchEl: HTMLInputElement | null = null;
function iosSwitchPulse(): void {
  if (!switchEl || !switchEl.isConnected) {
    switchEl = document.createElement('input');
    switchEl.type = 'checkbox';
    switchEl.setAttribute('switch', '');
    switchEl.setAttribute('aria-hidden', 'true');
    switchEl.tabIndex = -1;
    Object.assign(switchEl.style, {
      position: 'fixed',
      top: '0',
      left: '-100px',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none',
    });
    document.body.appendChild(switchEl);
  }
  switchEl.click();
}

function fire(kind: HapticKind): void {
  if (typeof window === 'undefined') return;
  try {
    if (isIOS()) {
      // One intensity is all iOS-web offers; the semantic level survives in
      // the event for the day the native engine can honour it.
      iosSwitchPulse();
    } else if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(PATTERNS[kind]);
    }
  } catch {
    // A haptic must never be the reason anything breaks.
  }
  window.dispatchEvent(new CustomEvent(HAPTIC_EVENT, { detail: kind }));
}

/** Picking one thing among peers - a category chip. The lightest level. */
export const hapticSelect = () => fire('select');
/** A small state change - a tab switch, a toggle flipping. */
export const hapticTick = () => fire('tick');
/** A commit moment - a transaction saved, a settlement recorded. */
export const hapticSuccess = () => fire('success');
/** Something destructive completed - a row deleted. */
export const hapticHeavy = () => fire('heavy');
