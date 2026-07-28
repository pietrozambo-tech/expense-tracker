# send-support

Sends in-app support messages by email (Resend), so the form submits **from the
app** instead of opening the user's mail client. Works for signed-in users and
guests; guests provide a reply email in the form.

## Setup

1. Create a [Resend](https://resend.com) account and an API key.
2. Verify the `tracklylab.com` domain in Resend (add the DNS records it shows).
   Until then, test with the sandbox sender (see below).
3. Set the secrets and deploy:

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxx
# optional overrides (defaults shown):
supabase secrets set SUPPORT_TO="support@tracklylab.com"
supabase secrets set SUPPORT_FROM="TracklyLab <support@tracklylab.com>"

supabase functions deploy send-support
```

`SUPABASE_URL` / `SUPABASE_ANON_KEY` are injected automatically (used to read the
signed-in user's account email from their JWT).

### Testing before the domain is verified

Resend only sends from a verified domain. Until `tracklylab.com` is verified,
set `SUPPORT_FROM="onboarding@resend.dev"` and `SUPPORT_TO` to your own Resend
account email (that's the only address Resend will deliver the sandbox sender to).

## Payload

`{ message, email, name, isGuest, appVersion, userAgent }` — the function adds
the JWT-verified account email/id and sets `reply_to` so you can reply straight
to the user. Until deployed (or if it errors), the app shows an error and offers
the direct `mailto:` link as a fallback.
