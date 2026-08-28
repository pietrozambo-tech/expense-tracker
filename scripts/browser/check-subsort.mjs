// "Share of Travel" reads in an order.
//
// The rows came out in whatever order the transactions happened to be walked
// in, which reads as no order at all - and the remainder, often the biggest
// row of the lot, was pinned to the bottom under the 1% ones. This is a card
// whose whole job is to say what you spend most on.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const OUT = process.env.CHECK_OUT ?? new globalThis.URL('.artifacts', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });

const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, locale: 'en-GB' });
await ctx.route(/supabase\.co/, (r) => r.abort());
await ctx.addInitScript(() => {
  const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  put('guest', 'true');
  put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en' });
  put('nudges', { tips: false, recap: false });
  const travel = { id: 'travel', name: 'Travel', type: 'expense', icon: 'Plane', color: 'text-sky-600', bgColor: 'bg-sky-50', selectedBg: 'bg-sky-100', subcategories: ['Flights', 'Hotel', 'Food', 'Activities'] };
  put('categories', [travel]);
  put('sources', [{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]);

  // Deliberately written in an order that is neither by size nor A-Z, so a
  // list that merely echoes insertion order is visibly wrong. The row with no
  // subcategory at all is the biggest, which is the case that was pinned last.
  const rows = [
    ['Activities', 10],
    ['Flights', 255],
    [null, 650],
    ['Food', 14],
    ['Hotel', 125],
  ];
  put('transactions', rows.map(([sub, amount], i) => {
    const date = `2026-08-${String(i + 2).padStart(2, '0')}`;
    return {
      id: `t${i}`, date, type: 'expense', amount, baseAmount: amount, currency: 'EUR',
      sourceId: 'cash', category: travel, ...(sub ? { subcategory: sub } : {}),
      createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z`,
      recurrence: 'Never repeat', description: `Azores ${i}`,
    };
  }));
});

const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
await p.getByRole('button', { name: 'Trend' }).first().click();
await p.waitForTimeout(1200);

// Open Travel's breakdown.
await p.getByText('Travel', { exact: true }).first().click();
await p.waitForTimeout(600);

// Read the LABELS off the screen, not a data attribute the fix introduced -
// otherwise this passes for the wrong reason and cannot be run against the
// behaviour it replaced. The caption's siblings are the rows, in both versions.
const names = () => p.evaluate(() => {
  const box = document.querySelector('[data-sub-caption]')?.parentElement;
  if (!box) return [];
  return [...box.children]
    .filter((el) => !el.hasAttribute('data-sub-caption'))
    .map((el) => el.textContent.trim().replace(/\s*\d+%.*$/, '').trim());
});

const byAmount = await names();
ok(byAmount.length === 5, `every bucket has a row, the unsubcategorised one included (${byAmount.length})`);
ok(byAmount.join(', ') === 'No subcategory, Flights, Hotel, Food, Activities',
  `biggest first, all the way down (${byAmount.join(', ')})`);
// The one the report was about: 650 is the largest, and it used to sit last.
ok(byAmount[0] === 'No subcategory', 'the biggest row is at the top even when it is the remainder');
ok(await p.locator('[data-sub-rest]').count() === 1, 'and it is still marked as the remainder, not a real subcategory');

await p.screenshot({ path: `${OUT}/subsort.png` });

// The card has one sort control; the sub-list is part of the card.
await p.getByLabel('Toggle sort order').click();
await p.waitForTimeout(600);
const alpha = await names();
ok(alpha.join(', ') === 'Activities, Flights, Food, Hotel, No subcategory',
  `switching the card to A-Z takes the sub-list with it (${alpha.join(', ')})`);

await p.getByLabel('Toggle sort order').click();
await p.waitForTimeout(600);
ok((await names()).join(', ') === 'No subcategory, Flights, Hotel, Food, Activities', 'and back');

await ctx.close();
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await b.close();
process.exit(fail.length ? 1 : 0);
