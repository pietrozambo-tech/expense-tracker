// The AI-import prompt, read off the screen it is shown on.
//
// It is a ~200-line template built inside a component, in two languages kept
// as hand-written twins, and nothing but this file checks that a rule added to
// one was added to the other. The rule that brought it here: a user asked for
// a trip called "Azores 🇵🇹", the assistant wrote plain "Azores", and the new
// expenses landed in a second trip beside the fifty already imported. The
// prompt said "a SHORT NAME (a word or two)" and showed two plain examples -
// so a flag read as decoration - and never said to use the name verbatim.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const OUT = process.env.CHECK_OUT ?? new globalThis.URL('.artifacts', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });

const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

const FLAG = 'Azores \u{1F1F5}\u{1F1F9}';

// A ledger holding one trip whose name carries a flag, so the prompt has
// something exact to quote.
const seed = ([lang, flagged]) => {
  const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  const travel = { id: 'travel', name: 'Travel', type: 'expense', icon: 'Plane', color: 'text-sky-600', bgColor: 'bg-sky-50', selectedBg: 'bg-sky-100', subcategories: ['Hotel', 'Food'] };
  put('guest', 'true');
  put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: lang });
  put('nudges', { tips: false, recap: false });
  put('categories', [travel]);
  put('sources', [{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]);
  put('transactions', ['Cena', 'Hotel', 'Volo'].map((d, i) => ({
    id: `t${i}`, date: `2026-08-2${i + 1}`, type: 'expense', amount: 20, baseAmount: 20, currency: 'EUR',
    sourceId: 'cash', category: travel, subcategory: 'Food',
    createdAt: '2026-08-21T10:00:00.000Z', updatedAt: '2026-08-21T10:00:00.000Z',
    recurrence: 'Never repeat', description: `${flagged} - ${d}`,
  })));
};

const promptText = async (lang, flagged) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, locale: lang === 'it' ? 'it-IT' : 'en-GB' });
  await ctx.route(/supabase\.co/, (r) => r.abort());
  await ctx.addInitScript(seed, [lang, flagged]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: lang === 'it' ? 'Impostazioni' : 'Settings' }).first().click();
  await p.waitForTimeout(600);
  await p.getByText(lang === 'it' ? 'Importa' : 'Import', { exact: false }).first().click();
  await p.waitForTimeout(700);
  const text = await p.evaluate(() => {
    // The prompt is the longest block of text on this screen by a wide margin.
    const all = [...document.querySelectorAll('div, pre')].map((el) => el.textContent ?? '');
    return all.sort((a, c) => c.length - a.length).find((t) => t.includes('"version": 1')) ?? '';
  });
  return { ctx, p, text };
};

// ── English ───────────────────────────────────────────────────────────────
{
  const { ctx, p, text } = await promptText('en', FLAG);
  ok(text.length > 1000, `the prompt is on screen to be copied (${text.length} chars)`);
  ok(/USE THE NAME EXACTLY AS I WRITE IT/.test(text),
    'it says to use the trip name verbatim');
  ok(text.includes(FLAG), 'and shows a flagged name as the example of what to keep');
  ok(/two separate trips/.test(text), 'saying what goes wrong otherwise, not just "do not"');

  // Stronger than any wording: the names it has to match, quoted.
  ok(/Trips I ALREADY have/.test(text), 'the prompt lists the trips the ledger already holds');
  ok(text.includes(`- "${FLAG}" (Aug 2026)`),
    'each by its exact stored name and month');
  await p.screenshot({ path: `${OUT}/prompt.png` });
  await ctx.close();
}

// ── Italian: the twin, which nothing else checks ──────────────────────────
{
  const { ctx, text } = await promptText('it', FLAG);
  ok(/USA IL NOME ESATTAMENTE COME LO SCRIVO IO/.test(text),
    'the Italian body carries the same rule');
  ok(text.includes('Azzorre \u{1F1F5}\u{1F1F9}'), 'with its own flagged example');
  ok(/due viaggi separati/.test(text), 'and the same consequence spelled out');
  ok(/I viaggi che ho GIÀ/.test(text), 'and lists the existing trips too');
  ok(text.includes(`- "${FLAG}" (Ago 2026)`), 'with the month in Italian');
  await ctx.close();
}

// ── no trips: the list must not appear as an empty heading ────────────────
{
  const { ctx, text } = await promptText('en', 'Weekend lungo con i ragazzi');
  ok(!/Trips I ALREADY have/.test(text),
    'a ledger with no detectable trip gets no empty "trips I already have" heading');
  ok(/USE THE NAME EXACTLY AS I WRITE IT/.test(text), 'while the verbatim rule still stands');
  await ctx.close();
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await b.close();
process.exit(fail.length ? 1 : 0);
