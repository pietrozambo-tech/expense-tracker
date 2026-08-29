// Looking at one trip: a filter, not a search.
//
// The way into a trip used to be the search box - the trips sheet put the
// name in it and relied on every description starting with it. That works
// because the name IS the prefix, and it took the search box hostage, showed
// two chips for one idea, and would sweep up any other row whose description
// happened to contain the word. It also meant reaching for a trip yourself
// was typing its name into a magnifying glass.
//
// Now it is a filter row like Source and Category, and picking one widens the
// period to every year - not for convenience: a trip's flights are booked
// months before it is taken, so under a single month the total on screen is a
// PART of the trip that looks like the whole of it.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const OUT = process.env.CHECK_OUT ?? new globalThis.URL('.artifacts', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });

const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

const TRIP = 'Azores \u{1F1F5}\u{1F1F9}';

const CATS = [
  { id: 'travel', name: 'Travel', type: 'expense', icon: 'Plane', color: 'text-sky-600', bgColor: 'bg-sky-50', selectedBg: 'bg-sky-100', subcategories: ['Hotel', 'Food'] },
  { id: 'groceries', name: 'Groceries', type: 'expense', icon: 'ShoppingCart', color: 'text-emerald-600', bgColor: 'bg-emerald-50', selectedBg: 'bg-emerald-100', subcategories: ['Supermarket'] },
];

const open = async (withTrips = true) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, locale: 'en-GB' });
  await ctx.route(/supabase\.co/, (r) => r.abort());
  await ctx.addInitScript(([cats, trip, seedTrips]) => {
    const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    put('guest', 'true');
    put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en' });
    put('nudges', { tips: false, recap: false });
    put('categories', cats);
    put('sources', [{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]);
    const row = (id, date, description, over = {}) => ({
      id, date, type: 'expense', amount: 20, baseAmount: 20, currency: 'EUR', sourceId: 'cash',
      category: cats[0], subcategory: 'Food',
      createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z`,
      recurrence: 'Never repeat', description, ...over,
    });
    const plain = [
      row('g1', '2026-08-10', 'Spesa settimanale', { category: cats[1], subcategory: 'Supermarket' }),
      row('g2', '2026-08-11', 'Farmacia', { category: cats[1], subcategory: 'Supermarket' }),
    ];
    put('transactions', seedTrips ? [
      // The trip itself, plus a booking made five months earlier - the reason
      // a single month cannot be trusted to show a trip's total.
      row('a1', '2026-08-21', `${trip} - Cena porto`),
      row('a2', '2026-08-22', `${trip} - Hotel`),
      row('a3', '2026-08-23', `${trip} - Pranzo`),
      row('a4', '2026-08-24', `${trip} - Burger`),
      row('a5', '2026-08-25', `${trip} - Wine tasting`),
      row('a0', '2026-03-13', `${trip} - Volo`),
      // Two trips under ONE name, a year apart: a search for "Formentera"
      // cannot tell them apart, and the filter has to.
      row('f1', '2025-07-04', 'Formentera - Cena'),
      row('f2', '2025-07-05', 'Formentera - Hotel'),
      row('f3', '2025-07-06', 'Formentera - Volo'),
      row('f4', '2026-07-04', 'Formentera - Cena'),
      row('f5', '2026-07-05', 'Formentera - Hotel'),
      row('f6', '2026-07-06', 'Formentera - Volo'),
      ...plain,
    ] : plain);
  }, [CATS, TRIP, withTrips]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Activity' }).first().click();
  await p.waitForTimeout(700);
  return { ctx, p };
};

const openFilters = async (p) => {
  await p.getByRole('button', { name: 'Filters' }).first().click();
  await p.waitForTimeout(500);
};
const shownIds = (p) => p.evaluate(() =>
  [...document.querySelectorAll('[data-row-id]')].map((el) => el.getAttribute('data-row-id')));
const periodLabel = (p) => p.locator('[data-period-chip]').innerText();

// ── nobody without a trip is offered a trip filter ────────────────────────
{
  const { ctx, p } = await open(false);
  await openFilters(p);
  const sheet = await p.locator('[data-overlay], .animate-slide-up').last().innerText();
  ok(/Category/.test(sheet), 'the filters sheet is open');
  ok(await p.locator('[data-filter-trip]').count() === 0,
    'and it has no Trip row - a filter for a thing you do not have only ever says "All"');
  await ctx.close();
}

// ── with one, it is there, and it takes the period with it ────────────────
{
  const { ctx, p } = await open();
  ok((await periodLabel(p)).includes('Aug'), `the list opens on this month (${await periodLabel(p)})`);

  await openFilters(p);
  ok(await p.locator('[data-filter-trip]').count() === 1, 'the Trip row is there for someone who has one');
  await p.locator('[data-filter-trip]').click();
  await p.waitForTimeout(500);
  const list = await p.locator('[data-trip-filter]').innerText();
  ok(/Azores/.test(list) && /Formentera/.test(list), 'and it lists the trips');
  await p.screenshot({ path: `${OUT}/tripfilter-list.png` });

  // Two Formenteras, a year apart, under one name. The dates are the only
  // thing on the row that tells them apart.
  ok((list.match(/Formentera/g) ?? []).length === 2, 'two holidays under one name are two entries');
  // Same days, a year apart. Without the year on the label these two rows
  // are identical, which is the one case the label exists for.
  // The Azores span runs from the March flight to the end of the holiday,
  // which is the honest answer and the reason the period has to widen.
  ok(/4-6 Jul 2025/.test(list) && /4-6 Jul 2026/.test(list) && /13 Mar - 25 Aug 2026/.test(list),
    `each carrying its own dates (${list.replace(/\n/g, ' / ')})`);

  const azores = await p.locator('[data-trip-filter-option]').filter({ hasText: 'Azores' }).getAttribute('data-trip-filter-option');
  await p.locator(`[data-trip-filter-option="${azores}"]`).click();
  await p.waitForTimeout(800);

  const ids = await shownIds(p);
  // a0 is the March booking. If the period had stayed on August it would be
  // missing, and the trip's total on screen would be a part of the trip
  // wearing the trip's name.
  ok(ids.sort().join(',') === 'a0,a1,a2,a3,a4,a5', `only that trip's rows, bookings included (${ids.join(',')})`);
  ok((await periodLabel(p)).toLowerCase().includes('all'),
    `and the period opened out to cover them (${await periodLabel(p)})`);
  await p.screenshot({ path: `${OUT}/tripfilter-on.png` });
  await ctx.close();
}

// ── the chip says which, and gets out of it in one tap ────────────────────
{
  const { ctx, p } = await open();
  await openFilters(p);
  await p.locator('[data-filter-trip]').click();
  await p.waitForTimeout(500);
  const key = await p.locator('[data-trip-filter-option]').filter({ hasText: 'Azores' }).getAttribute('data-trip-filter-option');
  await p.locator(`[data-trip-filter-option="${key}"]`).click();
  await p.waitForTimeout(800);

  const bar = await p.locator('[data-period-chip]').locator('xpath=../..').innerText();
  ok(bar.includes('Azores'), `the chip row names the trip (${bar.replace(/\n/g, ' | ')})`);
  ok(await p.locator('[data-filter-chip="trip"]').count() === 1, 'as a chip of its own, like any other filter');
  // The search box is left alone now - it used to be carrying the trip name.
  ok(!/Azores/.test(await p.locator('[data-period-chip]').innerText()), 'and the period chip is still a period');

  await p.locator('[data-filter-chip="trip"]').click();
  await p.waitForTimeout(700);
  const ids = await shownIds(p);
  ok(ids.includes('g1'), `clearing it brings everything back (${ids.length} rows)`);
  await ctx.close();
}

// ── two trips, one name: picking one means its own rows ───────────────────
{
  const { ctx, p } = await open();
  await openFilters(p);
  await p.locator('[data-filter-trip]').click();
  await p.waitForTimeout(500);
  // The 2025 one - the older of the two Formenteras.
  const keys = await p.locator('[data-trip-filter-option]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-trip-filter-option')).filter((k) => k && k.startsWith('formentera')));
  ok(keys.length === 2, `both Formenteras are addressable (${keys.join(' , ')})`);
  const older = keys.sort()[0];
  await p.locator(`[data-trip-filter-option="${older}"]`).click();
  await p.waitForTimeout(800);
  const ids = await shownIds(p);
  ok(ids.sort().join(',') === 'f1,f2,f3',
    `only the 2025 one, which no name search could have done (${ids.join(',')})`);
  await ctx.close();
}

// ── the trips sheet drills in through the same door ───────────────────────
{
  const { ctx, p } = await open();
  await p.getByLabel('More').first().click().catch(async () => {
    await p.locator('button').filter({ hasText: '⋯' }).first().click();
  });
  await p.waitForTimeout(500);
  await p.getByText('Trips', { exact: false }).first().click();
  await p.waitForTimeout(700);
  ok(await p.locator('[data-trips-sheet]').count() === 1, 'the trips sheet opens');

  await p.locator('[data-trip-card]').first().click();
  await p.waitForTimeout(900);
  const ids = await shownIds(p);
  ok(ids.length > 0 && ids.every((id) => id.startsWith('a')),
    `tapping a trip card shows that trip (${ids.join(',')})`);
  // What it used NOT to do: hijack the search box.
  const bar = await p.locator('[data-period-chip]').locator('xpath=../..').innerText();
  ok(!/"/.test(bar), `and leaves the search box alone (${bar.replace(/\n/g, ' | ')})`);
  await ctx.close();
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await b.close();
process.exit(fail.length ? 1 : 0);
