import { useState } from 'react';
import { Mail, ArrowLeft } from 'lucide-react';
import { useAuth } from './AuthProvider';

// Google "G" logo (official colours), inlined so it works offline
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.02-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.02 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

export function SignIn() {
  const { sendEmailCode, verifyEmailCode, signInWithGoogle, continueAsGuest, authError, clearAuthError } = useAuth();
  const [step, setStep] = useState<'start' | 'code'>('start');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const codeValid = /^\d{6}$/.test(code.trim());

  const google = async () => {
    setError(null);
    setBusy(true);
    const { error } = await signInWithGoogle();
    if (error) {
      setError(error);
      setBusy(false);
    }
    // On success the browser redirects to Google, so no further UI needed.
  };

  const send = async () => {
    if (!emailValid || busy) return;
    setBusy(true);
    setError(null);
    const { error } = await sendEmailCode(email);
    setBusy(false);
    if (error) setError(error);
    else { setStep('code'); setCode(''); }
  };

  const verify = async () => {
    if (!codeValid || busy) return;
    setBusy(true);
    setError(null);
    const { error } = await verifyEmailCode(email, code);
    if (error) { setError(error); setBusy(false); }
    // On success onAuthStateChange takes over and the app renders.
  };

  return (
    <div className="min-h-screen flex flex-col max-w-[430px] mx-auto" style={{ backgroundColor: '#F5F5F7' }}>
      <div className="flex-1 flex flex-col px-6 pt-16">
        <div className="flex items-center justify-center rounded-3xl mb-6" style={{ width: 72, height: 72, background: '#FFFFFF', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', fontSize: 38 }}>💸</div>

        {step === 'start' ? (
          <>
            <h1 style={{ color: '#1C1C1E', fontSize: 32, fontWeight: 600, letterSpacing: '-0.7px', marginBottom: 8 }}>Sign in</h1>
            <p style={{ color: '#8E8E93', fontSize: 15, lineHeight: 1.45 }}>
              Sync your data securely across your devices.
            </p>

            {authError && (
              <div className="mt-4 px-4 py-3 rounded-xl" style={{ backgroundColor: '#FFF0EF', border: '1px solid #FFD5D2' }}>
                <p style={{ color: '#C4271C', fontSize: 13, lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 600 }}>Sign-in didn't complete.</span> {authError}
                </p>
                <button onClick={clearAuthError} className="mt-1.5 text-[13px] font-medium" style={{ color: '#C4271C' }}>Dismiss</button>
              </div>
            )}

            {/* Google */}
            <button
              onClick={google}
              disabled={busy}
              className="w-full mt-8 py-4 rounded-xl font-medium text-base flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
              style={{ backgroundColor: '#FFFFFF', color: '#1C1C1E', border: '1px solid #E5E5EA', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
            >
              <GoogleG />
              Continue with Google
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px" style={{ background: '#E5E5EA' }} />
              <span style={{ color: '#B0B0B5', fontSize: 13 }}>or</span>
              <div className="flex-1 h-px" style={{ background: '#E5E5EA' }} />
            </div>

            {/* Email */}
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#8E8E93' }} />
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
                placeholder="you@email.com"
                className="w-full pl-11 pr-4 py-4 rounded-xl text-base outline-none transition-all"
                style={{ backgroundColor: '#FFFFFF', color: '#1C1C1E', border: '1px solid #E5E5EA', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
                onFocus={(e) => { e.target.style.border = '1.5px solid #007AFF'; e.target.style.boxShadow = '0 0 0 3px rgba(0,122,255,0.08)'; }}
                onBlur={(e) => { e.target.style.border = '1px solid #E5E5EA'; e.target.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; }}
              />
            </div>
            {error && <p className="mt-3" style={{ color: '#FF3B30', fontSize: 13 }}>{error}</p>}
          </>
        ) : (
          <>
            <button onClick={() => { setStep('start'); setError(null); }} className="flex items-center gap-1 -ml-1 mb-4 self-start" style={{ color: '#007AFF', fontSize: 15 }}>
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <h1 style={{ color: '#1C1C1E', fontSize: 28, fontWeight: 600, letterSpacing: '-0.6px', marginBottom: 8 }}>Enter your code</h1>
            <p style={{ color: '#8E8E93', fontSize: 15, lineHeight: 1.45 }}>
              We emailed a 6-digit code to <span style={{ color: '#1C1C1E', fontWeight: 600 }}>{email.trim()}</span>. Enter it below.
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') verify(); }}
              placeholder="000000"
              autoFocus
              className="w-full mt-6 py-4 rounded-xl text-center outline-none transition-all"
              style={{ backgroundColor: '#FFFFFF', color: '#1C1C1E', border: '1px solid #E5E5EA', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', fontSize: 30, fontWeight: 700, letterSpacing: '10px' }}
              onFocus={(e) => { e.target.style.border = '1.5px solid #007AFF'; e.target.style.boxShadow = '0 0 0 3px rgba(0,122,255,0.08)'; }}
              onBlur={(e) => { e.target.style.border = '1px solid #E5E5EA'; e.target.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; }}
            />
            {error && <p className="mt-3" style={{ color: '#FF3B30', fontSize: 13 }}>{error}</p>}
            <button onClick={send} disabled={busy} className="mt-4 text-[15px] font-medium self-start" style={{ color: '#007AFF' }}>
              Resend code
            </button>
          </>
        )}
      </div>

      {/* Bottom CTA */}
      <div className="px-6 pb-8 pt-6">
        {step === 'start' ? (
          <>
            <button
              onClick={send}
              disabled={!emailValid || busy}
              className="w-full py-4 rounded-xl font-medium text-base transition-all active:scale-[0.98]"
              style={{ backgroundColor: !emailValid ? '#E5E5EA' : '#007AFF', color: '#FFFFFF', boxShadow: !emailValid ? 'none' : '0 2px 8px rgba(0,122,255,0.25)', cursor: !emailValid ? 'not-allowed' : 'pointer' }}
            >
              {busy ? 'Sending…' : 'Email me a code'}
            </button>
            <button onClick={continueAsGuest} className="w-full py-3 mt-1 text-[15px] font-medium" style={{ color: '#8E8E93' }}>
              Continue without an account
            </button>
          </>
        ) : (
          <button
            onClick={verify}
            disabled={!codeValid || busy}
            className="w-full py-4 rounded-xl font-medium text-base transition-all active:scale-[0.98]"
            style={{ backgroundColor: !codeValid ? '#E5E5EA' : '#007AFF', color: '#FFFFFF', boxShadow: !codeValid ? 'none' : '0 2px 8px rgba(0,122,255,0.25)', cursor: !codeValid ? 'not-allowed' : 'pointer' }}
          >
            {busy ? 'Verifying…' : 'Verify & sign in'}
          </button>
        )}
      </div>
    </div>
  );
}
