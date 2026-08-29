// The import prompt, on the screen it is copied from.
//
// The prompt's CONTENT is the unit suite's job now (pnpm test:prompt): it is a
// pure function since the extraction, so the parity table between the two
// language bodies runs in a second without a browser. What is left here is the
// half that only exists on screen - that the thing is actually rendered, in the
// user's language, with a way to copy it. A prompt that is perfect and
// unreachable imports nothing.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const OUT = process.env.CHECK_OUT ?? new globalThis.URL('.artifacts', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });

const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

const FLAG = 'Azores \u{1F1F5}\u{1F1F9}';

const seed = ([lang]) => {
  const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  const travel = { id: 'travel', name: 'Travel', type: 'expense', icon: 'Plane', color: 'text-sky-600', bgColor: 'bg-sky-50', selectedBg: 'bg-sky-100', subcategories: ['Hotel', 'Food'] };
  put('guest', 'true');
  put('settings', { onboarded: true, userName: 'Pietro', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: lang });
  put('nudges', { tips: false, recap: false });
  put('categories', [travel]);
  put('sources', [{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]);
  put('transactions', ['Cena', 'Hotel', 'Volo'].map((d, i) => ({
    id: `t${i}`, date: `2026-08-2${i + 1}`, type: 'expense', amount: 20, baseAmount: 20, currency: 'EUR',
    sourceId: 'cash', category: travel, subcategory: 'Food',
    createdAt: '2026-08-21T10:00:00.000Z', updatedAt: '2026-08-21T10:00:00.000Z',
    recurrence: 'Never repeat', description: `Azores \u{1F1F5}\u{1F1F9} - ${d}`,
  })));
};

const openImport = async (lang) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, locale: lang === 'it' ? 'it-IT' : 'en-GB' });
  await ctx.route(/supabase\.co/, (r) => r.abort());
  await ctx.addInitScript(seed, [lang]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: lang === 'it' ? 'Impostazioni' : 'Settings' }).first().click();
  await p.waitForTimeout(600);
  await p.getByText(lang === 'it' ? 'Importa' : 'Import', { exact: false }).first().click();
  await p.waitForTimeout(700);
  const text = await p.evaluate(() => {
    const hit = [...document.querySelectorAll('div, pre')].filter((el) => (el.textContent ?? '').includes('"version": 1'));
    return hit.length ? hit[hit.length - 1].textContent : '';
  });
  return { ctx, p, text };
};

{
  const { ctx, p, text } = await openImport('en');
  ok(text.length > 5000, `the prompt is rendered in full, ready to copy (${text.length} chars)`);
  // The user's own ledger reaches the assistant. If this is missing on screen,
  // every rule about matching MY categories is addressed to nobody.
  ok(text.includes(`- "${FLAG}" (Aug 2026)`) && text.includes('cash = Cash'),
    'carrying my real trips and sources, not a generic template');
  ok(await p.getByRole('button', { name: /copy/i }).count() >= 1, 'with a button to copy it');
  await p.screenshot({ path: `${OUT}/prompt.png` });
  await ctx.close();
}

{
  const { ctx, text } = await openImport('it');
  ok(/PRIMA DI CONVERTIRE/.test(text), 'an Italian app hands over the Italian body');
  ok(text.includes(`- "${FLAG}" (Ago 2026)`), 'with the month in Italian');
  await ctx.close();
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await b.close();
process.exit(fail.length ? 1 : 0);
