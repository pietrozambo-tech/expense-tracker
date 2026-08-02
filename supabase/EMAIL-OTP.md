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

**Most of this is already done.** The in-app support form
(`supabase/functions/send-support`) sends through Resend from
`support@tracklylab.com`, so the domain is verified at the apex and SPF/DKIM are
live. Nothing to add in DNS.

> **A sending address is not a mailbox.** A hosting plan that includes "2 email
> addresses" is talking about *inboxes that receive*. Sending through Resend
> needs only the verified **domain**: any address on it works, and
> `no-reply@tracklylab.com` never has to exist as a mailbox anywhere. The
> mailbox allowance is untouched by this.
>
> The one consequence is that a reply to `no-reply@` reaches nobody, and
> Supabase's SMTP settings have no Reply-To field. So the template below points
> people at the support address in the text instead.

What to do:

1. **Domains** → confirm `tracklylab.com` shows *Verified*, and note the exact
   name (the sender must be on it: apex here, not a `send.` subdomain).
2. **API Keys → Create API Key**, sending permission, named e.g.
   `supabase-auth`. Copy it once (`re_…`); it is not shown again.
   - Deliberately *not* the key the support function uses. Same account, two
     keys, so either can be revoked without taking the other down. They also
     live in different places: the support key is a Supabase **secret** read by
     the Edge Function (`RESEND_API_KEY`), this one goes in the **SMTP
     password** field. Resend's HTTP API and its SMTP endpoint are two doors
     into the same verified domain.
3. Optional, two minutes, if it is not there already: a DMARC record. SPF and
   DKIM are what get mail delivered; DMARC is what stops someone else spoofing
   the domain. Start in monitor-only mode so it cannot break the support mail
   that already works:

   ```
   _dmarc.tracklylab.com   TXT   v=DMARC1; p=none; rua=mailto:support@tracklylab.com
   ```

## 2. Point Supabase at it

Supabase dashboard → **Project Settings → Authentication → SMTP Settings** →
enable *Custom SMTP*:

| field | value |
|---|---|
| Sender email | `no-reply@tracklylab.com` (any address on the verified domain; no mailbox needed) |
| Sender name | `TracklyLab` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` (literally that word, not an address) |
| Password | the `re_…` API key from step 1 |

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
<p style="font-family:-apple-system,system-ui,sans-serif;color:#8E8E93;font-size:13px;">
  Need help? Write to <a href="mailto:support@tracklylab.com" style="color:#007AFF;">support@tracklylab.com</a>.
</p>
```

That last line is doing real work: the mail goes out from a `no-reply@` address
that has no mailbox behind it, so it gives people somewhere that a human
actually reads.

Subject line, for both:

```
Your TracklyLab sign-in code
```

The code does **not** go in the subject. It seems convenient (the notification
banner would show it), but it backfires twice: the code sits readable on a
locked phone for anyone who glances at it, and a subject that is mostly a
number is classic spam-filter bait - the last thing a domain with no sending
history needs. iOS offers the code above the keyboard anyway, from the message
body, because the input carries `autocomplete="one-time-code"`.

Finally, **Authentication → Sign In / Providers → Email**: set *Email OTP
Length* to `6` and *Email OTP Expiration* to `600` seconds, matching what the
email promises. The app accepts any code of 6-10 digits (Supabase's allowed
range), so a mismatch here can no longer lock anyone out - the first live test
shipped an 8-digit code into a field that refused the 7th digit.

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
- [ ] it contains a **code and no link**
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

## Deliverability (the junk folder)

The very first live send landed in Gmail's junk folder. That is normal for a
domain with no sending history, and it fades - but three things speed it up:

1. **DMARC.** Gmail effectively expects SPF + DKIM + DMARC from any new sender
   now. Resend sets up the first two; DMARC is one TXT record, monitor-only so
   it cannot break anything that already sends:

   ```
   _dmarc.tracklylab.com   TXT   v=DMARC1; p=none; rua=mailto:support@tracklylab.com
   ```

2. **Keep the code out of the subject** (done above). A number-heavy subject
   from an unknown domain is exactly the shape filters are trained on.

3. **Mark the first one "Not junk"** in your own mailboxes. It trains the
   filter for the recipient domain and builds the sender's reputation. Early
   testers should be warned to check spam once; after a handful of legitimate
   sends the problem disappears on its own.
