// A synchronous key/value façade over whatever durable store the platform has.
//
// Why this exists: inside WKWebView - the web view the native iOS app runs in -
// localStorage is classed as *cache* by the system, and iOS is free to evict it
// when the device runs short on space. Someone who tracked six months of
// spending as a guest (no cloud account, so no copy anywhere else) could open
// the app one morning to an empty ledger, with nothing to restore from. On iOS
// the durable store is UserDefaults, which @capacitor/preferences writes to:
// backed up with the device, never evicted.
//
// Preferences is asynchronous, and every read site in the app is a synchronous
// `useState(() => loadX())` initialiser. Rather than turn the whole app async,
// this keeps a memory mirror: hydrate() fills it once before React mounts,
// reads answer from it, and writes update it synchronously while the durable
// write lands in the background.
//
// On the web nothing changes: localStorage is already durable there, the mirror
// is never armed, and no Capacitor code is loaded or bundled.

import { isNative } from './platform';

interface PreferencesPlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

let prefs: PreferencesPlugin | null = null;

// Armed by hydrate() on native only. While it is false every read falls through
// to localStorage, which is what the web does forever and what native does for
// the few milliseconds before hydration finishes.
const mirror = new Map<string, string>();
let mirrorReady = false;

function localGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // private mode, or storage disabled
  }
}

export function getItem(key: string): string | null {
  if (mirrorReady) return mirror.get(key) ?? null;
  return localGet(key);
}

export function setItem(key: string, value: string): void {
  // localStorage is written on both platforms. On the web it *is* the store; on
  // native it is a free second copy that keeps the pre-hydration read path and
  // the plugin-missing fallback honest.
  try {
    localStorage.setItem(key, value);
  } catch {
    /* full or unavailable; the app keeps working from memory */
  }
  if (!mirrorReady) return;
  mirror.set(key, value);
  enqueue(key, value);
}

export function removeItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  if (!mirrorReady) return;
  mirror.delete(key);
  enqueue(key, null);
}

// ── Durable writes ──────────────────────────────────────────────────────────
//
// Keyed by name with the latest value winning, so a burst of edits to the same
// key collapses to one write and two writes to one key can never land out of
// order (which would resurrect an older ledger).

const pending = new Map<string, string | null>();
let draining: Promise<void> | null = null;

function enqueue(key: string, value: string | null) {
  if (!prefs) return;
  pending.set(key, value);
  if (!draining) draining = drain();
}

async function drain(): Promise<void> {
  while (pending.size > 0) {
    const [key, value] = pending.entries().next().value as [string, string | null];
    pending.delete(key);
    try {
      if (value === null) await prefs!.remove({ key });
      else await prefs!.set({ key, value });
    } catch {
      // The localStorage copy is still there; a later write will try again.
    }
  }
  draining = null;
}

/** Resolves once every queued durable write has landed. Used by tests. */
export async function flush(): Promise<void> {
  while (draining) await draining;
}

/**
 * Load the durable store into memory. No-op on the web.
 *
 * Must be awaited before React renders, because the first thing the app does is
 * read settings synchronously.
 */
export async function hydrate(keys: readonly string[]): Promise<void> {
  if (!isNative()) return;
  try {
    const mod = await import('@capacitor/preferences');
    prefs = mod.Preferences as unknown as PreferencesPlugin;

    for (const key of keys) {
      const { value } = await prefs.get({ key });
      if (value != null) {
        mirror.set(key, value);
        continue;
      }
      // Nothing durable yet. Adopt whatever the previous localStorage-backed
      // build left behind, so upgrading to this version doesn't read as a fresh
      // install. Idempotent: the next launch finds it in Preferences.
      const legacy = localGet(key);
      if (legacy !== null) {
        mirror.set(key, legacy);
        pending.set(key, legacy);
      }
    }

    mirrorReady = true;
    if (pending.size > 0 && !draining) draining = drain();
  } catch {
    // Plugin missing or the bridge failed: stay on localStorage rather than
    // starting the app with no storage at all.
    prefs = null;
  }
}

/** Test seam: forget the native backend and go back to plain localStorage. */
export function __resetForTests(): void {
  prefs = null;
  mirror.clear();
  mirrorReady = false;
  pending.clear();
  draining = null;
}
