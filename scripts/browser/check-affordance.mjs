// Two things a second sweep found, both about what a surface CLAIMS.
//
//   a row that opens nothing   was still rendered as a full-width <button> on
//                              Trend: it took the tap, moved nothing, and did
//                              not even light up under the finger - while the
//                              row beside it, identical but for a chevron,
//                              opens. On the Dashboard the same row drills in.
//
//   a downward swipe at the    reloaded the whole app. The browser's own
//   top of a list              pull-to-refresh was live: white flash, shell
//                              rebuilt, tab and scroll position gone, in
//                              answer to a scroll gesture.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const REF = 'kxaqapcrbmuqulkltxum';
const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

const freshSession = () => {
  const soon = Math.floor(Date.now() / 1000) + 3600;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return {
    access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', exp: soon, aud: 'authenticated' })}.s`,
    token_type: 'bearer', expires_in: 3600, expires_at: soon, refresh_token: 'good',
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'p@example.com', app_metadata: { provider: 'google' }, created_at: '2026-01-01T00:00:00Z' },
  };
};
// One category WITH subcategories and one WITHOUT - the whole point.
const seed = ([ref, session]) => {
  const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en' });
  put('nudges', { tips: false, recap: false, installDismissed: true, customizeDismissed: true });
  const cat = (id, name, icon, colour, subs) => ({
    id, name, type: 'expense', icon, color: `text-${colour}-600`, bgColor: `bg-${colour}-50`,
    selectedBg: `bg-${colour}-100`, subcategories: subs,
  });
  const cats = [
    cat('food', 'Food & Drinks', 'Utensils', 'orange', ['Restaurants', 'Groceries']),
    cat('bare', 'Bare Category', 'Home', 'blue', []),
  ];
  put('categories', cats);
  put('income-categories', []);
  put('sources', [{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]);
  const rows = [];
  const now = new Date();
  for (let i = 0; i < 24; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - (i % 3), 5 + (i % 20));
    const date = d.toISOString().slice(0, 10);
    const c = cats[i % 2];
    rows.push({
      id: `t${i}`, date, type: 'expense', amount: 10 + i,
      baseAmount: 10 + i, currency: 'EUR', sourceId: 'cash',
      category: c, subcategory: c.subcategories[i % 2] ?? undefined,
      description: `Row ${i} bought`,
      createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z`, recurrence: 'Never repeat',
    });
  }
  put('transactions', rows);
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session));
};

const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB', hasTouch: true, isMobile: true });
await ctx.route(/supabase\.co/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await ctx.addInitScript(seed, [REF, freshSession()]);
const p = await ctx.newPage();
p.on('pageerror', (e) => { console.log('[pageerror]', e.message); fail.push('pageerror'); });
await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForTimeout(1600);

// ── nothing claims to be pressable unless it is ──────────────────────────
await p.getByRole('button', { name: 'Trend' }).first().click();
await p.waitForTimeout(1500);
const rows = await p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('div,button')) {
    const first = ((el.innerText ?? '').split('\n')[0] ?? '').trim();
    if (first !== 'Food & Drinks' && first !== 'Bare Category') continue;
    if (el.clientWidth < 200 || el.clientHeight > 60) continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      name: first,
      chevron: !!el.querySelector('svg.lucide-chevron-right'),
      press: /active:bg/.test(String(el.className)),
    });
  }
  return out;
});
const bare = rows.filter((r) => r.name === 'Bare Category');
const rich = rows.filter((r) => r.name === 'Food & Drinks');
ok(rows.length > 0, `the breakdown lists both categories (${rows.length} candidate rows)`);
ok(bare.length > 0 && bare.every((r) => r.tag !== 'button'),
  'a category with nothing under it is NOT a button - it never claims a tap it cannot answer');
ok(rich.some((r) => r.tag === 'button' && r.press),
  'while one that opens is a button, and lights up under the finger');

// And it still opens.
const opener = p.locator('button').filter({ has: p.locator('svg.lucide-chevron-right') }).first();
const before = (await p.locator('body').innerText()).length;
await opener.click({ force: true });
await p.waitForTimeout(700);
const after = (await p.locator('body').innerText()).length;
ok(after > before, `tapping it opens the subcategories underneath (${before} -> ${after} chars)`);
ok(/Restaurants|Groceries/.test(await p.locator('body').innerText()),
  'and they are the subcategories it promised');

// ── a swipe down is a scroll, not a reload ───────────────────────────────
const oy = await p.evaluate(() => [
  getComputedStyle(document.documentElement).overscrollBehaviorY,
  getComputedStyle(document.body).overscrollBehaviorY,
]);
ok(oy.every((v) => v === 'contain' || v === 'none'),
  `pulling down at the top cannot reload the app (html=${oy[0]}, body=${oy[1]})`);

await ctx.close();
console.log(fail.length ? `\n${fail.length} FAILED` : '\nnothing claims more than it does');
await b.close();
process.exit(fail.length ? 1 : 0);
