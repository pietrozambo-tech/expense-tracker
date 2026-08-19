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
//
// Silent is not the same as untraceable. Swallowing the error made a failing
// ping indistinguishable from a working one that nobody had triggered yet -
// so the outcome of the last attempt is kept locally and shown on the
// developer screen, where it costs a user nothing and answers the only
// question worth asking when the chart is empty: did this device try, and
// what did the server say?

const KEY = 'expense-tracker.v1.activityPinged';
const LAST = 'expense-tracker.v1.activityPingLast';

export interface PingInfo {
  /** ISO timestamp of the attempt. */
  at: string;
  ok: boolean;
  /** Why it failed, verbatim from the server where there was one. */
  error?: string;
  /** 'skipped' when the local guard short-circuited it. */
  skipped?: boolean;
}

/** UTC, to match the Edge Function's buckets - a local date would file a
 *  Tokyo morning and a Madrid evening under different days for the same
 *  moment, and the roll-up would never quite add up. */
const todayUTC = (now: Date): string => now.toISOString().slice(0, 10);

const remember = (info: PingInfo): PingInfo => {
  try {
    localStorage.setItem(LAST, JSON.stringify(info));
  } catch { /* nothing to remember it with */ }
  return info;
};

/** What happened the last time this device tried. */
export function lastPing(): PingInfo | null {
  try {
    const raw = localStorage.getItem(LAST);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v.at === 'string' ? (v as PingInfo) : null;
  } catch {
    return null;
  }
}

export async function pingActivity(
  userId: string | null,
  now = new Date(),
  opts?: { force?: boolean },
): Promise<PingInfo> {
  if (!userId) return remember({ at: now.toISOString(), ok: false, error: 'not signed in' });
  const day = todayUTC(now);
  if (!opts?.force) {
    try {
      if (localStorage.getItem(KEY) === `${userId}:${day}`) {
        return { at: now.toISOString(), ok: true, skipped: true };
      }
    } catch {
      /* no storage - ping anyway, the upsert is idempotent */
    }
  }
  try {
    const { error } = await supabase
      .from('app_activity')
      .upsert({ user_id: userId, day, last_seen: now.toISOString() }, { onConflict: 'user_id,day' });
    // Only remember it worked. A failed ping that marked itself done would
    // lose the whole day, and the next launch is the only retry there is.
    if (error) {
      return remember({ at: now.toISOString(), ok: false, error: error.message || 'upsert failed' });
    }
    try {
      localStorage.setItem(KEY, `${userId}:${day}`);
    } catch { /* nothing to remember it with */ }
    return remember({ at: now.toISOString(), ok: true });
  } catch (e) {
    return remember({
      at: now.toISOString(),
      ok: false,
      error: e instanceof Error ? e.message : 'ping threw',
    });
  }
}

/** The same ping, resolving the signed-in account itself - for callers (the
 *  developer screen) that hold no user id of their own. */
export async function pingCurrentUser(now = new Date(), opts?: { force?: boolean }): Promise<PingInfo> {
  try {
    const { data } = await supabase.auth.getUser();
    return await pingActivity(data?.user?.id ?? null, now, opts);
  } catch (e) {
    return { at: now.toISOString(), ok: false, error: e instanceof Error ? e.message : 'no session' };
  }
}
