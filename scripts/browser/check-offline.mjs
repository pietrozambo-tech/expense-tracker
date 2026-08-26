// Getting into your own app without a network.
//
// Supabase access tokens last an hour. Past that, getSession() has to refresh
// over the network before it will tell you who is signed in, and it answers
// `session: null` when that refresh fails - so an hour offline turned a
// signed-in user into a stranger at the sign-in screen, with their own ledger
// on the device behind it and no connection to sign in with.
//
// Airplane mode looked fine only by luck of timing: the token had not expired,
// so nothing went to the network. Every case below therefore starts from an
// EXPIRED token, which is the state any returning user is actually in.
//
// The distinction that has to hold: "we could not ask" keeps you signed in,
// "we asked and were told no" does not.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const OUT = process.env.CHECK_OUT ?? new globalThis.URL('.artifacts', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
const REF = 'kxaqapcrbmuqulkltxum';

const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

const expiredSession = () => {
  const past = Math.floor(Date.now() / 1000) - 7200; // two hours ago
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', exp: past, aud: 'authenticated' })}.sig`,
    token_type: 'bearer', expires_in: 3600, expires_at: past, refresh_token: 'stored-refresh-token',
    user: {
      id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'pietro@example.com',
      app_metadata: { provider: 'google' }, user_metadata: { full_name: 'Pietro' },
      created_at: '2026-01-01T00:00:00Z',
    },
  };
};

// network: 'airplane' (fails instantly) | 'nocoverage' (never answers)
//        | 'rejected' (the server says the refresh token is dead) | 'online'
const boot = async ({ network, withLocalData = true }) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB' });
  await ctx.route(`**${REF}**`, (route) => {
    if (network === 'airplane') return route.abort('internetdisconnected');
    if (network === 'nocoverage') return; // held open, never answered
    if (network === 'rejected') {
      return route.fulfill({
        status: 400, contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid Refresh Token: Refresh Token Not Found' }),
      });
    }
    // 'online': a working refresh, then an account with no cloud row yet.
    if (route.request().url().includes('/auth/v1/token')) {
      const future = Math.floor(Date.now() / 1000) + 3600;
      const s = expiredSession();
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ...s, access_token: 'fresh.token.sig', expires_at: future, expires_in: 3600 }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await ctx.route('**posthog**/**', (r) => r.fulfill({ status: 200, body: '{}' }));
  await ctx.addInitScript((args) => {
    const [ref, session, seedData] = args;
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session));
    localStorage.setItem('expense-tracker.v1.settings', JSON.stringify({
      onboarded: true, userName: 'Pietro', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en',
    }));
    localStorage.setItem('expense-tracker.v1.nudges', JSON.stringify({ tips: false, recap: false }));
    if (!seedData) return;
    // This device's own ledger - the thing that must never be behind a login.
    localStorage.setItem('expense-tracker.v1.owner', JSON.stringify({ id: 'u1', email: 'pietro@example.com' }));
    const cat = { id: 'travel', name: 'Travel', type: 'expense', icon: 'Plane', color: 'text-sky-600', bgColor: 'bg-sky-50', selectedBg: 'bg-sky-100', subcategories: [] };
    const d = new Date(); d.setDate(1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    localStorage.setItem('expense-tracker.v1.categories', JSON.stringify([cat]));
    localStorage.setItem('expense-tracker.v1.sources', JSON.stringify([{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]));
    localStorage.setItem('expense-tracker.v1.transactions', JSON.stringify([{
      id: 'e1', date: `${ym}-05`, type: 'expense', amount: 4321, baseAmount: 4321, currency: 'EUR',
      sourceId: 'cash', category: cat, createdAt: `${ym}-05T10:00:00.000Z`, updatedAt: `${ym}-05T10:00:00.000Z`,
      recurrence: 'Never repeat', description: 'Offline marker',
    }]));
  }, [REF, expiredSession(), withLocalData]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  return { ctx, p };
};

// Wait until the app settles into something identifiable, and say what it is.
const settle = async (p, capMs) => {
  const t0 = Date.now();
  for (;;) {
    const s = await p.evaluate(() => {
      const txt = document.body.innerText || '';
      return {
        signIn: /Continue with (Apple|Google)/.test(txt),
        inApp: /Dashboard/.test(txt) && /Settings/.test(txt),
        txt: txt.trim().slice(0, 80),
      };
    });
    if (s.signIn || s.inApp) return { ...s, ms: Date.now() - t0 };
    if (Date.now() - t0 > capMs) return { ...s, ms: Date.now() - t0, stuck: true };
    await p.waitForTimeout(250);
  }
};

// 1. Airplane mode with an expired token: the refresh fails instantly.
{
  const { ctx, p } = await boot({ network: 'airplane' });
  const s = await settle(p, 20000);
  ok(s.inApp, `airplane mode with an expired token opens the app, not the login screen (${s.ms}ms)`);
  ok(!s.signIn, 'and never shows a sign-in screen there is no network to use');
  ok(await p.getByText('4,321', { exact: false }).count() > 0, 'the ledger on the device is right there');
  await p.screenshot({ path: `${OUT}/offline-airplane.png` });
  await ctx.close();
}

// 2. A bar of signal but no working data connection: the request just hangs.
//    This is the case the owner reported.
{
  const { ctx, p } = await boot({ network: 'nocoverage' });
  const s = await settle(p, 20000);
  ok(s.inApp, `no coverage opens the app too - same outcome as airplane mode (${s.ms}ms)`);
  ok(!s.signIn, 'no redirect to a login screen that could not be completed anyway');
  await p.screenshot({ path: `${OUT}/offline-nocoverage.png` });
  await ctx.close();
}

// 3. The other side of the distinction: the SERVER says this refresh token is
//    dead. That is an answer, and it has to be obeyed - auth-js clears the
//    stored session, so there is nothing left to fall back to.
{
  const { ctx, p } = await boot({ network: 'rejected' });
  const s = await settle(p, 20000);
  ok(s.signIn, `a refresh the server rejects still signs you out, as it must (${s.ms}ms)`);
  ok(!s.inApp, 'a revoked session is not something the offline fallback can resurrect');
  await ctx.close();
}

// 4. No regression online: a working refresh lands signed in, promptly.
{
  const { ctx, p } = await boot({ network: 'online' });
  const s = await settle(p, 20000);
  ok(s.inApp && s.ms < 8000, `a working network still signs in normally and fast (${s.ms}ms)`);
  await ctx.close();
}

// 5. The other gate: a signed-in device with NOTHING local, whose cloud pull
//    hangs. Before the deadline this sat on the loading splash forever.
{
  const { ctx, p } = await boot({ network: 'nocoverage', withLocalData: false });
  const s = await settle(p, 30000);
  ok(!s.stuck, `a fresh device whose cloud pull never answers still gets a screen (${s.ms}ms, "${s.txt}")`);
  await ctx.close();
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await b.close();
process.exit(fail.length ? 1 : 0);
