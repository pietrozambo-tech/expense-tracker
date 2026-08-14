import type React from 'react';

// The app's one dark surface: near-black with a soft indigo bloom top-right,
// a fainter answer bottom-left, a hairline edge and a lifted shadow.
//
// Defined once and spread by every dark card - the personal hero, the Trend
// stat cards, the shared hero. Each used to carry its own copy of the same
// 300-character gradient, identical by luck; the shared hero then proved the
// point by drifting to a flat gradient with no bloom, no border and half the
// shadow, so the two heroes read as different materials on the same tab.
//
// Panes DO look slightly different by size: the highlight is anchored at
// 90%/-20% of the element, so a small card wears it closer in and brighter.
// That is the effect working - same material, different pane.
export const DARK_SURFACE: React.CSSProperties = {
  background: 'radial-gradient(120% 120% at 90% -20%, rgba(99,102,241,0.30) 0%, rgba(59,130,246,0.12) 42%, rgba(28,28,30,0) 68%), radial-gradient(100% 100% at 6% 118%, rgba(59,130,246,0.10) 0%, rgba(99,102,241,0.04) 45%, rgba(28,28,30,0) 72%), linear-gradient(150deg, #2E2E32 0%, #1C1C1E 100%)',
  boxShadow: '0 12px 30px rgba(28, 28, 30, 0.22)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
};
