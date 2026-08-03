import { supabase } from './supabase';

// Soft client-side limit: 10 messages per rolling 24h. Stops runaway/accidental
// spam without any backend state; a determined abuser bypasses it, which is
// acceptable for now (server-side limiting can come later if it's ever abused).
const SENT_LOG_KEY = 'expense-tracker.v1.supportSent';
export const SUPPORT_DAILY_LIMIT = 10;

const readLog = (): number[] => {
  try {
    const arr = JSON.parse(localStorage.getItem(SENT_LOG_KEY) || '[]');
    return Array.isArray(arr) ? arr.filter((t) => typeof t === 'number') : [];
  } catch {
    return [];
  }
};

export function supportLimitReached(now = Date.now()): boolean {
  return readLog().filter((t) => now - t < 24 * 60 * 60 * 1000).length >= SUPPORT_DAILY_LIMIT;
}

function recordSupportSend(now = Date.now()) {
  try {
    const kept = readLog().filter((t) => now - t < 24 * 60 * 60 * 1000);
    localStorage.setItem(SENT_LOG_KEY, JSON.stringify([...kept, now]));
  } catch {
    /* storage unavailable - limit just won't apply */
  }
}

// Send a support message straight from the app (no mailto). Posts to the
// send-support Edge Function, which emails it via Resend and sets a reply-to so
// support can answer the user directly. supabase.functions.invoke forwards the
// session JWT (for signed-in users) so the function can stamp the real account.
export async function sendSupportMessage(payload: {
  message: string;
  email: string;
  name?: string;
  isGuest?: boolean;
}): Promise<{ error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('send-support', {
      body: {
        message: payload.message,
        email: payload.email,
        name: payload.name || '',
        isGuest: !!payload.isGuest,
        appVersion: '1.0',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      },
    });
    if (error) return { error: error.message || 'Could not send your message' };
    if (data && (data as { ok?: boolean }).ok === false) {
      return { error: (data as { error?: string }).error || 'Could not send your message' };
    }
    recordSupportSend();
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not send your message' };
  }
}
