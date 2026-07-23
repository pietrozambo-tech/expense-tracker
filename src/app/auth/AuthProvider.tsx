import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, authRedirectTo } from '../lib/supabase';

const GUEST_KEY = 'expense-tracker.v1.guest';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean; // still resolving the initial session
  guest: boolean; // user chose to use the app locally, without an account
  signInWithEmail: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  continueAsGuest: () => void;
  leaveGuest: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
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

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      // Signing in supersedes guest mode
      if (newSession) {
        setGuest(false);
        try {
          localStorage.removeItem(GUEST_KEY);
        } catch {
          /* ignore */
        }
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signInWithEmail = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: authRedirectTo() },
    });
    return { error: error ? error.message : null };
  };

  const signOut = async () => {
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
        signInWithEmail,
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
