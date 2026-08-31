import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

// Supabase project config. The anon key is a *public* client key — it is meant
// to ship in the browser bundle; data is protected by Row Level Security, not
// by hiding this key. Values can be overridden at build time via Vite env vars
// (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) but default to the project's.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://kxaqapcrbmuqulkltxum.supabase.co';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4YXFhcGNyYm11cXVsa2x0eHVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MTI4ODIsImV4cCI6MjEwMDM4ODg4Mn0.pS7-pXF9spAFniyOb3Vtk8xxTDTY3huhXV4-urR3NIo';

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// For the one caller that cannot go through supabase.functions.invoke: the
// AI import reads its answer as a server-sent event stream, and invoke()
// buffers the whole response - which would turn the reading screen back into
// the spinner it exists to replace. lib/aiImport.ts fetches the function URL
// itself and needs these two to build the request the gateway accepts.
export const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
export const SUPABASE_ANON = SUPABASE_ANON_KEY;

// A single shared client. persistSession keeps the user logged in across
// reloads; detectSessionInUrl lets the magic-link redirect complete the login.
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Implicit flow returns the session in the redirect URL itself, so OAuth
    // works reliably on a static site / installed PWA without depending on a
    // code verifier stored in the originating browser context (which breaks
    // across the redirect on GitHub Pages / mobile).
    flowType: 'implicit',
  },
});

// Where the magic-link email should return the user: the current app page.
export const authRedirectTo = () => `${window.location.origin}${window.location.pathname}`;

// The session supabase-js has persisted, read straight out of storage.
//
// getSession() cannot answer "who is signed in?" without a network when the
// access token has expired - it goes and refreshes it, and returns
// `session: null` if that call fails. Supabase tokens last an hour, so an
// hour offline was enough to turn a signed-in user into a stranger looking at
// the sign-in screen, with their own ledger sitting on the device behind it.
//
// This is the offline evidence of who is signed in. Crucially it is also a
// reliable one: auth-js DELETES the stored session when the server genuinely
// rejects the refresh token, and KEEPS it when the refresh merely failed to
// reach anyone (see _callRefreshToken - isAuthRetryableFetchError). So a
// session still being here after a failed refresh means "we could not ask",
// never "we asked and were told no".
//
// The key is matched by shape rather than derived from the project ref, so
// nothing here has to stay in step with how supabase-js names it.
export function readStoredSession(): Session | null {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      // v2 stores the session flat; older payloads nest it under currentSession.
      const s = parsed?.currentSession ?? parsed;
      if (s && typeof s.access_token === 'string' && typeof s.refresh_token === 'string' && s.user) {
        return s as Session;
      }
    }
  } catch {
    // Storage unreadable (private mode, quota, corrupt JSON) - no worse off
    // than before: the caller falls back to treating this as signed out.
  }
  return null;
}
