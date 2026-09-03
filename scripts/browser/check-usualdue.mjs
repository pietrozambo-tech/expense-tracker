// The cumulative chart's legend, in the months before it has two lines to
// name.
//
// The median benchmark needs two earlier months carrying spending
// (lib/usual.ts, minPeriods = 2). Until then the chart drew one line, the
// legend was not drawn at all, and nothing said why or for how long - the
// comparison the whole app is built around was up to two months away and the
// only way to find that out was to read the source. The empty legend slot now
// carries the date, dimmed, and removes itself the month the curve appears.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const REF = 'kxaqapcrbmuqulkltxum';
const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

const session = () => {
  const soon = Math.floor(Date.now() / 1000) + 3600;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return {
    access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', exp: soon, aud: 'authenticated' })}.s`,
    token_type: 'bearer', expires_in: 3600, expires_at: soon, refresh_token: 'good',
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'p@example.com', app_metadata: { provider: 'google' }, created_at: '2026-01-01T00:00:00Z' },
  };
};
const seed = ([ref, sess, rows, lang]) => {
  const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: lang });
  put('nudges', { tips: false, recap: false, installDismissed: true, customizeDismissed: true });
  const cat = { id: 'food', name: 'Food & Drinks', type: 'expense', icon: 'Utensils', color: 'text-orange-600', bgColor: 'bg-orange-50', selectedBg: 'bg-orange-100', subcategories: [] };
  put('categories', [cat]);
  put('income-categories', []);
  put('sources', [{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]);
  put('transactions', rows.map((r, i) => ({
    id: `t${i}`, date: r.d, type: r.t ?? 'expense', amount: r.a, baseAmount: r.a, currency: 'EUR',
    sourceId: 'cash', category: cat, description: 'x',
    createdAt: `${r.d}T10:00:00.000Z`, updatedAt: `${r.d}T10:00:00.000Z`, recurrence: 'Never repeat',
  })));
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(sess));
};
const open = async (rows, lang = 'en') => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB', hasTouch: true, isMobile: true });
  await ctx.route(/supabase\.co/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.addInitScript(seed, [REF, session(), rows, lang]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { console.log('[pageerror]', e.message); fail.push('pageerror'); });
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1700);
  return { ctx, p };
};

// Dates relative to today, so the fixture is about "this month" and "two
// months back" rather than about September 2026.
const now = new Date();
const back = (months, day) => {
  const d = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const capped = Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(capped).padStart(2, '0')}`;
};
const monthName = (months) =>
  new Date(now.getFullYear(), now.getMonth() + months, 1).toLocaleDateString('en-US', { month: 'long' });
// The chart draws the month to date, so the rows have to be dated on or
// before today for the line to have anything in it.
const early = Math.min(2, now.getDate());
const mid = Math.min(9, now.getDate());

// ── one month in: the legend names the month, two out ────────────────────
{
  const { ctx, p } = await open([{ d: back(0, early), a: 40 }, { d: back(0, mid), a: 25 }]);
  const due = p.locator('[data-usual-due]');
  ok(await due.count() === 1, 'a first month gets a legend where there was none');
  const text = await due.innerText();
  ok(/Your usual/.test(text), `and it names the line that is missing, not a generic notice (${text})`);
  ok(text.includes(monthName(2)),
    `dated two months out, which is when a median of two months can first exist (${text}, expected ${monthName(2)})`);
  // Dimmed and grey: a slot waiting to be filled, not a second line claiming
  // to be drawn. The real legend entries render at full opacity.
  const look = await due.evaluate((el) => {
    const wrap = el.parentElement;
    const dot = el.querySelector('span');
    return { opacity: getComputedStyle(wrap).opacity, dot: getComputedStyle(dot).backgroundColor };
  });
  ok(Number(look.opacity) < 0.8, `held back from the chart it sits under (opacity ${look.opacity})`);
  ok(look.dot !== 'rgb(79, 116, 243)', `and not wearing the spending line's blue (${look.dot})`);
  await ctx.close();
}

// ── with a month already imported, the wait is one, and it says so ───────
{
  const { ctx, p } = await open([
    { d: back(1, 4), a: 60 }, { d: back(1, 20), a: 30 },
    { d: back(0, early), a: 40 }, { d: back(0, mid), a: 25 },
  ]);
  const text = await p.locator('[data-usual-due]').innerText();
  ok(text.includes(monthName(1)),
    `history brings the date forward: one imported month means next month, not the month after (${text}, expected ${monthName(1)})`);
  await ctx.close();
}

// ── two months behind it, and the promise is replaced by the thing ───────
{
  const { ctx, p } = await open([
    { d: back(2, 4), a: 55 }, { d: back(2, 18), a: 40 },
    { d: back(1, 4), a: 60 }, { d: back(1, 20), a: 30 },
    { d: back(0, early), a: 40 }, { d: back(0, mid), a: 25 },
  ]);
  ok(await p.locator('[data-usual-due]').count() === 0,
    'once the curve exists there is nothing left to promise');
  const body = await p.locator('body').innerText();
  ok(/Your usual/.test(body) && !/from /.test(body.split('Cumulative')[1] ?? ''),
    'and the legend names two real lines instead');
  await ctx.close();
}

// ── it is about the present, so a past month does not carry it ───────────
{
  const { ctx, p } = await open([{ d: back(0, early), a: 40 }, { d: back(0, mid), a: 25 }, { d: back(1, 9), a: 70 }]);
  ok(await p.locator('[data-usual-due]').count() === 1, 'this month carries the line');
  // Step back one month with the chevron beside the period title.
  await p.locator('button').filter({ has: p.locator('svg.lucide-chevron-left') }).first().click();
  await p.waitForTimeout(900);
  ok(await p.locator('[data-usual-due]').count() === 0,
    'a month already finished does not: a date in the future read off a past chart is nonsense');
  await ctx.close();
}

// ── and it speaks Italian ────────────────────────────────────────────────
{
  const { ctx, p } = await open([{ d: back(0, early), a: 40 }, { d: back(0, mid), a: 25 }], 'it');
  const text = await p.locator('[data-usual-due]').innerText();
  const itMonth = new Date(now.getFullYear(), now.getMonth() + 2, 1).toLocaleDateString('it-IT', { month: 'long' });
  ok(/Il tuo solito/.test(text) && new RegExp(itMonth, 'i').test(text),
    `in Italian too, with the Italian month name (${text})`);
  ok(!/from|your usual/i.test(text), 'and no English left in it');
  await ctx.close();
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nthe missing line says when it arrives');
await b.close();
process.exit(fail.length ? 1 : 0);
