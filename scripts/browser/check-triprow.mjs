// The trip on the description field: visible, removable, and no longer
// removable by accident.
//
// A trip has no field of its own - it is the name on the front of the
// description - so the edit screen has always been able to take a row OUT of
// a trip, and until now only by accident: the box held
// "Azores 🇵🇹 - Cena porto" as plain text, and rewriting the description to
// "Cena al porto" dropped the row out of the trip. The total fell, the
// expense was still there, and nothing said anything.
//
// The first block below is that exact sequence. It is the reason this file
// exists, and it fails on the old build.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const OUT = process.env.CHECK_OUT ?? new globalThis.URL('.artifacts', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });

const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

const TRIP = 'Azores \u{1F1F5}\u{1F1F9}';

const CATS = [
  { id: 'travel', name: 'Travel', type: 'expense', icon: 'Plane', color: 'text-sky-600', bgColor: 'bg-sky-50', selectedBg: 'bg-sky-100', subcategories: ['Hotel', 'Food', 'Flights'] },
  { id: 'groceries', name: 'Groceries', type: 'expense', icon: 'ShoppingCart', color: 'text-emerald-600', bgColor: 'bg-emerald-50', selectedBg: 'bg-emerald-100', subcategories: ['Supermarket'] },
];
const INC = [{ id: 'salary', name: 'Salary', type: 'income', icon: 'Wallet', color: 'text-teal-600', bgColor: 'bg-teal-50', selectedBg: 'bg-teal-100', subcategories: [] }];

const open = async () => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, locale: 'en-GB' });
  await ctx.route(/supabase\.co/, (r) => r.abort());
  await ctx.addInitScript(([cats, inc, trip]) => {
    const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
    // Without this guard addInitScript re-seeds on every reload and quietly
    // undoes whatever the test just saved.
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    put('guest', 'true');
    put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en' });
    put('nudges', { tips: false, recap: false });
    put('categories', cats);
    put('income-categories', inc);
    put('sources', [{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]);
    const row = (id, date, description, over = {}) => ({
      id, date, type: 'expense', amount: 20, baseAmount: 20, currency: 'EUR', sourceId: 'cash',
      category: cats[0], subcategory: 'Food',
      createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z`,
      recurrence: 'Never repeat', description, ...over,
    });
    put('transactions', [
      // A real trip: four rows in one month, so detectTrips believes it.
      row('t1', '2026-08-21', `${trip} - Cena porto`),
      row('t2', '2026-08-22', `${trip} - Hotel`),
      row('t3', '2026-08-23', `${trip} - Volo`),
      row('t4', '2026-08-24', `${trip} - Pranzo`),
      // Travel spending during the trip that never got the name.
      row('loose', '2026-08-22', 'Noleggio auto', { subcategory: undefined }),
      // Filed elsewhere, but dated in the middle of it.
      row('taxi', '2026-08-23', 'Taxi aeroporto', { category: cats[1], subcategory: 'Supermarket' }),
      // A prefix that names no trip: a description, and it must stay one.
      // Dated in the same month as everything else, because Activity opens on
      // the current period and a row outside it cannot be tapped at all.
      row('volo', '2026-08-05', 'Volo - andata'),
      // Same month, but outside the trip's dates and filed elsewhere: there
      // is nothing to say about it.
      row('far', '2026-08-05', 'Spesa settimanale', { category: cats[1], subcategory: 'Supermarket' }),
      // Two more trips, so there is an order to get wrong and a list to open.
      row('w1', '2026-08-05', 'Weekend Trieste - Cena'),
      row('w2', '2026-08-06', 'Weekend Trieste - Ostello'),
      row('w3', '2026-08-07', 'Weekend Trieste - Treno'),
      row('o1', '2026-01-10', 'Vecchio - Cena'),
      row('o2', '2026-01-11', 'Vecchio - Hotel'),
      row('o3', '2026-01-12', 'Vecchio - Volo'),
      // Income cannot be in a trip at all.
      row('pay', '2026-08-22', 'Stipendio', { type: 'income', category: inc[0], subcategory: undefined }),
    ]);
  }, [CATS, INC, TRIP]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Activity' }).first().click();
  await p.waitForTimeout(700);
  return { ctx, p };
};

const openRow = async (p, id) => {
  await p.locator(`[data-row-id="${id}"]`).click();
  await p.waitForTimeout(800);
};
const descValue = (p) => p.locator('[data-desc-input]').inputValue();
const chip = (p) => p.locator('[data-trip-chip]');
// Tolerant on purpose: an absent chip is a FAILING assertion above, not an
// exception that kills the run and hides every assertion after it.
const chipText = async (p) => (await chip(p).count()) ? (await chip(p).innerText()).trim() : '';
const stored = (p, id) => p.evaluate(
  (rowId) => JSON.parse(localStorage.getItem('expense-tracker.v1.transactions') ?? '[]').find((t) => t.id === rowId),
  id,
);
// The picker lives inside the travel category's panel now, so getting to it
// means filing the row there first - which is exactly the point: a trip needs
// that category to exist at all.
const pickTravel = async (p) => {
  await p.getByRole('button', { name: 'Travel' }).first().click();
  await p.waitForTimeout(400);
};
const save = async (p) => {
  await p.getByRole('button', { name: 'Update Expense' }).click();
  await p.waitForTimeout(900);
};

// ── the trip is an object, and rewriting the description leaves it alone ──
{
  const { ctx, p } = await open();
  await openRow(p, 't1');

  ok(await chip(p).count() === 1, 'a trip expense shows its trip as a chip beside the description');
  ok((await chipText(p)).includes(TRIP), `the chip is the trip, flag and all (${await chipText(p)})`);
  ok(await descValue(p) === 'Cena porto', `and the field holds the description alone ("${await descValue(p)}")`);

  await p.screenshot({ path: `${OUT}/triprow-chip.png` });

  // THE regression. Before the chip, this took the row out of the trip.
  await p.locator('[data-desc-input]').fill('Cena al porto');
  await p.waitForTimeout(250);
  ok(await chip(p).count() === 1, 'rewriting the description does not disturb the trip');
  await save(p);
  const after = await stored(p, 't1');
  ok(after.description === `${TRIP} - Cena al porto`,
    `saving keeps the row in the trip ("${after.description}")`);
  ok(after.category.id === 'travel', 'and where it was filed');
  await ctx.close();
}

// ── taking it out, on purpose ─────────────────────────────────────────────
{
  const { ctx, p } = await open();
  await openRow(p, 't2');
  await p.locator('[data-trip-chip-remove]').click();
  await p.waitForTimeout(300);
  ok(await chip(p).count() === 0, 'the ✕ takes the trip off');
  ok(await descValue(p) === 'Hotel', 'leaving the description as it was');
  await save(p);
  const after = await stored(p, 't2');
  ok(after.description === 'Hotel', `the name is gone from the row ("${after.description}")`);
  // Same rule the bulk edit follows: nothing here knows where the row came
  // from, so the category is not moved back to anywhere.
  ok(after.category.id === 'travel', 'and the category stays where it was, not guessed at');
  await ctx.close();
}

// ── putting one in ────────────────────────────────────────────────────────
{
  const { ctx, p } = await open();
  await openRow(p, 'loose');
  ok(await chip(p).count() === 0, 'travel spending with no name shows no chip');
  ok(await p.locator('[data-trip-panel]').count() === 1,
    'and a row already filed under travel has the picker open in front of it');
  await p.screenshot({ path: `${OUT}/triprow-offer.png` });

  await p.locator(`[data-trip-chip-option="${TRIP}"]`).click();
  await p.waitForTimeout(300);
  ok(await chip(p).count() === 1, 'tapping the trip attaches it');
  ok(await descValue(p) === 'Noleggio auto', 'and the description is untouched');
  await save(p);
  const after = await stored(p, 'loose');
  ok(after.description === `${TRIP} - Noleggio auto`, `the name goes on the front, spelled exactly ("${after.description}")`);
  await ctx.close();
}

// ── from another category, which has to move too ──────────────────────────
{
  const { ctx, p } = await open();
  await openRow(p, 'taxi');
  ok(await p.locator('[data-trip-panel]').count() === 0,
    'an expense filed elsewhere is asked nothing about trips');
  await pickTravel(p);
  ok(await p.locator('[data-trip-panel]').count() === 1, 'until it is filed under travel');
  await p.locator(`[data-trip-chip-option="${TRIP}"]`).click();
  await p.waitForTimeout(400);
  await save(p);
  const after = await stored(p, 'taxi');
  // Both conditions or neither: a row that took the name while filed under
  // Groceries would not appear in the trip - an edit that looks like it
  // worked and did nothing.
  ok(after.description === `${TRIP} - Taxi aeroporto`, 'it takes the name');
  ok(after.category.id === 'travel', 'AND is in the travel category, or it would not be in the trip');
  ok(after.subcategory === undefined, 'the old subcategory goes with the old category');
  await ctx.close();
}

// ── and it stays quiet the rest of the time ───────────────────────────────
{
  const { ctx, p } = await open();

  await openRow(p, 'volo');
  ok(await chip(p).count() === 0, 'a prefix naming no trip is not called one');
  ok(await descValue(p) === 'Volo - andata',
    `the sentence is left whole ("${await descValue(p)}")`);

  await p.getByLabel('Close').click();
  await p.waitForTimeout(800);
  // THE reason the picker moved. This row is dated during the trip, and under
  // the old placement it was asked about one - as was every other expense
  // written that fortnight, holiday or not.
  await openRow(p, 'far');
  ok(await p.locator('[data-trip-panel]').count() === 0,
    'an ordinary expense is asked nothing, even dated in the middle of a trip');

  await p.getByLabel('Close').click();
  await p.waitForTimeout(800);
  await openRow(p, 'pay');
  await p.waitForTimeout(300);
  ok(await chip(p).count() === 0 && await p.locator('[data-trip-panel]').count() === 0,
    'and income is left out of it - a trip is spending');
  await ctx.close();
}

// ── the order, and the way to the rest of them ────────────────────────────
{
  const { ctx, p } = await open();
  await openRow(p, 'loose');
  const chips = await p.locator('[data-trip-chip-option]').allInnerTexts();
  // Two trips exist; the row is dated inside one of them, so that one leads.
  ok(chips[0].trim() === TRIP, `the trip the date falls inside comes first (${chips.map((c) => c.trim()).join(' | ')})`);
  ok(chips.length === 2, 'and only a couple are shown, or the row wraps over the subcategories');
  ok(await p.locator('[data-trip-more]').count() === 1, 'with a way to the rest of them');

  await p.locator('[data-trip-more]').click();
  await p.waitForTimeout(500);
  const sheet = await p.locator('[data-trip-assign]').innerText();
  ok(/Weekend Trieste/.test(sheet) && /Vecchio/.test(sheet), 'which lists every trip, not just the near ones');
  // Dates, because two trips with similar names are told apart by when they
  // were, not by what they are called.
  ok(/21-24 Aug 2026/.test(sheet), `each one carrying its own dates (${sheet.replace(/\n/g, ' / ')})`);
  ok(/No trip/i.test(sheet), 'and the way out of a trip is on the same list');
  await ctx.close();
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await b.close();
process.exit(fail.length ? 1 : 0);
