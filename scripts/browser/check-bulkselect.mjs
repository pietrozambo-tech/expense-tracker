// Selecting several rows in Activity and acting on them.
//
// The unit suite (pnpm test:bulkedit) owns what happens to the data. This owns
// the half that only exists on screen: that a tap ticks a row instead of
// opening it, that the count is the truth about rows scrolled past the render
// cap, and that the destructive path asks first and can be taken back.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const OUT = process.env.CHECK_OUT ?? new globalThis.URL('.artifacts', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });

const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

const CATS = [
  { id: 'groc', name: 'Groceries', type: 'expense', icon: 'ShoppingCart', color: 'text-emerald-600', bgColor: 'bg-emerald-50', selectedBg: 'bg-emerald-100', subcategories: ['Supermarket'] },
  { id: 'travel', name: 'Travel', type: 'expense', icon: 'Plane', color: 'text-sky-600', bgColor: 'bg-sky-50', selectedBg: 'bg-sky-100', subcategories: ['Flights', 'Hotel'] },
];
const INCOME_CATS = [
  { id: 'sal', name: 'Salary', type: 'income', icon: 'Briefcase', color: 'text-emerald-600', bgColor: 'bg-emerald-50', selectedBg: 'bg-emerald-100', subcategories: [] },
];

// `n` ordinary rows in Aug 2026, plus one income row when asked - the mixed
// selection is its own case.
// One argument only - addInitScript takes a single value, and passing two
// silently drops the second.
const seed = ([n, withIncome]) => {
  const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  put('guest', 'true');
  put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en' });
  put('nudges', { tips: false, recap: false });
  put('categories', window.__CATS);
  put('income-categories', window.__INCOME);
  put('sources', [
    { id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' },
    { id: 'revolut', kind: 'card', mark: 'card', name: 'Revolut', brand: '#0075EB' },
  ]);
  const txns = [];
  for (let i = 0; i < n; i++) {
    const day = String((i % 27) + 1).padStart(2, '0');
    const date = `2026-08-${day}`;
    txns.push({
      id: `e${i}`, date, type: 'expense', amount: 10, baseAmount: 10, currency: 'EUR',
      sourceId: 'cash', category: window.__CATS[0], createdAt: `${date}T10:00:00.000Z`,
      updatedAt: `${date}T10:00:00.000Z`, recurrence: 'Never repeat', description: `Spesa ${i}`,
    });
  }
  if (withIncome) {
    txns.push({
      id: 'inc1', date: '2026-08-05', type: 'income', amount: 1000, baseAmount: 1000, currency: 'EUR',
      sourceId: 'cash', category: window.__INCOME[0], createdAt: '2026-08-05T10:00:00.000Z',
      updatedAt: '2026-08-05T10:00:00.000Z', recurrence: 'Never repeat', description: 'Stipendio',
    });
  }
  put('transactions', txns);
};

const open = async (n, withIncome = false) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, locale: 'en-GB' });
  // Nothing may reach the production project, guest seed or not.
  await ctx.route(/supabase\.co/, (r) => r.abort());
  await ctx.addInitScript(([cats, inc]) => { window.__CATS = cats; window.__INCOME = inc; }, [CATS, INCOME_CATS]);
  await ctx.addInitScript(seed, [n, withIncome]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Activity' }).first().click();
  await p.waitForTimeout(700);
  return { ctx, p };
};

const enterSelect = async (p) => {
  await p.locator('[data-act-more]').click();
  await p.waitForTimeout(300);
  await p.locator('[data-act-menu-select]').click();
  await p.waitForTimeout(400);
};

// ── the menu, and getting in ──────────────────────────────────────────────
{
  const { ctx, p } = await open(12);

  ok(await p.locator('[data-act-more]').count() === 1, 'the header carries one overflow button');
  await p.locator('[data-act-more]').click();
  await p.waitForTimeout(300);
  ok(await p.locator('[data-act-menu-export]').count() === 1, 'the menu still offers Export');
  ok(await p.locator('[data-act-menu-select]').count() === 1, 'and now offers Select');

  await p.locator('[data-act-menu-select]').click();
  await p.waitForTimeout(400);
  ok(await p.locator('[data-select-dot]').count() === 12, 'every row grows a tick');
  ok(await p.locator('[data-sel-bar]').count() === 1, 'the dock gives way to the action bar');
  // Not merely covered by it. The bar is the same dark glass in the same
  // place, so a dock left mounted underneath ghosts its labels up through.
  ok(
    await p.getByRole('button', { name: 'Dashboard' }).count() === 0,
    'and is unmounted, not painted over',
  );
  // The filters step aside: changing the period mid-selection would leave rows
  // ticked that are no longer on screen.
  ok(await p.locator('[data-period-chip]').count() === 0, 'and the filter bar steps aside while selecting');

  // The one regression that would matter most: a tap must tick, not navigate.
  await p.locator('[data-row-id="e0"]').click();
  await p.waitForTimeout(300);
  ok(
    await p.locator('[data-row-id="e0"] [data-select-dot="on"]').count() === 1,
    'tapping a row ticks it',
  );
  ok(
    (await p.locator('[data-sel-count]').innerText()).trim() === '1 selected',
    'the header counts it',
  );
  ok(await p.locator('[data-sel-bar]').count() === 1, 'and stays on Activity rather than opening the row');

  await p.locator('[data-row-id="e0"]').click();
  await p.waitForTimeout(250);
  ok(await p.locator('[data-select-dot="on"]').count() === 0, 'tapping again unticks it');

  await p.locator('[data-sel-done]').click();
  await p.waitForTimeout(350);
  ok(await p.locator('[data-select-dot]').count() === 0, 'Done leaves selection mode');
  ok(await p.locator('[data-period-chip]').count() === 1, 'and the filters come back');

  await ctx.close();
}

// ── select all means the FILTER, not what the list has painted ────────────
//
// Activity stops painting at 250 rows. "Select all" over the painted rows
// would quietly mean "the first 250 of your 400", delete them, and look like
// it had finished.
{
  const { ctx, p } = await open(400);
  await enterSelect(p);
  await p.locator('[data-sel-all]').click();
  await p.waitForTimeout(600);
  const label = (await p.locator('[data-sel-count]').innerText()).trim();
  ok(label === '400 selected', `select all takes the whole filtered set, not the painted 250 (${label})`);
  await p.screenshot({ path: `${OUT}/bulkselect.png` });
  await ctx.close();
}

// ── deleting, and taking it back ──────────────────────────────────────────
{
  const { ctx, p } = await open(12);
  await enterSelect(p);
  await p.locator('[data-row-id="e0"]').click();
  await p.locator('[data-row-id="e1"]').click();
  await p.locator('[data-row-id="e2"]').click();
  await p.waitForTimeout(300);

  await p.locator('[data-sel-action="delete"]').click();
  await p.waitForTimeout(400);
  const dialog = await p.locator('[data-overlay]').innerText();
  ok(/Delete 3 transactions\?/.test(dialog), `the confirmation names the count ("${dialog.split('\n')[0]}")`);
  // 3 × 10€. Whole amounts drop their decimals in this app's list format.
  ok(/\b30\s*€/.test(dialog), 'and what it comes to, which is the only checkable claim on the screen');

  await p.locator('[data-overlay] button').filter({ hasText: /^Delete$/ }).click();
  await p.waitForTimeout(700);
  const left = await p.evaluate(() => JSON.parse(localStorage.getItem('expense-tracker.v1.transactions') ?? '[]').length);
  ok(left === 9, `the rows go (${left}/12 left)`);
  ok(await p.locator('[data-select-dot]').count() === 0, 'and selection mode ends with them');

  await p.getByRole('button', { name: 'Undo' }).click();
  await p.waitForTimeout(700);
  const back = await p.evaluate(() => JSON.parse(localStorage.getItem('expense-tracker.v1.transactions') ?? '[]').length);
  ok(back === 12, `Undo puts them back (${back}/12)`);

  await ctx.close();
}

// ── moving a selection to another category ────────────────────────────────
{
  const { ctx, p } = await open(12);
  await enterSelect(p);
  await p.locator('[data-row-id="e0"]').click();
  await p.locator('[data-row-id="e1"]').click();
  await p.waitForTimeout(300);

  await p.locator('[data-sel-action="category"]').click();
  await p.waitForTimeout(400);
  ok(await p.locator('[data-bulk-category]').count() === 1, 'the category sheet opens on the selection');
  // Nothing is applied by picking - a bulk move is not a filter, and "Travel"
  // is only half of "Travel - Hotel".
  await p.locator('[data-bulk-category] button').filter({ hasText: 'Travel' }).first().click();
  await p.waitForTimeout(350);
  await p.locator('[data-bulk-category] button').filter({ hasText: /^Hotel$/ }).first().click();
  await p.waitForTimeout(300);
  await p.locator('[data-bulk-category-apply]').click();
  await p.waitForTimeout(700);

  const moved = await p.evaluate(() =>
    JSON.parse(localStorage.getItem('expense-tracker.v1.transactions') ?? '[]')
      .filter((t) => t.category?.id === 'travel')
      .map((t) => `${t.id}:${t.subcategory}`)
      .sort()
      .join(','));
  ok(moved === 'e0:Hotel,e1:Hotel', `both rows land under Travel - Hotel (${moved})`);

  await ctx.close();
}

// ── expenses and income cannot share a category list ──────────────────────
{
  const { ctx, p } = await open(4, true);
  await enterSelect(p);
  await p.locator('[data-row-id="e0"]').click();
  await p.locator('[data-row-id="inc1"]').click();
  await p.waitForTimeout(300);
  await p.locator('[data-sel-action="category"]').click();
  await p.waitForTimeout(500);
  ok(await p.locator('[data-bulk-category]').count() === 0, 'a mixed selection does not get a category sheet');
  const body = await p.locator('body').innerText();
  ok(/different categories/.test(body), 'it says why instead of greying out with no reason');
  await ctx.close();
}

// ── putting a selection on an account ─────────────────────────────────────
{
  const { ctx, p } = await open(6);
  await enterSelect(p);
  await p.locator('[data-row-id="e0"]').click();
  await p.locator('[data-row-id="e1"]').click();
  await p.waitForTimeout(300);
  await p.locator('[data-sel-action="source"]').click();
  await p.waitForTimeout(400);
  await p.getByText('Revolut', { exact: true }).first().click();
  await p.waitForTimeout(700);
  const onRevolut = await p.evaluate(() =>
    JSON.parse(localStorage.getItem('expense-tracker.v1.transactions') ?? '[]')
      .filter((t) => t.sourceId === 'revolut').map((t) => t.id).sort().join(','));
  ok(onRevolut === 'e0,e1', `both rows move to the account (${onRevolut})`);
  await ctx.close();
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await b.close();
process.exit(fail.length ? 1 : 0);
