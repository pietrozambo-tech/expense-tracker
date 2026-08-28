// Deleting from the open transaction, and a schedule that can pick a
// subcategory.
//
// Both were reachable-by-detour rather than missing: you could delete a row by
// closing the sheet and swiping it in the list, and you could give a schedule
// a subcategory by editing every occurrence it produced. Detours are the kind
// of gap that never shows up in a bug report, only in someone giving up.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const OUT = process.env.CHECK_OUT ?? new globalThis.URL('.artifacts', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });

const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

const CATS = [
  { id: 'housing', name: 'Housing', type: 'expense', icon: 'Home', color: 'text-blue-600', bgColor: 'bg-blue-50', selectedBg: 'bg-blue-100', subcategories: ['Rent', 'Utilities', 'Cleaning'] },
  { id: 'groceries', name: 'Groceries', type: 'expense', icon: 'ShoppingCart', color: 'text-emerald-600', bgColor: 'bg-emerald-50', selectedBg: 'bg-emerald-100', subcategories: ['Supermarket'] },
];

const open = async () => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, locale: 'en-GB' });
  await ctx.route(/supabase\.co/, (r) => r.abort());
  await ctx.addInitScript((cats) => {
    const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    put('guest', 'true');
    put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en' });
    put('nudges', { tips: false, recap: false });
    put('categories', cats);
    put('sources', [{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]);
    put('transactions', [
      { id: 'a', date: '2026-08-20', type: 'expense', amount: 42.5, baseAmount: 42.5, currency: 'EUR', sourceId: 'cash', category: cats[1], subcategory: 'Supermarket', createdAt: '2026-08-20T10:00:00.000Z', updatedAt: '2026-08-20T10:00:00.000Z', recurrence: 'Never repeat', description: 'Spesa settimanale' },
      { id: 'b', date: '2026-08-21', type: 'expense', amount: 12, baseAmount: 12, currency: 'EUR', sourceId: 'cash', category: cats[1], createdAt: '2026-08-21T10:00:00.000Z', updatedAt: '2026-08-21T10:00:00.000Z', recurrence: 'Never repeat', description: 'Caffè' },
    ]);
  }, CATS);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  return { ctx, p };
};

// ── deleting the transaction you have open ────────────────────────────────
{
  const { ctx, p } = await open();
  await p.getByRole('button', { name: 'Activity' }).first().click();
  await p.waitForTimeout(700);

  // A NEW transaction has nothing to delete.
  await p.getByRole('button', { name: 'Add' }).first().click().catch(async () => {
    await p.locator('.app-dock button').nth(2).click();
  });
  await p.waitForTimeout(700);
  ok(await p.locator('[data-edit-delete]').count() === 0, 'a new transaction offers no delete - there is nothing to delete yet');
  // Closing a NEW transaction lands on the Dashboard by design, so come back.
  await p.getByLabel('Close').click();
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: 'Activity' }).first().click();
  await p.waitForTimeout(700);

  await p.locator('[data-row-id="a"]').click();
  await p.waitForTimeout(800);
  ok(await p.locator('[data-edit-delete]').count() === 1, 'an OPEN transaction has a bin beside the close button');

  await p.locator('[data-edit-delete]').click();
  await p.waitForTimeout(450);
  const dialog = await p.locator('[data-overlay]').innerText();
  // Same question the swipe path asks, naming the row, because by now the
  // list is behind a full-screen sheet.
  ok(/Spesa settimanale/.test(dialog), `it asks first, naming the row ("${dialog.split('\n').find((l) => /Spesa/.test(l)) ?? ''}")`);

  await p.locator('[data-overlay] button').filter({ hasText: /^Delete$/ }).click();
  await p.waitForTimeout(900);
  const left = await p.evaluate(() => JSON.parse(localStorage.getItem('expense-tracker.v1.transactions') ?? '[]').map((t) => t.id));
  ok(left.join(',') === 'b', `the row goes (${left.join(',') || 'none'} left)`);
  ok(await p.locator('[data-period-chip]').count() === 1, 'and the sheet closes back to the list');
  await ctx.close();
}

// ── cancelling leaves everything alone ────────────────────────────────────
{
  const { ctx, p } = await open();
  await p.getByRole('button', { name: 'Activity' }).first().click();
  await p.waitForTimeout(700);
  await p.locator('[data-row-id="a"]').click();
  await p.waitForTimeout(800);
  await p.locator('[data-edit-delete]').click();
  await p.waitForTimeout(400);
  await p.locator('[data-overlay] button').filter({ hasText: /Cancel|Annulla/ }).click();
  await p.waitForTimeout(500);
  const still = await p.evaluate(() => JSON.parse(localStorage.getItem('expense-tracker.v1.transactions') ?? '[]').length);
  ok(still === 2, 'cancelling keeps the row');
  ok(await p.locator('[data-edit-delete]').count() === 1, 'and stays on the open transaction rather than closing it');
  await ctx.close();
}

// ── a schedule can pick a subcategory ─────────────────────────────────────
{
  const { ctx, p } = await open();
  await p.getByRole('button', { name: 'Settings' }).first().click();
  await p.waitForTimeout(700);
  await p.getByText('Recurring', { exact: true }).first().click();
  await p.waitForTimeout(700);
  await p.getByText('Add a recurring transaction', { exact: false }).first().click();
  await p.waitForTimeout(700);

  // The editor opens with the first category already standing in, so its
  // subcategories are there from the start.
  const onOpen = await p.locator('[data-sub-chip]').allInnerTexts();
  ok(onOpen.join(',') === 'Rent,Utilities,Cleaning',
    `the standing category's subcategories are offered from the start (${onOpen.join(', ')})`);
  // And they sit INSIDE the grid, under the row holding the chosen category -
  // the same layout the Add screen uses - rather than in a field of their own
  // at the foot of the form.
  const inGrid = await p.evaluate(() => {
    const chip = document.querySelector('[data-sub-chip]');
    const grid = chip?.closest('.grid');
    const cat = grid?.querySelector('button');
    return !!grid && !!cat && grid.contains(chip);
  });
  ok(inGrid, 'the subcategories open inside the category grid, not below the form');

  await p.getByRole('button', { name: 'Housing' }).first().click();
  await p.waitForTimeout(400);
  const subs = await p.locator('[data-sub-chip]').allInnerTexts();
  ok(subs.join(',') === 'Rent,Utilities,Cleaning', `picking a category offers its subcategories (${subs.join(', ')})`);

  await p.locator('[data-sub-chip="Rent"]').click();
  await p.waitForTimeout(250);

  // Switching category cannot carry a subcategory across: Rent under
  // Groceries is not a smaller error than none.
  await p.getByRole('button', { name: 'Groceries' }).first().click();
  await p.waitForTimeout(400);
  const after = await p.locator('[data-sub-chip]').allInnerTexts();
  ok(after.join(',') === 'Supermarket', 'switching category swaps the list');

  await p.getByRole('button', { name: 'Housing' }).first().click();
  await p.waitForTimeout(350);
  await p.locator('[data-sub-chip="Rent"]').click();
  await p.waitForTimeout(250);

  await p.getByPlaceholder(/Rent, Salary, Gym|Affitto/).fill('Affitto');
  await p.locator('input[inputmode="decimal"]').first().fill('900');
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/schedule-sub.png` });

  const save = p.getByRole('button', { name: /^(Save|Salva|Create|Add)/ }).last();
  await save.click();
  await p.waitForTimeout(900);
  const rules = await p.evaluate(() => JSON.parse(localStorage.getItem('expense-tracker.v1.recurring-rules') ?? '[]'));
  ok(rules.length === 1, `the schedule saves (${rules.length})`);
  ok(rules[0]?.template?.subcategory === 'Rent',
    `and keeps the subcategory it was given (${rules[0]?.template?.subcategory ?? 'none'})`);
  await ctx.close();
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await b.close();
process.exit(fail.length ? 1 : 0);
