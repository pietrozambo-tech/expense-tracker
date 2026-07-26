// Supabase Edge Function: delete-account
//
// Permanently deletes the calling user's account:
//   1. their data row in public.user_data
//   2. their Supabase auth identity (auth.users)
//
// Deleting an auth user requires the SERVICE ROLE key, which must never ship in
// the browser bundle — that is the whole reason this runs server-side. The
// service role, project URL and anon key are injected automatically into the
// Edge Function runtime by Supabase (SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY), so there are no secrets to configure by hand.
//
// Deploy:  supabase functions deploy delete-account
// The client calls it via supabase.functions.invoke('delete-account'), which
// forwards the signed-in user's JWT in the Authorization header.

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

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Missing Authorization header' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Identify the caller from their JWT (never trust a user id from the body).
  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: 'Invalid or expired session' });
  const userId = userData.user.id;

  // Elevated client for the actual deletion.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Delete the user's data first, so a mid-way failure can never leave data
  //    orphaned under an already-deleted account.
  const { error: dataErr } = await admin.from('user_data').delete().eq('user_id', userId);
  if (dataErr) return json(500, { error: `Failed to delete data: ${dataErr.message}` });

  // 2) Delete the auth identity itself.
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) return json(500, { error: `Failed to delete account: ${delErr.message}` });

  return json(200, { ok: true });
});
