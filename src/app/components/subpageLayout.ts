// Geometry shared by every full-screen sub-page that opens out of Settings.
//
// A sub-page must reach the BOTTOM EDGE OF THE SCREEN, even though the dock
// floats over the last 82px of it. A scroll region that stops short of the edge
// clips its content against a line with nothing drawn on it: the page
// background continues below, so a button scrolling past that line reads as
// sliced in half in open space rather than disappearing into an edge. Two
// screens shipped that way - Save on Profile, and "Add a recurring transaction"
// - both cut at a boundary 128px above the screen bottom and 46px above the
// dock, with clear background beneath the cut.
//
// The rule that prevents it: the dock is paid for ONCE, by the padding inside
// the sub-page's own scroller. Nothing above that adds more, and nothing below
// it does either - a second helping just moves the last element further from
// the dock while the invisible clip line stays exactly where it was.
//
// These live in their own module rather than in Settings.tsx because
// SourcesManager needs them too, and Settings imports SourcesManager - the
// numbers were duplicated by hand there and drifted out of step.

/** App.tsx gives the tab scroller pb-32 to clear the dock. */
export const PARENT_DOCK_PADDING = 128;

/** 8px = .app-top-inset, the only thing above a sub-page. */
export const SUBPAGE_HEIGHT = 'calc(100dvh - 8px)';

/**
 * What a sub-page's scroller keeps clear at the bottom. The dock is a 62px
 * pill sitting 20px above the screen edge, so it owns the last 82px; 96 leaves
 * 14px of air between the last element and the glass.
 */
export const DOCK_CLEARANCE = 96;

/**
 * Full height, and a negative margin cancelling the tab wrapper's own dock
 * padding rather than stacking with it - the same trick the Settings root uses
 * to sit snug above the dock.
 */
export const SUBPAGE_STYLE = {
  height: SUBPAGE_HEIGHT,
  backgroundColor: '#F6F5F2',
  marginBottom: -PARENT_DOCK_PADDING,
};
