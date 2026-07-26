import { supabase } from './supabase';

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
        appVersion: '0.1',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      },
    });
    if (error) return { error: error.message || 'Could not send your message' };
    if (data && (data as { ok?: boolean }).ok === false) {
      return { error: (data as { error?: string }).error || 'Could not send your message' };
    }
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not send your message' };
  }
}
