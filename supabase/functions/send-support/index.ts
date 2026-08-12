// Supabase Edge Function: send-support
//
// Sends a support message from the in-app form directly (no mailto / no
// redirect to the user's mail app). Delivers via Resend's HTTP API using an
// API key held server-side.
//
// Secrets to set once:
//   supabase secrets set RESEND_API_KEY=re_xxx
//   (optional) supabase secrets set SUPPORT_TO=support@tracklylab.com
//   (optional) supabase secrets set SUPPORT_FROM="TracklyLab <support@tracklylab.com>"
//   NOTE: the FROM domain must be verified in Resend. Before the domain is
//   verified you can test with SUPPORT_FROM="onboarding@resend.dev" (Resend only
//   delivers that to the account owner's address).
//
// Deploy:  supabase functions deploy send-support
// The client calls it via supabase.functions.invoke('send-support', { body }).

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

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'Invalid request body' });
  }

  // Server-side bounds. The client caps nothing, and this endpoint is
  // reachable by anyone holding the public anon key - without limits a script
  // can pump megabytes into the support inbox (and into the subject line,
  // which interpolates the name). The message is REJECTED over the cap so the
  // sender knows; the metadata fields are merely context, so they truncate.
  const MAX_MESSAGE = 5000;
  const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
  const message = clip(payload.message, MAX_MESSAGE + 1);
  const replyEmailRaw = clip(payload.email, 200);
  const name = clip(payload.name, 100);
  const isGuest = Boolean(payload.isGuest);
  const appVersion = clip(payload.appVersion, 32) || '?';
  const userAgent = clip(payload.userAgent, 300);
  if (!message) return json(400, { error: 'Message is empty' });
  if (message.length > MAX_MESSAGE) {
    return json(400, { error: `Message is too long (over ${MAX_MESSAGE} characters)` });
  }
  // A malformed reply-to must not sink the whole send - Resend rejects the
  // request outright on an invalid address. Keep the text the user typed in
  // the metadata block either way; only the header falls back to the account.
  const replyEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyEmailRaw) ? replyEmailRaw : '';

  // The signed-in account email straight from the JWT is authoritative (the
  // form email could be anything). Guests have no account.
  let accountEmail = '';
  let accountId = '';
  const authHeader = req.headers.get('Authorization');
  if (authHeader) {
    try {
      const authClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data } = await authClient.auth.getUser();
      if (data?.user && data.user.role !== 'anon') {
        accountEmail = data.user.email ?? '';
        accountId = data.user.id ?? '';
      }
    } catch {
      /* anon / no user — treat as guest */
    }
  }

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) return json(500, { error: 'Email is not configured yet' });
  const FROM = Deno.env.get('SUPPORT_FROM') || 'TracklyLab <support@tracklylab.com>';
  const TO = Deno.env.get('SUPPORT_TO') || 'support@tracklylab.com';

  const meta = [
    `Name: ${name || '—'}`,
    `Reply-to: ${replyEmailRaw || '—'}`,
    `Account: ${accountEmail || (isGuest ? 'guest (no account)' : 'unknown')}`,
    `Account ID: ${accountId || '—'}`,
    `Status: ${isGuest ? 'guest' : 'signed in'}`,
    `App: TracklyLab v${appVersion}`,
    `Device: ${userAgent || '—'}`,
  ].join('\n');

  const text = `${message}\n\n---\n${meta}`;
  const html =
    `<div style="white-space:pre-wrap;font-family:system-ui,sans-serif;font-size:14px;color:#1c1c1e">${escapeHtml(message)}</div>` +
    `<hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>` +
    `<pre style="font-family:ui-monospace,monospace;font-size:12px;color:#8e8e93">${escapeHtml(meta)}</pre>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [TO],
      // Reply straight to the user. Prefer the form email; fall back to account.
      reply_to: replyEmail || accountEmail || undefined,
      subject: `TracklyLab support${name ? ` — ${name}` : ''}`,
      text,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return json(502, { error: `Email send failed: ${detail || res.status}` });
  }
  return json(200, { ok: true });
});
