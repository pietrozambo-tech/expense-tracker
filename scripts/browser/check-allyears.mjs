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

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await b.close();
process.exit(fail.length ? 1 : 0);
