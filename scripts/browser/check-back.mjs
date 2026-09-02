// The system back gesture, on the sheets a tester will actually open.
//
// Before this the app pushed no history at all: back left the page, which in
// an installed PWA means the app closes with the sheet still open and
// whatever was typed in it gone. The rule now is one press, one sheet - and
// the press after the last one still leaves, because back that never exits is
// its own trap.
//
// Driven with page.goBack(), which is the same popstate the gesture fires.
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
const seed = ([ref, session]) => {
  const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en', monthlyBudget: 2000 });
  put('nudges', { tips: false, recap: false, installDismissed: true, customizeDismissed: true });
  const cat = (id, name, icon, colour, subs) => ({
    id, name, type: 'expense', icon, color: `text-${colour}-600`, bgColor: `bg-${colour}-50`,
    selectedBg: `bg-${colour}-100`, subcategories: subs,
  });
  const cats = [
    cat('food', 'Food & Drinks', 'Utensils', 'orange', ['Restaurants']),
    cat('travel', 'Travel', 'Plane', 'sky', ['Hotel']),
    cat('home', 'Housing', 'Home', 'blue', ['Rent']),
  ];
  put('categories', cats);
  put('income-categories', [{ id: 'sal', name: 'Salary', type: 'income', icon: 'Wallet', color: 'text-teal-600', bgColor: 'bg-teal-50', selectedBg: 'bg-teal-100', subcategories: [] }]);
  put('sources', [{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]);
  const rows = [];
  const now = new Date();
  for (let i = 0; i < 40; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - Math.floor(i / 4));
    const date = d.toISOString().slice(0, 10);
    const c = cats[i % 3];
    rows.push({
      id: `t${i}`, date, type: 'expense', amount: 5 + (i % 30),
      baseAmount: 5 + (i % 30), currency: 'EUR', sourceId: 'cash',
      category: c, subcategory: c.subcategories[0], description: `Row ${i} bought`,
      createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z`, recurrence: 'Never repeat',
    });
  }
  put('transactions', rows);
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session));
};

const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB', hasTouch: true, isMobile: true });
await ctx.route(/supabase\.co/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await ctx.addInitScript(seed, [REF, freshSession()]);
const p = await ctx.newPage();
// Errors count until we deliberately walk out of the app. Past that the page
// is about:blank, where the app's own intervals are denied localStorage -
// a driver artefact, not something a phone ever sees.
let leftOnPurpose = false;
p.on('pageerror', (e) => {
  if (leftOnPurpose) return;
  console.log('[pageerror]', e.message); fail.push('pageerror');
});
await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForTimeout(1600);

const body = () => p.locator('body').innerText();
const back = async () => { await p.goBack().catch(() => {}); await p.waitForTimeout(700); };
const alive = async () => /Dashboard|Activity|Settings/.test(await body().catch(() => ''));

// ── the filter sheet ─────────────────────────────────────────────────────
await p.getByRole('button', { name: 'Activity' }).first().click();
await p.waitForTimeout(900);
await p.locator('button').filter({ hasText: /^Filters$/ }).first().click();
await p.waitForTimeout(700);
const sheetUp = () => p.evaluate(() => !!document.querySelector('.animate-slide-up'));
ok(await sheetUp(), 'the filter sheet is open');
await back();
ok(!(await sheetUp()), 'back closes it');
ok(await alive(), 'and leaves you IN the app, not on a blank page');

// ── the period sheet, through the same wrapper ───────────────────────────
await p.locator('[data-period-chip]').first().click();
await p.waitForTimeout(700);
ok(await sheetUp(), 'the period sheet is open');
await back();
ok(!(await sheetUp()) && await alive(), 'back closes that one too');

// ── the Add sheet, which holds typed work ────────────────────────────────
await p.getByRole('button', { name: /add/i }).last().click();
await p.waitForTimeout(900);
ok(await p.locator('[data-amount-input]').count() === 1, 'the Add sheet is open');
await back();
await p.waitForTimeout(400);
ok(await p.locator('[data-amount-input]').count() === 0, 'back closes it, the way its X does');
ok(await alive(), 'still in the app');

// ── two deep: a sheet opened over another sheet ──────────────────────────
await p.getByRole('button', { name: 'Settings' }).first().click();
await p.waitForTimeout(800);
await p.getByText('Categories', { exact: false }).first().click();
await p.waitForTimeout(900);
await p.locator('button').filter({ hasText: /^Add category$/i }).first().click();
await p.waitForTimeout(800);
ok(/Preview/i.test(await body()), 'the add-category sheet is open over the Categories screen');
await p.locator('input[type=text]').first().fill('Bikes');
await p.waitForTimeout(200);
await back();
ok(!/Preview/i.test(await body()), 'back closes the sheet');
ok(/Categor/i.test(await body()) && await alive(),
  'and lands on the Categories screen underneath - not out of the app');

// ── a sheet closed by its own X leaves no phantom entry ──────────────────
// The disarm path: closing without the gesture has to hand the history entry
// back, or the next press is swallowed doing nothing and the gesture feels
// broken. Cancel, then straight back.
await p.locator('button').filter({ hasText: /^Add category$/i }).first().click();
await p.waitForTimeout(800);
ok(/Preview/i.test(await body()), 'a sheet is open again');
await p.locator('button').filter({ hasText: /^Cancel$/ }).last().click();
await p.waitForTimeout(700);
ok(!/Preview/i.test(await body()), 'its Cancel closes it');

// ── the press that SHOULD leave ──────────────────────────────────────────
// With nothing open, back is back: an app that never exits is its own trap,
// and a swallowed press here is exactly the phantom entry above.
const beforeUrl = p.url();
leftOnPurpose = true;
await back();
ok(p.url() !== beforeUrl || !(await alive()),
  'with no sheet open, back still leaves the app');

await ctx.close();
console.log(fail.length ? `\n${fail.length} FAILED` : '\nback closes what is on top, once per press');
await b.close();
process.exit(fail.length ? 1 : 0);
