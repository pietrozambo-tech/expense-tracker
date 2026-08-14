import { flushSync } from 'react-dom';

// Make a Settings navigation visible.
//
// Opening and closing a sub-page swapped one screen for another between two
// frames. Nothing was wrong with WHERE you ended up; the problem was that
// nothing showed you had gone anywhere, so leaving a sub-page read as the
// screen glitching rather than as coming back. That is worse with the edge
// swipe than with the chevron: a gesture that moves your finger 70px and
// produces an instant cut has no relationship between what you did and what
// happened.
//
// This uses the browser's View Transitions API, which snapshots the page
// before and after a state change and lets CSS animate between the two. The
// alternative was restructuring eleven early returns in Settings.tsx into a
// mounted-and-layered navigation stack, which is a great deal of risk for an
// animation.
//
// It degrades to exactly the old behaviour: where the API is missing (any
// WebKit before iOS 18), or the user has asked for less motion, the update
// runs on its own and the screen swaps as it always did.

type TransitionDoc = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

export type NavDirection = 'forward' | 'back';

export function navTransition(direction: NavDirection, update: () => void): void {
  const doc = document as TransitionDoc;
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (typeof doc.startViewTransition !== 'function' || reduced) {
    update();
    return;
  }

  // Which way the pages travel. Read by the ::view-transition rules in
  // index.css, and removed again as soon as the animation is over so an
  // unrelated transition elsewhere never inherits a direction.
  doc.documentElement.dataset.nav = direction;
  // React 18 batches, and the API needs the DOM to be in its NEW state by the
  // time the callback returns - otherwise it snapshots the same screen twice
  // and animates nothing.
  const transition = doc.startViewTransition(() => {
    flushSync(update);
  });
  void transition.finished.finally(() => {
    delete doc.documentElement.dataset.nav;
  });
}
