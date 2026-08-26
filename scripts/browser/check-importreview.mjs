// The import review dialog: proposing taxonomy is fine, committing it is
// the user's call - and the default answer is NO.
//
// The bug this guards against, end to end: a trip file asked for "Hotel",
// which its owner had deliberately deleted in favour of "Accomodation". The
// dialog listed the proposal PRE-TICKED, so one tap on Import re-added the
// deleted chip - on every import, for ever ("it keeps repopulating"). The
// proposals now start unchecked: the rows import either way, the taxonomy
// only grows by an explicit tick.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const URL = 'http://127.0.0.1:5199/';

const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

// The exact file shape scripts/tricount-import.mjs would have produced before
// it learned to use the user's own names: rows asking for a subcategory the
// user deleted.
const dir = mkdtempSync(join(tmpdir(), 'importreview-'));
const tripFile = join(dir, 'trip.json');
writeFileSync(tripFile, JSON.stringify({
  version: 1,
  currency: 'EUR',
  transactions: [
    { date: '2026-06-28', amount: 249, type: 'expense', category: 'Travel', subcategory: 'Hotel', description: 'Hotel FLW' },
    { date: '2026-06-28', amount: 99.23, type: 'expense', category: 'Travel', subcategory: 'Hotel', description: 'Hotel PIX' },
  ],
}));

const boot = async () => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, locale: 'en-GB' });
  await ctx.addInitScript(() => {
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    localStorage.setItem('expense-tracker.v1.guest', 'true');
    localStorage.setItem('expense-tracker.v1.settings', JSON.stringify({
      onboarded: true, userName: 'Pietro', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en',
    }));
    localStorage.setItem('expense-tracker.v1.nudges', JSON.stringify({ tips: false, recap: false }));
    // Travel deliberately WITHOUT "Hotel" - the owner deleted it.
    localStorage.setItem('expense-tracker.v1.categories', JSON.stringify([{
      id: 'travel', name: 'Travel', type: 'expense', icon: 'Plane', color: 'text-sky-600',
      bgColor: 'bg-sky-50', selectedBg: 'bg-sky-100',
      subcategories: ['Flights', 'Food', 'Activities', 'Transportation', 'Accomodation'],
    }]));
    localStorage.setItem('expense-tracker.v1.sources', JSON.stringify([
      { id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' },
    ]));
    localStorage.setItem('expense-tracker.v1.transactions', JSON.stringify([]));
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1600);
  await p.getByRole('button', { name: 'Settings' }).first().click();
  await p.waitForTimeout(700);
  await p.getByText('Import data', { exact: true }).first().click();
  await p.waitForTimeout(700);
  // The screen's one external link: "Tricount" pointing at the exporter that
  // stands in for the export button Tricount does not have. _blank, because
  // from the installed PWA it must open the system browser.
  // Twice on the screen: the trips card and step 1 both name Tricount, and
  // both names ARE the way to get the file out.
  const links = p.locator('a[href="https://tricount-exporter.pages.dev"]');
  const linkTexts = await links.allTextContents();
  ok(await links.count() === 2 && linkTexts.every((x) => x.trim() === 'Tricount'),
    `the card and the steps both link Tricount to the exporter (${linkTexts.length})`);
  const attrs = await links.evaluateAll((els) => els.map((a) => ({ t: a.target, r: a.rel })));
  ok(attrs.every((a) => a.t === '_blank' && /noopener/.test(a.r)),
    'each in a new tab, with the opener cut');
  await p.locator('input[type="file"]').setInputFiles(tripFile);
  await p.waitForTimeout(900);
  return { ctx, p };
};

const travelSubs = (p) => p.evaluate(() =>
  JSON.parse(localStorage.getItem('expense-tracker.v1.categories'))
    .find((c) => c.id === 'travel').subcategories);

// 1. The default path: import without touching the proposal.
{
  const { ctx, p } = await boot();
  const proposal = p.locator('[data-import-proposal]');
  ok(await proposal.count() === 1, 'a file asking for a deleted subcategory raises one proposal');
  ok(await proposal.getAttribute('data-import-proposal') === 'off',
    'and it starts UNCHECKED - growing my taxonomy is an opt-in, not a toll');

  await p.getByRole('button', { name: /Import 2 transactions/ }).click();
  await p.waitForTimeout(1200);
  const subs = await travelSubs(p);
  ok(!subs.includes('Hotel'),
    `importing without ticking leaves the deleted chip deleted (${subs.join(', ')})`);
  const txns = await p.evaluate(() => JSON.parse(localStorage.getItem('expense-tracker.v1.transactions')));
  ok(txns.length === 2, `both rows still imported (${txns.length})`);
  ok(txns.every((t) => !t.subcategory), 'just without the unapproved subcategory');
  await ctx.close();
}

// 2. The opt-in still works: tick it, and the chip is added.
{
  const { ctx, p } = await boot();
  await p.locator('[data-import-proposal]').click();
  ok(await p.locator('[data-import-proposal]').getAttribute('data-import-proposal') === 'on',
    'a tap turns the proposal on');
  await p.getByRole('button', { name: /Import 2 transactions/ }).click();
  await p.waitForTimeout(1200);
  const subs = await travelSubs(p);
  ok(subs.includes('Hotel'), `ticked, the chip is added for real (${subs.join(', ')})`);
  const txns = await p.evaluate(() => JSON.parse(localStorage.getItem('expense-tracker.v1.transactions')));
  ok(txns.every((t) => t.subcategory === 'Hotel'), 'and the rows carry it');
  await ctx.close();
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await b.close();
process.exit(fail.length ? 1 : 0);
