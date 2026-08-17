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

// Fired at most once, the first time a write is refused with no durable store
// behind it. A refused write is silent data loss on the next launch: the user
// keeps using an app that looks fine and reopens it to yesterday. The app
// cannot fix a full disk, but it can say so while there is still time to
// export a backup or sign in - staying quiet here turns a recoverable
// situation into a lost ledger.
export const STORAGE_BROKEN_EVENT = 'tracklylab:storage-broken';
let storageBroken = false;

/**
 * Whether a write has already been refused. The event alone is not enough:
 * language and analytics writes happen before React mounts, so the first
 * refusal can fire before anything is listening - the UI checks this on mount
 * and catches up.
 */
export function isStorageBroken(): boolean {
  return storageBroken;
}

function announceBrokenStorage(): void {
  // On native the durable store is UserDefaults; a localStorage failure there
  // costs nothing (hydrate() trusts whichever copy is newer), so only a device
  // with no other store gets the warning.
  if (storageBroken || mirrorReady) return;
  storageBroken = true;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(STORAGE_BROKEN_EVENT));
}

function localSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    announceBrokenStorage();
  }
}

export function getItem(key: string): string | null {
  if (mirrorReady) return mirror.get(key) ?? null;
  return localGet(key);
}

export function setItem(key: string, value: string): void {
  // localStorage is written on both platforms. On the web it *is* the store; on
  // native it is the synchronous working copy - always at least as fresh as
  // the durable one, which is what lets hydrate() trust it (see below).
  localSet(key, value);
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
      // The localStorage copy still has the newer value, and hydrate() trusts
      // localStorage over the durable store - the next launch reconciles.
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

    // Which copy to trust? localStorage is written synchronously on every
    // save; the durable write crosses an async bridge, and iOS can suspend
    // the app mid-flight and kill it while suspended - an edit made seconds
    // before backgrounding would exist in localStorage but not in the durable
    // store. So when localStorage holds a key it is never older, and it wins;
    // reading the durable copy first would lose exactly the edits this module
    // exists to protect. (This also covers upgrading from the localStorage-
    // only build: everything present is adopted and persisted.)
    //
    // Eviction takes the whole origin store, never single keys. So if ANY of
    // our keys is still in localStorage, the store is alive, and a key missing
    // from it was removed on purpose - reconcile the durable copy rather than
    // resurrect it (a lost in-flight remove would otherwise bring erased data
    // back). If NONE are present, the store was evicted - or this device was
    // restored from a backup that carried UserDefaults but not web storage -
    // and the durable copy is the truth: restore it, including back into
    // localStorage, so the aliveness test still holds next launch.
    const alive = keys.some((k) => localGet(k) !== null);

    for (const key of keys) {
      const local = localGet(key);
      const { value: durable } = await prefs.get({ key });
      if (local !== null) {
        mirror.set(key, local);
        if (durable !== local) pending.set(key, local);
      } else if (!alive) {
        if (durable != null) {
          mirror.set(key, durable);
          localSet(key, durable);
        }
      } else if (durable != null) {
        pending.set(key, null); // removed locally; finish the removal
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
  storageBroken = false;
}
