# Email sign-in with a 6-digit code

TracklyLab signs people in with a **code they type**, never a link they click.

That is a deliberate choice, not a style preference. A magic link opens in
whatever browser the mail client hands it to - on iPhone, Mail's own in-app
browser. That is a different browser context from the one that started the
sign-in, so it does not hold the PKCE verifier Supabase needs to complete the
exchange, and the link dies with an opaque error. A code the user reads and
types works from any mail app on any device, because nothing has to be carried
between browsers.

The code path is already implemented:

| | |
|---|---|
| send | `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })` |
| verify | `supabase.auth.verifyOtp({ email, token, type: 'email' })` |
| UI | `src/app/auth/SignIn.tsx`, behind `EMAIL_SIGN_IN_ENABLED` |

**Whether Supabase sends a link or a code is decided entirely by the email
templates, not by the code above.** Ship the default templates and users get a
link no matter what the client calls. That is step 3 below, and it is the step
that actually matters.

---

## 1. An SMTP provider

Supabase's built-in email service only sends to members of the project's own
team and is capped at a couple of messages an hour. It cannot be used for real
users, which is the whole reason this setup exists.

Any SMTP provider works. Resend is the one these instructions assume: the free
tier (3,000/month) is far beyond what this app needs, and the setup is DNS
records and one API key.

1. Create an account at resend.com.
2. **Domains → Add Domain** → `tracklylab.com`.
3. Resend shows a set of DNS records (domain verification, DKIM, SPF, and an MX
   for bounce handling). Add them **exactly as shown** wherever `tracklylab.com`
   DNS is managed.
   - These sit alongside the records that point the domain at GitHub Pages.
     Record types do not collide, so the website is unaffected.
   - Resend puts the MX on a `send.` subdomain rather than the apex, which
     leaves the apex free for real mailboxes (Google Workspace, etc.) later.
   - Verification is usually minutes, occasionally up to an hour.
4. **API Keys → Create API Key**, sending permission. Copy it once (`re_…`); it
   is not shown again.

## 2. Point Supabase at it

Supabase dashboard → **Project Settings → Authentication → SMTP Settings** →
enable *Custom SMTP*:

| field | value |
|---|---|
| Sender email | `no-reply@send.tracklylab.com` (must be on the verified domain) |
| Sender name | `TracklyLab` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` (literally that word, not an address) |
| Password | the `re_…` API key |

Then **Authentication → Rate Limits**: the email limit is deliberately tiny
until custom SMTP is configured. Raise it to something sane (30/hour is plenty
at this scale) or the second person to sign in that hour gets a silent failure.

## 3. Turn the templates into codes ← the step that matters

**Authentication → Emails → Templates.** Two templates are involved, and
missing the second one is the classic way this breaks:

- **Magic Link** - sent to someone who already has an account.
- **Confirm signup** - sent to someone signing in for the very first time.

A default template contains `{{ .ConfirmationURL }}`, which is what produces a
link. Replace the body of **both** with a code, and remove the URL entirely so
there is nothing to click:

```html
<h2 style="font-family:-apple-system,system-ui,sans-serif;color:#1C1C1E;">Your TracklyLab code</h2>
<p style="font-family:-apple-system,system-ui,sans-serif;color:#3C3C43;font-size:15px;">
  Enter this code to sign in:
</p>
<p style="font-family:-apple-system,system-ui,sans-serif;font-size:32px;font-weight:700;letter-spacing:8px;color:#1C1C1E;">
  {{ .Token }}
</p>
<p style="font-family:-apple-system,system-ui,sans-serif;color:#8E8E93;font-size:13px;">
  The code expires in 10 minutes. If you didn't ask for it, ignore this email.
</p>
```

Subject line, for both:

```
{{ .Token }} is your TracklyLab code
```

Putting the code in the subject means an iPhone shows it in the notification
banner, so most people never open the mail at all. (If the dashboard does not
substitute variables in subjects, fall back to `Your TracklyLab code`.)

Finally, **Authentication → Providers → Email**: confirm *Email OTP Length* is
`6` (the app validates `/^\d{6}$/`) and set *Email OTP Expiration* to `600`
seconds, matching what the email promises.

## 4. Verify before exposing it

Trigger a real send without touching the app. The anon key is public by design,
so this is safe to run and to paste anywhere:

```bash
curl -X POST 'https://kxaqapcrbmuqulkltxum.supabase.co/auth/v1/otp' \
  -H 'apikey: <VITE_SUPABASE_ANON_KEY from src/app/lib/supabase.ts>' \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","create_user":true}'
```

`{}` and HTTP 200 means Supabase accepted it. Then check the mail:

- [ ] it arrives at all (if not: Resend → Logs shows the SMTP-level reason)
- [ ] it contains a **6-digit code and no link**
- [ ] it is not in spam (if it is, DNS is not fully verified yet)
- [ ] **repeat with an address that has never signed in** - that exercises the
      *Confirm signup* template, and it is the one people forget

If the never-before-seen address gets a code but verification rejects it, the
signup OTP wants `type: 'signup'` rather than `'email'` in `verifyEmailCode`.
Same fix either way, just worth knowing which template you are looking at.

## 5. Switch it on

Set `EMAIL_SIGN_IN_ENABLED = true` in `src/app/auth/SignIn.tsx` and push. The
email field, the "Email me a code" button and the code screen are already
built behind that flag.

## Notes

- The account is keyed on the Supabase user id, not the email. Someone who
  signs in with Google today and with the same address by email tomorrow gets
  **two accounts** unless automatic identity linking is on and the address is
  verified on both. Worth settling before this goes to real users.
- Nothing here affects the native build: the code path is plain HTTPS, with no
  redirect and no custom URL scheme, so it is the one sign-in method that
  behaves identically on web and in the iOS shell.
