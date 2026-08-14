import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { identifyUser, track, resetAnalytics } from '../lib/analytics';
import { isNative, NATIVE_AUTH_REDIRECT } from '../lib/platform';
import { loadGuest, saveGuest } from '../lib/storage';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean; // still resolving the initial session
  guest: boolean; // user chose to use the app locally, without an account
  authError: string | null; // error returned in an OAuth redirect, if any
  clearAuthError: () => void;
  sendEmailCode: (email: string) => Promise<{ error: string | null }>;
  verifyEmailCode: (email: string, code: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signInWithApple: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error: string | null }>; // permanently deletes the account + data
  continueAsGuest: () => void;
  leaveGuest: () => void;
}

// Read an OAuth error that Supabase/Google put in the redirect URL (hash or query)
function readUrlAuthError(): string | null {
  try {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);
    return (
      hash.get('error_description') ||
      hash.get('error') ||
      query.get('error_description') ||
      query.get('error') ||
      null
    );
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Set by signOut() so the listener can tell a deliberate exit from a session
// the server took away. Module scope, not state: the listener fires outside
// React's render cycle and must read it synchronously.
let deliberateSignOut = false;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(() => readUrlAuthError());
  const [guest, setGuest] = useState<boolean>(loadGuest);

  useEffect(() => {
    // Resolve the current session on load (also completes a magic-link redirect)
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      // A sign-out nobody asked for is nearly always one thing: the access
      // token expired and the refresh was REJECTED - a rotated refresh token,
      // usually because the same account refreshed somewhere else first. It
      // presents as "I tapped something and got logged out", with the tap
      // being whatever happened to make the request that noticed.
      //
      // Recorded rather than guessed at, so the next report comes with its own
      // evidence. Local data is untouched by this; signing back in re-attaches
      // it, because the owner mark still matches.
      if (event === 'SIGNED_OUT' && !deliberateSignOut) {
        console.warn('[auth] signed out without being asked - a token refresh was rejected');
        track('signed_out_unexpected');
      }
      if (event === 'SIGNED_OUT') deliberateSignOut = false;
      setSession(newSession);
      // Signing in supersedes guest mode
      if (newSession) {
        setGuest(false);
        saveGuest(false);
        // Analytics: tie events to this user; count fresh sign-ins (not reloads)
        const u = newSession.user;
        identifyUser(u.id, { email: u.email, provider: u.app_metadata?.provider });
        if (event === 'SIGNED_IN') {
          track('signed_in', { method: u.app_metadata?.provider || 'email' });
        }
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Native only: finish an OAuth sign-in when the provider redirects back into
  // the app via our custom URL scheme. The implicit flow returns the tokens in
  // the URL fragment, so we hand them to Supabase and close the system browser.
  // No-op (and imports nothing) on web.
  useEffect(() => {
    if (!isNative()) return;
    let remove: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const { App: CapApp } = await import('@capacitor/app');
      const handle = await CapApp.addListener('appUrlOpen', async ({ url }) => {
        if (!url.startsWith(NATIVE_AUTH_REDIRECT)) return;
        try {
          const params = new URLSearchParams(url.split('#')[1] ?? '');
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');
          if (access_token && refresh_token) {
            await supabase.auth.setSession({ access_token, refresh_token });
          } else {
            const err = params.get('error_description') || params.get('error');
            if (err) setAuthError(err);
          }
        } finally {
          const { Browser } = await import('@capacitor/browser');
          await Browser.close().catch(() => {});
        }
      });
      if (cancelled) handle.remove();
      else remove = () => handle.remove();
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);

  // Email one-time code: sends a 6-digit code (no link to click, so it works
  // even when the email is opened in a different browser / mail app).
  const sendEmailCode = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    return { error: error ? error.message : null };
  };

  const verifyEmailCode = async (email: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    return { error: error ? error.message : null };
  };

  // OAuth works differently on web and in the native shell:
  //
  // - Web/PWA: hand the browser over to the provider and let Supabase pick the
  //   session back up from the redirect URL (detectSessionInUrl).
  // - Native: Apple rejects OAuth inside an embedded webview, so we open the
  //   provider in a system browser (ASWebAuthenticationSession via
  //   @capacitor/browser) and it redirects back into the app through our custom
  //   URL scheme; the appUrlOpen listener below completes the sign-in.
  //
  // Capacitor modules are imported dynamically so the PWA bundle never loads
  // them.
  const signInWithProvider = async (provider: 'google' | 'apple') => {
    if (isNative()) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: NATIVE_AUTH_REDIRECT, skipBrowserRedirect: true },
      });
      if (error) return { error: error.message };
      if (!data?.url) return { error: 'Could not start sign-in' };
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: data.url, presentationStyle: 'popover' });
      return { error: null };
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
    });
    return { error: error ? error.message : null };
  };

  const signInWithGoogle = () => signInWithProvider('google');
  const signInWithApple = () => signInWithProvider('apple');

  const signOut = async () => {
    deliberateSignOut = true;
    track('signed_out');
    resetAnalytics();
    await supabase.auth.signOut();
    setSession(null);
  };

  // Permanently delete the account. The server-side Edge Function (which holds
  // the service-role key) deletes the user's data row and their auth identity;
  // supabase.functions.invoke forwards the current session's JWT so the
  // function knows who is calling. On success we tear down the local session.
  const deleteAccount = async () => {
    try {
      const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
      if (error) return { error: error.message || 'Could not delete your account' };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Could not delete your account' };
    }
    track('account_deleted');
    resetAnalytics();
    await supabase.auth.signOut();
    setSession(null);
    return { error: null };
  };

  const continueAsGuest = () => {
    saveGuest(true);
    setGuest(true);
  };

  const leaveGuest = () => {
    saveGuest(false);
    setGuest(false);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        guest,
        authError,
        clearAuthError: () => setAuthError(null),
        sendEmailCode,
        verifyEmailCode,
        signInWithGoogle,
        signInWithApple,
        signOut,
        deleteAccount,
        continueAsGuest,
        leaveGuest,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
