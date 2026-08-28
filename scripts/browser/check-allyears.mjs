// Activity can show every year at once.
//
// The filter offered one year or another, so a trip over New Year - Dec 2025
// into Jan 2026 - could only ever be seen as one half or the other. No single
// year contains it, and dates cannot be asked to group what they split.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const OUT = process.env.CHECK_OUT ?? new globalThis.URL('.artifacts', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });

const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, locale: 'en-GB' });
await ctx.addInitScript(() => {
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  localStorage.setItem('expense-tracker.v1.guest', 'true');
  localStorage.setItem('expense-tracker.v1.settings', JSON.stringify({
    onboarded: true, userName: 'Pietro', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en',
  }));
  localStorage.setItem('expense-tracker.v1.nudges', JSON.stringify({ tips: false, recap: false }));
  const cat = { id: 'travel', name: 'Travel', type: 'expense', icon: 'Plane', color: 'text-sky-600', bgColor: 'bg-sky-50', selectedBg: 'bg-sky-100', subcategories: [] };
  localStorage.setItem('expense-tracker.v1.categories', JSON.stringify([cat]));
  localStorage.setItem('expense-tracker.v1.sources', JSON.stringify([{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]));
  // One trip, split by the calendar: two nights either side of New Year.
  const tx = (id, date, amount, description) => ({
    id, date, type: 'expense', amount, baseAmount: amount, currency: 'EUR', sourceId: 'cash',
    category: cat, createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z`,
    recurrence: 'Never repeat', description,
  });
  localStorage.setItem('expense-tracker.v1.transactions', JSON.stringify([
    tx('a', '2025-12-30', 120, 'Capodanno - Hotel'),
    tx('b', '2025-12-31', 80, 'Capodanno - Cena'),
    tx('c', '2026-01-01', 45, 'Capodanno - Pranzo'),
    tx('d', '2026-01-02', 60, 'Capodanno - Rientro'),
  ]));
});
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForTimeout(1600);
await p.getByRole('button', { name: 'Activity' }).first().click();
await p.waitForTimeout(900);

const rows = () => p.evaluate(() => (document.body.innerText.match(/Capodanno - /g) ?? []).length);
const openPeriod = async () => {
  await p.locator('[data-period-chip]').click();
  await p.waitForTimeout(500);
};

await openPeriod();

const allChip = p.locator('[data-period-all]');
ok(await allChip.count() === 1, 'the period sheet offers "All years"');
ok((await allChip.textContent()).trim() === 'All years', 'named plainly');

// Months belong to a year; across all of them they mean nothing.
ok(await p.getByText('Full Year', { exact: true }).count() === 1,
  'with a year selected the month options are there');

await allChip.click();
await p.waitForTimeout(700);
const seen = await rows();
ok(seen === 4, `all four rows of a New Year trip show at once (${seen}/4)`);
// The chip has to read as one label. Composed the usual way (month + year) it
// said "Full Year all".
const chipLabel = (await p.locator('[data-period-chip]').innerText()).trim();
ok(chipLabel === 'All years', `and the period chip reads as one thing ("${chipLabel}")`);

await p.screenshot({ path: `${OUT}/allyears.png` });

// Re-opening the sheet on "All years": the month grid steps aside rather than
// offering a choice that cannot narrow anything.
await openPeriod();
ok(await p.getByText('Full Year', { exact: true }).count() === 0,
  'and on All years the month options step aside - a month spans no years');

// Back to one year: the trip halves again, which is the behaviour that made
// the new option necessary in the first place.
await p.locator('button').filter({ hasText: /^2026$/ }).first().click();
await p.waitForTimeout(900);
const half = await rows();
ok(half === 2, `picking a single year still narrows to it (${half}/4 in 2026)`);

// ---- a big ledger: the list is capped, the totals are not ----
//
// Painting every row made All years a 1.5-2.5s stall on a real-sized ledger
// (worse on a phone). The DOM stops at the cap and the tail loads on
// request; the header keeps counting everything.
{
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 900 }, locale: 'en-GB' });
  await ctx2.addInitScript(() => {
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    localStorage.setItem('expense-tracker.v1.guest', 'true');
    localStorage.setItem('expense-tracker.v1.settings', JSON.stringify({
      onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en',
    }));
    localStorage.setItem('expense-tracker.v1.nudges', JSON.stringify({ tips: false, recap: false }));
    const cat = { id: 'groc', name: 'Groceries', type: 'expense', icon: 'ShoppingCart', color: 'text-emerald-600', bgColor: 'bg-emerald-50', selectedBg: 'bg-emerald-100', subcategories: [] };
    localStorage.setItem('expense-tracker.v1.categories', JSON.stringify([cat]));
    localStorage.setItem('expense-tracker.v1.sources', JSON.stringify([{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]));
    const txns = [];
    for (let i = 0; i < 400; i++) {
      const d = new Date(2025, 0, 1 + i);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      txns.push({ id: `e${i}`, date, type: 'expense', amount: 10, baseAmount: 10, currency: 'EUR', sourceId: 'cash', category: cat, createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z`, recurrence: 'Never repeat', description: `Spesa ${i}` });
    }
    localStorage.setItem('expense-tracker.v1.transactions', JSON.stringify(txns));
  });
  const p2 = await ctx2.newPage();
  await p2.goto(URL, { waitUntil: 'networkidle' });
  await p2.waitForTimeout(1600);
  await p2.getByRole('button', { name: 'Activity' }).first().click();
  await p2.waitForTimeout(700);
  await p2.locator('[data-period-chip]').click();
  await p2.waitForTimeout(400);
  await p2.locator('[data-period-all]').click();
  await p2.waitForTimeout(900);

  const painted = await p2.evaluate(() => (document.body.innerText.match(/Spesa \d+/g) ?? []).length);
  ok(painted >= 250 && painted <= 260,
    `a 400-row ledger paints only up to the cap, day-group aligned (${painted})`);
  const header = (await p2.locator('body').innerText()).includes('400 transactions');
  ok(header, 'while the header still counts all 400 - the cap is DOM-only');
  await p2.locator('[data-show-more-rows]').click();
  await p2.waitForTimeout(700);
  const after = await p2.evaluate(() => (document.body.innerText.match(/Spesa \d+/g) ?? []).length);
  ok(after === 400, `and Show more brings in the tail (${after}/400)`);
  await ctx2.close();
}

// ---- and never a month that has not happened ----
//
// The period list was built straight from the dates in the ledger, so one
// future-dated row - a flight booked for December, a schedule seeded ahead -
// put its month in the picker and let you browse spending that has not
// occurred. The Dashboard already refused; these two now agree with it.
{
  const ctx3 = await b.newContext({ viewport: { width: 390, height: 900 }, locale: 'en-GB' });
  await ctx3.route(/supabase\.co/, (r) => r.abort());
  await ctx3.addInitScript(() => {
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    localStorage.setItem('expense-tracker.v1.guest', 'true');
    localStorage.setItem('expense-tracker.v1.settings', JSON.stringify({
      onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en',
    }));
    localStorage.setItem('expense-tracker.v1.nudges', JSON.stringify({ tips: false, recap: false }));
    const cat = { id: 'travel', name: 'Travel', type: 'expense', icon: 'Plane', color: 'text-sky-600', bgColor: 'bg-sky-50', selectedBg: 'bg-sky-100', subcategories: [] };
    localStorage.setItem('expense-tracker.v1.categories', JSON.stringify([cat]));
    localStorage.setItem('expense-tracker.v1.sources', JSON.stringify([{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]));
    const now = new Date();
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const past = new Date(now); past.setMonth(past.getMonth() - 2);
    const soon = new Date(now); soon.setMonth(soon.getMonth() + 3);
    const nextYear = new Date(now); nextYear.setFullYear(nextYear.getFullYear() + 1);
    const tx = (id, date, description) => ({
      id, date, type: 'expense', amount: 20, baseAmount: 20, currency: 'EUR', sourceId: 'cash',
      category: cat, createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z`,
      recurrence: 'Never repeat', description,
    });
    localStorage.setItem('expense-tracker.v1.transactions', JSON.stringify([
      tx('n', iso(now), 'Questo mese'),
      tx('p', iso(past), 'Speso davvero'),
      tx('f', iso(soon), 'Volo prenotato'),
      tx('y', iso(nextYear), 'Molto avanti'),
    ]));
  });
  const p3 = await ctx3.newPage();
  await p3.goto(URL, { waitUntil: 'networkidle' });
  await p3.waitForTimeout(1600);
  await p3.getByRole('button', { name: 'Activity' }).first().click();
  await p3.waitForTimeout(800);
  await p3.locator('[data-period-chip]').click();
  await p3.waitForTimeout(500);

  const sheet = await p3.locator('body').innerText();
  const now = new Date();
  // The grid always draws twelve months and greys out the ones you cannot
  // pick - the same shape the Dashboard's picker uses - so the question is
  // whether a future month is ENABLED, not whether it is drawn.
  const shortMonth = (d) => d.toLocaleDateString('en-US', { month: 'short' });
  const soon = new Date(now); soon.setMonth(soon.getMonth() + 3);
  const cell = (d) => p3.getByRole('button', { name: shortMonth(d), exact: true }).first();

  ok(!sheet.includes(String(now.getFullYear() + 1)), 'next year is not on offer at all');
  ok(await cell(soon).isDisabled(),
    `a month three ahead cannot be picked, even holding a booked row ("${shortMonth(soon)}")`);
  ok(!(await cell(now).isDisabled()),
    `while the month you are in can ("${shortMonth(now)}")`);
  await ctx3.close();
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await b.close();
process.exit(fail.length ? 1 : 0);
