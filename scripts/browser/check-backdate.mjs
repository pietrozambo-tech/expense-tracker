// A schedule that starts before today, made in Settings.
//
// "I noticed this morning that Netflix charged me yesterday - bill it monthly
// from there." You could always say that from the Add screen, and never from
// Settings > Recurring: the date picker floored itself at today and the Create
// button stayed dead for any earlier day. The arithmetic is the unit suite's
// job (scenario 19); this is the part that only exists on screen - that the
// picker accepts yesterday, that the form says out loud how many rows saving
// will write, that saving writes exactly those, and that editing an existing
// schedule still refuses to go back (backdating an edit duplicates, see the
// note in ScheduleEditor).
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const OUT = process.env.CHECK_OUT ?? new globalThis.URL('.artifacts', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });

const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

// Dates are computed, never written down: this check has to keep passing
// tomorrow.
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const TODAY = daysAgo(0);
const YESTERDAY = daysAgo(1);

const CATS = [
  { id: 'app', name: 'App', type: 'expense', icon: 'Laptop', color: 'text-blue-600', bgColor: 'bg-blue-50', selectedBg: 'bg-blue-100', subcategories: [] },
  { id: 'food', name: 'Food & Drinks', type: 'expense', icon: 'Utensils', color: 'text-orange-600', bgColor: 'bg-orange-50', selectedBg: 'bg-orange-100', subcategories: [] },
];

const seed = (cats) => {
  const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  put('guest', 'true');
  put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en' });
  put('nudges', { tips: false, recap: false });
  put('categories', cats);
  put('sources', [{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]);
  put('transactions', []);
};

const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, locale: 'en-GB' });
await ctx.route(/supabase\.co/, (r) => r.abort());
await ctx.addInitScript(seed, CATS);

const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForTimeout(1600);

const openScheduled = async () => {
  await p.getByRole('button', { name: 'Settings' }).first().click();
  await p.waitForTimeout(600);
  await p.getByText('Recurring', { exact: true }).first().click();
  await p.waitForTimeout(700);
};
const note = () => p.locator('[data-sched-note]');
const setStart = async (value) => {
  await p.locator('[data-sched-start]').fill(value);
  await p.waitForTimeout(400);
};
const rows = () =>
  p.evaluate(() => JSON.parse(localStorage.getItem('expense-tracker.v1.transactions') ?? '[]')
    .map((t) => `${t.date} ${t.description} ${t.amount}`).sort());

await openScheduled();
await p.getByText('Add a recurring transaction', { exact: false }).first().click();
await p.waitForTimeout(700);

// The floor is the bug: a native date input with min=today cannot be pointed
// at yesterday at all, whatever the form does afterwards.
ok(await p.locator('[data-sched-start]').getAttribute('min') === null,
  'a new schedule puts no floor under the start date');

await p.getByPlaceholder('e.g. Rent, Salary, Gym').first().fill('Netflix');
await p.locator('input[inputmode="decimal"]').first().fill('12.99');
await p.getByText('App', { exact: true }).first().click();
await p.waitForTimeout(300);
await setStart(YESTERDAY);

ok((await p.locator('[data-sched-start]').inputValue()) === YESTERDAY,
  `and the picker holds yesterday (${YESTERDAY})`);
const create = p.getByRole('button', { name: 'Create', exact: true });
ok(await create.isEnabled(), 'Create is live for a day that has already happened');

// The form must not be quiet about it: saving is about to write a row.
ok(await note().getAttribute('data-sched-backfill') === '1',
  'and the form counts what saving will record right now');
const noteText = (await note().innerText()).trim();
ok(/record/i.test(noteText) && !/Nothing is recorded/i.test(noteText),
  `saying so instead of "nothing is recorded now" ("${noteText}")`);
await p.screenshot({ path: `${OUT}/backdate.png` });

// The count is live, not a fixed sentence: three weeks of a weekly bill is
// four charges, and the note has to say four.
await p.locator('select').last().selectOption('Every week');
await p.waitForTimeout(300);
await setStart(daysAgo(21));
ok(await note().getAttribute('data-sched-backfill') === '4',
  'three weeks back on a weekly bill counts four');

// Back to the case being fixed, and save it.
await p.locator('select').last().selectOption('Every month');
await p.waitForTimeout(300);
await setStart(YESTERDAY);
await create.click();
await p.waitForTimeout(1200);

const after = await rows();
ok(after.length === 1, `saving records exactly what it promised, once (${after.length} row(s))`);
ok((after[0] ?? '').startsWith(YESTERDAY), `dated the day picked, not today (${after[0]})`);

// Reopening must not mint a second copy: materialisation runs on every launch.
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(1800);
const reopened = await rows();
ok(reopened.length === 1, `and a relaunch does not record it again (${reopened.length} row(s))`);

// The other half of the rule: an EDIT still may not go back. The old chain is
// ended at `start` and a new one begins there, and occurrences owned by
// another series never count as covering one - so every month since would be
// charged twice.
await openScheduled();

// The cadence carries on from the day picked, not from today: the whole point
// of naming yesterday was to say which day of the month this bill falls on.
// Asserted on the day and month rather than the exact rendering, so this
// stays a claim about the schedule and not about date formatting.
const due = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const day = d.getDate();
  const m = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  m.setDate(Math.min(day, new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()));
  // Sliced to three letters: Node says "Sept" where the browser says "Sep",
  // and the month is the claim, not its abbreviation.
  return { day: m.getDate(), month: m.toLocaleDateString('en-GB', { month: 'short' }).slice(0, 3) };
})();
const listed = (await p.getByText(/^Next /).first().innerText()).trim();
ok(listed.includes(String(due.day)) && listed.includes(due.month),
  `and the next charge is a month after the day picked (${due.month} ${due.day} in "${listed}")`);

await p.getByRole('button', { name: /Edit the Netflix/i }).first().click();
await p.waitForTimeout(900);
ok(await p.locator('[data-sched-start]').count() === 1, 'the schedule reopens for editing');
ok(await p.locator('[data-sched-start]').getAttribute('min') === TODAY,
  `while editing one keeps the floor at today (${TODAY})`);
ok(await note().getAttribute('data-sched-backfill') === '0',
  'and an edit never announces a backfill');

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await ctx.close();
await b.close();
process.exit(fail.length ? 1 : 0);
