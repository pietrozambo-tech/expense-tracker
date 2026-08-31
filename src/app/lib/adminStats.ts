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

export interface AdminAccount {
  email: string | null;
  createdAt: string | null;
  /** Their most recent sign of life, across all of history. */
  lastSeen: string | null;
  /** What that sign of life was: a recorded launch, a data sync, or a
   *  sign-in. They are not equal evidence, so the roster says which. */
  lastSeenSource: 'open' | 'sync' | 'signin' | null;
  /** Days with a recorded open, across all of history. */
  visits: number;
  /** Days inside the reported window on which they opened the app. */
  days: string[];
}

/** One UTC day of AI-import spend, summed across every account. */
export interface AiSpendDay {
  day: string;
  conversions: number;
  tokensIn: number;
  tokensOut: number;
  users: number;
}

/**
 * USD per million tokens, by model - Anthropic's list prices.
 *
 * The tokens come counted from the server (ai_import_usage, via admin-stats);
 * the MONEY is worked out here at display time, so a price change is one edit
 * to this table and never a redeploy of anything. Which model to price is
 * also the server's answer (aiModel - the CONVERT_MODEL secret as the
 * function reads it), so switching the secret can never leave this screen
 * pricing yesterday's model. An unknown model shows tokens without money
 * rather than money computed from a guess.
 */
const MODEL_PRICES: Record<string, { inPerM: number; outPerM: number }> = {
  'claude-haiku-4-5': { inPerM: 1, outPerM: 5 },
  'claude-sonnet-5': { inPerM: 3, outPerM: 15 },
  'claude-sonnet-4-6': { inPerM: 3, outPerM: 15 },
  'claude-opus-5': { inPerM: 5, outPerM: 25 },
};

/** Estimated USD for one day's tokens, or null when the model is not priced. */
export function aiCostUsd(model: string, tokensIn: number, tokensOut: number): number | null {
  const p = MODEL_PRICES[model];
  if (!p) return null;
  return (tokensIn / 1e6) * p.inPerM + (tokensOut / 1e6) * p.outPerM;
}

export interface AdminStats {
  generatedAt: string;
  /** Whether the owner's own account is counted in these numbers. */
  includeSelf: boolean;
  /** First day with a RECORDED launch. Days before it are inferred from
   *  Supabase's auth log, and the screen says so rather than passing the two
   *  off as the same kind of fact. Null when nothing has been recorded yet. */
  trackingSince: string | null;
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
  accounts: AdminAccount[];
  /** AI-import burn by day, newest first. Empty until the feature is set up. */
  aiSpend: AiSpendDay[];
  /** The model convert-import is spending on right now, per the server. */
  aiModel: string;
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
    return normalise(data);
  } catch (e) {
    return { stats: null, error: e instanceof Error ? e.message : 'Could not load stats' };
  }
}

/**
 * Trust the shape of nothing that arrived over a network.
 *
 * A deployed function is a separate artefact from this bundle, and the two
 * drift: the version before this one answered with {signups} per day and no
 * newEmails at all, which rendered as a crash rather than as a number - the
 * whole app fell into its error boundary because a developer screen asked a
 * stale endpoint a question. So every field is defaulted here, and a payload
 * that is recognisably the older shape says so in words a redeploy answers.
 */
function normalise(data: unknown): { stats: AdminStats | null; error: string | null } {
  const raw = data as Record<string, any> | null;
  if (!raw || !Array.isArray(raw.days)) return { stats: null, error: 'Unexpected response' };
  const t = (raw.totals ?? {}) as Record<string, unknown>;
  // The tell: this build asks for daily actives, which the previous function
  // had no concept of. Its numbers would silently read as zeros.
  if (t.activeToday === undefined && (t as { signups7?: number }).signups7 !== undefined) {
    return {
      stats: null,
      error: 'The deployed admin-stats is the older version - redeploy it to count daily actives.',
    };
  }
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return {
    stats: {
      generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : '',
      includeSelf: raw.includeSelf === true,
      trackingSince: typeof raw.trackingSince === 'string' ? raw.trackingSince : null,
      totals: {
        accounts: num(t.accounts), activeToday: num(t.activeToday), newToday: num(t.newToday),
        active7: num(t.active7), new7: num(t.new7), new30: num(t.new30), excluded: num(t.excluded),
      },
      accounts: Array.isArray(raw.accounts)
        ? raw.accounts.map((a: Record<string, unknown>) => ({
            email: typeof a?.email === 'string' ? a.email : null,
            createdAt: typeof a?.createdAt === 'string' ? a.createdAt : null,
            lastSeen: typeof a?.lastSeen === 'string' ? a.lastSeen : null,
            lastSeenSource: a?.lastSeenSource === 'open' || a?.lastSeenSource === 'sync' || a?.lastSeenSource === 'signin'
              ? a.lastSeenSource : null,
            visits: typeof a?.visits === 'number' && Number.isFinite(a.visits) ? a.visits : 0,
            days: Array.isArray(a?.days) ? a.days.filter((x: unknown): x is string => typeof x === 'string') : [],
          }))
        : [],
      days: raw.days.map((d: Record<string, unknown>) => ({
        date: typeof d?.date === 'string' ? d.date : '',
        active: num(d?.active), new: num(d?.new), returning: num(d?.returning),
        emails: list(d?.emails), newEmails: list(d?.newEmails),
      })),
      // Absent from an older deployed function: an empty list, never a crash.
      aiSpend: Array.isArray(raw.aiSpend)
        ? raw.aiSpend.map((r: Record<string, unknown>) => ({
            day: typeof r?.day === 'string' ? r.day : '',
            conversions: num(r?.conversions), tokensIn: num(r?.tokensIn),
            tokensOut: num(r?.tokensOut), users: num(r?.users),
          }))
        : [],
      aiModel: typeof raw.aiModel === 'string' ? raw.aiModel : 'claude-haiku-4-5',
    },
    error: null,
  };
}
