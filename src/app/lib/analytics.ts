import posthog from 'posthog-js';

// PostHog product analytics. The project API key is a *public* client key
// (safe to ship in the bundle). Paste yours below (or set VITE_POSTHOG_KEY).
// While the key is empty, analytics is disabled and every call is a no-op —
// the app works exactly the same, it just doesn't send anything.
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || '';
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://eu.i.posthog.com';

let enabled = false;

export function initAnalytics() {
  if (enabled || !POSTHOG_KEY) return;
  try {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: true,
      autocapture: true,
      persistence: 'localStorage',
    });
    enabled = true;
  } catch {
    /* analytics is best-effort; never let it break the app */
  }
}

// Tie events to a stable user (call on sign-in)
export function identifyUser(id: string, props?: Record<string, unknown>) {
  if (!enabled) return;
  try {
    posthog.identify(id, props);
  } catch {
    /* ignore */
  }
}

export function track(event: string, props?: Record<string, unknown>) {
  if (!enabled) return;
  try {
    posthog.capture(event, props);
  } catch {
    /* ignore */
  }
}

// Clear identity on sign-out so the next user isn't merged with this one
export function resetAnalytics() {
  if (!enabled) return;
  try {
    posthog.reset();
  } catch {
    /* ignore */
  }
}
