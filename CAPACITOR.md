# TracklyLab on iOS (Capacitor)

The native iOS app wraps the **same** web build that ships as the PWA. One
codebase, two outputs — the PWA build is untouched by anything here.

| | command | output |
|---|---|---|
| PWA (GitHub Pages) | `pnpm build` | `dist/` **with** service worker + manifest |
| Native (iOS) | `pnpm build:native` | `dist/` **without** service worker |

`build:native` sets `CAP_BUILD=1`, which skips `vite-plugin-pwa` — a service
worker is pointless when assets are bundled inside the app, and it complicates
updates.

---

## One-time setup (on the Mac)

Prerequisites: macOS, **Xcode** (App Store), **CocoaPods** (`sudo gem install cocoapods`),
and an **Apple Developer Program** membership ($99/yr) for device testing +
submission.

```bash
pnpm install
pnpm build:native
npx cap add ios      # generates the ios/ Xcode project — commit it
npx cap open ios     # opens Xcode
```

In Xcode: select the **App** target → **Signing & Capabilities** → set your Team.
Then pick your iPhone as the run destination and hit ▶.

## Everyday loop

```bash
pnpm sync:ios        # = build:native + cap sync ios
npx cap open ios     # then ▶ in Xcode
```

Only re-run `cap open` when you need Xcode; `pnpm sync:ios` alone refreshes the
web assets inside the native project.

---

## Register the custom URL scheme (required for sign-in)

OAuth cannot run inside an embedded webview (Apple rejects it), so the app opens
the provider in a system browser and the provider redirects **back into the app**
through a custom URL scheme. Wire it up once:

**1. Xcode** → `App/App/Info.plist` → add:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array><string>com.tracklylab.app</string></array>
  </dict>
</array>
```

**2. Supabase** → Authentication → URL Configuration → **Redirect URLs**, add:

```
com.tracklylab.app://auth
```

**3. Google Cloud Console** → the OAuth client → keep the existing Supabase
callback (`https://<project>.supabase.co/auth/v1/callback`). Google redirects to
Supabase, Supabase redirects to the custom scheme — you do **not** register the
custom scheme with Google.

The scheme is defined once in `src/app/lib/platform.ts`
(`NATIVE_URL_SCHEME` / `NATIVE_AUTH_REDIRECT`) — change it there and in the two
places above if the bundle id ever changes.

### How the code branches

`src/app/auth/AuthProvider.tsx` picks the flow at runtime:

- **Web/PWA** — unchanged: redirect to the provider, `detectSessionInUrl` picks
  the session back up.
- **Native** — `skipBrowserRedirect: true`, open the URL with
  `@capacitor/browser` (ASWebAuthenticationSession), then an `appUrlOpen`
  listener reads the tokens from the redirect fragment, calls
  `supabase.auth.setSession()` and closes the browser.

Capacitor modules are **dynamically imported** behind `isNative()`, so the web
bundle never loads them (verified: 0 Capacitor references in the main chunk).

---

## Still to do before submitting

- [ ] **Sign in with Apple** — App Store guideline **4.8** makes it mandatory
      because we offer Google sign-in. The code path already exists behind
      `APPLE_SIGN_IN_ENABLED` in `SignIn.tsx`; it needs an Apple Service ID +
      key configured in Supabase, then flip the flag.
- [x] **Storage durability** — ✅ done. `WKWebView` classes `localStorage` as
      cache and iOS may evict it, which for a guest (no cloud copy) is the whole
      ledger gone. `src/app/lib/kv.ts` puts `@capacitor/preferences`
      (UserDefaults, never evicted) behind a *synchronous* façade, so the
      `useState(() => loadSettings())` initialisers in `App.tsx` did not have to
      change: `hydrateStorage()` in `main.tsx` fills a memory mirror before
      React mounts, reads answer from it, writes land in the background.
      Web build untouched (0 Capacitor references in the main chunk; the plugin
      is a separate 8 kB chunk that only native ever fetches).
      Covered by `pnpm test:storage` — run `--before` to watch 180 transactions
      vanish the way they would have.
- [ ] **Native value for guideline 4.2** — a pure web wrapper risks rejection as
      "minimum functionality". Lock Screen widget (WidgetKit) + Siri App Intents
      are the intended answer; both need a Swift extension target.
- [ ] **App icons + splash** — `@capacitor/assets` can generate the full set from
      one 1024×1024 source.
- [ ] **Privacy Policy + Terms URLs** and App Privacy "nutrition labels"
      (we collect: email, analytics events — no transaction contents).
- [ ] **Account deletion** — ✅ already shipped (guideline 5.1.1(v)),
      Settings → Danger zone → Delete account. Needs the `delete-account` Edge
      Function deployed.

## Gotchas

- `npx cap add ios` must run on macOS; it can't be generated here.
- Re-run `pnpm sync:ios` after **every** web change — Xcode serves a copied
  snapshot of `dist/`, not your live files.
- The `ios/` project is committed, but build artifacts (`Pods/`, `build/`,
  `App/public/`) are gitignored — `public/` is regenerated by every sync.

---

## Release ritual (every native update, ~30–60 min)

The PWA still deploys itself on every push — this ritual is only for the App
Store build, so batch it (weekly or fortnightly); anything urgent reaches PWA
users in minutes regardless.

1. `git pull` — the web code is whatever the branch holds; nothing native to
   merge.
2. `pnpm sync:ios` — rebuilds the web assets (no service worker) and copies
   them into the Xcode project.
3. Bump **Version** (user-facing, e.g. 1.3.0) and **Build** (must increase
   every upload) in Xcode → App target → General.
4. Xcode → **Product → Archive** → **Distribute App → App Store Connect**.
5. App Store Connect → the new build appears after ~15 min of processing →
   attach it to a new version, write the "What's New" text, **Submit for
   Review**. After the first approval, reviews usually clear within a day.
   Optional: **phased release** rolls it out over 7 days with a halt button.
6. TestFlight needs none of step 5 — testers get the build from step 4 within
   the hour.

**Discipline that starts here:** once versions linger on users' phones, every
server change (Edge Functions, SQL, sync payload shape) must keep working for
clients several versions old. Never assume the newest client; default every
field read from the network (the `normalise()` pattern in
`src/app/lib/adminStats.ts` is the house style for this).

---

## Moving a user from the PWA to the App Store app

The two are **separate storage worlds**. The PWA's data lives in Safari's
storage for `pietrozambo-tech.github.io`; the native app is its own container
and **cannot read a byte of it** — iOS provides no bridge between a website's
storage and an app's. Nothing is lost by installing the app (the PWA and its
data stay exactly where they are), but nothing carries over by itself either.

- **Signed-in users: seamless, nothing to do.** Their ledger lives in
  Supabase. Install the app, sign in with the same Google/Apple account, and
  the cloud pull restores everything. This is the migration path — the app's
  job is to funnel people onto it.
- **Guests: a manual bridge, or sign-in.** Their data exists only inside the
  PWA. Either sign in once in the PWA (uploads the ledger) and then sign in
  in the app — or Settings → Export backup in the PWA, then Import in the
  app. The guest backup nudge and the export/import path are the safety net
  here, and this is the strongest argument for both.
- **Device-local preferences reset** (theme, notification toggles, nudge
  clocks): they are deliberately never synced or backed up, so the app starts
  from defaults. Cosmetic, self-healing.
- **Keep the PWA published.** It is the instant-update channel, the Android
  story, and the only home for guests who never migrate. The App Store build
  is an additional door, not a replacement.

Worth building when the app ships: a small "Moving to the app?" pointer in the
PWA for guests, wired to the existing export flow.
