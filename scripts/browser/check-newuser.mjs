// The whole first-run road, in order, with the sample data walked across it.
//
// The thing this suite exists to hold down: WHICH surfaces are allowed to
// count sample rows, and which are not. The rule the app follows is not "never
// count them" - it is:
//
//   a VIEW of a month counts them.        You navigated to August; August on
//                                         this screen contains sample rows;
//                                         a summary card that disagreed with
//                                         the total above it would be a bug.
//
//   a NOTIFICATION does not.              The recap card and the review
//                                         pointer arrive uninvited, are worth
//                                         one appearance a month, and record
//                                         a SYNCED flag when answered. Firing
//                                         one off sample data spends a real
//                                         one-shot on a month the person
//                                         never lived.
//
// Before that rule was applied, loading the samples on a virgin ledger opened
// with "August in review - you spent 2,389EUR, top category Housing" to
// somebody who had recorded nothing; and for somebody who HAD a real August,
// waving that away wrote recapSeen and took their own August's card with it,
// on every device, for the rest of the month.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

// Pinned to the 3rd, because half of this workflow is date-sensitive: the
// review pointer only exists in a month's first five days, and a suite that
// quietly stopped testing it on the 6th would be worse than no suite.
const real = new Date();
const TODAY = new Date(real.getFullYear(), real.getMonth(), 3, 10, 0, 0);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const PREV = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1);
const prevDay = (n) => ymd(new Date(PREV.getFullYear(), PREV.getMonth(), n));
const thisDay = (n) => ymd(new Date(TODAY.getFullYear(), TODAY.getMonth(), n));

const FOOD = { id: 'food', name: 'Food & Drinks', type: 'expense', icon: 'Utensils', color: 'text-orange-600', bgColor: 'bg-orange-50', selectedBg: 'bg-orange-100', subcategories: [] };
const HOUSE = { id: 'housing', name: 'Housing', type: 'expense', icon: 'Home', color: 'text-blue-600', bgColor: 'bg-blue-50', selectedBg: 'bg-blue-100', subcategories: [] };

const seed = ([rows]) => {
  const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en' });
  // Default nudge prefs but for the install banner, which would otherwise
  // outrank everything on a browser that has not installed. Crucially recap
  // and tips are left ON - this suite is about what a real new user meets.
  put('nudges', { installDismissed: true });
  put('categories', [rows.cats ?? null].flat().filter(Boolean));
  put('income-categories', []);
  put('sources', [{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]);
  put('transactions', rows.tx ?? []);
  put('guest', 'true');
};

const open = async (fixture = {}) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB', hasTouch: true, isMobile: true });
  await ctx.route(/supabase\.co/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  // Freeze the wall clock only - NOT the timers. clock.install() would fake
  // setTimeout too and the app would never finish booting.
  await ctx.clock.setFixedTime(TODAY);
  await ctx.addInitScript(seed, [fixture]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { console.log('[pageerror]', e.message); fail.push('pageerror'); });
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1700);
  return { ctx, p };
};

const tx = (id, date, amount, cat, desc, type = 'expense') => ({
  id, date, type, amount, baseAmount: amount, currency: 'EUR', sourceId: 'cash',
  category: cat, description: desc, createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z`,
  recurrence: 'Never repeat',
});
// Sample rows are recognised by their id prefix and nothing else - the app's
// own isDemoRow is exactly this test - so a fixture can mint them directly
// instead of driving the generator for every scenario.
const demo = (n, date, amount, cat, desc) => tx(`demo-${n}`, date, amount, cat, desc);

const nudgeOf = async (p) =>
  (await p.locator('[data-nudge]').count()) ? await p.locator('[data-nudge]').getAttribute('data-nudge') : 'none';
const recapSeen = (p) =>
  p.evaluate(() => JSON.parse(localStorage.getItem('expense-tracker.v1.settings') || '{}').recapSeen ?? null);
const rowCount = (p) =>
  p.evaluate(() => JSON.parse(localStorage.getItem('expense-tracker.v1.transactions') || '[]').length);

// ── 1. the empty screen has nothing to advise about ──────────────────────
{
  const { ctx, p } = await open({ cats: [FOOD, HOUSE] });
  ok(/Your first month starts here/.test(await p.locator('body').innerText()), 'a brand-new guest lands on the empty state');
  ok(await nudgeOf(p) === 'none', 'and is not handed a card on top of it: there is nothing yet to summarise or tidy');
  ok(await p.locator('[data-review-pointer]').count() === 0, 'no pointer to a month they were not here for');

  // The first expense, written the way a finger writes it.
  await p.getByRole('button', { name: /add/i }).last().click();
  await p.waitForTimeout(800);
  await p.locator('[data-amount-input]').fill('12.50');
  await p.locator('[data-category-picker] button').filter({ hasText: /Food/ }).first().click();
  await p.waitForTimeout(300);
  await p.locator('button').filter({ hasText: /Save/i }).last().click();
  await p.waitForTimeout(1200);
  ok(/From here on I'll keep count/i.test(await p.locator('body').innerText()),
    'the first one is met with the handshake, not just a receipt');
  await p.waitForTimeout(2200);
  ok(await nudgeOf(p) === 'customize',
    'one row in, the setup checklist arrives - the screens nobody finds on their own');
  ok(await recapSeen(p) === null, 'and no month has been marked read, because none has been shown');
  await ctx.close();
}

// ── 2. the sample data, on a ledger with nothing of their own in it ──────
// The real generator, through the real button, once - the scenarios below
// mint sample rows directly, and something has to prove the two agree.
{
  const { ctx, p } = await open({ cats: [FOOD, HOUSE] });
  await p.locator('[data-empty-demo]').click();
  await p.waitForTimeout(2600);
  ok(await rowCount(p) > 100, `a year of sample history lands in one tap (${await rowCount(p)} rows)`);
  ok(await nudgeOf(p) !== 'recap',
    'and does NOT summon a summary of last month: they were not here last month');
  ok(await p.locator('[data-review-pointer]').count() === 0,
    'nor a pointer to it, which would spend the same one-shot by being tapped');
  ok(await recapSeen(p) === null,
    'nothing is marked read, so their first real recap is still theirs to get');
  const card = await p.locator('[data-nudge]').innerText().catch(() => '');
  ok(/sample/i.test(card),
    `the card that does show is the one that fits the moment, and it says so (${card.split('\n')[0]})`);
  // A year of sample history means the median benchmark genuinely exists, so
  // the legend has two real lines and nothing to promise.
  ok(await p.locator('[data-usual-due]').count() === 0,
    'with a year of history behind it the comparison is real, so the chart stops promising one');

  // ── 3. and erasing it puts everything back ────────────────────────────
  await p.getByRole('button', { name: 'Settings' }).first().click();
  await p.waitForTimeout(800);
  await p.locator('button').filter({ hasText: /Erase demo data/i }).first().click();
  await p.waitForTimeout(700);
  await p.locator('button').filter({ hasText: /Erase|Delete|Yes/i }).last().click();
  await p.waitForTimeout(1500);
  ok(await rowCount(p) === 0, `only their own rows survive, and they had none (${await rowCount(p)})`);
  await p.getByRole('button', { name: 'Dashboard' }).first().click();
  await p.waitForTimeout(1200);
  ok(await recapSeen(p) === null, 'and the recap flag is still unwritten after the round trip');
  await ctx.close();
}

// ── 4. a real last month, with the samples piled on top ──────────────────
// The case that cost somebody their own August: their six rows are in there,
// and so are five hundred of ours.
{
  const own = [3, 7, 11, 15, 19, 23].map((d, i) => tx(`real${i}`, prevDay(d), 20 + i * 5, FOOD, 'Groceries'));
  // 500 apiece, so their 195EUR and the combined 2,695EUR share no digits:
  // an earlier fixture summed to 2,195EUR and "195" matched BOTH, which is a
  // test that passes whether or not the code is right.
  const fake = [4, 9, 14, 19, 24].map((d, i) => demo(`h${i}`, prevDay(d), 500, HOUSE, 'Rent'));
  const { ctx, p } = await open({ cats: [FOOD, HOUSE], tx: [...own, ...fake] });
  ok(await nudgeOf(p) === 'recap', 'a real last month does summon the summary card');
  const text = await p.locator('[data-nudge]').innerText();
  ok(/195/.test(text), `and it reports THEIR month - 195EUR of groceries (${text.split('\n')[2] ?? text})`);
  ok(!/2[.,]695/.test(text), 'not the 2,695EUR the month holds once the sample rent is counted in');
  ok(/Food/.test(text) && !/Housing/.test(text),
    'and their biggest category, not the sample data\'s');
  await p.locator('[data-nudge] button').last().click();
  await p.waitForTimeout(800);
  ok(await recapSeen(p) !== null, 'dismissing their own summary does consume the month, as it always did');
  await ctx.close();
}

// ── 4b. a month with nothing spent in it has nothing to review ───────────
{
  const income = tx('pay', prevDay(27), 2000, FOOD, 'Salary', 'income');
  const fake = [4, 9, 14].map((d, i) => demo(`h${i}`, prevDay(d), 500, HOUSE, 'Rent'));
  const { ctx, p } = await open({ cats: [FOOD, HOUSE], tx: [income, ...fake] });
  ok(await nudgeOf(p) !== 'recap',
    'a last month holding only a salary raises no summary card - its body would read "you spent 0"');
  await ctx.close();
}

// ── 5. the finished month itself is a VIEW, and counts everything ────────
// The deliberate other half of the rule. The card here describes the month
// the screen is showing; filtering it would leave a summary contradicting the
// total printed directly above it.
{
  const own = [3, 7, 11, 15, 19, 23].map((d, i) => tx(`real${i}`, prevDay(d), 20 + i * 5, FOOD, 'Groceries'));
  // 500 apiece, so their 195EUR and the combined 2,695EUR share no digits:
  // an earlier fixture summed to 2,195EUR and "195" matched BOTH, which is a
  // test that passes whether or not the code is right.
  const fake = [4, 9, 14, 19, 24].map((d, i) => demo(`h${i}`, prevDay(d), 500, HOUSE, 'Rent'));
  const { ctx, p } = await open({ cats: [FOOD, HOUSE], tx: [...own, ...fake, tx('now1', thisDay(2), 30, FOOD, 'Lunch')] });
  await p.locator('button').filter({ has: p.locator('svg.lucide-chevron-left') }).first().click();
  await p.waitForTimeout(1200);
  const body = await p.locator('body').innerText();
  ok(/SUMMARY/i.test(body), 'stepping back to last month shows its summary card');
  ok(/Housing/.test(body),
    'which names Housing - the month AS DISPLAYED, sample rows and all, agreeing with the total above it');
  await ctx.close();
}

// ── 6. five of their own, for the card and the pointer alike ─────────────
// One threshold, one constant (RECAP_NUDGE_MIN_TX), because they answer one
// question. Signing up on the 30th and logging two coffees used to open the
// new month with "August in review - you spent 7EUR".
{
  const fake = [4, 9, 14, 19, 24, 27].map((d, i) => demo(`h${i}`, prevDay(d), 400, HOUSE, 'Rent'));
  const four = [3, 7, 11, 15].map((d, i) => tx(`real${i}`, prevDay(d), 25, FOOD, 'Groceries'));
  {
    const { ctx, p } = await open({ cats: [FOOD, HOUSE], tx: [...four, ...fake] });
    ok(await p.locator('[data-review-pointer]').count() === 0,
      'four of their own rows and six of ours is still four: no pointer');
    ok(await nudgeOf(p) !== 'recap',
      'and no summary card either - four rows is an afternoon, not a month to review');
    await ctx.close();
  }
  {
    const five = [...four, tx('real4', prevDay(19), 25, FOOD, 'Groceries')];
    const { ctx, p } = await open({ cats: [FOOD, HOUSE], tx: [...five, ...fake] });
    ok(await p.locator('[data-review-pointer]').count() === 1,
      'the fifth of their own brings it out, on the 3rd of the month');
    ok(await nudgeOf(p) === 'recap',
      'and brings the card with it: the two never disagree about whether the month is worth it');
    ok(/summary/i.test(await p.locator('[data-review-pointer]').innerText()),
      'naming the month it points at');
    await ctx.close();
  }
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nthe samples are shown, never announced');
await b.close();
process.exit(fail.length ? 1 : 0);
