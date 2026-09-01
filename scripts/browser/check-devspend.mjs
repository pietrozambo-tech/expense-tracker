// The AI spend, on the screen where it is actually looked at.
//
// It shipped inside the Users dashboard - two taps and a "Load user stats"
// button away, under thirty days of email addresses it has nothing to do
// with. A number whose whole job is to catch a surprise early has to be
// visible the moment the Developer screen opens, or it is not doing that job.
//
// The admin-stats function is played by this file: what is under test is the
// screen, not the server's arithmetic (that has test:adminstats).
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const REF = 'kxaqapcrbmuqulkltxum';
const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

const freshSession = () => {
  const soon = Math.floor(Date.now() / 1000) + 3600;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return {
    access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', exp: soon, aud: 'authenticated' })}.s`,
    token_type: 'bearer', expires_in: 3600, expires_at: soon, refresh_token: 'good',
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'p@example.com', app_metadata: { provider: 'google' }, created_at: '2026-01-01T00:00:00Z' },
  };
};
const seed = ([ref, session, today]) => {
  const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en' });
  put('nudges', { tips: false, recap: false, installDismissed: true, customizeDismissed: true });
  put('categories', [{ id: 'food', name: 'Food', type: 'expense', icon: 'Utensils', color: 'text-orange-600', bgColor: 'bg-orange-50', selectedBg: 'bg-orange-100', subcategories: [] }]);
  put('income-categories', []);
  put('sources', []);
  put('transactions', []);
  // The developer screen is behind a code; this device has already answered it.
  put('dev-unlocked', true);
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session));
  localStorage.setItem('stub-today', today);
};

const today = new Date().toISOString().slice(0, 10);
// What admin-stats answers: two days of imports, priced at Haiku's rates.
// 40K in + 8K out today = 40*1 + 8*5 = $0.08 per million... in numbers this
// small the card says "<$0.01", which is itself the assertion below.
const STATS = {
  days: [], totals: { accounts: 1, active7: 1, active30: 1, new7: 0, new30: 0 }, includeSelf: true,
  aiModel: 'claude-haiku-4-5',
  aiSpend: [
    { day: today, conversions: 3, tokensIn: 4_000_000, tokensOut: 400_000 },
    { day: '2026-08-31', conversions: 1, tokensIn: 1_000_000, tokensOut: 100_000 },
  ],
};

let statsCalls = 0;
const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, locale: 'en-GB' });
// Routes are matched NEWEST first, so the broad Supabase stub is registered
// BEFORE the function's own route - the other way round it answers "{}" to
// admin-stats and the screen is tested against nothing.
await ctx.route(/supabase\.co/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await ctx.route(/functions\/v1\/admin-stats/, (r) => {
  statsCalls += 1;
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STATS) });
});
await ctx.addInitScript(seed, [REF, freshSession(), today]);
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
await p.getByRole('button', { name: 'Settings' }).first().click();
await p.waitForTimeout(600);

// Into Developer, the way the owner gets there: the small spanner at the
// foot of Settings, which this device has already unlocked.
await p.locator('[data-dev-entry]').click();
await p.waitForTimeout(1400);
ok(await p.locator('[data-ai-spend]').count() === 1,
  'the AI spend is on the Developer screen itself, with no button to press first');
ok(statsCalls === 1, `and it fetched itself once on opening (${statsCalls})`);

const card = await p.locator('[data-ai-spend]').innerText();
ok(/claude-haiku-4-5/.test(card), `naming the model it is priced at (${card.split('\n')[0]})`);
// 4M in at $1 + 400K out at $5 = $4 + $2 = ~$6.00 today.
ok(/~\$6\.00/.test(card), `today's bill in money, not tokens (${card.replace(/\n/g, ' | ')})`);
// Plus yesterday: 5M in + 500K out = $5 + $2.50 = ~$7.50 across both days.
ok(/~\$7\.50/.test(card), 'and the window total beside it');
ok(/3 conversions/.test(card), 'with the conversions those tokens paid for');

// It must be ABOVE the Users entry - the thing you glance at comes before
// the thing you go into.
const order = await p.evaluate(() => {
  const spend = document.querySelector('[data-ai-spend]');
  const users = document.querySelector('[data-dev-users-entry]');
  if (!spend || !users) return 'missing';
  return spend.compareDocumentPosition(users) & Node.DOCUMENT_POSITION_FOLLOWING ? 'before' : 'after';
});
ok(order === 'before', `and it comes before the Users dashboard (${order})`);

// The Users screen still works, and does NOT refetch what is already held.
await p.screenshot({ path: `${process.env.CHECK_OUT ?? new globalThis.URL('.artifacts', import.meta.url).pathname}/devspend.png` });
await p.locator('[data-dev-users-entry]').click();
await p.waitForTimeout(800);
ok(statsCalls === 1, `opening Users reuses the answer already fetched (${statsCalls})`);
ok(await p.locator('[data-ai-spend]').count() === 0,
  'and the spend is no longer duplicated inside it');

await p.screenshot({ path: `${process.env.CHECK_OUT ?? new globalThis.URL('.artifacts', import.meta.url).pathname}/devspend-users.png` });
await ctx.close();
console.log(fail.length ? `\n${fail.length} FAILED` : '\nthe bill is where it is read');
await b.close();
process.exit(fail.length ? 1 : 0);
