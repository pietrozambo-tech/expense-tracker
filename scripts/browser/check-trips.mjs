// Trips: the sheet, and putting rows into one after the fact.
//
// The grouping itself is the unit suite's job (pnpm test:trips). This is the
// half that only exists on screen: that the menu entry stays away from people
// with no trips, that opening a trip escapes the period filter, and that the
// late taxi you paid in cash actually lands in the trip rather than merely
// getting its name.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const OUT = process.env.CHECK_OUT ?? new globalThis.URL('.artifacts', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });

const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

const CATS = [
  { id: 'travel', name: 'Travel', type: 'expense', icon: 'Plane', color: 'text-sky-600', bgColor: 'bg-sky-50', selectedBg: 'bg-sky-100', subcategories: ['Flights', 'Hotel', 'Food'] },
  { id: 'trans', name: 'Transportation', type: 'expense', icon: 'Car', color: 'text-amber-600', bgColor: 'bg-amber-50', selectedBg: 'bg-amber-100', subcategories: ['Taxi'] },
];
const INCOME = [
  { id: 'sal', name: 'Salary', type: 'income', icon: 'Briefcase', color: 'text-emerald-600', bgColor: 'bg-emerald-50', selectedBg: 'bg-emerald-100', subcategories: [] },
];

// Shaped like the real import: a couple of booking rows months early, the bulk
// of the trip in one month. Formentera twice, a year apart. Plus a taxi that
// never made it into the tricount, and an income row.
const seed = ([cats, income, full]) => {
  const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  put('guest', 'true');
  put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en' });
  put('nudges', { tips: false, recap: false });
  put('categories', cats);
  put('income-categories', income);
  put('sources', [{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]);

  let n = 0;
  const row = (date, description, amount, over = {}) => ({
    id: `x${n++}`, date, type: 'expense', amount, baseAmount: amount, currency: 'EUR',
    sourceId: 'cash', category: cats[0], createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`, recurrence: 'Never repeat', description, ...over,
  });

  const txns = [];
  // Azores: 2 booked in March, 10 in August. One trip.
  txns.push(row('2026-03-13', 'Azores - Volo Lisbona', 100, { subcategory: 'Flights' }));
  txns.push(row('2026-03-13', 'Azores - Volo Ponta', 100, { subcategory: 'Flights' }));
  for (let i = 0; i < 6; i++) txns.push(row('2026-08-21', `Azores - Cena ${i}`, 20, { subcategory: 'Food' }));
  for (let i = 0; i < 4; i++) txns.push(row('2026-08-22', `Azores - Hotel ${i}`, 50, { subcategory: 'Hotel' }));

  if (full) {
    // Formentera, two summers, five rows each.
    for (let i = 0; i < 5; i++) txns.push(row('2025-08-10', `Formentera - Cena ${i}`, 20, { subcategory: 'Food' }));
    for (let i = 0; i < 5; i++) txns.push(row('2026-07-11', `Formentera - Pranzo ${i}`, 30, { subcategory: 'Food' }));
    // The one that never made it into the tricount.
    txns.push(row('2026-08-22', 'Taxi aeroporto', 35, { id: 'taxi', category: cats[1], subcategory: 'Taxi' }));
    txns.push({
      id: 'inc', date: '2026-08-20', type: 'income', amount: 900, baseAmount: 900, currency: 'EUR',
      sourceId: 'cash', category: income[0], createdAt: '2026-08-20T10:00:00.000Z',
      updatedAt: '2026-08-20T10:00:00.000Z', recurrence: 'Never repeat', description: 'Stipendio',
    });
  }
  put('transactions', txns);
};

const open = async (full = true) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, locale: 'en-GB' });
  await ctx.route(/supabase\.co/, (r) => r.abort());
  await ctx.addInitScript(seed, [CATS, INCOME, full]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Activity' }).first().click();
  await p.waitForTimeout(700);
  return { ctx, p };
};
const openMenu = async (p) => { await p.locator('[data-act-more]').click(); await p.waitForTimeout(300); };
const enterSelect = async (p) => {
  await openMenu(p);
  await p.locator('[data-act-menu-select]').click();
  await p.waitForTimeout(400);
};

// ── the sheet ─────────────────────────────────────────────────────────────
{
  const { ctx, p } = await open();
  await openMenu(p);
  ok(await p.locator('[data-act-menu-trips]').count() === 1, 'the menu offers Trips');
  await p.locator('[data-act-menu-trips]').click();
  await p.waitForTimeout(500);

  const cards = p.locator('[data-trip-card]');
  ok(await cards.count() === 3, `three trips: Azores once, Formentera twice (${await cards.count()})`);

  const sheet = await p.locator('[data-trips-sheet]').innerText();
  // Azores: 2x100 booked + 6x20 + 4x50 = 520, over twelve rows.
  ok(/520/.test(sheet), 'the Azores total counts the March bookings too');
  ok(/12 expenses/.test(sheet), 'and says how many rows it is made of');
  ok(/Aug 2026/.test(sheet), 'labelled by its peak month, not its first date');
  ok(/Hotel/.test(sheet) && /Flights/.test(sheet) && /Food/.test(sheet),
    'the breakdown names the subcategories');

  // The case that broke the naive rule.
  const formentera = (sheet.match(/Formentera/g) ?? []).length;
  ok(formentera === 2, `the same name in two summers is two cards (${formentera})`);
  ok(/Aug 2025/.test(sheet) && /Jul 2026/.test(sheet), 'and the month tells them apart');

  // The sheet is a place you went, not a strip that grew to fit. Sized by its
  // content it sat in the bottom third of the screen and left the transaction
  // list you were leaving with two thirds of it - a trip summary competing for
  // attention with the thing it summarises, and losing.
  const frame = await p.evaluate(() => {
    const el = document.querySelector('[data-trips-sheet]');
    const list = el.lastElementChild;
    return {
      h: Math.round(el.getBoundingClientRect().height),
      top: Math.round(el.getBoundingClientRect().top),
      vh: window.innerHeight,
      cards: Math.round([...list.children].reduce((h, c) => h + c.getBoundingClientRect().height, 0)),
    };
  });
  ok(frame.h >= frame.vh * 0.6, `the sheet takes two thirds of the screen (${frame.h} of ${frame.vh}px)`);
  ok(frame.h > frame.cards + 120,
    `and stands above its own content rather than hugging it (${frame.h}px of sheet, ${frame.cards}px of cards)`);
  ok(frame.top > 0, `while still showing where closing it lands (${frame.top}px of Activity above)`);
  globalThis.__sheetHeight = frame.h;

  await p.screenshot({ path: `${OUT}/trips.png` });

  // Opening one escapes the period: March bookings and August rows together.
  await cards.first().click();
  await p.waitForTimeout(700);
  const body = await p.locator('body').innerText();
  ok(/Volo Lisbona/.test(body), 'opening a trip shows its March booking...');
  ok(/Azores - Cena 0/.test(body), '...alongside its August rows');
  ok(!/Formentera/.test(body), 'and nothing from the other trip');
  await ctx.close();
}

// ── no trips, no entry ────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, locale: 'en-GB' });
  await ctx.route(/supabase\.co/, (r) => r.abort());
  await ctx.addInitScript(([cats, income]) => {
    const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
    localStorage.setItem('seeded', '1');
    put('guest', 'true');
    put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en' });
    put('nudges', { tips: false, recap: false });
    put('categories', cats);
    put('income-categories', income);
    put('sources', [{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]);
    // Two rows sharing an opening word: a coincidence, not a holiday.
    put('transactions', [
      { id: 'a', date: '2026-08-20', type: 'expense', amount: 30, baseAmount: 30, currency: 'EUR', sourceId: 'cash', category: cats[0], createdAt: '2026-08-20T10:00:00.000Z', updatedAt: '2026-08-20T10:00:00.000Z', recurrence: 'Never repeat', description: 'Milano - Roma treno' },
      { id: 'b', date: '2026-08-21', type: 'expense', amount: 80, baseAmount: 80, currency: 'EUR', sourceId: 'cash', category: cats[0], createdAt: '2026-08-21T10:00:00.000Z', updatedAt: '2026-08-21T10:00:00.000Z', recurrence: 'Never repeat', description: 'Milano - Hotel' },
    ]);
  }, [CATS, INCOME]);
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Activity' }).first().click();
  await p.waitForTimeout(600);
  await openMenu(p);
  ok(await p.locator('[data-act-menu-trips]').count() === 0,
    'two rows sharing a word are no trip, and the menu is exactly what it was');
  await ctx.close();
}

// ── the late taxi ─────────────────────────────────────────────────────────
{
  const { ctx, p } = await open();
  await enterSelect(p);
  await p.locator('[data-row-id="taxi"]').click();
  await p.waitForTimeout(300);
  await p.locator('[data-sel-action="trip"]').click();
  await p.waitForTimeout(450);
  ok(await p.locator('[data-trip-assign]').count() === 1, 'the trip sheet opens on the selection');
  ok(await p.locator('[data-trip-option="Azores"]').count() === 1, 'and offers the trips that exist');

  await p.locator('[data-trip-option="Azores"]').click();
  await p.waitForTimeout(700);

  const taxi = await p.evaluate(() =>
    JSON.parse(localStorage.getItem('expense-tracker.v1.transactions') ?? '[]').find((t) => t.id === 'taxi'));
  ok(taxi.description === 'Azores - Taxi aeroporto', 'the name goes on the front of the description');
  // Without this the row takes the name and still is not in the trip - an
  // edit that looks like it worked and did nothing.
  ok(taxi.category.id === 'travel', 'and the row moves to the travel category');
  ok(taxi.subcategory === undefined, 'its Transportation subcategory does not follow it');

  await openMenu(p);
  await p.locator('[data-act-menu-trips]').click();
  await p.waitForTimeout(500);
  const sheet = await p.locator('[data-trips-sheet]').innerText();
  ok(/555/.test(sheet), 'and the trip total picks it up (520 + 35)');
  ok(/13 expenses/.test(sheet), 'along with the count');
  await ctx.close();
}

// ── taking one back out ───────────────────────────────────────────────────
{
  const { ctx, p } = await open();
  await enterSelect(p);
  await p.locator('[data-row-id="x2"]').click();
  await p.waitForTimeout(250);
  await p.locator('[data-sel-action="trip"]').click();
  await p.waitForTimeout(450);
  await p.locator('[data-trip-option="none"]').click();
  await p.waitForTimeout(700);
  const row = await p.evaluate(() =>
    JSON.parse(localStorage.getItem('expense-tracker.v1.transactions') ?? '[]').find((t) => t.id === 'x2'));
  ok(row.description === 'Cena 0', 'No trip takes the name back off');
  ok(row.category.id === 'travel', 'and leaves the category where it is');
  await ctx.close();
}

// ── income is not trip spending ───────────────────────────────────────────
{
  const { ctx, p } = await open();
  await enterSelect(p);
  await p.locator('[data-row-id="inc"]').click();
  await p.waitForTimeout(250);
  await p.locator('[data-sel-action="trip"]').click();
  await p.waitForTimeout(500);
  ok(await p.locator('[data-trip-assign]').count() === 0, 'an income row gets no trip sheet');
  ok(/expenses only/.test(await p.locator('body').innerText()), 'it says why');
  await ctx.close();
}

// ── renaming a trip ───────────────────────────────────────────────────────
//
// A trip has no record of its own: the name on the front of every description
// IS the trip. So renaming is a rewrite of every row, and a name the detector
// cannot read back does not fail loudly - the rows change, nothing matches,
// and the trip is gone from this sheet with no way back to it. The editor has
// to refuse those before the button does anything.
{
  // Built as a string, not written into a regex: \u{...} without the u flag is
  // not an escape, and the assertion would pass or fail for the wrong reason.
  const FLAGGED = 'Azores \u{1F1F5}\u{1F1F9}';
  const { ctx, p } = await open();
  await openMenu(p);
  await p.locator('[data-act-menu-trips]').click();
  await p.waitForTimeout(500);

  ok(await p.locator('[data-trip-rename]').count() === 3, 'every trip card offers a pencil');
  // Newest first, so the first card is the Azores.
  await p.locator('[data-trip-rename]').first().click();
  await p.waitForTimeout(400);
  const input = p.locator('[data-trip-rename-input]');
  ok(await input.count() === 1, 'tapping it opens the rename sheet');
  ok(await input.inputValue() === 'Azores', 'prefilled with the name it has');
  ok(await p.locator('[data-trip-rename-save]').isDisabled(), 'and saving the same name is not an edit');

  // What the detector would refuse, the field refuses first.
  await input.fill('Weekend lungo con i ragazzi');
  await p.waitForTimeout(300);
  ok(await p.locator('[data-trip-rename-error]').count() === 1,
    'a name the app could not read back is called out');
  await p.screenshot({ path: `${OUT}/trip-rename-bad.png` });
  ok(await p.locator('[data-trip-rename-save]').isDisabled(), 'and cannot be saved');
  await input.fill('Azores - costa nord');
  await p.waitForTimeout(300);
  ok(await p.locator('[data-trip-rename-save]').isDisabled(),
    'nor can one carrying the separator, which would split every description');

  await input.fill(FLAGGED);
  await p.waitForTimeout(300);
  ok(await p.locator('[data-trip-rename-error]').count() === 0, 'a flag on the end is fine');
  const preview = (await p.locator('[data-trip-rename-preview]').innerText()).trim();
  ok(preview.startsWith(`${FLAGGED} - `), `and the preview shows a real row rewritten ("${preview}")`);
  ok(await p.locator('[data-trip-rename-save]').isEnabled(), 'now it can be saved');
  await p.screenshot({ path: `${OUT}/trip-rename.png` });

  await p.locator('[data-trip-rename-save]').click();
  await p.waitForTimeout(900);
  const sheet = await p.locator('[data-trips-sheet]').innerText();
  ok(sheet.includes(FLAGGED), 'the card wears the new name');
  ok(/12 expenses/.test(sheet), 'still with all twelve rows');
  const written = await p.evaluate(() =>
    JSON.parse(localStorage.getItem('expense-tracker.v1.transactions') ?? '[]')
      .filter((t) => (t.description ?? '').includes('Azores')).map((t) => t.description));
  ok(written.length === 12 && written.every((d) => d.startsWith(`${FLAGGED} - `)),
    `every description is rewritten, not stacked (${written.length}: ${written[0]})`);

  // Renaming onto a trip a month away merges the two. Legitimate, and not
  // undone by renaming back - so it is said before the tap.
  await p.locator('[data-trip-rename]').first().click();
  await p.waitForTimeout(400);
  await p.locator('[data-trip-rename-input]').fill('Formentera');
  await p.waitForTimeout(400);
  const merge = await p.locator('[data-trip-rename-merge]').count();
  ok(merge === 1, 'renaming onto a neighbouring trip warns that they will merge');
  await p.screenshot({ path: `${OUT}/trip-rename-merge.png` });
  const mergeText = merge ? (await p.locator('[data-trip-rename-merge]').innerText()).trim() : '';
  // Aug 2026, not the Jul 2026 card it is being renamed onto - and that is the
  // point of computing this by re-detecting instead of hunting for a
  // same-named neighbour. Merged, the twenty-two rows have one peak, so the
  // card that results is August's. A guess would have named the wrong month.
  ok(/Formentera/.test(mergeText) && /Aug 2026/.test(mergeText),
    `naming the card that will actually result ("${mergeText}")`);
  await ctx.close();
}

// ── one trip gets the same sheet as three ─────────────────────────────────
//
// The reported case, and the one a content-sized sheet gets wrong: with a
// single trip it drew a strip across the bottom third of the screen. The
// frame is the point - what is in it does not decide how much room it takes.
{
  const { ctx, p } = await open(false);
  await openMenu(p);
  await p.locator('[data-act-menu-trips]').click();
  await p.waitForTimeout(500);
  ok(await p.locator('[data-trip-card]').count() === 1, 'one trip in the ledger, one card');
  const one = await p.evaluate(() => {
    const el = document.querySelector('[data-trips-sheet]');
    return { h: Math.round(el.getBoundingClientRect().height), vh: window.innerHeight };
  });
  ok(one.h >= one.vh * 0.6,
    `and the sheet is just as tall for it (${one.h} of ${one.vh}px)`);
  ok(one.h === globalThis.__sheetHeight,
    `exactly as tall as the three-trip one (${one.h} vs ${globalThis.__sheetHeight}px)`);
  await p.screenshot({ path: `${OUT}/trips-one.png` });
  await ctx.close();
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await b.close();
process.exit(fail.length ? 1 : 0);
