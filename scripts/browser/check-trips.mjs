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
    // Bought for the trip, months before it and outside the editor's default
    // window: the row the "look further" switch exists for.
    txns.push(row('2026-01-15', 'Assicurazione viaggio', 45, { id: 'ins', category: cats[1] }));
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
  ok(await input.count() === 1, 'tapping it opens the editor');
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
  ok(await p.locator('[data-trip-rename-note]').count() === 1,
    'and it says a rename is every row, not this one');
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

// ── the pencil edits the trip, not only its name ──────────────────────────
//
// A trip is the name on the front of its rows, so adding one, removing one
// and renaming the lot are the same write with different arguments. That is
// why they are one sheet. Nothing is written until Save, which is what makes
// the total at the top worth having: it moves as you tick.
{
  const { ctx, p } = await open();
  await openMenu(p);
  await p.locator('[data-act-menu-trips]').click();
  await p.waitForTimeout(500);
  await p.locator('[data-trip-rename]').first().click();
  await p.waitForTimeout(500);

  const marks = () => p.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll('[data-trip-row]')].map((el) => [el.getAttribute('data-trip-row'), el.getAttribute('data-trip-row-mark')])));
  const totalText = () => p.locator('[data-trip-edit-total]').innerText();
  const saveText = () => p.locator('[data-trip-rename-save]').innerText();

  const m0 = await marks();
  // Capped: the rows already in the trip are reference, and leaving all
  // fifty-six of a real holiday on screen would push the rows that can JOIN
  // one below the fold nobody reaches.
  ok(Object.values(m0).filter((v) => v === 'in').length === 5,
    `only the first few of the trip's rows are shown (${Object.values(m0).filter((v) => v === 'in').length})`);
  ok(await p.locator('[data-trip-show-all]').count() === 1, 'with a way to the rest');
  ok((await totalText()).includes('520'), `and the total is the whole trip either way (${(await totalText()).replace(/\n/g, ' ')})`);
  ok((await totalText()).includes('12'), 'as is the count');

  // The taxi that never made it into the tricount, dated inside the trip.
  ok(m0.taxi === 'off', 'the taxi paid outside the tricount is offered');
  ok(!('inc' in m0), 'income is not - a trip is spending');
  ok(!Object.keys(m0).some((id) => id === 'ins'), 'and nor is a row outside the window');
  const offeredIds = Object.entries(m0).filter(([, v]) => v === 'off').map(([k]) => k);
  ok(!offeredIds.some((id) => id.startsWith('x') && Number(id.slice(1)) >= 12),
    'rows already in another trip are left alone');
  await p.screenshot({ path: `${OUT}/trip-edit.png` });

  // Tick it in: the number moves before anything is written.
  await p.locator('[data-trip-row="taxi"]').click();
  await p.waitForTimeout(400);
  ok((await totalText()).includes('555'), `ticking a row moves the total (${(await totalText()).replace(/\n/g, ' ')})`);
  ok((await totalText()).includes('520'), 'and keeps the old one beside it, struck through');
  ok(/\+1/.test(await saveText()), `the button says what it will do (${(await saveText()).replace(/\n/g, ' ')})`);

  // And one out. x2 is the first August dinner, 20 - past the cap, so this
  // also proves the rest of the trip is actually reachable.
  await p.locator('[data-trip-show-all]').click();
  await p.waitForTimeout(400);
  {
    const n = Object.values(await marks()).filter((v) => v === 'in').length;
    ok(n === 12, `showing the rest brings the whole trip into view (${n})`);
  }
  await p.locator('[data-trip-row="x2"]').click();
  await p.waitForTimeout(300);
  ok((await marks()).x2 === 'out', 'a row ticked out is struck rather than removed from view');
  ok((await totalText()).includes('535'), `the total follows it too (${(await totalText()).replace(/\n/g, ' ')})`);
  ok(/\+1/.test(await saveText()) && /1/.test(await saveText()), 'and the button counts both directions');

  // Nothing is written yet.
  const before = await p.evaluate(() =>
    JSON.parse(localStorage.getItem('expense-tracker.v1.transactions') ?? '[]').find((t) => t.id === 'taxi'));
  ok(before.description === 'Taxi aeroporto', 'and none of it is written before Save');

  await p.locator('[data-trip-rename-save]').click();
  await p.waitForTimeout(1000);
  const after = await p.evaluate(() => {
    const all = JSON.parse(localStorage.getItem('expense-tracker.v1.transactions') ?? '[]');
    const by = (id) => all.find((t) => t.id === id);
    return { taxi: by('taxi'), dropped: by('x2') };
  });
  ok(after.taxi.description === 'Azores - Taxi aeroporto', `the added row takes the name (${after.taxi.description})`);
  ok(after.taxi.category.id === 'travel', 'AND the travel category, or it would not be in the trip');
  ok(after.dropped.description === 'Cena 0', `the dropped row loses the name (${after.dropped.description})`);
  ok(after.dropped.category.id === 'travel', 'and keeps its category - nothing here knows where it came from');

  const sheet = await p.locator('[data-trips-sheet]').innerText();
  ok(/12 expenses/.test(sheet), 'the card is still twelve rows - one out, one in');
  ok(/535/.test(sheet.replace(/[.,]/g, (c) => c)) || /535/.test(sheet), `and carries the total the editor promised (${sheet.split('\n').slice(0, 4).join(' | ')})`);
  await ctx.close();
}

// ── looking further than the trip's own days ──────────────────────────────
{
  const { ctx, p } = await open();
  await openMenu(p);
  await p.locator('[data-act-menu-trips]').click();
  await p.waitForTimeout(500);
  await p.locator('[data-trip-rename]').first().click();
  await p.waitForTimeout(500);

  ok(await p.locator('[data-trip-row="ins"]').count() === 0,
    'travel insurance bought in January is outside the trip\'s own days');
  const narrow = (await p.locator('[data-trip-window]').innerText()).trim();
  await p.locator('[data-trip-widen]').click();
  await p.waitForTimeout(400);
  ok(await p.locator('[data-trip-row="ins"]').count() === 1, 'until the window is widened, and then it is reachable');
  const wide = (await p.locator('[data-trip-window]').innerText()).trim();
  ok(narrow !== wide, `and the window says so out loud ("${narrow}" then "${wide}")`);
  await ctx.close();
}

// ── the cliff, said before the tap and not blocking it ────────────────────
//
// Below three rows the app stops reading a group as a trip. Deciding a
// weekend was not really one is a legitimate thing to want, and the rows keep
// their name either way - so this warns and lets you through.
{
  const { ctx, p } = await open();
  await openMenu(p);
  await p.locator('[data-act-menu-trips]').click();
  await p.waitForTimeout(500);
  // Newest first: Azores, Formentera 2026, Formentera 2025. The last has five.
  await p.locator('[data-trip-rename]').nth(2).click();
  await p.waitForTimeout(500);
  const ids = await p.evaluate(() =>
    [...document.querySelectorAll('[data-trip-row][data-trip-row-mark="in"]')].map((el) => el.getAttribute('data-trip-row')));
  ok(ids.length === 5, `the 2025 Formentera has five rows (${ids.length})`);
  ok(await p.locator('[data-trip-floor]').count() === 0, 'and nothing to warn about yet');

  for (const id of ids.slice(0, 3)) {
    await p.locator(`[data-trip-row="${id}"]`).click();
    await p.waitForTimeout(350);
  }
  ok(await p.locator('[data-trip-floor]').count() === 1, 'taking it under three warns that it stops being a trip');
  ok(await p.locator('[data-trip-rename-save]').isEnabled(), 'and does not block it - the expenses are not going anywhere');
  await p.screenshot({ path: `${OUT}/trip-edit-floor.png` });

  await p.locator('[data-trip-rename-save]').click();
  await p.waitForTimeout(1000);
  const sheet = await p.locator('[data-trips-sheet]').innerText();
  // Counted, not matched on text: "2 expenses" is a substring of "12
  // expenses", and the first version of this passed the Azores card off as
  // the one that was supposed to have gone.
  ok(await p.locator('[data-trip-card]').count() === 2,
    `the card goes, and the other two stay (${sheet.replace(/\n/g, ' | ')})`);
  ok(!/Aug 2025/.test(sheet), 'with nothing left of it in the sheet');
  const left = await p.evaluate(() =>
    JSON.parse(localStorage.getItem('expense-tracker.v1.transactions') ?? '[]')
      .filter((t) => (t.description ?? '').includes('Formentera')).length);
  ok(left === 7, `while the expenses stay - two of them still named (${left})`);
  await ctx.close();
}

// ── building a trip out of expenses you already have ──────────────────────
//
// This worked before: hold a row down in Activity, tick some more, tap the
// aeroplane, "New trip...". Every piece of it, reachable only by somebody who
// already knew. Here it is where a person looking at their trips would reach.
{
  const { ctx, p } = await open();
  await openMenu(p);
  await p.locator('[data-act-menu-trips]').click();
  await p.waitForTimeout(500);
  ok(await p.locator('[data-trips-new]').count() === 1, 'the sheet has a + beside its close button');

  await p.locator('[data-trips-new]').click();
  await p.waitForTimeout(500);
  ok(await p.locator('[data-trip-new-sheet]').count() === 1, 'which opens a trip with nothing in it yet');
  ok(await p.locator('[data-trip-new-save]').isDisabled(), 'and nothing to save');

  const offered = await p.evaluate(() =>
    [...document.querySelectorAll('[data-trip-row]')].map((el) => el.getAttribute('data-trip-row')));
  ok(offered.includes('taxi'), `it offers expenses in no trip (${offered.join(',')})`);
  ok(!offered.includes('inc'), 'not income');
  ok(!offered.some((id) => id.startsWith('x')), 'and not rows already in a trip');
  await p.screenshot({ path: `${OUT}/trip-new.png` });

  await p.locator('[data-trip-new-name]').fill('Weekend lungo con i ragazzi');
  await p.waitForTimeout(300);
  ok(await p.locator('[data-trip-new-error]').count() === 1,
    'a name the app could not read back is refused here too');
  await p.locator('[data-trip-new-name]').fill('Trieste');
  await p.waitForTimeout(300);
  ok(await p.locator('[data-trip-new-error]').count() === 0, 'a real one is fine');
  ok(await p.locator('[data-trip-new-save]').isDisabled(), 'but a trip with no expenses is not a trip');

  await p.locator('[data-trip-row="taxi"]').click();
  await p.waitForTimeout(400);
  ok((await p.locator('[data-trip-new-total]').innerText()).includes('35'),
    `the total builds as you tick (${(await p.locator('[data-trip-new-total]').innerText()).replace(/\n/g, ' ')})`);
  ok(await p.locator('[data-trip-new-floor]').count() === 1, 'one expense is warned about - it will not read back as a trip');
  ok(await p.locator('[data-trip-new-save]').isEnabled(), 'and still not blocked');

  await p.locator('[data-trip-new-save]').click();
  await p.waitForTimeout(1000);
  const written = await p.evaluate(() =>
    JSON.parse(localStorage.getItem('expense-tracker.v1.transactions') ?? '[]').find((t) => t.id === 'taxi'));
  ok(written.description === 'Trieste - Taxi aeroporto', `the picked row takes the name (${written.description})`);
  ok(written.category.id === 'travel', 'and moves to the travel category');
  await ctx.close();
}

// ── naming a new one after a trip that already exists ─────────────────────
{
  const { ctx, p } = await open();
  await openMenu(p);
  await p.locator('[data-act-menu-trips]').click();
  await p.waitForTimeout(500);
  await p.locator('[data-trips-new]').click();
  await p.waitForTimeout(500);
  await p.locator('[data-trip-row="taxi"]').click();
  await p.waitForTimeout(300);
  await p.locator('[data-trip-new-name]').fill('Azores');
  await p.waitForTimeout(500);
  // Same surprise as renaming onto a neighbour, and the same sentence: the
  // taxi is dated inside the Azores, so it joins that trip rather than
  // starting one.
  ok(await p.locator('[data-trip-new-merge]').count() === 1,
    'naming it after a trip it would join says so before the tap');
  await p.screenshot({ path: `${OUT}/trip-new-merge.png` });
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
