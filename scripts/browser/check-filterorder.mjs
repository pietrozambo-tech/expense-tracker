// The filters sheet opens shut, in the order people reach for things.
//
// It used to open with Type already expanded - four chips at the top, above
// the two filters most people actually want - so the sheet looked like it was
// already mid-answer and pushed Category and Source down the card. Type is a
// row like the rest now, saying its own value at rest, and the order runs
// from the broadest cut to the narrowest: what it was spent on, the narrower
// slice of that, how it recurs, what paid, where.
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
  put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en' });
  put('nudges', { tips: false, recap: false, installDismissed: true, customizeDismissed: true });
  const cat = (id, name, icon, colour, subs) => ({
    id, name, type: 'expense', icon, color: `text-${colour}-600`, bgColor: `bg-${colour}-50`,
    selectedBg: `bg-${colour}-100`, subcategories: subs,
  });
  const cats = [
    cat('food', 'Food & Drinks', 'Utensils', 'orange', ['Restaurants', 'Groceries']),
    cat('home', 'Housing', 'Home', 'blue', ['Rent']),
  ];
  put('categories', cats);
  put('income-categories', []);
  put('sources', [{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]);
  const rows = [];
  const now = new Date();
  for (let i = 0; i < 20; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - Math.floor(i / 3)));
    const date = d.toISOString().slice(0, 10);
    const c = cats[i % 2];
    rows.push({
      id: `t${i}`, date, type: 'expense', amount: 5 + i,
      baseAmount: 5 + i, currency: 'EUR', sourceId: 'cash',
      category: c, subcategory: c.subcategories[i % c.subcategories.length],
      description: `Row ${i} bought`,
      createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z`,
      // Every third row recurs, so the Type filter has something to find.
      recurrence: i % 3 === 0 ? 'Every month' : 'Never repeat',
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

const order = () => p.evaluate(() =>
  [...document.querySelectorAll('[data-filter-category],[data-filter-subcategory],[data-filter-type],[data-filter-source],[data-filter-trip]')]
    .map((e) => e.getAttribute('data-filter-category') !== null ? 'category'
      : e.getAttribute('data-filter-subcategory') !== null ? 'subcategory'
      : e.getAttribute('data-filter-type') !== null ? 'type'
      : e.getAttribute('data-filter-source') !== null ? 'source' : 'trip'));
const openFilters = async () => {
  await p.getByRole('button', { name: /^Filters/ }).first().click();
  await p.waitForTimeout(600);
};

await p.getByRole('button', { name: 'Activity' }).first().click();
await p.waitForTimeout(900);
await openFilters();

// ── nothing is open before it is asked for ───────────────────────────────
const sheet = await p.locator('.animate-slide-up').last().innerText();
ok(!/One-off/.test(sheet) && !/Imported/.test(sheet),
  'the sheet opens with every filter shut - no options spilled before anyone asked');
ok(await order().then((o) => JSON.stringify(o) === JSON.stringify(['category', 'type', 'source'])),
  `and the rows run broadest-first: ${JSON.stringify(await order())}`);
ok(/Type\nAll/.test(sheet) || /Type[\s\S]{0,4}All/.test(sheet),
  'Type is a row that says its own value at rest, like the ones around it');

// ── it opens a sheet of its own ──────────────────────────────────────────
await p.locator('[data-filter-type]').click();
await p.waitForTimeout(600);
const typeSheet = await p.locator('[data-type-sheet]').innerText();
ok(/One-off/.test(typeSheet) && /Recurring/.test(typeSheet) && /Imported/.test(typeSheet),
  'tapping it opens the four options in a sheet of their own');
const before = await p.locator('[data-row-id]').count();
await p.locator('[data-type-option="Recurring"]').click();
await p.waitForTimeout(800);
const after = await p.locator('[data-row-id]').count();
ok(after > 0 && after < before, `choosing one closes the sheet and cuts the list (${before} -> ${after})`);
ok((await p.locator('[data-filter-chip]').allInnerTexts()).join(' ').includes('Recurring'),
  'and the choice is on the bar as a chip you can tap off');

await openFilters();
ok(/Recurring/.test(await p.locator('[data-filter-type]').innerText()),
  'reopening, the Type row carries what was chosen');

// ── the subcategory row follows the category ─────────────────────────────
ok((await order()).indexOf('subcategory') === -1,
  'with no category chosen there is no Subcategory row - it could only ever say All');
await p.locator('[data-filter-category]').click();
await p.waitForTimeout(600);
await p.locator('button').filter({ hasText: /Food & Drinks/ }).last().click();
await p.waitForTimeout(800);
await openFilters();
const withCat = await order();
ok(JSON.stringify(withCat) === JSON.stringify(['category', 'subcategory', 'type', 'source']),
  `picking one grows the Subcategory row directly under it: ${JSON.stringify(withCat)}`);
await p.locator('[data-filter-subcategory]').click();
await p.waitForTimeout(700);
const subs = await p.locator('body').innerText();
ok(/Restaurants/.test(subs) && !/Rent/.test(subs.split('Restaurants')[1] ?? ''),
  'and it offers that category\'s subcategories, not every one in the app');

// ── the chips read in the same order as the rows ─────────────────────────
await p.keyboard.press('Escape');
await p.mouse.click(195, 14);
await p.waitForTimeout(600);
const chips = await p.locator('[data-filter-chip]').allInnerTexts();
ok(chips.length >= 2 && /Food & Drinks/.test(chips[0]) && /Recurring/.test(chips.join(' ')),
  `the bar lists them in the order the sheet does (${JSON.stringify(chips.map((c) => c.trim()))})`);

await ctx.close();
console.log(fail.length ? `\n${fail.length} FAILED` : '\nthe sheet opens shut, and in order');
await b.close();
process.exit(fail.length ? 1 : 0);
