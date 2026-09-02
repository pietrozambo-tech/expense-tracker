// "August in review", dismissed on one device, stays dismissed on the next.
//
// It did not. The two "already seen" markers lived with the install banner
// and the backup clock in the device-local nudge prefs, on the reasoning that
// at worst a second device would show a card once more. An iPad said
// otherwise: signing in showed both the review card and the "August summary"
// pointer again, and dismissing them there taught the phone nothing either.
// Having read last month's summary is a fact about the READER, not about the
// phone it was read on.
//
// They live in the synced settings now. What stays device-local is what
// genuinely is: the install banner (about this device), the backup clock
// (about this device's storage), the on/off toggles (like notification
// permissions).
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

// Half the rows in LAST month, which is what makes the recap due at all.
const seed = ([ref, sess, oldNudges]) => {
  const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en' });
  if (oldNudges) put('nudges', oldNudges);
  const cat = { id: 'food', name: 'Food & Drinks', type: 'expense', icon: 'Utensils', color: 'text-orange-600', bgColor: 'bg-orange-50', selectedBg: 'bg-orange-100', subcategories: [] };
  put('categories', [cat]);
  put('income-categories', []);
  put('sources', [{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]);
  const rows = [];
  const now = new Date();
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - (i % 2), 5 + i);
    const date = d.toISOString().slice(0, 10);
    rows.push({
      id: `t${i}`, date, type: 'expense', amount: 20 + i, baseAmount: 20 + i, currency: 'EUR',
      sourceId: 'cash', category: cat, description: `Row ${i}`,
      createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z`, recurrence: 'Never repeat',
    });
  }
  put('transactions', rows);
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(sess));
};

const device = async ({ cloud, oldNudges } = {}) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB', hasTouch: true, isMobile: true });
  // Routes match NEWEST first, so the broad stub goes in BEFORE the specific
  // one - the other way round it answers "{}" to the record fetch as well and
  // the device never hydrates.
  await ctx.route(/supabase\.co/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.route(/user_data/, (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify(cloud ? { data: cloud, updated_at: new Date().toISOString() } : null),
  }));
  await ctx.addInitScript(seed, [REF, session(), oldNudges ?? null]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { console.log('[pageerror]', e.message); fail.push('pageerror'); });
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1800);
  return { ctx, p };
};
const onScreen = async (p) => {
  const t = await p.locator('body').innerText();
  return { card: /in review/i.test(t), pointer: /summary/i.test(t) };
};
const settings = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('expense-tracker.v1.settings') ?? '{}'));

// ── the phone: read it once, and it is read ──────────────────────────────
const one = await device();
const first = await onScreen(one.p);
ok(first.card && first.pointer, `a new month opens with both the review card and the summary line (${JSON.stringify(first)})`);

await one.p.locator('button').filter({ has: one.p.locator('svg.lucide-x') }).first().click();
await one.p.waitForTimeout(600);
await one.p.locator('button, [role=button]').filter({ hasText: /summary/i }).first().click();
await one.p.waitForTimeout(900);
await one.p.getByRole('button', { name: 'Dashboard' }).first().click();
await one.p.waitForTimeout(900);
await one.p.reload({ waitUntil: 'networkidle' });
await one.p.waitForTimeout(1800);
const after = await onScreen(one.p);
ok(!after.card && !after.pointer, 'dismissing the card and tapping the line puts both away for good');

const s = await settings(one.p);
const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
ok(s.recapSeen === month && s.reviewSeen === month,
  `and it is written where the account can carry it, not where the device keeps it (${s.recapSeen} / ${s.reviewSeen})`);
const nudges = await one.p.evaluate(() => JSON.parse(localStorage.getItem('expense-tracker.v1.nudges') ?? '{}'));
ok (!nudges.recapSeen && !nudges.reviewSeen,
  'the device-local nudge prefs no longer hold either - one home, not two');

// What this device would have pushed.
const cloud = await one.p.evaluate(() => ({
  transactions: JSON.parse(localStorage.getItem('expense-tracker.v1.transactions') ?? '[]'),
  categories: JSON.parse(localStorage.getItem('expense-tracker.v1.categories') ?? '[]'),
  incomeCategories: [],
  sources: JSON.parse(localStorage.getItem('expense-tracker.v1.sources') ?? '[]'),
  settings: JSON.parse(localStorage.getItem('expense-tracker.v1.settings') ?? '{}'),
}));
await one.ctx.close();

// ── the iPad: same account, first sign-in ────────────────────────────────
const two = await device({ cloud });
const fresh = await onScreen(two.p);
ok(!fresh.card && !fresh.pointer,
  `signing in on a second device does not ask again (${JSON.stringify(fresh)})`);
await two.ctx.close();

// ── the account that has not pushed yet ──────────────────────────────────
// A device that dismissed it before this change kept the answer in its nudge
// prefs. It must be carried over, or the fix would itself show the card once
// more to everyone who had already waved it away.
const three = await device({ cloud: null, oldNudges: { tips: true, recap: true, recapSeen: month, reviewSeen: month } });
const carried = await onScreen(three.p);
ok(!carried.card && !carried.pointer,
  `a dismissal made before the move is honoured, not re-asked (${JSON.stringify(carried)})`);
ok((await settings(three.p)).recapSeen === month,
  'and it moves into the settings, so the next device inherits it too');
await three.ctx.close();

console.log(fail.length ? `\n${fail.length} FAILED` : '\nread once, read everywhere');
await b.close();
process.exit(fail.length ? 1 : 0);
