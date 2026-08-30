import { useState } from 'react';
import { getLanguage } from '../i18n/store';
import { Mail, ArrowLeft } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { TracklyLogo } from '../components/TracklyLogo';
import { hasLocalLedger, loadOwner } from '../lib/storage';

// Placeholder tagline — swap for the final one once decided.
const TAGLINE = 'Your Expense Lens';

// The two document names in the consent line, lifted out of the sentence so
// both languages emphasise them the same way rather than each carrying a copy.
const LEGAL_EM = { color: 'var(--ink-2)', fontWeight: 500 } as const;

// Live since 20 Aug 2026: Apple Developer Program + a Services ID, key and
// signed client secret configured in Supabase. App Store guideline 4.8 makes
// this mandatory once Google sign-in is offered, and Apple's own guidance puts
// its button no lower than the alternatives - hence it sits above Google.
//
// The client secret is a JWT that Apple caps at six months. When web Apple
// sign-in starts failing, that is why: regenerate with tools/
// apple-client-secret.html and repaste it into Supabase.
const APPLE_SIGN_IN_ENABLED = true;

// Email one-time-code sign-in. Codes are delivered by a custom SMTP provider
// (Resend) configured in Supabase - see supabase/EMAIL-OTP.md, which also
// explains why this is a typed code and never a link.
const EMAIL_SIGN_IN_ENABLED = true;

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

// Apple logo (white, for the black button)
function AppleLogo() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true" style={{ marginTop: -2 }}>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01M12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

export function SignIn() {
  const { sendEmailCode, verifyEmailCode, signInWithGoogle, signInWithApple, continueAsGuest, authError, clearAuthError } = useAuth();
  const [step, setStep] = useState<'start' | 'code'>('start');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Someone who has been here before, standing at the sign-in screen.
  //
  // This screen is written for a first run, and it is not always a first run.
  // A refresh token can be rejected outright - it rotates, and if the response
  // to the rotating request never reaches the phone (a flight, a tunnel, a
  // second copy of the app refreshing first) the next launch presents a token
  // the server has already retired. Supabase then signs the session out, which
  // is correct, and the app showed this page: the cold welcome, no mention of
  // the ledger sitting in storage two inches behind it.
  //
  // Read once at mount, from storage rather than from any auth state, because
  // by the time this screen renders the session is gone and the two durable
  // facts are all that is left: whose data this is, and that there is some.
  const [returning] = useState(() => {
    const owner = loadOwner();
    return owner && hasLocalLedger() ? owner : null;
  });

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  // Supabase's code length is a dashboard setting (6-10 digits); accept the
  // whole range so a settings change can never lock people out again.
  const codeValid = /^\d{6,10}$/.test(code.trim());

  const google = async () => {
    setError(null);
    setBusy(true);
    const { error } = await signInWithGoogle();
    if (error) { setError(error); setBusy(false); }
  };

  const apple = async () => {
    setError(null);
    setBusy(true);
    const { error } = await signInWithApple();
    if (error) { setError(error); setBusy(false); }
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
  };

  // Soft brand halo AROUND THE LOGO, never touching the top edge.
  //
  // Two prior versions each taught one lesson. A radial anchored at the
  // viewport top tinted the top edge unevenly. A linear one tinted it evenly
  // and a theme-color override asked the installed app's status-bar strip to
  // match - but with status-bar-style "default" iOS paints that strip itself
  // and ignored the override (screenshot, 20 Aug), so the seam stayed. The
  // strip cannot be recoloured from here. What CAN be guaranteed is the
  // page's side of the boundary: this ellipse is sized and placed so its
  // final stop - fully faded to the page colour - lands well above y=0.
  // Centre 26% down, vertical radius 34%: the top edge sits at 26/34 = 76%
  // of the radius, and the fade completes at 70%, a clear margin before it.
  // The top edge is therefore pure var(--bg-page): the same colour every
  // other screen meets the strip with. Nothing for iOS to disagree with.
  //
  // The last stop stays var(--bg-page), not a literal: a hardcoded light
  // value once split the dark screen into a dark half and a cream half.
  const bg =
    'radial-gradient(80% 34% at 50% 26%, rgba(99,102,241,0.12), rgba(59,130,246,0.06) 45%, var(--bg-page) 70%)';

  return (
    // Viewport height, not a minimum: this screen grows every time a provider
    // is added (the email block pushed the terms off a 667pt phone, and Apple
    // will add a button again). A fixed height with the middle section taking
    // the slack keeps the buttons where they are on any device.
    // Two nested boxes where there was one: the OUTER paints the gradient down
    // the whole viewport column; the INNER holds the actual screen and caps at
    // 900px, centred vertically. On a phone nothing changes - the cap only
    // engages on tall screens (iPad portrait is 1194pt), where the old single
    // box pinned the buttons to the bottom and opened a 400px hole between
    // the email field and "Email me a code".
    <div className="flex max-w-[430px] mx-auto" style={{ height: '100dvh', background: bg }}>
      <div className="flex flex-col w-full my-auto" style={{ height: '100%', maxHeight: 900 }}>
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col px-6">
        {step === 'start' ? (
          <>
            {/* Brand hero */}
            <div className="flex flex-col items-center text-center pb-8" style={{ paddingTop: 'clamp(36px, 9vh, 80px)' }}>
              <TracklyLogo size={64} className="mb-4" />
              <h1 style={{ color: 'var(--ink)', fontSize: 34, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>TracklyLab</h1>
              <p className="mt-2.5" style={{ color: 'var(--ink-3)', fontSize: 16, lineHeight: 1.4, maxWidth: 300 }}>{TAGLINE}</p>
            </div>

            {authError && (
              <div className="mb-4 px-4 py-3 rounded-xl" style={{ backgroundColor: 'var(--wash-over)', border: '1px solid #FFD5D2' }}>
                <p style={{ color: '#C4271C', fontSize: 13, lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 600 }}>{getLanguage() === 'it' ? "L'accesso non è andato a buon fine." : "Sign-in didn't complete."}</span> {authError}
                </p>
                <button onClick={clearAuthError} className="mt-1.5 text-[13px] font-medium" style={{ color: '#C4271C' }}>{getLanguage() === 'it' ? 'Chiudi' : 'Dismiss'}</button>
              </div>
            )}

            {/* Not an error, so it does not look like one: the calm note, in
                the card colours, saying the one thing this person wants to
                know before they touch anything. It names the account too -
                signing back in with a DIFFERENT provider mints an empty one
                and reads as lost data (see the Hide My Email note below). */}
            {returning && (
              <div
                data-signin-returning
                className="mb-4 px-4 py-3 rounded-xl"
                style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--line)' }}
              >
                <p style={{ color: 'var(--ink)', fontSize: 13, lineHeight: 1.45 }}>
                  <span style={{ fontWeight: 600 }}>
                    {getLanguage() === 'it'
                      ? 'I tuoi dati sono ancora su questo telefono.'
                      : 'Your data is still on this phone.'}
                  </span>{' '}
                  {getLanguage() === 'it'
                    ? returning.email
                      ? `Rientra con ${returning.email} e torna a sincronizzarsi: non si è perso niente.`
                      : 'Rientra con lo stesso account e torna a sincronizzarsi: non si è perso niente.'
                    : returning.email
                      ? `Sign back in with ${returning.email} and it picks up syncing again - nothing was lost.`
                      : 'Sign back in with the same account and it picks up syncing again - nothing was lost.'}
                </p>
              </div>
            )}

            {/* Apple — hidden until configured (see APPLE_SIGN_IN_ENABLED) */}
            {APPLE_SIGN_IN_ENABLED && (
              <button
                onClick={apple}
                disabled={busy}
                className="w-full py-4 rounded-2xl font-medium text-base flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] mb-3"
                // The transparent border mirrors the 1px one on the Google
                // button below: without it Apple's button rendered 2px
                // shorter, and Apple's guidelines say its button may not be
                // the less prominent one. Measured, not eyeballed.
                style={{ backgroundColor: '#000000', color: '#FFFFFF', border: '1px solid transparent', boxShadow: '0 2px 10px rgba(0,0,0,0.12)' }}
              >
                <AppleLogo />
                {getLanguage() === 'it' ? 'Continua con Apple' : 'Continue with Apple'}
              </button>
            )}
            {/* NOTE - the Hide My Email trap, known and accepted. Apple's
                sheet can hand us a relay address; for someone who first
                signed up with Google that relay matches nothing, Supabase
                mints a fresh empty account, and it reads as lost data. A
                warning line lived here briefly and was removed as clutter
                (owner's call, 21 Aug 2026) - if a support message ever says
                "logged in with Apple and everything is gone", this is what
                happened, and the fix is to sign out and use Google or pick
                Share My Email. */}

            {/* Google */}
            <button
              onClick={google}
              disabled={busy}
              className="w-full py-4 rounded-2xl font-medium text-base flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
              style={{ backgroundColor: 'var(--bg-card)', color: 'var(--ink)', border: '1px solid var(--line)', boxShadow: '0 2px 10px rgba(17,24,39,0.05)' }}
            >
              <GoogleG />
              {getLanguage() === 'it' ? 'Continua con Google' : 'Continue with Google'}
            </button>

            <p className="text-center mt-3.5 px-6" style={{ color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.45 }}>
              {getLanguage() === 'it' ? 'Accedi per salvare i tuoi dati e sincronizzarli su tutti i tuoi dispositivi.' : 'Sign in to back up your data and sync it across your devices.'}
            </p>

            {error && <p className="mt-3" style={{ color: '#FF3B30', fontSize: 13 }}>{error}</p>}

            {/* Email one-time code (see EMAIL_SIGN_IN_ENABLED) */}
            {EMAIL_SIGN_IN_ENABLED && (
              <>
                {/* Divider */}
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
                  {/* The other word on this screen that stayed English. */}
                  <span style={{ color: 'var(--disabled)', fontSize: 12, fontWeight: 500 }}>{getLanguage() === 'it' ? 'OPPURE' : 'OR'}</span>
                  <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
                </div>

                {/* Email input */}
                <div className="relative">
                  <Mail className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-2)' }} />
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
                    placeholder="you@email.com"
                    className="w-full pl-11 pr-4 py-4 rounded-2xl text-base outline-none transition-all"
                    style={{ backgroundColor: 'var(--bg-card)', color: 'var(--ink)', border: '1px solid var(--line)', boxShadow: '0 2px 10px rgba(17,24,39,0.04)' }}
                    onFocus={(e) => { e.target.style.border = '1.5px solid #4F74F3'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.10)'; }}
                    onBlur={(e) => { e.target.style.border = '1px solid var(--line)'; e.target.style.boxShadow = '0 2px 10px rgba(17,24,39,0.04)'; }}
                  />
                </div>
              </>
            )}
          </>
        ) : (
          <div style={{ paddingTop: 'clamp(28px, 7vh, 64px)' }}>
            <button onClick={() => { setStep('start'); setError(null); }} className="flex items-center gap-1 -ml-1 mb-5 self-start" style={{ color: 'var(--accent-ink)', fontSize: 15 }}>
              <ArrowLeft className="w-4 h-4" />{getLanguage() === 'it' ? 'Indietro' : 'Back'}</button>
            <TracklyLogo size={48} className="mb-5" />
            <h1 style={{ color: 'var(--ink)', fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8 }}>{getLanguage() === 'it' ? 'Inserisci il codice' : 'Enter your code'}</h1>
            <p style={{ color: 'var(--ink-3)', fontSize: 15, lineHeight: 1.45 }}>
              {getLanguage() === 'it' ? 'Abbiamo inviato un codice di accesso a' : 'We emailed a sign-in code to'} <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{email.trim()}</span>{getLanguage() === 'it' ? '. Inseriscilo qui sotto.' : '. Enter it below.'}
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') verify(); }}
              placeholder="000000"
              autoFocus
              className="w-full mt-6 py-4 rounded-2xl text-center outline-none transition-all"
              style={{ backgroundColor: 'var(--bg-card)', color: 'var(--ink)', border: '1px solid var(--line)', boxShadow: '0 2px 10px rgba(17,24,39,0.04)', fontSize: 30, fontWeight: 700, letterSpacing: '10px' }}
              onFocus={(e) => { e.target.style.border = '1.5px solid #4F74F3'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.10)'; }}
              onBlur={(e) => { e.target.style.border = '1px solid var(--line)'; e.target.style.boxShadow = '0 2px 10px rgba(17,24,39,0.04)'; }}
            />
            {error && <p className="mt-3" style={{ color: '#FF3B30', fontSize: 13 }}>{error}</p>}
            <button onClick={send} disabled={busy} className="mt-4 text-[15px] font-medium self-start" style={{ color: 'var(--accent-ink)' }}>
              {getLanguage() === 'it' ? 'Invia di nuovo il codice' : 'Resend code'}
            </button>
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      <div className="px-6 pt-6 flex-shrink-0" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
        {step === 'start' ? (
          <>
            {EMAIL_SIGN_IN_ENABLED && (
              <button
                onClick={send}
                disabled={!emailValid || busy}
                className="w-full py-4 rounded-2xl font-medium text-base transition-all active:scale-[0.98]"
                style={{ backgroundColor: !emailValid ? 'var(--line)' : 'var(--chip-ink)', color: '#FFFFFF', boxShadow: !emailValid ? 'none' : '0 6px 18px rgba(28,28,30,0.22)', cursor: !emailValid ? 'not-allowed' : 'pointer' }}
              >
                {busy ? (getLanguage() === 'it' ? 'Invio…' : 'Sending…') : (getLanguage() === 'it' ? 'Inviami un codice via email' : 'Email me a code')}
              </button>
            )}
            <button onClick={continueAsGuest} className="w-full py-3 mt-2 text-[15px] font-medium" style={{ color: 'var(--ink-2)' }}>
              {getLanguage() === 'it' ? 'Continua senza account' : 'Continue without an account'}
            </button>
            {/* Half of this line used to stay in English on an Italian phone:
                only the word "Termini" was translated, so the sentence around
                it and "Privacy Policy" read as English. The document names now
                match what Settings calls them, which is where these two are
                actually opened - one name per document, everywhere. */}
            <p className="text-center mt-3 px-4" style={{ color: 'var(--disabled)', fontSize: 12, lineHeight: 1.5 }}>
              {getLanguage() === 'it' ? (
                <>
                  Continuando accetti i nostri{' '}
                  <span style={LEGAL_EM}>Termini di Servizio</span> e la nostra{' '}
                  <span style={LEGAL_EM}>Privacy Policy</span>.
                </>
              ) : (
                <>
                  By continuing you agree to our{' '}
                  <span style={LEGAL_EM}>Terms of Service</span> and{' '}
                  <span style={LEGAL_EM}>Privacy Policy</span>.
                </>
              )}
            </p>
          </>
        ) : (
          <button
            onClick={verify}
            disabled={!codeValid || busy}
            className="w-full py-4 rounded-2xl font-medium text-base transition-all active:scale-[0.98]"
            style={{ backgroundColor: !codeValid ? 'var(--line)' : 'var(--chip-ink)', color: '#FFFFFF', boxShadow: !codeValid ? 'none' : '0 6px 18px rgba(28,28,30,0.22)', cursor: !codeValid ? 'not-allowed' : 'pointer' }}
          >
            {busy ? (getLanguage() === 'it' ? 'Verifica…' : 'Verifying…') : (getLanguage() === 'it' ? 'Verifica e accedi' : 'Verify & sign in')}
          </button>
        )}
      </div>
      </div>
    </div>
  );
}
