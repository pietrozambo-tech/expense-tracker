import { supabase } from './supabase';

// Daily account numbers for the developer screen, fetched from the
// admin-stats Edge Function. Everything that decides WHO may see this lives
// server-side (see supabase/functions/admin-stats/index.ts): the dev code
// unlocks a screen, it does not grant access to other people's addresses.
//
// What the numbers mean, so the panel is never read as more than it is:
//   signups  accounts created that day (auth.users.created_at)
//   active   accounts whose most recent sign-in falls on that day. It counts
//            each account ONCE, on its latest visit only - so it is a floor
//            for "people who opened the app", not a session count, and older
//            days thin out as people come back. PostHog remains the honest
//            source for visitor traffic, which is mostly guests who never
//            sign up at all.

export interface AdminDay {
  /** UTC calendar day, YYYY-MM-DD. */
  date: string;
  signups: number;
  active: number;
  emails: string[];
}

export interface AdminStats {
  generatedAt: string;
  totals: { accounts: number; signups7: number; signups30: number; active7: number };
  days: AdminDay[];
}

export async function fetchAdminStats(): Promise<{ stats: AdminStats | null; error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('admin-stats', { body: {} });
    if (error) {
      // A 403 arrives as a FunctionsHttpError whose message is the generic
      // "non-2xx status code"; the function's own sentence is in the body,
      // which the SDK hands over as a Response on the error context.
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const body = await ctx.json();
          if (body?.error) return { stats: null, error: String(body.error) };
        } catch { /* not JSON - fall through to the SDK's own message */ }
      }
      return { stats: null, error: error.message || 'Could not load stats' };
    }
    const stats = data as AdminStats | null;
    if (!stats || !Array.isArray(stats.days)) return { stats: null, error: 'Unexpected response' };
    return { stats, error: null };
  } catch (e) {
    return { stats: null, error: e instanceof Error ? e.message : 'Could not load stats' };
  }
}
