// The one blue a filter control wears while it is actually filtering something.
//
// Activity and Trend had drifted onto two different blues - Activity on the
// brand indigo, Trend's subcategory toggle on Tailwind's stock blue-50/400/600,
// while Trend's CATEGORY toggle stayed white no matter what was selected. Three
// behaviours for one idea. The values live here so the next filter control that
// needs an "on" state cannot invent a fourth.
export const FILTER_ACTIVE = {
  /** Chip fill. */
  bg: 'var(--wash-accent)',
  /** Transparent, so a filled chip is exactly as tall as a bordered one. */
  border: 'transparent',
  /** Label, and any icon that carries meaning. */
  text: '#4F74F3',
  /** Chevrons and clear-crosses: present, but a step back from the label. */
  icon: '#93A6F8',
} as const;

/** The resting state of the same control. */
export const FILTER_IDLE = {
  bg: 'var(--bg-card)',
  border: 'var(--line)',
  text: 'var(--chip-text)',
  icon: 'var(--chip-icon)',
} as const;
