// The pill that orders the category grid.
//
// The ordering itself is the unit suite's job (pnpm test:catorder). This is
// the part that only exists on screen: that the pill says which order is in
// force without being opened, that choosing one re-lays the grid, and - the
// whole point of it being a preference rather than a toggle - that the choice
// is still there on the next launch.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const OUT = process.env.CHECK_OUT ?? new globalThis.URL('.artifacts', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });

const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

const CATS = [
  { id: 'app', name: 'App', type: 'expense', icon: 'Laptop', color: 'text-blue-600', bgColor: 'bg-blue-50', selectedBg: 'bg-blue-100', subcategories: [] },
  { id: 'food', name: 'Food & Drinks', type: 'expense', icon: 'Utensils', color: 'text-orange-600', bgColor: 'bg-orange-50', selectedBg: 'bg-orange-100', subcategories: [] },
  { id: 'groceries', name: 'Groceries', type: 'expense', icon: 'ShoppingCart', color: 'text-emerald-600', bgColor: 'bg-emerald-50', selectedBg: 'bg-emerald-100', subcategories: [] },
  { id: 'sport', name: 'Sport', type: 'expense', icon: 'Dumbbell', color: 'text-green-600', bgColor: 'bg-green-50', selectedBg: 'bg-green-100', subcategories: [] },
];

// Groceries is the workhorse, Sport has never been used. Alphabetically
// Groceries is third of four; by use it is first.
const seed = (cats) => {
  const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  put('guest', 'true');
  put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en' });
  put('nudges', { tips: false, recap: false });
  put('categories', cats);
  put('sources', [{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]);
  const rows = [];
  const add = (cat, n) => {
    for (let i = 0; i < n; i++) {
      const date = `2026-08-${String((i % 27) + 1).padStart(2, '0')}`;
      rows.push({
        id: `${cat.id}${i}`, date, type: 'expense', amount: 10, baseAmount: 10, currency: 'EUR',
        sourceId: 'cash', category: cat, createdAt: `${date}T10:00:00.000Z`,
        updatedAt: `${date}T10:00:00.000Z`, recurrence: 'Never repeat', description: `${cat.name} ${i}`,
      });
    }
  };
  add(cats[2], 9); // Groceries
  add(cats[1], 5); // Food & Drinks
  add(cats[0], 2); // App
  put('transactions', rows);
};

const openAdd = async (ctx) => {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.locator('.app-dock button').nth(2).click();
  await p.waitForTimeout(800);
  return p;
};
// The CATEGORIES, in the order the grid lays them out. The last tile is the
// one that makes a new category rather than choosing one, and it is always
// last whatever the sort - so it is excluded here rather than pinned to the
// end of every expectation, where it would say nothing about ordering.
const gridNames = (p) =>
  p.evaluate(() => [...document.querySelectorAll('.grid button')]
    .filter((el) => !el.hasAttribute('data-cat-create'))
    .map((el) => el.textContent.trim())
    .filter((n) => n && !/^\d/.test(n)));

const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, locale: 'en-GB' });
await ctx.route(/supabase\.co/, (r) => r.abort());
await ctx.addInitScript(seed, CATS);

{
  const p = await openAdd(ctx);

  ok(await p.locator('[data-cat-order]').count() === 1, 'a pill sits beside the Category label');
  const label = (await p.locator('[data-cat-order]').innerText()).trim();
  // Readable without opening it: the pill IS the answer, not a way to ask.
  ok(label === 'A-Z', `and says which order is in force ("${label}")`);

  const alpha = await gridNames(p);
  ok(alpha.join(', ') === 'App, Food & Drinks, Groceries, Sport',
    `the grid starts alphabetical (${alpha.join(', ')})`);

  await p.locator('[data-cat-order]').click();
  await p.waitForTimeout(350);
  ok(await p.locator('[data-cat-order-menu]').count() === 1, 'tapping it offers the orders');
  ok(await p.locator('[data-cat-order-opt="alpha"]').count() === 1
    && await p.locator('[data-cat-order-opt="used"]').count() === 1, 'both of them');

  await p.locator('[data-cat-order-opt="used"]').click();
  await p.waitForTimeout(500);
  const used = await gridNames(p);
  // 9 Groceries, 5 Food, 2 App, 0 Sport.
  ok(used.join(', ') === 'Groceries, Food & Drinks, App, Sport',
    `choosing Most used re-lays the grid by how often each is used (${used.join(', ')})`);
  ok((await p.locator('[data-cat-order]').innerText()).trim() === 'Most used', 'and the pill says so');
  await p.screenshot({ path: `${OUT}/catorder.png` });

  // The point of a preference: it outlives the sheet it was set in.
  await p.getByLabel('Close').click();
  await p.waitForTimeout(700);
  await p.locator('.app-dock button').nth(2).click();
  await p.waitForTimeout(700);
  const again = await gridNames(p);
  ok(again.join(', ') === 'Groceries, Food & Drinks, App, Sport', 'reopening Add keeps it');
  await p.close();
}

// ...and the next launch. Same context, so the same localStorage: this is the
// reload a person does without thinking about it.
{
  const p = await openAdd(ctx);
  const stored = await p.evaluate(() =>
    JSON.parse(localStorage.getItem('expense-tracker.v1.settings') ?? '{}').categoryOrder);
  ok(stored === 'used', `the choice is written down, not held in memory ("${stored}")`);
  const after = await gridNames(p);
  ok(after.join(', ') === 'Groceries, Food & Drinks, App, Sport', 'and survives a fresh launch');

  // And back again, so the pill is a choice rather than a one-way door.
  await p.locator('[data-cat-order]').click();
  await p.waitForTimeout(300);
  await p.locator('[data-cat-order-opt="alpha"]').click();
  await p.waitForTimeout(500);
  ok((await gridNames(p)).join(', ') === 'App, Food & Drinks, Groceries, Sport', 'switching back works too');
  await p.close();
}
await ctx.close();

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await b.close();
process.exit(fail.length ? 1 : 0);
