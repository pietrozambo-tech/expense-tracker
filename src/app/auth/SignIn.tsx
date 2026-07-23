import { useState } from 'react';
import { Mail, CheckCircle2 } from 'lucide-react';
import { useAuth } from './AuthProvider';

export function SignIn() {
  const { signInWithEmail, continueAsGuest } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const send = async () => {
    if (!valid || status === 'sending') return;
    setStatus('sending');
    setError(null);
    const { error } = await signInWithEmail(email);
    if (error) {
      setError(error);
      setStatus('idle');
    } else {
      setStatus('sent');
    }
  };

  return (
    <div className="min-h-screen flex flex-col max-w-[430px] mx-auto" style={{ backgroundColor: '#F5F5F7' }}>
      <div className="flex-1 flex flex-col px-6 pt-20">
        <div className="flex items-center justify-center rounded-3xl mb-6" style={{ width: 72, height: 72, background: '#FFFFFF', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', fontSize: 38 }}>💸</div>

        {status === 'sent' ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-6 h-6" style={{ color: '#30D158' }} />
              <h1 style={{ color: '#1C1C1E', fontSize: 28, fontWeight: 600, letterSpacing: '-0.6px' }}>Check your email</h1>
            </div>
            <p style={{ color: '#8E8E93', fontSize: 15, lineHeight: 1.45 }}>
              We sent a sign-in link to <span style={{ color: '#1C1C1E', fontWeight: 600 }}>{email.trim()}</span>. Open it on this device to continue.
            </p>
            <button
              onClick={() => { setStatus('idle'); }}
              className="mt-6 text-[15px] font-medium self-start"
              style={{ color: '#007AFF' }}
            >
              Use a different email
            </button>
          </>
        ) : (
          <>
            <h1 style={{ color: '#1C1C1E', fontSize: 32, fontWeight: 600, letterSpacing: '-0.7px', marginBottom: 8 }}>
              Sign in
            </h1>
            <p style={{ color: '#8E8E93', fontSize: 15, lineHeight: 1.45 }}>
              Get a magic link by email — no password needed. Your data syncs securely across your devices.
            </p>

            <div className="mt-10">
              <label className="block mb-2" style={{ color: '#1C1C1E', fontSize: 15, fontWeight: 600 }}>Email</label>
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
              {error && <p className="mt-2" style={{ color: '#FF3B30', fontSize: 13 }}>{error}</p>}
            </div>
          </>
        )}
      </div>

      {status !== 'sent' && (
        <div className="px-6 pb-8 pt-6">
          <button
            onClick={send}
            disabled={!valid || status === 'sending'}
            className="w-full py-4 rounded-xl font-medium text-base transition-all active:scale-[0.98]"
            style={{
              backgroundColor: !valid ? '#E5E5EA' : '#007AFF',
              color: '#FFFFFF',
              boxShadow: !valid ? 'none' : '0 2px 8px rgba(0,122,255,0.25)',
              cursor: !valid ? 'not-allowed' : 'pointer',
            }}
          >
            {status === 'sending' ? 'Sending…' : 'Email me a link'}
          </button>
          <button
            onClick={continueAsGuest}
            className="w-full py-3 mt-1 text-[15px] font-medium"
            style={{ color: '#8E8E93' }}
          >
            Continue without an account
          </button>
        </div>
      )}
    </div>
  );
}
