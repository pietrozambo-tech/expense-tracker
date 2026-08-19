import { supabase } from './supabase';
import { runningEnv } from './nudges';

export type SupportTopic = 'feedback' | 'problem';

// What a problem report carries beyond the words: enough to reproduce the
// environment, nothing about the money. appVersion and userAgent already
// travel as their own fields on the send, so they are not repeated here.
export function buildDiagnostics(facts: { txCount: number }): string {
  const env = runningEnv();
  const s = typeof window !== 'undefined' ? window.screen : null;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
  const tz = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '?'; } catch { return '?'; }
  })();
  const lang = typeof navigator !== 'undefined' ? navigator.language : '?';
  return [
    '--- diagnostics ---',
    `screen: ${s ? `${s.width}x${s.height}` : '?'} @${dpr}x`,
    `mode: ${env.standalone ? 'installed (standalone)' : 'browser tab'}`,
    `locale: ${lang} / ${tz}`,
    `transactions: ${facts.txCount}`,
  ].join('\n');
}

// The one message string the Edge Function receives. A topic line first so
// the inbox sorts problems from praise at a glance; the diagnostics block
// only when it is a problem - feedback stays exactly the user's words.
// The server REJECTS messages over 5000 chars, so the textarea caps lower
// and this stays within budget by construction.
export function composeSupportMessage(
  topic: SupportTopic,
  text: string,
  facts: { txCount: number },
): string {
  const head = topic === 'problem' ? 'Topic: Problem report' : 'Topic: Feedback';
  const parts = [head, '', text.trim()];
  if (topic === 'problem') parts.push('', buildDiagnostics(facts));
  return parts.join('\n');
}

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
        // The real build, not a literal. This was pinned at '1.0' while the
        // app shipped 1.0.0 and Settings displayed __APP_VERSION__ - so the
        // one field whose entire job is telling you which build a bug came
        // from was guaranteed to be wrong from the first version bump.
        appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '?',
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
