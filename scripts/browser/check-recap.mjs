// The monthly recap card, on the first of the month - and the bug that made
// it immortal.
//
// Reported verbatim on Sep 1: "I dismissed and clicked on it, but keep
// getting it every time I change tab or close the app." The dismissal itself
// always worked - in ONE context. The installed PWA and a Safari tab (or a
// page iOS suspended and later resumed) each keep the prefs they woke up
// with, and the copy that never saw the dismissal kept showing August.
// The fix converges every live context on the stored copy (storage event +
// visibilitychange); this file proves the card shows once, stays dismissed
// across a relaunch, and drops out of a SECOND live tab the moment the first
// one dismisses it.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const REF = 'kxaqapcrbmuqulkltxum';
const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

// A session valid against the FAKE clock below, not the real one.
const freshSession = () => {
  const soon = Math.floor(new Date(2026, 8, 1, 12, 0, 0).getTime() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return {
    access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', exp: soon, aud: 'authenticated' })}.s`,
    token_type: 'bearer', expires_in: 3600, expires_at: soon, refresh_token: 'good',
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'p@example.com', app_metadata: { provider: 'google' }, created_at: '2026-01-01T00:00:00Z' },
  };
};
const seed = ([ref, session]) => {
  const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en' });
  // recap on; every other card answered, so the recap is the one due.
  put('nudges', { tips: false, recap: true, lastBackupAt: '2026-08-30T10:00:00.000Z', installDismissed: true, customizeDismissed: true });
  const cat = { id: 'food', name: 'Food', type: 'expense', icon: 'Utensils', color: 'text-orange-600', bgColor: 'bg-orange-50', selectedBg: 'bg-orange-100', subcategories: [] };
  put('categories', [cat]);
  put('income-categories', []);
  put('sources', [{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]);
  put('transactions', ['2026-08-05', '2026-08-08', '2026-08-12', '2026-08-15', '2026-08-20', '2026-08-22'].map((date, i) => ({
    id: 't' + i, date, type: 'expense', amount: 20, baseAmount: 20, currency: 'EUR', sourceId: 'cash',
    category: cat, createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z`,
    recurrence: 'Never repeat', description: 'Row ' + i,
  })));
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session));
};
// Sep 1 2026, 10:00 - the morning the report card is due.
const fakeClock = () => {
  const Real = Date;
  const OFFSET = new Real(2026, 8, 1, 10, 0, 0).getTime() - Real.now();
  class FakeDate extends Real {
    constructor(...args) { if (args.length) super(...args); else super(Real.now() + OFFSET); }
    static now() { return Real.now() + OFFSET; }
  }
  window.Date = FakeDate;
};

const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route(/supabase\.co/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await ctx.addInitScript(seed, [REF, freshSession()]);
await ctx.addInitScript(fakeClock);

const boot = async () => {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  return p;
};

// Two live copies of the app, same storage - the installed PWA and the
// Safari tab that showed the bug.
const a = await boot();
const b2 = await boot();
ok(await a.locator('[data-nudge="recap"]').count() === 1, 'Sep 1: the August report card is due');
ok((await a.locator('[data-nudge="recap"]').innerText()).includes('August'),
  'and it names the month it summarises');
ok(await b2.locator('[data-nudge="recap"]').count() === 1, 'a second live tab shows it too');

await a.locator('[data-nudge-dismiss]').click();
await a.waitForTimeout(400);
ok(await a.locator('[data-nudge="recap"]').count() === 0, 'the X answers it where it was tapped');
const stored = await a.evaluate(() => JSON.parse(localStorage.getItem('expense-tracker.v1.nudges') ?? '{}'));
ok(stored.recapSeen === '2026-09', `and the answer is written down for the month (${stored.recapSeen})`);

// The other tab learns of the dismissal through the storage event - no
// reload, no second dismissal. This is the reported bug, pinned.
await b2.waitForTimeout(600);
ok(await b2.locator('[data-nudge="recap"]').count() === 0,
  'the OTHER live copy drops the card on its own - dismissed means dismissed everywhere');

// And the relaunch: once per month means the next launch stays quiet.
await a.reload({ waitUntil: 'networkidle' });
await a.waitForTimeout(1500);
ok(await a.locator('[data-nudge="recap"]').count() === 0, 'closing and reopening the app does not resurrect it');

// ── the review pointer - the OTHER August line, reported on a screenshot ──
//
// "August summary >" under the segment toggle. Its "seen" lived in component
// state, which dies on every tab switch and every relaunch - so tapping it
// hid it for seconds and it greeted the user again all morning. One tap a
// month is the contract, and the tap is now written down.
ok(await a.locator('[data-review-pointer]').count() === 1
  && (await a.locator('[data-review-pointer]').innerText()).includes('August'),
  'Sep 1: the "August summary" pointer is on the new month');
await a.locator('[data-review-pointer]').click();
await a.waitForTimeout(600);
const heroText = await a.locator('body').innerText();
ok(heroText.includes('August 2026'), 'tapping it walks back to August');
ok(await a.locator('[data-review-pointer]').count() === 0, 'and the pointer considers itself heard');
const stored2 = await a.evaluate(() => JSON.parse(localStorage.getItem('expense-tracker.v1.nudges') ?? '{}'));
ok(stored2.reviewSeen === '2026-09', `written down for the month (${stored2.reviewSeen})`);
// The reported bug, pinned: a remount (tab switch, app relaunch) must not
// resurrect it.
await a.reload({ waitUntil: 'networkidle' });
await a.waitForTimeout(1500);
ok(await a.locator('[data-review-pointer]').count() === 0,
  'changing tab or reopening the app does not bring it back');

await ctx.close();
console.log(fail.length ? `\n${fail.length} FAILED` : '\nonce per month means once');
await b.close();
process.exit(fail.length ? 1 : 0);
