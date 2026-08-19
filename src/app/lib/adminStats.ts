import { supabase } from './supabase';

// Daily account numbers for the developer screen, fetched from the
// admin-stats Edge Function. Everything that decides WHO may see this lives
// server-side (see supabase/functions/admin-stats/index.ts): the dev code
// unlocks a screen, it does not grant access to other people's addresses.
//
// What the numbers mean, so the panel is never read as more than it is:
//   active   accounts that OPENED the app that day, counted once each. Real
//            opens, recorded by the app itself (lib/activityPing.ts) - not
//            sign-ins, which a months-long session never repeats.
//   new      of those, the accounts created the same day. A subset of active,
//            never a separate addition to it.
//
// Guests are absent by construction: they have no account to count. PostHog
// remains the source for visitor traffic, most of which never signs up.

export interface AdminDay {
  /** UTC calendar day, YYYY-MM-DD. */
  date: string;
  /** Accounts that opened the app that day. */
  active: number;
  /** Of those, the ones created the same day - a subset of active. */
  new: number;
  returning: number;
  emails: string[];
  newEmails: string[];
}

export interface AdminStats {
  generatedAt: string;
  /** Whether the owner's own account is counted in these numbers. */
  includeSelf: boolean;
  totals: {
    accounts: number;
    activeToday: number;
    newToday: number;
    active7: number;
    new7: number;
    new30: number;
    excluded: number;
  };
  days: AdminDay[];
}

export async function fetchAdminStats(includeSelf = false): Promise<{ stats: AdminStats | null; error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('admin-stats', { body: { includeSelf } });
    if (error) {
      // Every failure arrives as the same sentence - "Edge Function returned a
      // non-2xx status code" - which says nothing about WHICH failure. The
      // real answer is in the response the SDK parks on error.context, and it
      // comes in three shapes: our own {error}, the API gateway's {message} or
      // {msg} (a rejected JWT never reaches our code), and plain text when the
      // worker failed to boot. Read all three, and always show the status.
      const ctx = (error as { context?: Response }).context;
      const status = ctx && typeof ctx.status === 'number' ? ctx.status : null;
      let detail = '';
      if (ctx && typeof ctx.text === 'function') {
        try {
          const raw = await ctx.text();
          try {
            const body = JSON.parse(raw);
            detail = String(body?.error ?? body?.message ?? body?.msg ?? body?.code ?? raw);
          } catch {
            detail = raw.slice(0, 200);
          }
        } catch { /* body already consumed or unreadable */ }
      }
      const label = detail.trim() || error.message || 'Could not load stats';
      return { stats: null, error: status ? `${status}: ${label}` : label };
    }
    const stats = data as AdminStats | null;
    if (!stats || !Array.isArray(stats.days)) return { stats: null, error: 'Unexpected response' };
    return { stats, error: null };
  } catch (e) {
    return { stats: null, error: e instanceof Error ? e.message : 'Could not load stats' };
  }
}
