import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
