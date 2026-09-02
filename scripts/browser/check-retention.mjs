// Two answers to the same question: what does a brand-new person get out of
// this app before a month of history exists?
//
//   the empty screen   offered to add a row, or to look around with FAKE
//                      data - but never to bring their own, which the app has
//                      solved since the AI import shipped. The cold start is
//                      felt here, so this is where the import is worth
//                      offering; after ten hand-typed rows the habit already
//                      exists and the offer reads as "you needn't have
//                      bothered".
//
//   the save toast     said "12,50€ saved to Food" and nothing else, four
//                      times a day. It now adds ONE line, for two things
//                      only: the first expense a person ever writes, and a
//                      description typed four times in a month - which
//                      nothing in the app adds up, because nothing groups by
//                      description. The rest of the time it is silent, which
//                      is the point (see lib/saveInsight.ts).
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
const seed = ([ref, sess, rows]) => {
  const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en' });
  put('nudges', { tips: false, recap: false, installDismissed: true, customizeDismissed: true });
  const cat = { id: 'food', name: 'Food & Drinks', type: 'expense', icon: 'Utensils', color: 'text-orange-600', bgColor: 'bg-orange-50', selectedBg: 'bg-orange-100', subcategories: [] };
  put('categories', [cat]);
  put('income-categories', []);
  put('sources', [{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]);
  put('transactions', rows.map((r, i) => ({
    id: `t${i}`, date: r.d, type: 'expense', amount: r.a, baseAmount: r.a, currency: 'EUR',
    sourceId: 'cash', category: cat, description: r.t,
    createdAt: `${r.d}T10:00:00.000Z`, updatedAt: `${r.d}T10:00:00.000Z`, recurrence: 'Never repeat',
  })));
  if (sess) localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(sess));
  else put('guest', 'true');
};
const open = async (rows = [], signedIn = true) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB', hasTouch: true, isMobile: true });
  await ctx.route(/supabase\.co/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.addInitScript(seed, [REF, signedIn ? session() : null, rows]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { console.log('[pageerror]', e.message); fail.push('pageerror'); });
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1700);
  return { ctx, p };
};
// Writes one expense the way a finger does.
const addOne = async (p, amount, desc) => {
  await p.getByRole('button', { name: /add/i }).last().click();
  await p.waitForTimeout(800);
  await p.locator('[data-amount-input]').fill(amount);
  await p.locator('[data-category-picker] button').filter({ hasText: /Food/ }).first().click();
  await p.waitForTimeout(300);
  const d = p.locator('input[type=text]').filter({ hasNot: p.locator('[data-amount-input]') });
  if (await d.count()) await d.last().fill(desc);
  await p.waitForTimeout(200);
  await p.locator('button').filter({ hasText: /Save/i }).last().click();
  await p.waitForTimeout(1200);
};
const month = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
};

// ── the empty screen offers a third road ─────────────────────────────────
{
  const { ctx, p } = await open();
  const card = await p.locator('body').innerText();
  ok(/Your first month starts here/.test(card), 'the empty Dashboard is up');
  ok(await p.locator('[data-empty-import]').count() === 1,
    'and offers to bring in data you already have - not only to type it or to look at fake rows');
  const row = await p.locator('[data-empty-import]').innerText();
  ok(/statement|spreadsheet|Splitwise/i.test(row),
    `naming what counts as data, so it is not a riddle (${row.replace(/\n/g, ' | ')})`);
  // Three tiers, not three equal choices: write one row, bring your history,
  // or - quieter and outside the card - see what the screen becomes with
  // months in it. Two of them opened with "Or" when the demo line sat inside
  // the card as a third button.
  const demo = await p.locator('[data-empty-demo]').innerText();
  ok(/charts|comparisons|trends/i.test(demo),
    `and the sample-data line says what it is FOR, not just that it exists (${demo})`);
  ok(!/^\s*Or\b/i.test(row) && !/^\s*Or\b/i.test(demo),
    'with no two "Or" openings stacked on each other');
  ok(await p.evaluate(() => {
    const card = document.querySelector('[data-empty-import]')?.closest('.rounded-2xl');
    const line = document.querySelector('[data-empty-demo]');
    return !!card && !!line && !card.contains(line)
      && line.getBoundingClientRect().top >= card.getBoundingClientRect().bottom;
  }), 'and it sits BELOW the card, not as a third button inside it');
  await p.locator('[data-empty-import]').click();
  await p.waitForTimeout(1300);
  const landed = await p.locator('body').innerText();
  ok(/Import data/.test(landed) && await p.locator('[data-ai-door]').count() === 1,
    'and it lands on the very screen the Settings entry opens, AI door and all - one import, two doors');
  // The jump has to fire ONCE. Leave Import by its own chevron (this is a
  // sub-page, not a sheet, so the system back gesture is not its exit), walk
  // away and come back: Settings must not re-open Import on its own.
  await p.locator('button').filter({ has: p.locator('svg.lucide-chevron-left') }).first().click();
  await p.waitForTimeout(900);
  ok(/Import data/.test(await p.locator('body').innerText()),
    'its chevron goes back to Settings, where Import is a row again');
  await p.getByRole('button', { name: 'Dashboard' }).first().click();
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: 'Settings' }).first().click();
  await p.waitForTimeout(900);
  ok(!/Bring in your existing data/.test(await p.locator('body').innerText()),
    'and coming back to Settings does not re-open it: the instruction was one-shot');
  await ctx.close();
}

// ── a guest is told the truth about which road needs an account ──────────
{
  const { ctx, p } = await open([], false);
  const row = await p.locator('[data-empty-import]').innerText();
  ok(/account/i.test(row),
    `a guest is still offered it, and told the automatic way needs an account (${row.replace(/\n/g, ' | ')})`);
  ok(!/^Importing needs/i.test(row),
    'and not told that importing needs one - the manual road works without');
  await ctx.close();
}

// ── the first expense is met with a handshake ────────────────────────────
{
  const { ctx, p } = await open();
  await addOne(p, '12.50', 'Groceries');
  const t = await p.locator('body').innerText();
  ok(/saved for Food/i.test(t) || /12.50/.test(t), 'the save is confirmed, as it always was');
  ok(/From here on I'll keep count/i.test(t),
    'and the very first one gets a line saying what the app is for');
  await ctx.close();
}

// ── the fourth of the same thing gets added up ───────────────────────────
{
  const m = month();
  const { ctx, p } = await open([
    { d: `${m}-03`, a: 6, t: 'Coffee' },
    { d: `${m}-05`, a: 6, t: 'Coffee' },
    { d: `${m}-08`, a: 6, t: 'coffee ' },   // typed sloppily; same thing
  ]);
  await addOne(p, '6', 'Coffee');
  const t = await p.locator('body').innerText();
  ok(/4×/.test(t) && /24/.test(t),
    'the fourth coffee is added up - four rows the list only ever showed a day apart');
  ok(!/From here on/i.test(t), 'and it is not mistaken for a first expense');
  await ctx.close();
}

// ── and the fifth says nothing ───────────────────────────────────────────
{
  const m = month();
  const { ctx, p } = await open([
    { d: `${m}-03`, a: 6, t: 'Coffee' }, { d: `${m}-05`, a: 6, t: 'Coffee' },
    { d: `${m}-06`, a: 6, t: 'Coffee' }, { d: `${m}-08`, a: 6, t: 'Coffee' },
  ]);
  await addOne(p, '6', 'Coffee');
  const t = await p.locator('body').innerText();
  ok(!/5×/.test(t) && !/×/.test(t.split('saved')[1] ?? ''),
    'the fifth is silent: the sentence has not changed, only the number');
  await ctx.close();
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nsomething to see on day one, and silence the rest of the time');
await b.close();
process.exit(fail.length ? 1 : 0);
