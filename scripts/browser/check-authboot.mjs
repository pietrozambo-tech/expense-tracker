// The app must always finish booting.
//
// The whole UI sits behind `authLoading` (App renders a bare logo splash while
// it is true), and that flag was cleared in exactly one place: the .then() of
// supabase.auth.getSession(). No catch, no deadline. A stored token that had
// expired sent getSession() to the network to refresh it, and when that
// request never came back the app stayed on the logo forever - reported on
// device two days after a launch that worked, with nothing deployed between.
//
// Every request to the auth host is intercepted here; nothing reaches the real
// project. What is asserted is the invariant, not the mechanism: whatever
// getSession() does or fails to do, the user gets a usable screen.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const OUT = process.env.CHECK_OUT ?? new globalThis.URL('.artifacts', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
const REF = 'kxaqapcrbmuqulkltxum';

const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

// A stored session whose access token expired an hour ago - the state every
// returning user is in, and the one that triggers a refresh on launch.
const staleSession = () => {
  const past = Math.floor(Date.now() / 1000) - 3600;
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', exp: past, aud: 'authenticated' })}.sig`;
  return {
    access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: past,
    refresh_token: 'stale-refresh-token',
    user: {
      id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'pietro@example.com',
      app_metadata: { provider: 'google' }, user_metadata: { full_name: 'Pietro' },
      created_at: '2026-01-01T00:00:00Z',
    },
  };
};

// authBehaviour: 'hang' (never answers) | 'abort' (fails outright) | 'none'
const boot = async ({ authBehaviour, signedIn }) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB' });
  // Nothing may leave for the real project, in any of these scenarios.
  let escaped = 0;
  await ctx.route(`**${REF}**`, (route) => {
    escaped += 1;
    if (authBehaviour === 'abort') return route.abort('failed');
    if (authBehaviour === 'hang') return; // held open, never answered
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await ctx.route('**posthog**/**', (r) => r.fulfill({ status: 200, body: '{}' }));
  await ctx.addInitScript((args) => {
    const [ref, session] = args;
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    localStorage.setItem('expense-tracker.v1.settings', JSON.stringify({
      onboarded: true, userName: 'Pietro', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en',
    }));
    localStorage.setItem('expense-tracker.v1.nudges', JSON.stringify({ tips: false, recap: false }));
    if (session) localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session));
    else localStorage.setItem('expense-tracker.v1.guest', 'true');
  }, [REF, signedIn ? staleSession() : null]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  return { ctx, p, escaped: () => escaped };
};

// Has the app got past the splash? The splash is the logo and nothing else,
// so "past it" means a screen the user can actually act on.
const usable = (p) => p.evaluate(() => {
  const txt = document.body.innerText || '';
  const buttons = [...document.querySelectorAll('button')].length;
  return { hasText: txt.trim().length > 0, buttons, sample: txt.trim().slice(0, 60) };
});

// Wait for the app to become usable, and report how long it took. A fixed
// sleep was the wrong tool: supabase-js retries a failed refresh internally
// with its own backoff, so "has it recovered yet" is a question about the
// deadline, not about any one request.
const waitUsable = async (p, capMs) => {
  const t0 = Date.now();
  for (;;) {
    const s = await usable(p);
    if (s.buttons > 0) return { ...s, ms: Date.now() - t0 };
    if (Date.now() - t0 > capMs) return { ...s, ms: Date.now() - t0, timedOut: true };
    await p.waitForTimeout(250);
  }
};

// 1. The refresh request never answers. This is the reported failure.
{
  const { ctx, p } = await boot({ authBehaviour: 'hang', signedIn: true });
  await p.waitForTimeout(1500);
  const early = await usable(p);
  ok(!early.hasText && early.buttons === 0,
    'while the session is resolving the app shows the bare splash (no text, no buttons)');

  // The session deadline is 2.5s, and with no local ledger the cloud pull's
  // own deadline follows it; allow both room, then it must have moved on.
  const late = await waitUsable(p, 20000);
  ok(!late.timedOut,
    `a refresh that never answers no longer wedges the app (usable after ${late.ms}ms, "${late.sample}")`);
  await p.screenshot({ path: `${OUT}/authboot-hang.png` });
  await ctx.close();
}

// 2. The refresh fails outright. supabase-js retries this one on its own
//    schedule, so the deadline - not the request - is what has to save it.
//    With no local ledger to show, the cloud pull's own deadline stacks on
//    top of the session one; both are bounded, which is the whole point.
{
  const { ctx, p } = await boot({ authBehaviour: 'abort', signedIn: true });
  const s = await waitUsable(p, 20000);
  ok(!s.timedOut, `a refresh that fails outright lands on a usable screen too (${s.ms}ms, "${s.sample}")`);
  await ctx.close();
}

// 3. No regression: a guest with nothing to refresh still boots straight in,
//    and fast - the deadline must not become the normal path.
{
  const t0 = Date.now();
  const { ctx, p, escaped } = await boot({ authBehaviour: 'none', signedIn: false });
  await p.waitForSelector('button', { timeout: 15000 });
  const ms = Date.now() - t0;
  ok(ms < 6000, `a guest still boots without waiting on the deadline (${ms}ms)`);
  ok(escaped() === 0, 'and a guest launch asks the auth host for nothing at all');
  await ctx.close();
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await b.close();
process.exit(fail.length ? 1 : 0);
