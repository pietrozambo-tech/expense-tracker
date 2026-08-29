// The Dashboard's setup checklist - the card that asks a new user to make the
// categories and accounts their own.
//
// Two things here can only be proved in a browser. First the ORDER: the card
// has to appear on a phone in a browser tab, which is every new user for at
// least a few days. While the install banner outranked it, it could not - one
// card, and install always won. Second the SELF-TICKING: nothing marks a line
// done, the app reads it back off the ledger, so editing anything in Settings
// has to tick the line and finishing both has to retire the card without
// anybody dismissing it.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const OUT = process.env.CHECK_OUT ?? new globalThis.URL('.artifacts', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });

const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

// Onboarded, one expense on the books, and - deliberately - no categories or
// sources written down at all: the app seeds its own, which is exactly the
// state the card is about.
const seed = () => {
  const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  put('guest', 'true');
  put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en' });
  put('nudges', { tips: true, recap: false });
  put('transactions', [{
    id: 't1', date: '2026-08-10', type: 'expense', amount: 12, baseAmount: 12, currency: 'EUR',
    sourceId: 'cash',
    category: { id: 'food', name: 'Food & Drinks', type: 'expense', icon: 'Utensils', color: 'text-orange-600', bgColor: 'bg-orange-50', selectedBg: 'bg-orange-100', subcategories: [] },
    createdAt: '2026-08-10T10:00:00.000Z', updatedAt: '2026-08-10T10:00:00.000Z',
    recurrence: 'Never repeat', description: 'Lunch',
  }]);
};

const open = async (ctx) => {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1600);
  return p;
};
const toDashboard = async (p) => {
  await p.locator('.app-dock button').nth(0).click();
  await p.waitForTimeout(700);
};
const doneOf = (p, key) => p.locator(`[data-setup-task="${key}"]`).getAttribute('data-setup-done');

// An iPhone in Safari, NOT installed: install is due here too, and used to win.
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  locale: 'en-GB',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
});
await ctx.route(/supabase\.co/, (r) => r.abort());
await ctx.addInitScript(seed);

{
  const p = await open(ctx);

  const which = await p.locator('[data-nudge]').getAttribute('data-nudge');
  ok(which === 'customize', `a phone in a browser tab is shown setup, not the install banner (got "${which}")`);

  // The greeting and the title are the top of this screen; the card is a note
  // about it. Rendered as a sibling of Dashboard rather than inside it, the
  // card came FIRST - "Two things and you are set", then "Good morning,
  // Marco", then "Dashboard" - which reads as the app introducing itself with
  // a chore.
  const order = await p.evaluate(() => {
    const h1 = [...document.querySelectorAll('h1')].find((el) => el.textContent.trim() === 'Dashboard');
    const card = document.querySelector('[data-nudge]');
    return { h1: Math.round(h1.getBoundingClientRect().bottom), card: Math.round(card.getBoundingClientRect().top) };
  });
  ok(order.card >= order.h1,
    `and it sits under the greeting and title, not above them (card at ${order.card}, title ends at ${order.h1})`);
  ok(await p.locator('[data-setup-task]').count() === 2, 'the card lists both halves of setup');
  ok(await doneOf(p, 'categories') === 'no' && await doneOf(p, 'sources') === 'no',
    'with nothing ticked on factory settings');
  ok(await p.locator('[data-setup-progress]').getAttribute('data-setup-progress') === '0/2',
    'and a progress bar that agrees');
  // The rows are the call to action; a second "Open Settings" button below
  // them would be asking twice.
  ok(await p.locator('[data-nudge-cta]').count() === 0, 'no separate CTA - the lines themselves are the button');
  // The label is the only part that carries meaning, and 390px is the common
  // phone: "Categories and subcat..." is not a checklist item.
  const clipped = await p.evaluate(() =>
    [...document.querySelectorAll('[data-setup-task] span:not(:first-child)')]
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.textContent));
  ok(clipped.length === 0, `both labels fit at 390px unabbreviated (clipped: ${JSON.stringify(clipped)})`);
  await p.screenshot({ path: `${OUT}/setuptip.png` });

  // Each line goes to ITS OWN screen. Dropping someone at the top of Settings
  // and letting them hunt is the reason the old tip did not work.
  await p.locator('[data-setup-task="categories"]').click();
  await p.waitForTimeout(900);
  ok(await p.getByRole('heading', { name: 'Categories', exact: true }).count() === 1,
    'the Categories line opens the Categories editor itself');

  // Touch something, the way a real person would.
  await p.getByText('Food & Drinks', { exact: true }).first().click();
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: 'Add subcategory' }).first().click();
  await p.waitForTimeout(400);
  await p.locator('input[type="text"]').last().fill('Sushi');
  await p.getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForTimeout(600);

  await toDashboard(p);
  ok(await p.locator('[data-nudge="customize"]').count() === 1, 'one half done: the card stays for the other');
  ok(await doneOf(p, 'categories') === 'yes', 'and the Categories line has ticked itself - nothing marked it done');
  ok(await doneOf(p, 'sources') === 'no', 'while the untouched half stays open');
  ok(await p.locator('[data-setup-progress]').getAttribute('data-setup-progress') === '1/2', 'the bar moves with it');
  ok(await p.locator('[data-setup-task="categories"]').isDisabled(), 'a finished line is not a button any more');

  await p.locator('[data-setup-task="sources"]').click();
  await p.waitForTimeout(900);
  ok(await p.getByRole('heading', { name: 'Sources', exact: true }).count() === 1,
    'and the other line opens Sources');

  await p.getByRole('button', { name: 'Add source' }).first().click();
  await p.waitForTimeout(400);
  await p.locator('input[type="text"]').last().fill('Revolut');
  await p.getByRole('button', { name: 'Add source' }).last().click();
  await p.waitForTimeout(600);

  await toDashboard(p);
  ok(await p.locator('[data-nudge="customize"]').count() === 0,
    'both halves done: the card retires itself, with nothing to dismiss');
  ok(await p.locator('[data-nudge="install"]').count() === 1,
    'and the install invitation, queued behind it, finally gets its turn');
  await p.close();
}
await ctx.close();

// A fresh device: the X is still an answer, and it hands the slot on rather
// than swallowing it.
{
  const ctx2 = await b.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'en-GB',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });
  await ctx2.route(/supabase\.co/, (r) => r.abort());
  await ctx2.addInitScript(seed);
  const p = await open(ctx2);
  await p.locator('[data-nudge="customize"] [data-nudge-dismiss]').click();
  await p.waitForTimeout(600);
  ok(await p.locator('[data-nudge="customize"]').count() === 0, 'dismissing the setup card puts it away');
  ok(await p.locator('[data-nudge="install"]').count() === 1, 'and install steps into the slot');
  await p.close();
  await ctx2.close();
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await b.close();
process.exit(fail.length ? 1 : 0);
