// The in-app AI import, walked end to end against a scripted function.
//
// Nothing here reaches the real Edge Function or spends a token: the
// convert-import endpoint is played by this file, answering the exact SSE
// frames the server emits (event: row / done / failed, cut on blank lines).
// What is under test is everything on the phone's side of the trust
// boundary: the door only existing for accounts, the trip ASSERTION built
// from the file's own dates against the ledger's own trips, the reading
// screen, the result screen doing its arithmetic through the same
// buildImport the JSON path uses, the commit landing in the ledger, the
// questions round-trip, and the day's-over refusal.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const OUT = process.env.CHECK_OUT ?? new globalThis.URL('.artifacts', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
const REF = 'kxaqapcrbmuqulkltxum';

const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

const TRIP = 'Azores \u{1F1F5}\u{1F1F9}';

// A session that is still VALID, so supabase-js answers from storage and the
// app boots signed in without a single network round trip.
const freshSession = () => {
  const soon = Math.floor(Date.now() / 1000) + 3600;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return {
    access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', exp: soon, aud: 'authenticated' })}.s`,
    token_type: 'bearer', expires_in: 3600, expires_at: soon, refresh_token: 'good',
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'p@example.com', app_metadata: { provider: 'google' }, created_at: '2026-01-01T00:00:00Z' },
  };
};

const seed = ([ref, session]) => {
  const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en' });
  put('nudges', { tips: false, recap: false });
  const travel = { id: 'travel', name: 'Travel', type: 'expense', icon: 'Plane', color: 'text-sky-600', bgColor: 'bg-sky-50', selectedBg: 'bg-sky-100', subcategories: ['Hotel', 'Food'] };
  const food = { id: 'food', name: 'Food & Drinks', type: 'expense', icon: 'Utensils', color: 'text-orange-600', bgColor: 'bg-orange-50', selectedBg: 'bg-orange-100', subcategories: [] };
  put('categories', [travel, food]);
  put('income-categories', [{ id: 'sal', name: 'Salary', type: 'income', icon: 'Wallet', color: 'text-teal-600', bgColor: 'bg-teal-50', selectedBg: 'bg-teal-100', subcategories: [] }]);
  put('sources', [{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }]);
  const row = (id, date, description, amount = 20) => ({
    id, date, type: 'expense', amount, baseAmount: amount, currency: 'EUR', sourceId: 'cash',
    category: travel, subcategory: 'Food', createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z`,
    recurrence: 'Never repeat', description,
  });
  put('transactions', [
    // A real trip, so the assertion has something to point at.
    row('t1', '2026-08-21', `AZ - Cena porto`.replace('AZ', 'Azores \u{1F1F5}\u{1F1F9}')),
    row('t2', '2026-08-22', `Azores \u{1F1F5}\u{1F1F9} - Hotel`),
    row('t3', '2026-08-23', `Azores \u{1F1F5}\u{1F1F9} - Volo`),
    row('t4', '2026-08-24', `Azores \u{1F1F5}\u{1F1F9} - Pranzo`),
    // The dedupe's evidence: this exact row also arrives in the payload.
    // importedAt matters - only rows that came from a FILE take part in the
    // dedupe. A hand-typed twin deliberately never blocks an import.
    { ...row('dup', '2026-08-22', `Azores \u{1F1F5}\u{1F1F9} - Ferry`, 30), importedAt: '2026-08-25T10:00:00.000Z' },
  ]);
  if (session) localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session));
  else put('guest', 'true');
};

const sse = (frames) => frames.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');

// What the function would answer once it has read the file: the payload in
// the app's own import shape, trip prefixes already re-applied server-side.
const OK_DONE = {
  status: 'ok',
  payload: {
    version: 1, currency: 'EUR',
    transactions: [
      { date: '2026-08-22', amount: 30, type: 'expense', category: 'Travel', description: `Azores \u{1F1F5}\u{1F1F9} - Ferry` },
      { date: '2026-08-22', amount: 43.34, type: 'expense', category: 'Travel', subcategory: 'Hotel', description: `Azores \u{1F1F5}\u{1F1F9} - Extra night` },
      { date: '2026-08-23', amount: 26.59, type: 'expense', category: 'Travel', subcategory: 'Food', description: `Azores \u{1F1F5}\u{1F1F9} - Pranzo Pico` },
      { date: '2026-08-23', amount: 9, type: 'expense', category: 'Travel', subcategory: 'Food', description: `Azores \u{1F1F5}\u{1F1F9} - Burger` },
    ],
  },
  notes: [], remaining: 2, model: 'claude-sonnet-5', usage: { input: 5000, output: 900 },
};
const ROWS = OK_DONE.payload.transactions.map((r, i) => ['row', { n: i + 1, row: r }]);

const CSV = [
  'date,description,amount',
  '2026-08-22,Ferry,30',
  '2026-08-22,Extra night,43.34',
  '2026-08-23,Pranzo Pico,26.59',
  '2026-08-23,Burger,9',
].join('\n');

const open = async ({ session, convert }) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, locale: 'en-GB' });
  let calls = 0;
  // Routes are matched newest-first, so the broad Supabase stub goes in
  // FIRST and the function's own route after it - the other way round, the
  // broad one answers "{}" to the conversion call and the whole flow reads
  // as an instant failure.
  await ctx.route(/supabase\.co/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.route('**/functions/v1/convert-import', async (route) => {
    calls += 1;
    const reply = convert(calls, JSON.parse(route.request().postData() ?? '{}'));
    // A beat of latency, so the reading screen is a state the test can see
    // rather than a frame it always misses.
    await new Promise((r) => setTimeout(r, reply.delay ?? 0));
    if (reply.abort) return route.abort('internetdisconnected');
    return route.fulfill(reply.res);
  });
  await ctx.addInitScript(seed, [REF, session ? freshSession() : null]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Settings' }).first().click();
  await p.waitForTimeout(600);
  await p.getByText('Import data', { exact: false }).first().click();
  await p.waitForTimeout(700);
  return { ctx, p, calls: () => calls };
};

const pickCsv = (p) => p.locator('[data-ai-door] input[type="file"]').setInputFiles({
  name: 'azores.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV),
});

// ── a guest sees no door ──────────────────────────────────────────────────
{
  const { ctx, p } = await open({ session: false, convert: () => ({ res: { status: 500, body: '{}' } }) });
  ok(await p.locator('[data-ai-door]').count() === 0, 'a guest gets no AI door - no account, nobody to bill');
  ok(/Open any AI assistant/.test(await p.locator('body').innerText()),
    'and the manual path stands whole, exactly as before');
  await ctx.close();
}

// ── the whole happy path, in one signed-in context ────────────────────────
{
  const { ctx, p } = await open({
    session: true,
    convert: () => ({ delay: 900, res: { status: 200, contentType: 'text/event-stream', body: sse([...ROWS, ['done', OK_DONE]]) } }),
  });
  ok(await p.locator('[data-ai-door]').count() === 1, 'signed in, the door is there');
  const before = await p.locator('body').innerText();
  ok(!/Open any AI assistant/.test(before), 'with the manual steps folded away');
  await p.locator('[data-ai-manual-line]').click();
  await p.waitForTimeout(300);
  ok(/Open any AI assistant/.test(await p.locator('body').innerText()),
    'though one quiet line unfolds them for whoever wants that road');
  await p.locator('[data-ai-manual-line]').click();
  await p.waitForTimeout(200);

  await pickCsv(p);
  await p.waitForTimeout(600);
  // The file's dates sit inside the Azores trip: the app asserts, it does
  // not interview.
  ok(await p.locator('[data-ai-flow][data-ai-step="trip"]').count() === 1,
    'dates inside a known trip: the assertion screen appears');
  const tripText = await p.locator('[data-ai-flow]').innerText();
  ok(tripText.includes(TRIP), `naming the trip it recognised (${tripText.split('\n').slice(0, 4).join(' | ')})`);
  ok(await p.locator(`[data-ai-chip="yes"]`).count() === 1, 'with "yes" already the lit chip');
  await p.screenshot({ path: `${OUT}/aiimport-trip.png` });

  await p.locator('[data-ai-cta="go"]').click();
  await p.waitForTimeout(250);
  ok(await p.locator('[data-ai-flow][data-ai-step="reading"]').count() === 1, 'Go starts the reading screen');
  ok(/No expense has been added yet/.test(await p.locator('[data-ai-flow]').innerText()),
    'which says out loud that nothing has been committed');
  await p.screenshot({ path: `${OUT}/aiimport-reading.png` });

  await p.waitForSelector('[data-ai-flow][data-ai-step="ready"]', { timeout: 10000 });
  const ready = await p.locator('[data-ai-flow]').innerText();
  // Four rows arrived; one is the ferry the ledger already holds.
  ok(/Add the 3 expenses/.test(ready), `the CTA counts only what is NEW (${ready.match(/Add the \d+/)?.[0]})`);
  ok(/1 was already here/.test(ready), 'and the dedupe is one grey line, not a report');
  ok(ready.includes(TRIP), 'the trip badge rides on the dark card');
  await p.screenshot({ path: `${OUT}/aiimport-ready.png` });

  await p.locator('[data-ai-cta="commit"]').click();
  await p.waitForTimeout(900);
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('expense-tracker.v1.transactions') ?? '[]'));
  ok(stored.length === 5 + 3, `committing adds exactly the three new rows (${stored.length})`);
  ok(stored.some((t) => t.description === `Azores \u{1F1F5}\u{1F1F9} - Pranzo Pico`),
    'spelled with the flag the server re-applied');
  ok(await p.locator('[data-ai-flow]').count() === 0, 'and the flow is gone');
  await ctx.close();
}

// ── the questions round-trip ──────────────────────────────────────────────
{
  const NEED = {
    status: 'need_input',
    questions: [{ ask: 'Which column is you?', options: ['Pit', 'Merlo'] }],
    notes: [], remaining: 2, model: 'm', usage: { input: 1, output: 1 },
  };
  const { ctx, p, calls } = await open({
    session: true,
    convert: (n, body) => n === 1
      ? { res: { status: 200, contentType: 'text/event-stream', body: sse([['done', NEED]]) } }
      : { answered: body.answers, res: { status: 200, contentType: 'text/event-stream', body: sse([...ROWS, ['done', OK_DONE]]) } },
  });
  await pickCsv(p);
  await p.waitForTimeout(400);
  await p.locator('[data-ai-cta="go"]').click();
  await p.waitForSelector('[data-ai-flow][data-ai-step="questions"]', { timeout: 8000 });
  ok(/Which column is you\?/.test(await p.locator('[data-ai-flow]').innerText()),
    'the model can ask instead of guessing, and the question renders');
  await p.locator('[data-ai-chip="Pit"]').click();
  await p.locator('[data-ai-cta="go"]').click();
  await p.waitForSelector('[data-ai-flow][data-ai-step="ready"]', { timeout: 8000 });
  ok(calls() === 2, 'answering asks the function again');
  await ctx.close();
}

// ── the day's lot ─────────────────────────────────────────────────────────
{
  const { ctx, p } = await open({
    session: true,
    convert: () => ({ res: { status: 429, contentType: 'application/json', body: JSON.stringify({ code: 'daily_limit', error: "That is today's lot." }) } }),
  });
  await pickCsv(p);
  await p.waitForTimeout(400);
  await p.locator('[data-ai-cta="go"]').click();
  await p.waitForSelector('[data-ai-flow][data-ai-step="error"]', { timeout: 8000 });
  const err = await p.locator('[data-ai-flow]').innerText();
  ok(/That's it for today/.test(err), `the cap is a calm sentence, not an error code (${err.split('\n')[1] ?? ''})`);
  ok(await p.locator('[data-ai-cta="retry"]').count() === 0, 'with no retry button pointing at the same wall');
  await ctx.close();
}

// ── the line dies ─────────────────────────────────────────────────────────
//
// The most ordinary failure this flow will ever meet, so it gets its own
// sentence and its own screen - not a shrug. The route aborts the way a
// dead connection does; the screen must say offline, say nothing was
// added, and leave a retry in reach.
{
  const { ctx, p } = await open({ session: true, convert: () => ({ abort: true }) });
  await pickCsv(p);
  await p.waitForTimeout(400);
  await p.locator('[data-ai-cta="go"]').click();
  await p.waitForSelector('[data-ai-flow][data-ai-step="error"]', { timeout: 8000 });
  const err = await p.locator('[data-ai-flow]').innerText();
  ok(/You're offline/.test(err), `a dead line is named as offline (${err.split('\n').find((l) => l.trim()) ?? ''})`);
  ok(/Nothing has been added/.test(err), 'and the screen says nothing was added');
  ok(await p.locator('[data-ai-cta="retry"]').count() === 1, 'with a retry for when the line returns');
  await p.screenshot({ path: `${OUT}/aiimport-offline.png` });
  await ctx.close();
}

// ── the door, for the eye ─────────────────────────────────────────────────
{
  const { ctx, p } = await open({ session: true, convert: () => ({ abort: true }) });
  await p.screenshot({ path: `${OUT}/aiimport-door.png`, fullPage: true });
  const door = await p.locator('body').innerText();
  ok((await p.locator('[data-ai-door]').innerText()).includes('Tricount, Splitwise'),
    'the door shows its breadth - both split apps named in the tiles');
  ok(/Banks & cards/.test(door) && /Trips & split expenses/.test(door),
    'the WHY cards are back above the button');
  ok(/matched to your categories/.test(door),
    'and the door says the matching is fitted to YOUR setup');
  ok(await p.locator('a[href*="tricount-exporter"]').count() === 1,
    'Tricount - which has no export of its own - links to the tool that makes one');
  await ctx.close();
}

// ── a real Excel file, unpacked on the phone ──────────────────────────────
//
// The workbook is a genuine zip built by the xlsx fixture: shared strings,
// a styles table, dates stored as day counts, two sheets. If the in-browser
// converter works, its dates land inside the Azores trip and the assertion
// screen appears - the same path a CSV takes, because by then it IS one.
{
  const { buildWorkbook } = await import('../xlsx-test/fixture.mjs');
  const { ctx, p } = await open({
    session: true,
    convert: (n, body) => ({
      sawCsv: body.files?.[0]?.media_type,
      res: { status: 200, contentType: 'text/event-stream', body: sse([...ROWS, ['done', OK_DONE]]) },
    }),
  });
  await p.locator('[data-ai-door] input[type="file"]').setInputFiles({
    name: 'spese.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: buildWorkbook(),
  });
  await p.waitForTimeout(800);
  ok(await p.locator('[data-ai-flow][data-ai-step="trip"]').count() === 1,
    'an .xlsx unpacks on the phone: its serial dates land inside the trip and the assertion appears');
  await p.locator('[data-ai-cta="go"]').click();
  await p.waitForSelector('[data-ai-flow][data-ai-step="ready"]', { timeout: 10000 });
  ok(true, 'and the rest of the flow is the CSV flow, because by then it is one');
  await ctx.close();
}

// ── the Italian twin, in the dark ─────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, locale: 'it-IT', colorScheme: 'dark' });
  await ctx.route(/supabase\.co/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.addInitScript(seed, [REF, freshSession()]);
  await ctx.addInitScript(() => {
    localStorage.setItem('expense-tracker.v1.theme', 'dark');
    const s = JSON.parse(localStorage.getItem('expense-tracker.v1.settings') ?? '{}');
    s.language = 'it';
    localStorage.setItem('expense-tracker.v1.settings', JSON.stringify(s));
  });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Impostazioni' }).first().click();
  await p.waitForTimeout(600);
  await p.getByText('Importa dati', { exact: false }).first().click();
  await p.waitForTimeout(700);
  ok(/Aggiungi dai tuoi dati/.test(await p.locator('body').innerText()),
    'the door speaks Italian');
  await pickCsv(p);
  await p.waitForTimeout(600);
  const text = await p.locator('[data-ai-flow]').innerText();
  ok(/Le metto lì\?/.test(text) && text.includes(TRIP),
    'and the assertion does too, flag intact');
  await p.screenshot({ path: `${OUT}/aiimport-trip-it-dark.png` });
  await ctx.close();
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await b.close();
process.exit(fail.length ? 1 : 0);
