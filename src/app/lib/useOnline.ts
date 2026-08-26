import { useEffect, useState } from 'react';

/**
 * Whether the device currently believes it has a network.
 *
 * `navigator.onLine` on its own is a snapshot taken at render time, which is
 * how the sync row came to claim "Synced 5m ago" to somebody sitting on a
 * plane: the value was read once, while the thing it describes changes
 * underneath. The browser fires events when it flips, so listen for them.
 *
 * Worth knowing what this can and cannot tell you. `false` is reliable -
 * airplane mode, wifi off - and means nothing will reach the network. `true`
 * only means the device has *an* interface up, not that anything is reachable
 * through it: a phone showing one bar with no working data connection reports
 * true and every request hangs. That case is not detectable here, which is why
 * the deadlines in AuthProvider and cloud.ts exist and why nothing should be
 * gated on this being true.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine !== false,
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    // The flip can happen between the initial read and this effect running.
    setOnline(navigator.onLine !== false);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return online;
}
