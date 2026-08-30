// The demo data demonstrates the trips feature, in both languages.
//
// Until now the sample set's travel rows were named "Trip" - no prefix, no
// group - so the first thing every tester did (load the demo) showed the
// Trips sheet as an empty state and hid the Trip filter entirely. The demo
// was demoing the app from before the feature existed.
//
// Now it carries one real trip: London, six rows, the flights booked two
// months before the stay, all in GBP. This walks the load-demo path a tester
// actually takes and asserts the card is there, that it is ONE card (the
// history backfill must not photocopy it into phantom Londons), and that the
// Italian demo calls it Londra.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const OUT = process.env.CHECK_OUT ?? new globalThis.URL('.artifacts', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });

const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

const openWithDemo = async (lang) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, locale: lang === 'it' ? 'it-IT' : 'en-GB' });
  await ctx.route(/supabase\.co/, (r) => r.abort());
  await ctx.addInitScript(([lang]) => {
    const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    put('guest', 'true');
    put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: lang });
    put('nudges', { tips: false, recap: false });
    // No categories or transactions seeded: the demo loads against the app's
    // own default catalogue, exactly as it does for a real fresh user.
  }, [lang]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);

  // The path a tester takes: Settings -> Load demo data -> confirm.
  await p.getByRole('button', { name: lang === 'it' ? 'Impostazioni' : 'Settings' }).first().click();
  await p.waitForTimeout(600);
  await p.getByText(lang === 'it' ? 'Carica dati di esempio' : 'Load demo data', { exact: false }).first().click();
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: lang === 'it' ? 'Carica' : 'Load', exact: true }).click();
  await p.waitForTimeout(1200);

  await p.getByRole('button', { name: lang === 'it' ? 'Attività' : 'Activity' }).first().click();
  await p.waitForTimeout(700);
  await p.locator('[data-act-more]').click();
  await p.waitForTimeout(350);
  await p.locator('[data-act-menu-trips]').click();
  await p.waitForTimeout(700);
  return { ctx, p };
};

// ── English demo ──────────────────────────────────────────────────────────
{
  const { ctx, p } = await openWithDemo('en');
  const sheet = await p.locator('[data-trips-sheet]').innerText();
  ok(await p.locator('[data-trip-card]').count() === 1,
    `the demo shows exactly ONE trip - no phantom clones from the backfill (${await p.locator('[data-trip-card]').count()})`);
  ok(/London 🇬🇧/.test(sheet), `and it is London, flag included (${sheet.split('\n').slice(2, 4).join(' | ')})`);
  ok(/6 expenses/.test(sheet), 'with its six rows');
  // Foreign currency: the GBP amounts arrive converted into the card total.
  ok(!/NaN/.test(sheet), 'and a real converted total, not NaN');
  await p.screenshot({ path: `${OUT}/demotrip-en.png` });

  // Tapping the card drills in: the trip filter takes over and the period
  // widens to reach the flights booked two months before the stay.
  await p.locator('[data-trip-card]').first().click();
  await p.waitForTimeout(900);
  const rows = await p.evaluate(() =>
    [...document.querySelectorAll('[data-row-id]')].length);
  ok(rows === 6, `tapping it shows the six rows, early flights included (${rows})`);
  const period = await p.locator('[data-period-chip]').innerText();
  ok(/all/i.test(period), `with the period opened out (${period})`);
  await ctx.close();
}

// ── Italian demo ──────────────────────────────────────────────────────────
{
  const { ctx, p } = await openWithDemo('it');
  const sheet = await p.locator('[data-trips-sheet]').innerText();
  ok(/Londra 🇬🇧/.test(sheet),
    `the Italian demo says Londra - the prefix translated as a name (${sheet.split('\n').slice(2, 4).join(' | ')})`);
  ok(await p.locator('[data-trip-card]').count() === 1, 'one card here too');
  // The rows themselves: prefix + translated body, joined the way the app
  // joins them, so the trip holds together in Italian.
  await p.locator('[data-trip-card]').first().click();
  await p.waitForTimeout(900);
  const texts = await p.evaluate(() =>
    [...document.querySelectorAll('[data-row-id]')].map((el) => el.textContent ?? ''));
  ok(texts.length === 6 && texts.every((t) => t.includes('Londra 🇬🇧')),
    `all six rows carry the same Italian name (${texts.length})`);
  ok(texts.some((t) => t.includes('Voli andata e ritorno')),
    'with the bodies translated too');
  await p.screenshot({ path: `${OUT}/demotrip-it.png` });
  await ctx.close();
}

// ── loading the demo does not ask a guest to back it up ───────────────────
//
// The reported case, walked end to end: first run as a guest, tap "load demo
// data", land on the Dashboard. The backup card fired - telling someone to
// save a ledger they had not written a line of - because the demo adds
// hundreds of rows and the threshold counted all of them.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, locale: 'it-IT' });
  await ctx.route(/supabase\.co/, (r) => r.abort());
  await ctx.addInitScript(() => {
    const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    put('guest', 'true');
    // Tips ON and no backup ever taken - the state a first run really is.
    put('settings', { onboarded: true, userName: 'Marco', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'it' });
    put('nudges', { tips: true, recap: false });
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Impostazioni' }).first().click();
  await p.waitForTimeout(600);
  await p.getByText('Carica dati di esempio', { exact: false }).first().click();
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: 'Carica', exact: true }).click();
  await p.waitForTimeout(1400);
  await p.getByRole('button', { name: 'Dashboard' }).first().click();
  await p.waitForTimeout(1000);

  const which = await p.locator('[data-nudge]').getAttribute('data-nudge').catch(() => null);
  ok(which !== 'backup',
    `a guest who only loaded the demo is not told to back it up (card shown: ${which ?? 'none'})`);
  ok(!/Scarica backup/.test(await p.locator('body').innerText()),
    'and the download-a-backup line is nowhere on the screen');
  await p.screenshot({ path: `${OUT}/demo-guest-nudge.png` });
  await ctx.close();
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await b.close();
process.exit(fail.length ? 1 : 0);
