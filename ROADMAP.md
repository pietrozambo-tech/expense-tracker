# Roadmap — parked ideas

Things deliberately deferred, with enough detail to pick them up cold. Not a
backlog of everything: only items where the thinking is already done and would
otherwise be lost.

---

## 1. In-app AI: insights window + one-step import

**Status:** parked, costed. No code written.

### What it is

Two features sharing one piece of plumbing.

**(a) Insights window.** An ad-hoc sheet where the user's transactions are read
by Claude and come back as recommendations, comments and observations —
"tennis is up 40% since April", "your Others bucket is 12% of spend, worth
splitting". Conversational follow-ups.

**(b) One-step import.** Today's import is a three-step round trip: the user
copies our prompt out of Settings, pastes it into ChatGPT with their file, gets
JSON back, imports the JSON. With AI in the app that collapses to one step —
the user drops the CSV / bank statement / Splitwise export / **screenshot**
straight into the Import screen, and the Edge Function runs the prompt that
currently lives in `Settings.tsx`, returns an `ImportPayload`, and it goes
straight into `buildImport()`. Screenshots work because the models are
multimodal; that covers Tricount, which has no CSV export at all.

(b) is the higher-value half. It removes the only genuinely awkward flow in the
app, and it reuses the import prompt we have already tuned for split-expense
trips and account-owner detection.

### Costing (pricing as of 2026-06-24 — re-check before building)

Insights, per request. Assumes ~22 tokens per transaction in a compact
one-line-per-row serialisation, plus ~1,000 tokens of system prompt carrying
the user's own categories, budget and currency, and ~700 output tokens.

| Data sent | Input tokens | Haiku 4.5 | Sonnet 5 | Opus 5 |
|---|---|---|---|---|
| This month (~60 txns) | 2,320 | 0.6¢ | 1.8¢ | 2.9¢ |
| Last 3 months (~180) | 4,960 | 0.9¢ | 2.5¢ | 4.2¢ |
| Full year (~700) | 16,400 | 2.0¢ | 6.0¢ | 10.0¢ |
| Heavy user, 2 years (~2,000) | 45,000 | 4.9¢ | 14.6¢ | 24.3¢ |

At 4 insights/user/month on a full year of data: €0.08 (Haiku), €0.24
(Sonnet 5), €0.40 (Opus 5) — i.e. 2.7% / 8.0% / 13.3% of a €2.99 subscription.

Import conversion, per file (~100 rows): ~4,000 input + ~4,500 output tokens
≈ 8¢ on Sonnet 5. Output dominates, because the JSON is the product. A
screenshot adds ~1,500 input tokens, which is noise next to that. Imports are
occasional, so this stays cheap per user.

**Prompt caching** cuts conversational follow-ups to ~0.1× on input — a
year-window follow-up drops from 6.0¢ to 1.5¢ on Sonnet 5. Watch the minimum
cacheable prefix, which is *not* monotonic across models: 512 tokens on
Opus 5, 1,024 on Sonnet 5, **4,096 on Haiku 4.5**. A one-month window on Haiku
sits below the floor and will not cache at all.

**Recommendation:** Sonnet 5, prompt caching on, gated behind Plus. It is the
only tier where caching works across both short and long windows, and a weak
answer about someone's money is worse than no answer. The model id is one
string in the Edge Function if the economics change.

### Build notes

- Third Supabase Edge Function, same shape as `send-support`. **The API key
  lives there and only there — never in the bundle.**
- **Copy `send-support`'s per-user daily cap on day one, not day thirty.** This
  is the first metered resource in the app exposed to the open internet.
  Uncapped, 1,000 looped calls on Opus with a year of data is ~$105.
- ~150-line function + a client hook + the sheet UI. Two to three days with
  streaming.
- Supabase free tier covers 500K invocations/month — irrelevant at our scale.

### Privacy — blocking, do first

`site/privacy.html` currently opens with *"what you record never leaves your
phone"* for signed-out users. That sentence has to change before a single
transaction is sent anywhere. Descriptions are the sensitive part ("Dr. Rossi",
"divorce lawyer") and also exactly where the good insights come from. Plan:
explicit per-use opt-in that says plainly that transactions are sent to
Anthropic, rather than a stripped mode that drops descriptions and guts the
feature.

### Why it matters commercially

This is the first thing in the app with real marginal cost per use, which makes
it the honest anchor for a paid tier — better than paywalling sync, which costs
us nearly nothing.

---

## 2. Automatic bank expenses (Revolut asked first)

**Status:** decided 2026-08-03 — **one import path, no per-bank parsers.**

A native Revolut CSV parser was designed and rejected: every dedicated parser
is a second door into the ledger to maintain, test and explain, and the next
bank makes it a third. The import stays universal, and the one real friction
in it — the external AI round trip — is fixed by item 1(b) above, which is
universal too: once the AI runs in-app, "automatic Revolut" is just *export
the statement, drop it in Import, done*. Same door, no external step, and it
works identically for any bank, PDF, or screenshot.

Two pieces survive from the per-bank design, both bank-agnostic:

- **Share target (native app, ~1 day on Capacitor):** a PWA cannot register as
  an iOS share target; the native app can. Revolut → Statement → Share →
  TracklyLab → the ordinary import. Applies to any file from any app.
- **Dedupe on import:** a synthesized stable id from
  `hash(date, amount, currency, description)` so overlapping exports can never
  double-count — "already imported" becomes a count in the summary. Worth
  building with 1(b), since one-step import will invite re-imports.

True background sync (open banking) remains the only genuinely automatic
route, and it is parked for post-launch, tied to a paid tier: PSD2 account
access needs an AISP licence (ride an aggregator's — GoCardless BAD, SaltEdge,
Enable Banking; verify pricing, order ~€0.30–1.50/account/month), consent
renews every 90–180 days, and the feed must land in a `pending_transactions`
inbox table drained through the import pipeline — **never written into the
client-merged `user_data` blob**, which a server-side writer would race.

---

## 3. Smaller parked items

- **Optimistic render during token refresh.** Cuts the expired-token +
  slow-network cold start from ~1,446ms to ~330ms. Carries auth risk: shows UI
  before the refresh confirms the session.
- **Supabase custom auth domain** (~$10/mo) so the Google consent screen stops
  showing the Supabase domain instead of TracklyLab.
- **Governing-law clause** missing from the Terms.
- **Dark mode.**
- **320px row clipping** — pre-existing overlap on the narrowest phones.
- **Haptics.**
- **PostHog device split.**
- **Apple Developer Program enrolment** → Apple Sign-In, TestFlight, Capacitor
  spike.
- **Splitwise / Tricount direct API pull — ruled out.** Splitwise's Terms of
  Use forbid use "in connection with any fee-based service" and forbid apps
  that compete with Splitwise. Do not revisit without new terms. The
  screenshot/CSV path in item 1 is the way in.
