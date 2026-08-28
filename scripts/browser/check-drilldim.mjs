// The drilldown's dimming reaches the status bar, in the right colour.
//
// index.html's viewport is not `viewport-fit=cover`, so in the installed app
// the layout viewport starts below the status bar: that strip is painted by
// the BODY, which the sheet's `fixed inset-0` scrim cannot reach. Dashboard
// therefore tints the body to whatever the scrim makes of the page.
//
// The tint was the literal #999999 - white dimmed 40%, right for the light
// theme and only for it. At night it drew a pale grey bar across the top of
// an otherwise dark screen (reported on device). It is computed from the
// live --bg-page token now, so what is asserted here is the relationship,
// not either theme's number: body == 0.6 x the page colour.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';

const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

const openDrilldown = async (mode) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB', colorScheme: mode });
  await ctx.addInitScript((m) => {
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    localStorage.setItem('expense-tracker.v1.theme', m);
    localStorage.setItem('expense-tracker.v1.guest', 'true');
    localStorage.setItem('expense-tracker.v1.settings', JSON.stringify({
      onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en',
    }));
    localStorage.setItem('expense-tracker.v1.nudges', JSON.stringify({ tips: false, recap: false }));
    const cat = { id: 'app', name: 'App', type: 'expense', icon: 'Laptop', color: 'text-blue-600', bgColor: 'bg-blue-50', selectedBg: 'bg-blue-100', subcategories: [] };
    localStorage.setItem('expense-tracker.v1.categories', JSON.stringify([cat]));
    localStorage.setItem('expense-tracker.v1.sources', JSON.stringify([{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]));
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    localStorage.setItem('expense-tracker.v1.transactions', JSON.stringify([
      { id: 'a', date: `${ym}-05`, type: 'expense', amount: 20.44, baseAmount: 20.44, currency: 'EUR', sourceId: 'cash', category: cat, createdAt: `${ym}-05T10:00:00Z`, updatedAt: `${ym}-05T10:00:00Z`, recurrence: 'Never repeat', description: 'Claude' },
      { id: 'b', date: `${ym}-06`, type: 'expense', amount: 99, baseAmount: 99, currency: 'EUR', sourceId: 'cash', category: cat, createdAt: `${ym}-06T10:00:00Z`, updatedAt: `${ym}-06T10:00:00Z`, recurrence: 'Never repeat', description: 'Apple Dev Yearly fee' },
    ]));
  }, mode);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1700);
  await p.locator('button').filter({ hasText: /^App/ }).first().click();
  await p.waitForTimeout(600);
  const all = p.locator('button').filter({ hasText: /All |View all/ }).first();
  if (await all.count()) { await all.click(); await p.waitForTimeout(800); }
  const read = await p.evaluate(() => {
    const rgb = (s) => (s.match(/\d+/g) ?? []).map(Number);
    const page = getComputedStyle(document.documentElement).getPropertyValue('--bg-page').trim();
    const n = parseInt(page.slice(1), 16);
    return {
      body: rgb(getComputedStyle(document.body).backgroundColor),
      expected: [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c * 0.6)),
      open: !!document.querySelector('.fixed.inset-0.z-\\[60\\]'),
    };
  });
  await ctx.close();
  return read;
};

for (const mode of ['dark', 'light']) {
  const r = await openDrilldown(mode);
  ok(r.open, `${mode}: the drilldown sheet is open`);
  ok(JSON.stringify(r.body) === JSON.stringify(r.expected),
    `${mode}: the status-bar strip is the page dimmed, not a fixed colour (body ${r.body.join(',')} vs page*0.6 ${r.expected.join(',')})`);
  // The reported symptom, stated directly: no pale bar on a dark screen.
  if (mode === 'dark') {
    ok(r.body[0] < 60, `dark: and that strip is dark, not the old pale grey (${r.body[0]})`);
  }
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await b.close();
process.exit(fail.length ? 1 : 0);
