import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { identifyUser, track, resetAnalytics } from '../lib/analytics';

const GUEST_KEY = 'expense-tracker.v1.guest';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(() => readUrlAuthError());
  const [guest, setGuest] = useState<boolean>(() => {
    try {
      return localStorage.getItem(GUEST_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    // Resolve the current session on load (also completes a magic-link redirect)
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      // Signing in supersedes guest mode
      if (newSession) {
        setGuest(false);
        try {
          localStorage.removeItem(GUEST_KEY);
        } catch {
          /* ignore */
        }
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

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
    });
    return { error: error ? error.message : null };
  };

  const signInWithApple = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
    });
    return { error: error ? error.message : null };
  };

  const signOut = async () => {
    track('signed_out');
    resetAnalytics();
    await supabase.auth.signOut();
    setSession(null);
  };

  const continueAsGuest = () => {
    try {
      localStorage.setItem(GUEST_KEY, 'true');
    } catch {
      /* ignore */
    }
    setGuest(true);
  };

  const leaveGuest = () => {
    try {
      localStorage.removeItem(GUEST_KEY);
    } catch {
      /* ignore */
    }
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
