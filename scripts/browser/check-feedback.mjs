// The four things an interaction audit found the app answering badly.
//
// Not features - answers. Each one is a moment where the finger did
// something and the app said nothing, or said something different from what
// it says everywhere else:
//
//   the tab you return to      starts at the top instead of where you left it
//   a row you swiped away      goes without an undo, while fifty ticked rows get one
//   the greyed Save            swallows the tap and never says what is missing
//   the tap outside a sheet    closes the filter sheets, ignores the category ones
//
// Driven as a finger would, with a real swipe (the row listens for touch, not
// for a mouse) and a real tap on the dimmed strip.
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
// Enough rows that every tab is taller than the screen - the whole point of
// remembering where you were.
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
  for (let i = 0; i < 120; i += 1) {
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
p.on('pageerror', (e) => { console.log('[pageerror]', e.message); fail.push('pageerror'); });
await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForTimeout(1600);
const body = () => p.locator('body').innerText();
const rowCount = () => p.evaluate(() => JSON.parse(localStorage.getItem('expense-tracker.v1.transactions') ?? '[]').length);
const scrollY = () => p.evaluate(() => Math.round(window.scrollY));

// ── where you left off ───────────────────────────────────────────────────
await p.evaluate(() => window.scrollTo(0, 700));
await p.waitForTimeout(400);
const left = await scrollY();
ok(left > 300, `the Dashboard is long enough to scroll (${left}px)`);
await p.getByRole('button', { name: 'Trend' }).first().click();
await p.waitForTimeout(800);
ok(await scrollY() < 50, 'a tab you have not visited opens at the top');
await p.evaluate(() => window.scrollTo(0, 400));
await p.waitForTimeout(400);
const trendLeft = await scrollY();
await p.getByRole('button', { name: 'Dashboard' }).first().click();
await p.waitForTimeout(1000);
const back = await scrollY();
ok(Math.abs(back - left) < 60, `and coming back puts you where you were (${left}px -> ${back}px)`);
await p.getByRole('button', { name: 'Trend' }).first().click();
await p.waitForTimeout(1000);
ok(Math.abs(await scrollY() - trendLeft) < 60,
  `each tab remembers its OWN place, not the last one scrolled (Trend left at ${trendLeft}px, back at ${await scrollY()}px)`);

// ── the row you swiped away ──────────────────────────────────────────────
await p.getByRole('button', { name: 'Activity' }).first().click();
await p.waitForTimeout(900);
const n0 = await rowCount();
const moved = await p.evaluate(async () => {
  const row = [...document.querySelectorAll('button')].find((x) => /Row \d+/.test(x.innerText));
  if (!row) return null;
  const r = row.getBoundingClientRect();
  const y = r.top + r.height / 2;
  const mk = (type, x) => new TouchEvent(type, {
    bubbles: true, cancelable: true,
    touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: row, clientX: x, clientY: y })],
    changedTouches: [new Touch({ identifier: 1, target: row, clientX: x, clientY: y })],
  });
  row.dispatchEvent(mk('touchstart', r.right - 40));
  for (let dx = 10; dx <= 120; dx += 10) {
    row.dispatchEvent(mk('touchmove', r.right - 40 - dx));
    await new Promise((res) => requestAnimationFrame(res));
  }
  row.dispatchEvent(mk('touchend', r.right - 160));
  await new Promise((res) => setTimeout(res, 400));
  return getComputedStyle(row).transform;
});
ok(/matrix\(1, 0, 0, 1, -\d/.test(moved ?? ''), `a sideways swipe opens the row (${moved})`);
await p.locator('[aria-label="Delete expense"]').first().click();
await p.waitForTimeout(700);
// The swipe's delete asks first - and its sentence has to be true about
// what follows, which is why the undo below changed the words with it.
const dialog = await body();
ok(/Delete Expense\?/i.test(dialog), 'the swipe asks before removing anything');
ok(!/cannot be undone/i.test(dialog),
  'and no longer claims the delete is final - it is undoable for a few seconds');
await p.locator('button').filter({ hasText: /^Delete$/ }).last().click();
await p.waitForTimeout(900);
const n1 = await rowCount();
ok(n1 === n0 - 1, `the row goes (${n0} -> ${n1})`);
// "Undo", the word - not "undone" inside a sentence, which is what the
// first draft of this check matched and passed on.
ok(await p.locator('button').filter({ hasText: /^Undo$/ }).count() === 1,
  'and the toast offers Undo - the same answer fifty ticked rows get');
await p.locator('button').filter({ hasText: /^Undo$/ }).first().click();
await p.waitForTimeout(900);
ok(await rowCount() === n0, `tapping it puts the row back (${await rowCount()})`);

// ── the greyed Save ──────────────────────────────────────────────────────
await p.getByRole('button', { name: /add/i }).last().click();
await p.waitForTimeout(900);
await p.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 400); });
await p.waitForTimeout(400);
const save = p.locator('button').filter({ hasText: /Save|Add expense/i }).last();
ok(await save.getAttribute('aria-disabled') === 'true', 'with nothing typed the Save still READS as unavailable');
await save.click({ force: true });
await p.waitForTimeout(700);
ok(await p.evaluate(() => document.activeElement?.hasAttribute?.('data-amount-input') ?? false),
  'but tapping it now answers: the cursor lands in the empty amount');
ok(await scrollY() < 80, 'and the form scrolls to where the answer is');

// ── the tap outside ──────────────────────────────────────────────────────
await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
await p.getByRole('button', { name: 'Settings' }).first().click();
await p.waitForTimeout(700);
await p.getByText('Categories', { exact: false }).first().click();
await p.waitForTimeout(900);
await p.locator('button').filter({ hasText: /Add category|New category/i }).first().click();
await p.waitForTimeout(800);
ok(/Preview/i.test(await body()), 'the add-category sheet opens');
await p.locator('input').first().click();
await p.waitForTimeout(300);
ok(/Preview/i.test(await body()), 'a tap INSIDE it changes nothing');
// The same greyed-Save question, asked in the sheet where it bites hardest:
// 1036px of icons and colours in a 614px window, so by the time you have
// picked them the name field is off screen and the keyboard is gone.
const catSave = p.locator('button').filter({ hasText: /^Save$/ }).last();
ok(await catSave.getAttribute('aria-disabled') === 'true', 'its Save reads as unavailable with no name typed');
await p.evaluate(() => { document.activeElement?.blur?.(); });
const scroller = p.locator('.overflow-y-auto').last();
await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
await p.waitForTimeout(400);
await catSave.click({ force: true });
await p.waitForTimeout(800);
ok(await p.evaluate(() => document.activeElement?.tagName === 'INPUT'),
  'and tapping it puts the cursor back in the name, instead of swallowing the tap');
await p.mouse.click(195, 25);
await p.waitForTimeout(700);
ok(!/Preview/i.test(await body()),
  'and a tap on the dimmed strip closes it, like every other sheet in the app');

await ctx.close();
console.log(fail.length ? `\n${fail.length} FAILED` : '\nevery tap is answered');
await b.close();
process.exit(fail.length ? 1 : 0);
