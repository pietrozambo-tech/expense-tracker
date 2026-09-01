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
  // What the model worked out on its own. On a split file these lines are
  // the owner's only check that the reading is right - see the notes
  // assertion on the ready screen.
  notes: ['Your column: Pit', 'Columns were balances', 'Your share: 906€'],
  remaining: 2, model: 'claude-sonnet-5', usage: { input: 5000, output: 900 },
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
    if (reply.hang) return; // held open forever - the watchdog's case
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
  const guestBody = await p.locator('body').innerText();
  ok(/Open any AI assistant/.test(guestBody), 'and the manual path stands whole, exactly as before');
  ok(/Bring in your existing data/.test(guestBody), 'intro and value cards included - for them this IS the screen');
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
  const unfolded = await p.locator('body').innerText();
  ok(/Open any AI assistant/.test(unfolded),
    'though one quiet line unfolds them for whoever wants that road');
  ok(!/Bring in your existing data/.test(unfolded) && !/Banks & spreadsheets/.test(unfolded),
    'unfolded under the door, the fold starts at the steps - no second copy of the pitch just read');
  // One button per screen: with the fold open, the fold's own chooser is the
  // only dark CTA, and the quiet line becomes the road back.
  ok(await p.locator('[data-ai-browse]').count() === 0,
    'the door button steps aside while the fold is open');
  ok(/Back to the automatic import/.test(unfolded), 'and the quiet line becomes the road back');
  ok(!/a spreadsheet, a bank\/card statement/.test(unfolded),
    'step 1 is cut to one sentence - the file litany already lives on the door card');
  await p.locator('[data-ai-manual-line]').click();
  await p.waitForTimeout(200);
  ok(await p.locator('[data-ai-browse]').count() === 1, 'folding back brings the door button home');

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
  // The route is still sitting on its 900ms delay: headers have not arrived,
  // so the narration must say the TRUE thing - the upload is in flight - over
  // a sweeping bar, since no percent is known before the first row.
  const opening = await p.locator('[data-ai-opening]').innerText();
  ok(/Uploading the file/.test(opening), `while the upload is in flight, the line says so (${opening})`);
  ok(await p.locator('[data-ai-bar="indeterminate"]').count() === 1,
    'above a live bar - sweeping, because no percent is known yet');
  await p.screenshot({ path: `${OUT}/aiimport-reading.png` });

  await p.waitForSelector('[data-ai-flow][data-ai-step="ready"]', { timeout: 10000 });
  const ready = await p.locator('[data-ai-flow]').innerText();
  // Four rows arrived; one is the ferry the ledger already holds.
  ok(/Add the 3 expenses/.test(ready), `the CTA counts only what is NEW (${ready.match(/Add the \d+/)?.[0]})`);
  ok(/1 was already here/.test(ready), 'and the dedupe is one grey line, not a report');
  ok(ready.includes(TRIP), 'the trip badge rides on the dark card');
  // The five-second check the instructions promise: which column it took as
  // mine, shares or balances, and the total. Parsed but never shown, a
  // reading that had quietly dropped the biggest rows looked exactly like a
  // correct one - reported from a device on a real Splitwise export.
  ok(await p.locator('[data-ai-notes]').count() === 1
    && /Your share: 906/.test(await p.locator('[data-ai-notes]').innerText()),
    'and what it worked out - my column, shares vs balances, my total - is on screen before I commit');
  await p.screenshot({ path: `${OUT}/aiimport-ready.png` });

  await p.locator('[data-ai-cta="commit"]').click();
  await p.waitForTimeout(900);
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('expense-tracker.v1.transactions') ?? '[]'));
  ok(stored.length === 5 + 3, `committing adds exactly the three new rows (${stored.length})`);
  ok(stored.some((t) => t.description === `Azores \u{1F1F5}\u{1F1F9} - Pranzo Pico`),
    'spelled with the flag the server re-applied');
  ok(await p.locator('[data-ai-flow]').count() === 0, 'and the flow is gone');

  // The wrong door, caught: a CSV dropped on the manual path's .json button
  // is someone who missed the automatic one - the error must say so, point
  // upward, and fold the manual path away so that door is back on screen.
  // (The commit just landed us on the Dashboard - that is deliberate, the
  // result is the point - so walk back in first.)
  await p.getByRole('button', { name: 'Settings' }).first().click();
  await p.waitForTimeout(600);
  await p.getByText('Import data', { exact: false }).first().click();
  await p.waitForTimeout(700);
  await p.locator('[data-ai-manual-line]').click();
  await p.waitForTimeout(300);
  await p.locator('input[accept=".json,application/json"]').setInputFiles({
    name: 'estratto.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV),
  });
  await p.waitForTimeout(500);
  const nudge = await p.locator('body').innerText();
  ok(/This button only reads the \.json/.test(nudge), 'a CSV on the .json button is caught and named');
  ok(/use "Choose a file" above/.test(nudge), 'with the pointer at the door that reads everything');
  ok(await p.locator('[data-ai-browse]').count() === 1,
    'and the fold steps aside so that door is back on screen');
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
//
// Reported from a device, verbatim: the wall said "Per oggi è tutto" and
// nothing else, which read as the app breaking. The refusal must name the
// rule (all N reads used), say nothing was touched - and be remembered, so
// the DOOR warns before the next file picker and trip question, not after.
{
  const { ctx, p } = await open({
    session: true,
    convert: () => ({ res: { status: 429, contentType: 'application/json', body: JSON.stringify({ code: 'daily_limit', error: "That is today's lot.", limit: 3, remaining: 0 }) } }),
  });
  await pickCsv(p);
  await p.waitForTimeout(400);
  await p.locator('[data-ai-cta="go"]').click();
  await p.waitForSelector('[data-ai-flow][data-ai-step="error"]', { timeout: 8000 });
  const err = await p.locator('[data-ai-flow]').innerText();
  ok(/You've used today's imports/.test(err), `the cap is a calm sentence, not an error code (${err.split('\n')[1] ?? ''})`);
  ok(/It's 3 a day/.test(err), 'naming the rule in the words the user has, with the server\'s number');
  ok(/Nothing has been touched/.test(err), 'and saying out loud that nothing was touched');
  ok(await p.locator('[data-ai-cta="retry"]').count() === 0, 'with no retry button pointing at the same wall');
  await p.locator('[data-ai-cta="close"]').click();
  await p.waitForTimeout(400);
  ok(await p.locator('[data-ai-day-done]').count() === 1,
    'back at the door, the day-is-done note now stands before the button');
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
  // The only way OFF a retry-only screen. It used to sit under the centred
  // body's negative margin - visible, and silently dead to every tap.
  await p.locator('[data-ai-flow] button[aria-label]').first().click();
  await p.waitForTimeout(300);
  ok(await p.locator('[data-ai-flow]').count() === 0, 'and the top-left X actually closes the screen');
  await ctx.close();
}

// ── the function that never answers ───────────────────────────────────────
//
// Reported from a device, verbatim: 'stuck here since +3 minutes, no
// messages to the user at all'. The route holds the request open forever;
// the client's watchdog (shortened via its localStorage override, because
// no test waits ninety seconds) must abort on its own and land on a screen
// that says what happened and what was not touched.
{
  const { ctx, p } = await open({ session: true, convert: () => ({ hang: true }) });
  await p.evaluate(() => localStorage.setItem('expense-tracker.v1.ai-first-ms', '1500'));
  await pickCsv(p);
  await p.waitForTimeout(400);
  await p.locator('[data-ai-cta="go"]').click();
  await p.waitForSelector('[data-ai-flow][data-ai-step="error"]', { timeout: 8000 });
  const err = await p.locator('[data-ai-flow]').innerText();
  ok(/It's not answering/.test(err), 'a function that goes quiet is interrupted by the app itself');
  ok(/Nothing has been added/.test(err), 'saying out loud that nothing was touched');
  ok(await p.locator('[data-ai-cta="retry"]').count() === 1, 'with a retry in reach');
  await p.screenshot({ path: `${OUT}/aiimport-stalled.png` });
  await ctx.close();
}

// ── the door, for the eye ─────────────────────────────────────────────────
{
  const { ctx, p } = await open({ session: true, convert: () => ({ abort: true }) });
  await p.screenshot({ path: `${OUT}/aiimport-door.png`, fullPage: true });
  const door = await p.locator('body').innerText();
  ok(/Banks & cards/.test(door) && /Trips & split expenses/.test(door) && /Splitwise/.test(door),
    'the WHY is on the door - banks, trips, Splitwise - before any button asks');
  ok(/matched to your categories/.test(door),
    'and it says the matching is fitted to YOUR setup');
  ok(await p.locator('a[href*="tricount-exporter"]').count() === 1,
    'Tricount - which has no export of its own - links to the tool that makes one');
  // The user's own complaint, pinned: on a real phone height the whole door
  // - reasons, button, hint, manual line - fits with NOTHING under the fold.
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(300);
  const fit = await p.evaluate(() => {
    const sc = document.querySelector('[data-ai-door]').closest('.overflow-y-auto');
    return { sh: sc.scrollHeight, ch: sc.clientHeight };
  });
  ok(fit.sh <= fit.ch + 2, `the door fits an iPhone screen without scrolling (${fit.sh} vs ${fit.ch})`);
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

// ── the bookings do not hide the trip ─────────────────────────────────────
//
// From the user's real file: the flights and hotels of an August trip are
// BOOKED in March and June, and a min..max date window spanning half a year
// matched no trip - so the assertion screen never appeared and the model
// spent a whole read asking what the app already knew. The scan now takes
// the dominant cluster, and says "most of them" instead of "all".
{
  const { ctx, p } = await open({
    session: true,
    convert: () => ({ res: { status: 200, contentType: 'text/event-stream', body: sse([...ROWS, ['done', OK_DONE]]) } }),
  });
  const csv = ['date,description,amount',
    ...['2026-08-21', '2026-08-22', '2026-08-22', '2026-08-23', '2026-08-23', '2026-08-24', '2026-08-24', '2026-08-24']
      .map((d, i) => `${d},Row ${i},10`),
    '2026-03-13,Voli da Madrid,490',
    '2026-03-14,Macchina,230',
    '2026-06-28,Hotel FLW,747',
  ].join('\n');
  await p.locator('[data-ai-door] input[type="file"]').setInputFiles({
    name: 'azores-with-bookings.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });
  await p.waitForTimeout(600);
  ok(await p.locator('[data-ai-flow][data-ai-step="trip"]').count() === 1,
    'booking rows from months before no longer hide the trip the file is about');
  const text = await p.locator('[data-ai-flow]').innerText();
  ok(/Most of them between/.test(text) && text.includes(TRIP),
    `and the assertion says "most", which is the truth (${text.split('\n')[1] ?? ''})`);
  await ctx.close();
}

// ── trip-shaped, but no known trip ────────────────────────────────────────
//
// A tight run of dates the ledger has no trip for: the yes/no is asked HERE,
// once, with the name typed or tapped - because the alternative is the model
// asking the same thing in a round of its own, which costs a whole read from
// the daily allowance. The answer rides on the FIRST call.
{
  let lastBody = null;
  const { ctx, p } = await open({
    session: true,
    convert: (n, body) => {
      lastBody = body;
      return { res: { status: 200, contentType: 'text/event-stream', body: sse([...ROWS, ['done', OK_DONE]]) } };
    },
  });
  const csv = ['date,description,amount',
    '2026-10-03,Cena,20', '2026-10-05,Hotel,90', '2026-10-07,Museo,12', '2026-10-09,Treno,35',
  ].join('\n');
  await p.locator('[data-ai-door] input[type="file"]').setInputFiles({
    name: 'ottobre.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });
  await p.waitForTimeout(600);
  ok(await p.locator('[data-ai-flow][data-ai-step="trip"]').count() === 1
    && /Is this a trip\?/.test(await p.locator('[data-ai-flow]').innerText()),
    'a tight run of unknown dates asks the trip question locally, before any read is spent');
  // "No" is the lit default, and under it an optional line of context - the
  // pre-emption of the model's next question, one round cheaper.
  ok(await p.locator('[data-ai-context]').count() === 1
    && (await p.locator('[data-ai-context]').getAttribute('placeholder'))?.includes('Tell me more'),
    'saying No opens a "tell me more" line instead of going quiet');
  await p.locator('[data-ai-chip="other"]').click();
  ok((await p.locator('[data-ai-trip-name]').getAttribute('placeholder')) === 'Trip name…',
    'and saying yes asks for a trip name by name, not a "new name"');
  await p.locator('[data-ai-trip-name]').fill('Ottobre');
  await p.locator('[data-ai-cta="go"]').click();
  await p.waitForSelector('[data-ai-flow][data-ai-step="ready"]', { timeout: 10000 });
  ok(lastBody?.trip?.is_trip === true && lastBody?.trip?.name === 'Ottobre',
    `and the answer rides on the FIRST call (${JSON.stringify(lastBody?.trip)})`);
  // The other branch: No, with words. They must reach the function as an
  // answer on the first call.
  await p.locator('[data-ai-flow] button[aria-label]').first().click();
  await p.waitForTimeout(300);
  await p.locator('[data-ai-door] input[type="file"]').setInputFiles({
    name: 'ottobre.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });
  await p.waitForTimeout(600);
  await p.locator('[data-ai-context]').fill('Sono le spese di casa, colonna Pit sono io');
  await p.locator('[data-ai-cta="go"]').click();
  await p.waitForSelector('[data-ai-flow][data-ai-step="ready"]', { timeout: 10000 });
  ok(lastBody?.trip?.is_trip === false
    && lastBody?.answers?.[0]?.answer === 'Sono le spese di casa, colonna Pit sono io',
    `and a No with words attached sends the words along (${JSON.stringify(lastBody?.answers)})`);
  await ctx.close();
}

// ── the crowded reader, and the reason on the generic wall ────────────────
{
  const { ctx, p } = await open({
    session: true,
    convert: (n) => n === 1
      ? { res: { status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'busy', error: 'Too many imports at once. Try again in a minute.' }) } }
      : { res: { status: 502, contentType: 'application/json', body: JSON.stringify({ code: 'unreadable', error: 'Could not read the file: boom' }) } },
  });
  await pickCsv(p);
  await p.waitForTimeout(400);
  await p.locator('[data-ai-cta="go"]').click();
  await p.waitForSelector('[data-ai-flow][data-ai-step="error"]', { timeout: 8000 });
  const busy = await p.locator('[data-ai-flow]').innerText();
  ok(/It's busy right now/.test(busy), 'a crowded reader is its own calm sentence, not a generic failure');
  ok(await p.locator('[data-ai-cta="retry"]').count() === 1, 'with a retry, because a minute fixes it');
  await p.locator('[data-ai-cta="retry"]').click();
  await p.waitForSelector('[data-ai-detail]', { timeout: 8000 });
  const err = await p.locator('[data-ai-flow]').innerText();
  ok(/I couldn't read it/.test(err), 'anything unnamed still lands on the generic screen');
  ok(/Could not read the file: boom/.test(err),
    'which now carries the server\'s own words - "non sono riuscito a leggerlo" with no reason was the reported wall');
  await ctx.close();
}

// ── the file's own arithmetic, against the model's ────────────────────────
//
// Reported from a device: a real Splitwise trip whose own screen reads "Your
// share 955,77 €" came back as an offer to add 200 EUR, and nothing on the
// screen said otherwise - a wrong reading looked exactly like a right one.
// The phone can do that arithmetic itself (lib/splitFile, tested to the cent
// against Splitwise's own figure), so now it does, and says so out loud when
// the two readings disagree.
{
  // Balances, the Splitwise shape: -12 each for four people, +36 for the
  // payer. My share is 12 a row, 48 across four rows.
  const SPLIT = ['Date,Description,Category,Cost,Currency,P Rossi,Franco B,Andrea G,Vera',
    '2026-08-22,Cena,Dining out,48.00,EUR,-12.00,36.00,-12.00,-12.00',
    '2026-08-22,Taxi,Taxi,48.00,EUR,36.00,-12.00,-12.00,-12.00',
    '2026-08-23,Spesa,Groceries,48.00,EUR,-12.00,-12.00,36.00,-12.00',
    '2026-08-23,Barca,General,48.00,EUR,-12.00,-12.00,-12.00,36.00',
    '',
    '2026-09-01,Total balance, , ,EUR,0.00,0.00,0.00,0.00',
  ].join('\n');
  // What a WRONG reading looks like: one row instead of four.
  const THIN = {
    ...OK_DONE,
    payload: { version: 1, currency: 'EUR', transactions: [OK_DONE.payload.transactions[0]] },
  };
  let sawAnswers = null;
  let sawFile = null;
  const { ctx, p } = await open({
    session: true,
    convert: (n, body) => {
      sawAnswers = body.answers;
      sawFile = Buffer.from(body.files?.[0]?.data ?? '', 'base64').toString('utf8');
      return { res: { status: 200, contentType: 'text/event-stream', body: sse([['done', THIN]]) } };
    },
  });
  await p.locator('[data-ai-door] input[type="file"]').setInputFiles({
    name: 'formentera.csv', mimeType: 'text/csv', buffer: Buffer.from(SPLIT),
  });
  await p.waitForTimeout(600);
  if (await p.locator('[data-ai-cta="go"]').count()) await p.locator('[data-ai-cta="go"]').click();
  await p.waitForSelector('[data-ai-flow][data-ai-step="ready"]', { timeout: 10000 });
  // The seeded user is "P" and the column "P Rossi" - the first name finds it,
  // and it rides on the first request so the model never spends a round asking.
  ok(sawAnswers?.some((a) => /P Rossi/.test(a.answer)),
    `my column travels on the FIRST call, not as a question (${JSON.stringify(sawAnswers)})`);
  // What actually left the phone: not the per-person columns, but my own
  // rows with my share already worked out. The model got the balance
  // arithmetic wrong on a real export - twice on one screen - so it is no
  // longer asked to do it.
  ok(sawFile?.startsWith('date,description,category,amount'),
    `the file sent is the phone's own reading, not the raw columns (${sawFile?.split('\n')[0]})`);
  ok(!/-12\.00/.test(sawFile ?? '') && /,12\.00/.test(sawFile ?? ''),
    'every amount in it is my share, and none of them is negative');
  ok(await p.locator('[data-ai-crosscheck="off"]').count() === 1,
    'a reading that lost most of the rows is caught by the phone\'s own arithmetic');
  const warn = await p.locator('[data-ai-crosscheck]').innerText();
  ok(/48/.test(warn) && /30/.test(warn),
    `and the two numbers are put side by side (${warn})`);
  await ctx.close();
}
{
  // The same file, read correctly: four rows of 12. The line confirms rather
  // than warns - and a false alarm here would be worse than no line at all.
  const SPLIT = ['Date,Description,Category,Cost,Currency,P Rossi,Franco B,Andrea G,Vera',
    '2026-08-22,Cena,Dining out,48.00,EUR,-12.00,36.00,-12.00,-12.00',
    '2026-08-22,Taxi,Taxi,48.00,EUR,36.00,-12.00,-12.00,-12.00',
    '2026-08-23,Spesa,Groceries,48.00,EUR,-12.00,-12.00,36.00,-12.00',
    '2026-08-23,Barca,General,48.00,EUR,-12.00,-12.00,-12.00,36.00',
  ].join('\n');
  const RIGHT = {
    ...OK_DONE,
    payload: {
      version: 1, currency: 'EUR',
      transactions: ['Cena', 'Taxi', 'Spesa', 'Barca'].map((d, i) => ({
        date: `2026-08-2${i < 2 ? 2 : 3}`, amount: 12, type: 'expense', category: 'Travel', description: d,
      })),
    },
  };
  const { ctx, p } = await open({
    session: true,
    convert: () => ({ res: { status: 200, contentType: 'text/event-stream', body: sse([['done', RIGHT]]) } }),
  });
  await p.locator('[data-ai-door] input[type="file"]').setInputFiles({
    name: 'formentera.csv', mimeType: 'text/csv', buffer: Buffer.from(SPLIT),
  });
  await p.waitForTimeout(600);
  if (await p.locator('[data-ai-cta="go"]').count()) await p.locator('[data-ai-cta="go"]').click();
  await p.waitForSelector('[data-ai-flow][data-ai-step="ready"]', { timeout: 10000 });
  ok(await p.locator('[data-ai-crosscheck="ok"]').count() === 1,
    'and a reading that agrees with the file is confirmed, not second-guessed');
  // The model's own total is dropped once the phone has done the sums. On a
  // real 50-row trip it reported "€1.087,02" under a card correctly reading
  // 1375,49 - fifty numbers added in prose, printed beside the right answer.
  const notes = await p.locator('[data-ai-notes]').innerText();
  ok(!/906|€\s?\d/.test(notes) && /balances/.test(notes),
    `its arithmetic claim is gone, its reading kept (${notes.replace(/\n/g, ' | ')})`);
  await ctx.close();
}

// ── the nickname: asked here, once, instead of costing a round ───────────
//
// A Tricount trip files its people as "Pit", "Merlo", "Max". No name
// matching turns "P" into "Pit", so the phone cannot do the arithmetic and
// the model would spend a whole read asking which column is me. The app asks
// instead - one tap, before anything is sent - and then owns the sums.
{
  const TRI = ['date,description,category,paid_by,total,Pit,Merlo,Max',
    '2026-08-22,Ferry,Transport,Merlo,90.00,30.00,30.00,30.00',
    '2026-08-22,Hotel,Stay,Pit,300.00,100.00,100.00,100.00',
    '2026-08-23,Cena,Food,Max,60.00,20.00,20.00,20.00',
    '2026-08-23,Museo solo Pit,Culture,Pit,12.00,12.00,0.00,0.00',
  ].join('\n');
  let sawFile = null;
  let calls = 0;
  const { ctx, p } = await open({
    session: true,
    convert: (n, body) => {
      calls += 1;
      sawFile = Buffer.from(body.files?.[0]?.data ?? '', 'base64').toString('utf8');
      return { res: { status: 200, contentType: 'text/event-stream', body: sse([...ROWS, ['done', OK_DONE]]) } };
    },
  });
  await p.locator('[data-ai-door] input[type="file"]').setInputFiles({
    name: 'azores.csv', mimeType: 'text/csv', buffer: Buffer.from(TRI),
  });
  await p.waitForTimeout(700);
  ok(await p.locator('[data-ai-flow][data-ai-step="who"]').count() === 1,
    'a file whose columns are nicknames asks which one is me, on the phone');
  const chips = (await p.locator('[data-ai-chip^="who-"]').allInnerTexts()).join('|');
  ok(/Pit/.test(chips) && /Merlo/.test(chips) && /not in here/.test(chips),
    `offering the file's own names and a way out (${chips})`);
  ok(calls === 0, 'and it has not called anything yet');
  await p.locator('[data-ai-chip="who-Pit"]').click();
  await p.locator('[data-ai-cta="who-go"]').click();
  await p.waitForTimeout(500);
  // The trip screen still comes after, then the reading - one call in total.
  if (await p.locator('[data-ai-cta="go"]').count()) await p.locator('[data-ai-cta="go"]').click();
  await p.waitForSelector('[data-ai-flow][data-ai-step="ready"]', { timeout: 10000 });
  ok(calls === 1, `one call for the whole file, questions included (${calls})`);
  const sum = (sawFile ?? '').split('\n').slice(1).filter(Boolean)
    .reduce((s, l) => s + Number(l.split(',').pop()), 0);
  ok(Math.abs(sum - 162) < 0.01, `and Pit's own share is what leaves (${sum})`);
  await ctx.close();
}

// ── the files that must never reach the model ────────────────────────────
//
// The day's read is claimed by the server BEFORE the model is called, so
// anything the phone can rule out for free has to be ruled out here. Three
// kinds, and the route asserts it: not one of these may cause a request.
{
  let calls = 0;
  const { ctx, p } = await open({
    session: true,
    convert: () => { calls += 1; return { res: { status: 500, body: '{}' } }; },
  });
  const pick = (name, mimeType, body) => p.locator('[data-ai-door] input[type="file"]')
    .setInputFiles({ name, mimeType, buffer: Buffer.from(body) });

  // 1. Something that is not a ledger at all. No dates, barely a number.
  await pick('curriculum.txt', 'text/plain',
    'Curriculum vitae\n\nPietro Rossi\nProduct designer, Milan.\nSkills: Figma, prototyping, research.\nSpeaks Italian and English.\n');
  await p.waitForTimeout(700);
  const body1 = await p.locator('body').innerText();
  ok(/don't see any expenses/.test(body1), `a file with no dates and no money is refused on the phone (${body1.split('\n').find((l) => /expenses/.test(l)) ?? ''})`);
  ok(await p.locator('[data-ai-flow]').count() === 0, 'without opening the flow');

  // 2. The app's own .json, dropped on the AI door. It is already in the
  //    importer's format: no read, no wait, it just imports.
  const payload = JSON.stringify({
    version: 1, currency: 'EUR',
    transactions: [
      { date: '2026-08-22', amount: 12.5, type: 'expense', category: 'Travel', description: 'Ferry JSON' },
      { date: '2026-08-23', amount: 8, type: 'expense', category: 'Travel', description: 'Caffe JSON' },
    ],
  });
  await pick('tracklylab-import.json', 'application/json', payload);
  await p.waitForTimeout(1200);
  ok(await p.locator('[data-ai-flow]').count() === 0, 'a ready-made .json does not open the AI flow at all');
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('expense-tracker.v1.transactions') ?? '[]'));
  ok(stored.some((t) => t.description === 'Ferry JSON'),
    `it is imported directly, free and instant (${stored.length} rows now)`);

  // 3. A text file past what one read can hold. Refused here rather than by
  //    the API, which would have cost the read to say no.
  await p.getByRole('button', { name: 'Settings' }).first().click();
  await p.waitForTimeout(500);
  await p.getByText('Import data', { exact: false }).first().click();
  await p.waitForTimeout(600);
  const huge = ['date,description,amount']
    .concat(Array.from({ length: 12000 }, (_, i) => `2026-08-22,Row number ${i} with a long enough description to bulk this out,${i}.50`))
    .join('\n');
  await pick('enorme.csv', 'text/csv', huge);
  await p.waitForTimeout(700);
  ok(/Too long to read in one go/.test(await p.locator('body').innerText()),
    'a file past one read\'s worth of text is refused with what to do about it');

  ok(calls === 0, `and not one of the three spent a read (${calls} calls)`);
  await ctx.close();
}

// ── read, and there was nothing in it ────────────────────────────────────
//
// The other half of the same question: the model DID read the file and found
// no transactions. That used to land on the result screen saying "nothing
// new - close", which means "you already had these" and sends the user
// hunting for a duplicate that never existed.
{
  const EMPTY = { ...OK_DONE, payload: { version: 1, currency: 'EUR', transactions: [] } };
  const { ctx, p } = await open({
    session: true,
    convert: () => ({ res: { status: 200, contentType: 'text/event-stream', body: sse([['done', EMPTY]]) } }),
  });
  await pickCsv(p);
  await p.waitForTimeout(500);
  await p.locator('[data-ai-cta="go"]').click();
  await p.waitForSelector('[data-ai-flow][data-ai-step="error"]', { timeout: 8000 });
  const err = await p.locator('[data-ai-flow]').innerText();
  ok(/don't see any expenses/.test(err), 'a file read to the end with nothing in it says exactly that');
  ok(!/Nothing new/.test(err), 'and never calls it a duplicate');
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
