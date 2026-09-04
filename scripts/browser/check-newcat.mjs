// Making a category, and a subcategory, from the form you are already filling.
//
// The whole feature is one promise: what you have typed is still there
// afterwards. Every check below is a way of breaking that promise, so the
// amount and the description are written FIRST and read back at the end of
// each one - a flow that creates the category perfectly and loses the 18 euros
// is a worse screen than the one it replaced.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';

const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

// A small catalogue, so the grid is short enough to see whole and the
// duplicate check has a real name to collide with.
const CATS = [
  { id: 'sport', name: 'Sport', type: 'expense', icon: 'Dumbbell', color: 'text-green-600', bgColor: 'bg-green-50', selectedBg: 'bg-green-100', subcategories: ['Tennis', 'Gym'] },
  { id: 'housing', name: 'Housing', type: 'expense', icon: 'Home', color: 'text-blue-600', bgColor: 'bg-blue-50', selectedBg: 'bg-blue-100', subcategories: ['Rent'] },
];
const INC = [
  { id: 'salary', name: 'Salary', type: 'income', icon: 'Briefcase', color: 'text-emerald-600', bgColor: 'bg-emerald-50', selectedBg: 'bg-emerald-100' },
];

const open = async () => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, locale: 'en-GB' });
  await ctx.route(/supabase\.co/, (r) => r.abort());
  await ctx.addInitScript(([cats, inc]) => {
    const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    put('guest', 'true');
    put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en' });
    put('nudges', { tips: false, recap: false });
    put('categories', cats);
    put('income-categories', inc);
    put('sources', [{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]);
    put('transactions', []);
  }, [CATS, INC]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  return { ctx, p };
};

/** The Add screen, with a half-written expense in it. */
const halfWritten = async (p, { amount = '18', desc = 'Taglio capelli' } = {}) => {
  await p.getByRole('button', { name: /Add transaction|Aggiungi movimento/ }).first().click();
  await p.waitForTimeout(500);
  await p.locator('[data-amount-input]').fill(amount);
  const d = p.locator('input[placeholder*="e.g."], input[placeholder*="es."]').first();
  if (await d.count()) await d.fill(desc);
  await p.waitForTimeout(250);
};

// Read the FIELDS, not the rendered text: an input's value never appears in
// innerText, so scanning the body for "18" would answer no to a form that
// still holds it perfectly.
const stillThere = async (p, amount, desc) => {
  const got = await p.evaluate(() => ({
    amount: document.querySelector('[data-amount-input]')?.value ?? '',
    desc: [...document.querySelectorAll('input')].map((i) => i.value).join(' | '),
  }));
  return got.amount.includes(amount) && got.desc.includes(desc);
};

// ── the tile is there, last, and only where a form can answer it ──────────
{
  const { ctx, p } = await open();
  await halfWritten(p);
  const tile = p.locator('[data-cat-create]');
  ok(await tile.count() === 1, 'the Add screen offers a way to make a category');
  // Last in the grid: where the scan ends is where you know it is not there.
  const lastIsCreate = await p.evaluate(() => {
    const grid = document.querySelector('[data-category-picker] .grid');
    return grid?.lastElementChild?.hasAttribute('data-cat-create') ?? false;
  });
  ok(lastIsCreate, 'and it is the last tile, whatever the grid is sorted by');
  await ctx.close();
}

// ── name, icon, colour - and the form underneath survives it ──────────────
{
  const { ctx, p } = await open();
  await halfWritten(p);
  await p.locator('[data-cat-create]').click();
  await p.waitForSelector('[data-create-cat]', { timeout: 5000 });

  ok(await p.locator('[data-create-cat-type="expense"]').count() === 1,
    'the sheet declares which list it will land on rather than asking');
  ok(await p.locator('[data-create-cat-icon]').count() > 5, 'with icons to choose from');
  ok(await p.locator('[data-create-cat-color]').count() > 5, 'and colours');

  await p.locator('[data-create-cat-name]').fill('Barbiere');
  await p.locator('[data-create-cat-icon]').nth(3).click();
  await p.locator('[data-create-cat-color]').nth(5).click();
  await p.locator('[data-create-cat-cta]').click();
  await p.waitForTimeout(600);

  ok(await p.locator('[data-create-cat]').count() === 0, 'the sheet closes on create');
  ok(await stillThere(p, '18', 'Taglio capelli'),
    'and the transaction underneath is untouched - the whole point of the sheet');

  // Created AND chosen: it was made to be used now.
  const chosen = await p.evaluate(() => {
    const tiles = [...document.querySelectorAll('[data-category-picker] .grid > button')];
    const mine = tiles.find((t) => t.textContent?.trim() === 'Barbiere');
    return mine ? mine.className.includes('ring-2') : false;
  });
  ok(chosen, 'the new category is selected, not just created');
  await ctx.close();
}

// ── a name that is already taken is said, not silently resolved ───────────
{
  const { ctx, p } = await open();
  await halfWritten(p);
  await p.locator('[data-cat-create]').click();
  await p.waitForSelector('[data-create-cat]', { timeout: 5000 });
  // "sport" against the seeded "Sport": case is not a difference between names.
  await p.locator('[data-create-cat-name]').fill('sport');
  await p.waitForTimeout(300);
  ok(await p.locator('[data-create-cat-dupe]').count() === 1,
    'a name you already have is said out loud, before anything is created');
  const cta = await p.locator('[data-create-cat-cta]').innerText();
  ok(/Use that one|Usa quella/.test(cta), `and the button changes to match (${cta})`);
  await p.locator('[data-create-cat-cta]').click();
  await p.waitForTimeout(500);

  const tiles = await p.evaluate(() =>
    [...document.querySelectorAll('[data-category-picker] .grid > button')]
      .map((t) => t.textContent?.trim()).filter((x) => /^sport$/i.test(x ?? '')));
  ok(tiles.length === 1, `no second tile under the same name (${tiles.join(', ')})`);
  await ctx.close();
}

// ── the subcategory: a chip that becomes a field, and never a sheet ────────
{
  const { ctx, p } = await open();
  await halfWritten(p);
  // Pick a category so its panel opens.
  await p.evaluate(() => {
    const t = [...document.querySelectorAll('[data-category-picker] .grid > button')]
      .find((x) => x.textContent?.trim() === 'Sport');
    t?.click();
  });
  await p.waitForTimeout(400);
  ok(await p.locator('[data-sub-add]').count() === 1, 'the subcategory row offers one more');
  await p.locator('[data-sub-add]').click();
  await p.waitForTimeout(250);
  ok(await p.locator('[data-sub-input]').count() === 1, 'which becomes a field in place');
  ok(await p.locator('[data-create-cat]').count() === 0,
    'and opens nothing over the form - a subcategory is a word, not a screen');

  await p.locator('[data-sub-input]').fill('Piscina');
  await p.locator('[data-sub-confirm]').click();
  await p.waitForTimeout(500);

  const chips = await p.evaluate(() =>
    [...document.querySelectorAll('[data-sub-chip]')].map((c) => c.getAttribute('data-sub-chip')));
  ok(chips.includes('Piscina'), `the chip exists (${chips.join(', ')})`);
  const on = await p.locator('[data-sub-chip="Piscina"]').getAttribute('class');
  ok(/blue/.test(on ?? ''), 'and is already chosen');
  ok(await stillThere(p, '18', 'Taglio capelli'), 'with the transaction still underneath it');
  await ctx.close();
}

// ── the return key does what the tick does ────────────────────────────────
{
  const { ctx, p } = await open();
  await halfWritten(p);
  await p.evaluate(() => {
    const t = [...document.querySelectorAll('[data-category-picker] .grid > button')]
      .find((x) => x.textContent?.trim() === 'Sport');
    t?.click();
  });
  await p.waitForTimeout(400);
  await p.locator('[data-sub-add]').click();
  await p.locator('[data-sub-input]').fill('Padel');
  await p.locator('[data-sub-input]').press('Enter');
  await p.waitForTimeout(400);
  ok(await p.locator('[data-sub-chip="Padel"]').count() === 1,
    'the keyboard return key confirms too - the tick is the visible half of it');
  await ctx.close();
}

// ── leaving the field with a word in it KEEPS the word ────────────────────
//
// The decision this encodes: typing "Piega" and tapping Save would otherwise
// drop it silently at the exact moment of saving. A chip too many is two taps
// to delete; a word lost as you save is not recoverable at all.
{
  const { ctx, p } = await open();
  await halfWritten(p);
  await p.evaluate(() => {
    const t = [...document.querySelectorAll('[data-category-picker] .grid > button')]
      .find((x) => x.textContent?.trim() === 'Sport');
    t?.click();
  });
  await p.waitForTimeout(400);
  await p.locator('[data-sub-add]').click();
  await p.locator('[data-sub-input]').fill('Nuoto');
  // Somewhere else entirely - the description field, as a stray tap would be.
  await p.locator('[data-amount-input]').click();
  await p.waitForTimeout(500);
  ok(await p.locator('[data-sub-chip="Nuoto"]').count() === 1,
    'a word typed and not confirmed is kept, not dropped as you look away');
  await ctx.close();
}

// ── escape is the one way out that keeps nothing ──────────────────────────
{
  const { ctx, p } = await open();
  await halfWritten(p);
  await p.evaluate(() => {
    const t = [...document.querySelectorAll('[data-category-picker] .grid > button')]
      .find((x) => x.textContent?.trim() === 'Sport');
    t?.click();
  });
  await p.waitForTimeout(400);
  await p.locator('[data-sub-add]').click();
  await p.locator('[data-sub-input]').fill('Scherma');
  await p.locator('[data-sub-input]').press('Escape');
  await p.waitForTimeout(400);
  ok(await p.locator('[data-sub-chip="Scherma"]').count() === 0, 'Escape abandons it');
  ok(await p.locator('[data-sub-add]').count() === 1, 'and the row goes back to offering one');
  await ctx.close();
}

// ── cancelling the sheet creates nothing and costs nothing ────────────────
{
  const { ctx, p } = await open();
  await halfWritten(p);
  const before = await p.evaluate(() => document.querySelectorAll('[data-category-picker] .grid > button').length);
  await p.locator('[data-cat-create]').click();
  await p.waitForSelector('[data-create-cat]', { timeout: 5000 });
  await p.locator('[data-create-cat-name]').fill('Mai creata');
  await p.locator('[data-create-cat] > div').first().press('Escape').catch(() => {});
  await p.evaluate(() => document.querySelector('[data-create-cat]')?.click());
  await p.waitForTimeout(500);
  ok(await p.locator('[data-create-cat]').count() === 0, 'a tap outside closes the sheet');
  const after = await p.evaluate(() => document.querySelectorAll('[data-category-picker] .grid > button').length);
  ok(after === before, `and nothing was created (${before} tiles, then ${after})`);
  ok(await stillThere(p, '18', 'Taglio capelli'), 'with the transaction intact');
  await ctx.close();
}

// ── the same grid in the recurring editor gets the same way in ────────────
{
  const { ctx, p } = await open();
  await p.getByRole('button', { name: /^Settings$|^Impostazioni$/ }).first().click();
  await p.waitForTimeout(600);
  await p.getByText(/^Recurring$|^Ricorrenti$/).first().click();
  await p.waitForTimeout(700);
  await p.getByText(/Add a recurring|Aggiungi una ricorrenza/).first().click();
  await p.waitForTimeout(700);
  ok(await p.locator('[data-cat-create]').count() === 1,
    'the recurring editor has it too - one catalogue, whichever form you are on');
  await p.locator('[data-cat-create]').click();
  await p.waitForSelector('[data-create-cat]', { timeout: 5000 });
  await p.locator('[data-create-cat-name]').fill('Barbiere');
  await p.locator('[data-create-cat-cta]').click();
  await p.waitForTimeout(600);
  const chosen = await p.evaluate(() => {
    const tiles = [...document.querySelectorAll('.grid > button')];
    const mine = tiles.find((t) => t.textContent?.trim() === 'Barbiere');
    return mine ? mine.className.includes('ring-2') : false;
  });
  ok(chosen, 'and it lands chosen here as well');
  await ctx.close();
}

// ── an income category goes on the income list, not the expense one ───────
{
  const { ctx, p } = await open();
  await halfWritten(p);
  await p.getByRole('button', { name: /^Income$|^Entrata$/ }).first().click();
  await p.waitForTimeout(400);
  await p.locator('[data-cat-create]').click();
  await p.waitForSelector('[data-create-cat]', { timeout: 5000 });
  ok(await p.locator('[data-create-cat-type="income"]').count() === 1,
    'the sheet follows the Expense/Income switch');
  await p.locator('[data-create-cat-name]').fill('Rimborsi');
  await p.locator('[data-create-cat-cta]').click();
  await p.waitForTimeout(600);
  const inIncome = await p.evaluate(() =>
    [...document.querySelectorAll('[data-category-picker] .grid > button')]
      .some((t) => t.textContent?.trim() === 'Rimborsi'));
  ok(inIncome, 'and the new category is on the income grid');
  // Back to expenses: it must NOT be there.
  await p.getByRole('button', { name: /^Expense$|^Spesa$/ }).first().click();
  await p.waitForTimeout(400);
  const leaked = await p.evaluate(() =>
    [...document.querySelectorAll('[data-category-picker] .grid > button')]
      .some((t) => t.textContent?.trim() === 'Rimborsi'));
  ok(!leaked, 'and nowhere near the expense one - that is wrong on every row filed under it');
  await ctx.close();
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await b.close();
process.exit(fail.length ? 1 : 0);
