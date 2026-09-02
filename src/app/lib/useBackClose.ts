import { useEffect, useRef } from 'react';

// What the Android back gesture does when a sheet is open.
//
// Before this, nothing: the app pushed no history at all (history.length was
// 2 from a cold start), so back left the page - which, in an installed PWA,
// means closing the app with the sheet still open and whatever was typed in
// it gone. The gesture is the most used control on the platform, and it was
// the one control the app never answered.
//
// The shape is deliberately small: ONE history entry exists while anything is
// open, however many sheets are stacked, and it is re-armed after each one
// closes. Counting entries per sheet is the version of this that goes wrong -
// a sheet closed by its own X while another opens leaves the count off by
// one, and from then on back either eats two sheets or none.
//
// Two things make that harder than it reads, and both cost a real bug first:
//
//   history.back() is ASYNCHRONOUS. Pushing a new entry before its popstate
//   arrives moves the target out from under it, and the queued back then goes
//   one entry too far - straight out of the app. Tapping a trip card did
//   exactly this: it closes the trips sheet and opens the Activity screen in
//   one gesture, so a back and a push landed in the same tick and the app
//   navigated to about:blank.
//
//   A sheet closing while another opens is normal, not exceptional. So the
//   stack is reconciled ONCE per tick, after React has finished committing
//   both: a close-then-open nets out to "still armed", and touches history
//   not at all.

type Entry = { close: () => void };

const stack: Entry[] = [];
// True exactly when our entry is on the history stack.
let armed = false;
// A back() we asked for, whose popstate has not arrived. Nothing may touch
// history until it does.
let inFlight = false;
// Tells our own popstate from the user's: without it, closing a sheet by its
// X would go on to close the next one down.
let ours = false;
let scheduled = false;

const reconcile = () => {
  if (typeof window === 'undefined' || inFlight) return;
  if (stack.length > 0 && !armed) {
    armed = true;
    window.history.pushState({ trackly: 'sheet' }, '');
  } else if (stack.length === 0 && armed) {
    armed = false;
    inFlight = true;
    ours = true;
    window.history.back();
  }
};

// After the commit, not during it: the whole point is to see the finished
// state of the stack rather than each half of a swap.
const schedule = () => {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => { scheduled = false; reconcile(); });
};

const onPop = () => {
  if (ours) {
    ours = false;
    inFlight = false;
    // A sheet may have opened while the back was in flight.
    reconcile();
    return;
  }
  // The browser consumed our entry: there is nothing left to give back.
  armed = false;
  inFlight = false;
  stack[stack.length - 1]?.close();
  // The close unmounts the sheet, whose cleanup schedules the next reconcile.
};

if (typeof window !== 'undefined') window.addEventListener('popstate', onPop);

/**
 * Close this sheet when the system back gesture fires.
 *
 * `open` is for sheets that live inside a component that stays mounted (the
 * currency picker inside the amount field); a sheet that is only rendered
 * while open passes true.
 */
export function useBackClose(open: boolean, onClose: () => void) {
  // Read through a ref so a handler rebuilt on every render does not tear the
  // entry down and push a new history entry each time.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const entry: Entry = { close: () => closeRef.current() };
    stack.push(entry);
    schedule();
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      schedule();
    };
  }, [open]);
}
