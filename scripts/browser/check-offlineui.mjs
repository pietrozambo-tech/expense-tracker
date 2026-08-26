// The sync row has to describe the present, not the last save.
//
// It reported "Synced 5m ago" to a device sitting in airplane mode, because
// the status it showed was a record of the last successful push and nothing
// re-examined it. Someone wondering why a cloud action just failed got a green
// tick for an answer.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const OUT = process.env.CHECK_OUT ?? new globalThis.URL('.artifacts', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
const REF = 'kxaqapcrbmuqulkltxum';

const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

const liveSession = () => {
  const future = Math.floor(Date.now() / 1000) + 3600;
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', exp: future, aud: 'authenticated' })}.sig`,
    token_type: 'bearer', expires_in: 3600, expires_at: future, refresh_token: 'r',
    user: {
      id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'pietro@example.com',
      app_metadata: { provider: 'google' }, user_metadata: { full_name: 'Pietro' },
      created_at: '2026-01-01T00:00:00Z',
    },
  };
};

const boot = async (language = 'en') => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, locale: language === 'it' ? 'it-IT' : 'en-GB' });
  await ctx.route(`**${REF}**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await ctx.route('**posthog**/**', (r) => r.fulfill({ status: 200, body: '{}' }));
  await ctx.addInitScript((args) => {
    const [ref, session, lang] = args;
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session));
    localStorage.setItem('expense-tracker.v1.owner', JSON.stringify({ id: 'u1', email: 'pietro@example.com' }));
    localStorage.setItem('expense-tracker.v1.settings', JSON.stringify({
      onboarded: true, userName: 'Pietro', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: lang,
    }));
    localStorage.setItem('expense-tracker.v1.nudges', JSON.stringify({ tips: false, recap: false }));
    const cat = { id: 'travel', name: 'Travel', type: 'expense', icon: 'Plane', color: 'text-sky-600', bgColor: 'bg-sky-50', selectedBg: 'bg-sky-100', subcategories: [] };
    const d = new Date(); d.setDate(1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    localStorage.setItem('expense-tracker.v1.categories', JSON.stringify([cat]));
    localStorage.setItem('expense-tracker.v1.sources', JSON.stringify([{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]));
    localStorage.setItem('expense-tracker.v1.transactions', JSON.stringify([{
      id: 'e1', date: `${ym}-05`, type: 'expense', amount: 12, baseAmount: 12, currency: 'EUR',
      sourceId: 'cash', category: cat, createdAt: `${ym}-05T10:00:00.000Z`, updatedAt: `${ym}-05T10:00:00.000Z`,
      recurrence: 'Never repeat', description: 'x',
    }]));
  }, [REF, liveSession(), language]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1800);
  await p.getByRole('button', { name: language === 'it' ? 'Impostazioni' : 'Settings' }).first().click();
  await p.waitForTimeout(900);
  return { ctx, p };
};

// Anchored on the row itself, so it reads the same in every state - deriving
// it from the offline sub-line meant the helper went blind the moment the
// thing it was checking for disappeared.
const syncRow = (p) => p.evaluate(() => {
  const row = document.querySelector('[data-sync-row]');
  const why = row?.querySelector('[data-sync-offline-why]');
  const lines = row ? row.innerText.trim().split('\n').map((x) => x.trim()).filter(Boolean) : [];
  return {
    label: lines[0] || '',
    why: why ? why.textContent.trim() : null,
    rowText: row ? row.innerText.trim() : '',
  };
});

// 1. Online: the row is a normal synced row, with the account on it.
{
  const { ctx, p } = await boot();
  const s = await syncRow(p);
  ok(/Synced/.test(s.label), `online, the row reports synced ("${s.label}")`);
  ok(s.why === null, 'and says nothing about being offline');
  ok(await p.locator('[data-dock-dot]').count() === 0, 'and the dock carries no dot');
  ok(await p.getByText('pietro@example.com').count() > 0, 'the account is named, as before');

  // 2. Go offline with nothing else happening - no save, no cloud call. This
  //    is the case that used to keep showing a green tick.
  await ctx.setOffline(true);
  await p.evaluate(() => window.dispatchEvent(new Event('offline')));
  await p.waitForTimeout(700);
  const off = await syncRow(p);
  ok(/Offline/.test(off.label), `going offline changes the row with no save needed ("${off.label}")`);
  ok(off.why && /safe/.test(off.why), `and explains what it means for the data ("${off.why}")`);
  // Scoped to the sync row: the email legitimately appears elsewhere on the
  // Settings screen (the account section names it too).
  ok(off.rowText && !off.rowText.includes('pietro@example.com'),
    `in THIS row the email steps aside for the answer actually needed ("${off.rowText.replace(/\n/g, ' | ')}")`);
  // The dot is the pointer; the row is the answer. It must appear without a
  // tab change - the dock is visible from every screen.
  ok(await p.locator('[data-dock-dot]').count() === 1, 'a quiet amber dot appears on the Settings tab');
  await p.screenshot({ path: `${OUT}/offlineui.png` });

  // 3. Back online: it must recover on its own, not stay stuck amber.
  await ctx.setOffline(false);
  await p.evaluate(() => window.dispatchEvent(new Event('online')));
  await p.waitForTimeout(900);
  const back = await syncRow(p);
  ok(!/Offline/.test(back.label), `coming back online clears it ("${back.label}")`);
  ok(await p.locator('[data-dock-dot]').count() === 0, 'and takes the dock dot with it');
  ok(back.rowText.includes('pietro@example.com'), 'and the account comes back onto the row with it');
  await ctx.close();
}

// 4. Italian.
{
  const { ctx, p } = await boot('it');
  await ctx.setOffline(true);
  await p.evaluate(() => window.dispatchEvent(new Event('offline')));
  await p.waitForTimeout(700);
  const s = await syncRow(p);
  ok(s.why !== null && /al sicuro/.test(s.why), `it speaks Italian too ("${s.why}")`);
  await ctx.close();
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await b.close();
process.exit(fail.length ? 1 : 0);
