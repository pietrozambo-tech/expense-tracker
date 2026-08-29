// The AI-import prompt, read off the screen it is copied from.
//
// It is a ~13k-character template built inside a component, in two languages
// kept as hand-written twins, and until this file nothing checked that a rule
// added to one was added to the other - the component's own comment records an
// English-only edit that left the Italian arithmetic rule wrong for months.
//
// The RULES table below is the parity check: every rule has a marker phrase in
// each language, and a rule that exists in one body and not the other fails
// here rather than in somebody's ledger.
//
// What brought this file into being: a user answered "Azores 🇵🇹" when asked
// for a trip name, the assistant wrote plain "Azores", and the new expenses
// landed in a second trip beside the fifty already imported.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const OUT = process.env.CHECK_OUT ?? new globalThis.URL('.artifacts', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });

const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

const FLAG = 'Azores \u{1F1F5}\u{1F1F9}';

const seed = ([lang, tripName]) => {
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
    recurrence: 'Never repeat', description: `${tripName} - ${d}`,
  })));
};

const promptText = async (lang, tripName) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, locale: lang === 'it' ? 'it-IT' : 'en-GB' });
  await ctx.route(/supabase\.co/, (r) => r.abort());
  await ctx.addInitScript(seed, [lang, tripName]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: lang === 'it' ? 'Impostazioni' : 'Settings' }).first().click();
  await p.waitForTimeout(600);
  await p.getByText(lang === 'it' ? 'Importa' : 'Import', { exact: false }).first().click();
  await p.waitForTimeout(700);
  const text = await p.evaluate(() => {
    // The prompt is by far the longest block of text on this screen.
    const all = [...document.querySelectorAll('div, pre')].map((el) => el.textContent ?? '');
    return all.sort((a, c) => c.length - a.length).find((t) => t.includes('"version": 1')) ?? '';
  });
  return { ctx, p, text };
};

// name, English marker, Italian marker.
const RULES = [
  ['the JSON skeleton', '"version": 1', '"version": 1'],
  ['ask before converting', 'BEFORE YOU CONVERT', 'PRIMA DI CONVERTIRE'],
  ['everything in one message', 'I need from you:', 'Mi serve da te:'],
  ['which column is me', 'WHICH COLUMN IS ME', 'QUALE COLONNA SONO IO'],
  ['whether it is a trip at all', 'WHETHER IT IS A TRIP', 'SE È UN VIAGGIO'],
  ['a file with no year', 'no YEAR anywhere', "non c'è l'ANNO"],
  ['rows that are monthly totals', 'monthly or weekly TOTAL', 'TOTALE mensile o settimanale'],
  ['every sheet and tab', 'Open EVERY sheet', 'Apri OGNI foglio'],
  ['read my answers back first', 'repeat my answers back', 'ripetimi le mie risposte'],
  ['decimal point, not comma', 'decimal POINT not comma', 'punto decimale'],
  ['negative amounts are two things', 'A NEGATIVE amount', 'Un importo NEGATIVO'],
  ['never convert a foreign amount', 'do NOT convert it', 'NON convertirlo'],
  ['exactly one of my categories', 'exactly ONE of MY categories', 'esattamente UNA delle MIE categorie'],
  ['statement noise is skipped', 'balance brought forward', 'saldo riportato'],
  ['shares versus balances', 'the columns are SHARES', 'le colonne sono QUOTE'],
  ['the share total, checkable in seconds', 'THE TOTAL OF MY SHARE', 'IL TOTALE DELLA MIA QUOTA'],
  ['stop when the rows disagree', 'STOP and ask me', 'FERMATI e chiedimi'],
  ['a one-name row is not a settlement', 'NOT automatically a settlement', 'NON è automaticamente un pareggio'],
  ['settlement categories, in English too', 'Reimbursement', 'Reimbursement'],
  ['who paid is not what it cost me', 'never my cost', 'Non è mai il mio costo'],
  ['booking dates are kept', 'dated when they were BOOKED', 'data della PRENOTAZIONE'],
  ['a trip is filed as one thing', 'A TRIP IS ONE THING', 'UN VIAGGIO È UNA COSA SOLA'],
  ['ask for the trip name', 'ASK me for a SHORT NAME', 'CHIEDIMI un NOME BREVE'],
  ['use the answer verbatim', 'EXACTLY AS I WRITE IT', 'ESATTAMENTE COME LA SCRIVO'],
  ["the app's limits on that name", "THE APP'S LIMITS", "I LIMITI dell'app"],
  ['ask rather than trim', 'never trim it yourself', 'non accorciarlo mai'],
  ['only the JSON goes in the FILE', 'ONLY the JSON in the FILE', 'Nel FILE metti SOLO il JSON'],
];

const en = await promptText('en', FLAG);
const it = await promptText('it', FLAG);

ok(en.text.length > 5000 && it.text.length > 5000,
  `both prompts are on screen to be copied (${en.text.length} / ${it.text.length} chars)`);

for (const [name, mEn, mIt] of RULES) {
  const hasEn = en.text.includes(mEn);
  const hasIt = it.text.includes(mIt);
  ok(hasEn && hasIt, `${name}${hasEn && hasIt ? '' : hasEn ? ' - MISSING IN ITALIAN' : ' - MISSING IN ENGLISH'}`);
}

// The rule that only exists because it was got wrong: the name must survive
// character for character, and the assistant is shown one that would not have.
ok(en.text.includes(FLAG) && it.text.includes('Azzorre \u{1F1F5}\u{1F1F9}'),
  'each language shows a flagged name as the example of what to keep');

// Stronger than any wording: the names it has to match, quoted from my ledger.
ok(/Trips I ALREADY have/.test(en.text) && en.text.includes(`- "${FLAG}" (Aug 2026)`),
  'English lists the trips the ledger already holds, by exact name and month');
ok(/I viaggi che ho GIÀ/.test(it.text) && it.text.includes(`- "${FLAG}" (Ago 2026)`),
  'Italian does too, with the month in Italian');

await en.p.screenshot({ path: `${OUT}/prompt.png` });
await en.ctx.close();
await it.ctx.close();

// A ledger with nothing the app would call a trip must not grow an empty
// heading promising a list.
{
  const { ctx, text } = await promptText('en', 'Weekend lungo con i ragazzi');
  ok(!/Trips I ALREADY have/.test(text),
    'no trips detected: no empty "trips I already have" heading');
  ok(/USE MY ANSWER EXACTLY AS I WRITE IT/.test(text), 'while the verbatim rule still stands');
  await ctx.close();
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await b.close();
process.exit(fail.length ? 1 : 0);
