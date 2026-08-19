import { supabase } from './supabase';

// One row per user per day, written on launch - the only honest source for
// "how many people opened the app today" (see supabase/schema-activity.sql for
// why auth.users cannot answer that).
//
// Deliberately cheap and deliberately silent:
//   * at most one write per device per day, guarded locally, so opening the
//     app twenty times costs one round trip;
//   * an upsert, so several devices on the same account collapse into the one
//     row that (user_id, day) allows;
//   * every failure is swallowed. A counter for the developer screen is never
//     a reason for someone's app to complain at them.

const KEY = 'expense-tracker.v1.activityPinged';

/** UTC, to match the Edge Function's buckets - a local date would file a
 *  Tokyo morning and a Madrid evening under different days for the same
 *  moment, and the roll-up would never quite add up. */
const todayUTC = (now: Date): string => now.toISOString().slice(0, 10);

export async function pingActivity(userId: string | null, now = new Date()): Promise<void> {
  if (!userId) return; // guests have no account to count
  const day = todayUTC(now);
  try {
    if (localStorage.getItem(KEY) === `${userId}:${day}`) return;
  } catch {
    /* no storage - ping anyway, the upsert is idempotent */
  }
  try {
    const { error } = await supabase
      .from('app_activity')
      .upsert({ user_id: userId, day, last_seen: now.toISOString() }, { onConflict: 'user_id,day' });
    // Only remember it worked. A failed ping that marked itself done would
    // lose the whole day, and the next launch is the only retry there is.
    if (error) return;
    try {
      localStorage.setItem(KEY, `${userId}:${day}`);
    } catch { /* nothing to remember it with */ }
  } catch {
    /* offline, blocked, table missing - all fine, this is telemetry */
  }
}
