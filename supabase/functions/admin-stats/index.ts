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
import { aggregate, windowDays } from './aggregate.ts';

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
  type Row = { id: string; created_at?: string; email?: string | null };
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

  const { days, totals } = aggregate({
    accounts: users.map((u) => ({ id: u.id, email: u.email ?? null, createdAt: u.created_at ?? null })),
    opens: (openRows ?? []).map((r: { user_id: string; day: string }) => ({ userId: r.user_id, day: r.day })),
    today,
    days: MAX_DAYS,
    excludeIds,
    maxEmailsPerDay: MAX_EMAILS_PER_DAY,
  });

  return json(200, {
    ok: true,
    generatedAt: new Date().toISOString(),
    includeSelf,
    totals,
    days,
  });
}
