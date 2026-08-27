// Supabase Edge Function: admin-stats
//
// Daily account numbers for the developer screen: how many people signed up
// each day, how many opened the app that day, and (for the owner's eyes) the
// addresses behind them.
//
// WHY THIS IS SERVER-SIDE, AND WHY IT CHECKS AGAIN
//
// The developer screen is unlocked by a code held in the browser bundle.
// That is fine for toggles that only affect the device holding them, and
// worthless as protection for other people's email addresses: anyone can read
// the bundle, type the code, and ask. So the gate that matters is here, and it
// is not the code - it is the caller's own signed-in JWT, checked against an
// allow-list that lives in the project's secrets and never ships to a browser.
//
// Listing accounts needs the SERVICE ROLE key, which for the same reason can
// only ever exist in this runtime. Supabase injects SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY automatically.
//
// Configure the allow-list once (comma-separated, case-insensitive):
//   supabase secrets set ADMIN_EMAILS="you@example.com"
// Unset, this function answers 403 to everyone - it fails closed, because the
// alternative failure mode is publishing a user list.
//
// Deploy:  supabase functions deploy admin-stats
//
// The platform's "Verify JWT" setting can be left on (send-support runs with
// it on and is called from the same browsers): the gateway passes the CORS
// preflight through, and every caller - guests included - holds a valid anon
// token anyway, so that check never decides anything here. The decision is the
// one below: who the JWT says you are, against the allow-list.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// #region aggregate ------------------------------------------------------
// The arithmetic, inline and fenced.
//
// It lived in its own module until the Supabase dashboard's editor - which
// deploys exactly one file - refused the import. It stays fenced by these
// markers because scripts/test-adminstats.mjs lifts the region out and tests
// it directly: one source of truth that is both deployable by paste and
// exercised without a deploy.
//
// Two inputs, deliberately separate:
//   accounts  every account, with the day it was created (auth.users)
//   opens     one (user, day) pair per day an account opened the app
//             (public.app_activity - see supabase/schema-activity.sql)
//
// and one rule that decides everything: a day's ACTIVE users are the accounts
// that opened the app that day; its NEW users are the subset of those created
// the same day. New is therefore always part of active, never added to it -
// so a stacked bar of new + returning is exactly the day's total, which is
// the only reading of the chart that cannot mislead.

export interface AccountRow {
  id: string;
  email: string | null;
  createdAt: string | null;
}

export interface OpenRow {
  userId: string;
  day: string; // YYYY-MM-DD
}

export interface DayStat {
  date: string;
  active: number;
  new: number;
  returning: number;
  /** Addresses that opened the app that day, new ones first. */
  emails: string[];
  newEmails: string[];
}

export interface Totals {
  accounts: number;
  activeToday: number;
  newToday: number;
  active7: number;
  new7: number;
  new30: number;
  /** How many accounts were left out as the owner's own (see excludeIds). */
  excluded: number;
}

/** One line of the account roster: who exists, and when they were last here. */
export interface AccountLine {
  email: string | null;
  createdAt: string | null;
  /** Their most recent sign of life, whatever it was. */
  lastSeen: string | null;
  /** WHICH sign of life, because they are not equally strong evidence:
   *    open    a recorded launch - the real thing, but only since the
   *            activity table existed
   *    sync    their data last changed on the server (user_data.updated_at) -
   *            they were using the app, and this predates the tracking
   *    signin  their last sign-in (auth.users) - weakest, since a session
   *            outlives months of use, but it is a floor and it is historical
   *  A roster that showed all three as one number would claim a precision it
   *  does not have. */
  lastSeenSource: 'open' | 'sync' | 'signin' | null;
  /** Days with a recorded open, across all of history. Zero for an account
   *  whose whole life predates the activity table - which is why the roster
   *  never reads this as "they never used it". */
  visits: number;
  /** The days inside the reported window on which they opened the app, so a
   *  single account can be read on its own without another round trip. */
  days: string[];
}

export interface Aggregated {
  days: DayStat[];
  totals: Totals;
  /** Every counted account, most recently active first, never-seen last. */
  accounts: AccountLine[];
}

/** UTC day for a timestamp, or null. Local days would file one moment under
 *  two dates depending on where the reader is. */
export const dayOf = (iso: string | null | undefined): string | null =>
  iso && iso.length >= 10 ? iso.slice(0, 10) : null;

/** The last `count` days ending today, newest first. */
export function windowDays(today: Date, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function aggregate(args: {
  accounts: AccountRow[];
  opens: OpenRow[];
  today: Date;
  days?: number;
  /** Accounts to leave out entirely - the owner's own, so a developer opening
   *  the app forty times a day does not read as an audience. */
  excludeIds?: Set<string>;
  maxEmailsPerDay?: number;
  /** Most recent sign of life per account, with its provenance. */
  lastSeenById?: Map<string, { at: string; source: 'open' | 'sync' | 'signin' }>;
  /** Recorded open-days per account, over all of history. */
  visitsById?: Map<string, number>;
}): Aggregated {
  const { accounts, opens, today } = args;
  const exclude = args.excludeIds ?? new Set<string>();
  const maxEmails = args.maxEmailsPerDay ?? 50;
  const dates = windowDays(today, args.days ?? 30);
  const inWindow = new Set(dates);

  const counted = accounts.filter((a) => !exclude.has(a.id));
  const byId = new Map(counted.map((a) => [a.id, a]));
  const bornOn = new Map<string, string>();
  for (const a of counted) {
    const d = dayOf(a.createdAt);
    if (d) bornOn.set(a.id, d);
  }

  // Unique users per day: the same account opening twice is one person, and
  // two devices write two rows for the same (user, day) only if the upsert
  // ever loses a race.
  const seen = new Map<string, Set<string>>();
  for (const o of opens) {
    if (!inWindow.has(o.day) || exclude.has(o.userId) || !byId.has(o.userId)) continue;
    const set = seen.get(o.day) ?? new Set<string>();
    set.add(o.userId);
    seen.set(o.day, set);
  }

  const days: DayStat[] = dates.map((date) => {
    const ids = [...(seen.get(date) ?? new Set<string>())];
    const newIds = ids.filter((id) => bornOn.get(id) === date);
    const isNew = new Set(newIds);
    const email = (id: string) => byId.get(id)?.email ?? null;
    // New accounts lead the list: on a day with traffic they are the part
    // worth reading first.
    const ordered = [...newIds, ...ids.filter((id) => !isNew.has(id))];
    return {
      date,
      active: ids.length,
      new: newIds.length,
      returning: ids.length - newIds.length,
      emails: ordered.map(email).filter((e): e is string => !!e).slice(0, maxEmails),
      newEmails: newIds.map(email).filter((e): e is string => !!e).slice(0, maxEmails),
    };
  });

  // Sign-ups counted from the accounts themselves, not from opens: an account
  // created on a day it never opened (a sign-up that bounced straight out)
  // still happened, and "new" in the totals should not quietly lose it.
  const createdWithin = (n: number) => {
    const recent = new Set(dates.slice(0, n));
    return counted.filter((a) => {
      const d = bornOn.get(a.id);
      return !!d && recent.has(d);
    }).length;
  };

  // The roster: most recently active first, and accounts that have never been
  // seen last, ordered by when they signed up. Sorting the never-seen among
  // the seen by any fallback date would quietly claim an activity they do not
  // have.
  const lastSeen = args.lastSeenById ?? new Map<string, { at: string; source: 'open' | 'sync' | 'signin' }>();
  const roster: AccountLine[] = counted
    .map((a) => {
      const hit = lastSeen.get(a.id) ?? null;
      return {
        email: a.email, createdAt: a.createdAt,
        lastSeen: hit?.at ?? null, lastSeenSource: hit?.source ?? null,
        visits: args.visitsById?.get(a.id) ?? 0,
        // Their own days, newest first - the window the chart above reports.
        days: dates.filter((d) => seen.get(d)?.has(a.id)),
      };
    })
    .sort((x, y) => {
      if (x.lastSeen && y.lastSeen) return x.lastSeen < y.lastSeen ? 1 : -1;
      if (x.lastSeen) return -1;
      if (y.lastSeen) return 1;
      return (y.createdAt ?? '') < (x.createdAt ?? '') ? -1 : 1;
    });

  return {
    days,
    accounts: roster,
    totals: {
      accounts: counted.length,
      activeToday: days[0]?.active ?? 0,
      newToday: days[0]?.new ?? 0,
      active7: new Set(
        days.slice(0, 7).flatMap((d) => [...(seen.get(d.date) ?? [])]),
      ).size,
      new7: createdWithin(7),
      new30: createdWithin(30),
      excluded: accounts.length - counted.length,
    },
  };
}
// #endregion aggregate ---------------------------------------------------

// Bounds. A hobby project's user list is small, but the shape of this endpoint
// should not depend on that staying true.
const MAX_DAYS = 30;
const MAX_PAGES = 20;
const PER_PAGE = 1000;
const MAX_EMAILS_PER_DAY = 50;

// Every path below returns a sentence. An uncaught throw here would instead
// become a platform 500 whose body is not our JSON, and the browser SDK
// reports all of those as the same useless "non-2xx status code" - so the one
// thing this handler must never do is throw.
Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (e) {
    return json(500, { error: `admin-stats crashed: ${e instanceof Error ? e.message : String(e)}` });
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Sign in first - this reads account data.' });

  // The only option the caller has: whether to count the owner's own account.
  // A malformed or absent body simply means "no".
  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch { /* no body sent */ }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  // Named individually: "something is unset" costs another round trip to find
  // out which, and these are injected by the platform, so a gap here is a
  // project-configuration story worth telling precisely.
  const missing = [
    !SUPABASE_URL && 'SUPABASE_URL',
    !ANON_KEY && 'SUPABASE_ANON_KEY',
    !SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean);
  if (missing.length) return json(500, { error: `Missing runtime secrets: ${missing.join(', ')}` });

  const allowed = (Deno.env.get('ADMIN_EMAILS') ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) {
    return json(403, { error: 'No admin allow-list configured (set ADMIN_EMAILS).' });
  }

  // Who is asking, according to their token - never according to the body.
  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: 'Invalid or expired session' });

  const callerEmail = (userData.user.email ?? '').toLowerCase();
  if (!callerEmail || !allowed.includes(callerEmail)) {
    // Deliberately the same short answer for "not on the list" and "list is
    // empty": a probe learns nothing about who is on it.
    return json(403, { error: 'Not an admin account.' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Walk the account list. listUsers is paginated; stop at the last short page
  // or the page cap, whichever comes first.
  type Row = { id: string; created_at?: string; email?: string | null; last_sign_in_at?: string | null };
  const users: Row[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) return json(500, { error: `Could not list accounts: ${error.message}` });
    const batch = data?.users ?? [];
    users.push(...(batch as Row[]));
    if (batch.length < PER_PAGE) break;
  }

  const today = new Date();
  const since = windowDays(today, MAX_DAYS)[MAX_DAYS - 1];

  // The opens. A missing table is the one failure worth naming precisely:
  // it means schema-activity.sql has not been run yet, and every number that
  // depends on it would otherwise read as a flat, believable zero.
  const { data: openRows, error: openErr } = await admin
    .from('app_activity')
    .select('user_id, day')
    .gte('day', since);
  if (openErr) {
    const missing = /relation .* does not exist|could not find the table|schema cache/i.test(openErr.message);
    return json(500, {
      error: missing
        ? 'No app_activity table yet - run supabase/schema-activity.sql in the SQL editor.'
        : `Could not read activity: ${openErr.message}`,
    });
  }

  // The owner's own account is excluded by default: a developer who opens the
  // app forty times a day would otherwise BE the audience the chart reports.
  const includeSelf = payload.includeSelf === true;
  const excludeIds = new Set(
    includeSelf ? [] : users.filter((u) => allowed.includes((u.email ?? '').toLowerCase())).map((u) => u.id),
  );

  // Latest open per account, over all of history rather than the chart's
  // window: "last seen" is the roster's whole point, and a user who stopped
  // coming two months ago is exactly the one worth seeing.
  const { data: seenRows } = await admin
    .from('app_activity')
    .select('user_id, last_seen')
    .order('last_seen', { ascending: false })
    .limit(20000);
  // Days before the activity table existed, recovered from Supabase's own
  // auth log (see supabase/schema-activity-backfill.sql). A missing function
  // is not an error - the roster simply has less history to show - so this
  // never fails the request.
  let historyRows: { user_id: string; day: string }[] = [];
  const { data: hist } = await admin.rpc('activity_history', { since });
  if (Array.isArray(hist)) historyRows = hist as { user_id: string; day: string }[];

  // Three signals, weakest first so the strongest overwrites it. Only the
  // first is a recorded open; the other two are what history there is, and
  // they matter because the activity table starts the day it was created -
  // without them every account that predates it reads as "never opened",
  // which is a claim about them rather than about the data.
  const lastSeenById = new Map<string, { at: string; source: 'open' | 'sync' | 'signin' }>();
  const note = (id: string, at: string | null | undefined, source: 'open' | 'sync' | 'signin') => {
    if (!at) return;
    const prev = lastSeenById.get(id);
    if (!prev || prev.at < at) lastSeenById.set(id, { at, source });
  };

  for (const u of users) note(u.id, u.last_sign_in_at ?? null, 'signin');

  // When their data last changed on the server: proof they were using the app,
  // and it reaches back to the day they started.
  const { data: syncRows } = await admin.from('user_data').select('user_id, updated_at').limit(20000);
  for (const r of (syncRows ?? []) as { user_id: string; updated_at: string }[]) {
    note(r.user_id, r.updated_at, 'sync');
  }

  // Where the recorded history actually begins - worked out BEFORE the merges
  // below, because it is their cutoff.
  //
  // Two honesty rules live here. Inferred days (token refreshes from the
  // auth log) may only fill the gap BEFORE recording began: once the app
  // records real launches, a backgrounded tab refreshing its token daily
  // must not keep an account "active" in the chart. And openRows is
  // windowed (.gte day, since), so an earliest recorded day EQUAL to the
  // window start means tracking began before the window - the true start is
  // unknowable from here, and reporting the window edge as "recorded since"
  // would attribute months of recorded launches to the audit-log proxy.
  // null then reads as "everything shown is recorded", which is the truth.
  const recordedDays = (openRows ?? []).map((r: { day: string }) => r.day).sort();
  const firstRecorded = recordedDays.length ? recordedDays[0] : null;
  const trackingSince = firstRecorded && firstRecorded > since ? firstRecorded : null;
  const inferredRows = historyRows.filter((r) => firstRecorded === null || r.day < firstRecorded);

  // Days each account showed up, counted once per day whichever record
  // proves it: a recorded launch and a token refresh on the same day are one
  // day. Recorded rows reach back only to the activity table's first day;
  // inferred ones cover the days before it.
  const dayKeys = new Set<string>();
  for (const r of (seenRows ?? []) as { user_id: string; last_seen: string }[]) {
    note(r.user_id, r.last_seen, 'open');
    dayKeys.add(`${r.user_id}|${dayOf(r.last_seen) ?? ''}`);
  }
  for (const r of inferredRows) dayKeys.add(`${r.user_id}|${r.day}`);
  const visitsById = new Map<string, number>();
  for (const key of dayKeys) {
    const id = key.slice(0, key.indexOf('|'));
    visitsById.set(id, (visitsById.get(id) ?? 0) + 1);
  }

  // Recorded launches and pre-tracking inferred days, deduped: an account
  // that opened the app on a day it also refreshed a token is one day.
  const openKeys = new Set<string>();
  const allOpens: { userId: string; day: string }[] = [];
  for (const r of [...(openRows ?? []), ...inferredRows] as { user_id: string; day: string }[]) {
    const key = `${r.user_id}|${r.day}`;
    if (openKeys.has(key)) continue;
    openKeys.add(key);
    allOpens.push({ userId: r.user_id, day: r.day });
  }

  const { days, totals, accounts } = aggregate({
    accounts: users.map((u) => ({ id: u.id, email: u.email ?? null, createdAt: u.created_at ?? null })),
    opens: allOpens,
    today,
    days: MAX_DAYS,
    excludeIds,
    maxEmailsPerDay: MAX_EMAILS_PER_DAY,
    lastSeenById,
    visitsById,
  });

  return json(200, {
    ok: true,
    generatedAt: new Date().toISOString(),
    includeSelf,
    trackingSince,
    totals,
    days,
    accounts,
  });
}
