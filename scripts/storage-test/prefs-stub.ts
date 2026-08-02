// Stands in for @capacitor/preferences (aliased at bundle time by
// scripts/test-storage.mjs). It is the *durable* store in these scenarios: the
// one thing iOS is not allowed to throw away. Exposing the map lets a scenario
// check what really survived, and the counters let one check that a burst of
// edits collapses into a couple of writes instead of hundreds.

export const store = new Map<string, string>();

export const stats = { get: 0, set: 0, remove: 0 };

/** Set to make every bridge call reject, standing in for a missing plugin. */
export const control = { broken: false, delayMs: 0 };

const tick = () => new Promise<void>((r) => setTimeout(r, control.delayMs));

export function resetStub() {
  store.clear();
  stats.get = 0;
  stats.set = 0;
  stats.remove = 0;
  control.broken = false;
  control.delayMs = 0;
}

export const Preferences = {
  async get({ key }: { key: string }): Promise<{ value: string | null }> {
    stats.get++;
    await tick();
    if (control.broken) throw new Error('bridge unavailable');
    return { value: store.has(key) ? store.get(key)! : null };
  },
  async set({ key, value }: { key: string; value: string }): Promise<void> {
    stats.set++;
    await tick();
    if (control.broken) throw new Error('bridge unavailable');
    store.set(key, value);
  },
  async remove({ key }: { key: string }): Promise<void> {
    stats.remove++;
    await tick();
    if (control.broken) throw new Error('bridge unavailable');
    store.delete(key);
  },
};
