// Mockups for "create a category while adding a transaction".
//
// The real app, driven in Chromium, with the proposed pieces injected into the
// real DOM before each shot - so what is being judged is the actual screen
// with one thing changed, not a drawing of it.
import pw from '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'shots');
const APP = 'http://127.0.0.1:5199/';

const browser = await pw.chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-proxy-server'],
});
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, locale: 'it-IT' });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(APP, { waitUntil: 'domcontentloaded' });
const CATS = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'cats-it.json'), 'utf8'));
await page.evaluate((cats) => {
  // The Italian starter catalogue, seeded straight in: onboarding is what
  // normally chooses it by language, and this run skips onboarding.
  localStorage.setItem('expense-tracker.v1.categories', JSON.stringify(cats.categories));
  localStorage.setItem('expense-tracker.v1.income-categories', JSON.stringify(cats.incomeCategories));
  localStorage.setItem('expense-tracker.v1.guest', 'true');
  localStorage.setItem('expense-tracker.v1.settings', JSON.stringify({
    onboarded: true, userName: 'Pietro', currency: 'EUR', monthlyBudget: 2200,
    insightsEnabled: true, hasSeenIntro: true, weekStartsOn: 1, language: 'it',
  }));
}, CATS);
await page.goto(APP, { waitUntil: 'networkidle' });
await page.waitForTimeout(1400);

const shot = async (n) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${n}.png` });
  console.log('shot', n);
};

// A ledger with something in it, so the grid is the one people actually scan.
await page.getByText('Provali con dati di esempio', { exact: false }).first().click().catch(() => {});
await page.waitForTimeout(1800);

// Open Add, and fill it the way somebody halfway through would have.
await page.getByRole('button', { name: 'Aggiungi movimento' }).first().click();
await page.waitForTimeout(700);
await page.locator('[data-amount-input]').fill('18');
await page.waitForTimeout(200);
const desc = page.locator('input[placeholder*="es."]').first();
await desc.fill('Taglio capelli').catch(() => {});
await page.waitForTimeout(300);

// Scroll to the bottom of the category grid: the moment the gap is felt.
await page.evaluate(() => {
  const sc = [...document.querySelectorAll('div')].find((d) => d.className.includes('overflow-y-auto') && d.scrollHeight > d.clientHeight + 50);
  if (sc) sc.scrollTop = sc.scrollHeight;
});
await shot('01-today');

// ── The + tile, last in the grid ────────────────────────────────────────
await page.evaluate(() => {
  const grid = document.querySelector('[data-category-picker] .grid');
  const tile = document.createElement('button');
  tile.id = 'mk-plus';
  tile.setAttribute('style', 'display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;min-height:52px;border:1.5px dashed var(--line);background:transparent;');
  tile.innerHTML = `
    <span style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:var(--bg-inset);flex-shrink:0;">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--ink-2)" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
    </span>
    <span style="font-size:13px;text-align:left;line-height:1.15;color:var(--ink-2);">Nuova categoria</span>`;
  grid.appendChild(tile);
});
await page.evaluate(() => {
  const sc = [...document.querySelectorAll('div')].find((d) => d.className.includes('overflow-y-auto') && d.scrollHeight > d.clientHeight + 50);
  if (sc) sc.scrollTop = sc.scrollHeight;
});
await shot('02-plus-tile');

// ── The sheet it opens ──────────────────────────────────────────────────
// One row for what it IS (icon + name together, not a preview card repeating
// the field under it), then the two things worth changing, then one button.
await page.evaluate(() => {
  const d = document.createElement('div');
  d.id = 'mk-sheet';
  const ICONS = [
    '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
    '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a3 3 0 0 0-6 0v4"/><path d="M2 7h20"/>',
    '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>',
    '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  ];
  d.innerHTML = `
  <div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:80;display:flex;align-items:flex-end;justify-content:center;">
   <div style="width:100%;max-width:430px;background:var(--bg-card);border-radius:22px 22px 0 0;padding:18px 22px 26px;">
    <div style="width:38px;height:4px;border-radius:99px;background:var(--bg-track);margin:0 auto 16px;"></div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <div style="color:var(--ink);font-size:17px;font-weight:700;">Nuova categoria</div>
      <span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;background:rgba(194,53,43,.10);color:#C2352B;font-size:11px;font-weight:700;letter-spacing:.04em;">SPESA</span>
    </div>

    <div style="display:flex;align-items:center;gap:11px;margin-bottom:20px;">
      <span style="width:48px;height:48px;border-radius:13px;background:#FEE2E2;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round"><g>${ICONS[0]}</g></svg>
      </span>
      <div style="flex:1;padding:13px 15px;border-radius:13px;background:var(--bg-field);color:var(--ink);font-size:16.5px;font-weight:500;">Barbiere</div>
    </div>

    <div style="color:var(--ink-2);font-size:11px;font-weight:700;letter-spacing:.08em;margin-bottom:9px;">ICONA</div>
    <div style="display:flex;gap:9px;overflow:hidden;margin-bottom:18px;">
      ${ICONS.map((pth, i) => `<span style="width:46px;height:46px;border-radius:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${i === 0 ? '#FEE2E2' : 'var(--bg-inset)'};${i === 0 ? 'box-shadow:0 0 0 2px #4F74F3;' : ''}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${i === 0 ? '#EF4444' : 'var(--ink-2)'}" stroke-width="2" stroke-linecap="round"><g>${pth}</g></svg></span>`).join('')}
    </div>

    <div style="color:var(--ink-2);font-size:11px;font-weight:700;letter-spacing:.08em;margin-bottom:9px;">COLORE</div>
    <div style="display:flex;gap:10px;margin-bottom:22px;">
      ${['#EF4444', '#F97316', '#EAB308', '#22C55E', '#14B8A6', '#3B82F6', '#A855F7', '#EC4899'].map((c, i) =>
        `<span style="width:30px;height:30px;border-radius:999px;background:${c};${i === 0 ? 'box-shadow:0 0 0 2px var(--bg-card),0 0 0 4px #4F74F3;' : ''}"></span>`).join('')}
    </div>

    <button style="width:100%;padding:15px;border-radius:15px;border:0;background:#4F74F3;color:#fff;font-size:16px;font-weight:600;">Crea e usa</button>
   </div>
  </div>`;
  document.body.appendChild(d);
});
await shot('03-sheet');

// ── Back on the form, created and already chosen ────────────────────────
await page.evaluate(() => {
  document.getElementById('mk-sheet')?.remove();
  const plus = document.getElementById('mk-plus');
  plus.setAttribute('style', 'display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;min-height:52px;background:var(--bg-inset);box-shadow:0 0 0 2px #3B82F6;');
  plus.innerHTML = `
    <span style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:#FEE2E2;flex-shrink:0;">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/></svg>
    </span>
    <span style="font-size:13px;text-align:left;line-height:1.15;color:var(--ink);font-weight:500;">Barbiere</span>`;
  // The subcategory panel that opens under it, empty but for the way in.
  const panel = document.createElement('div');
  panel.id = 'mk-panel';
  panel.setAttribute('style', 'grid-column:span 2;border-radius:12px;padding:12px 14px;background:var(--bg-card);border:1px solid var(--line-2);box-shadow:0 1px 4px rgba(0,0,0,.05);');
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;height:24px;">
      <span style="color:var(--ink-2);font-size:11px;font-weight:600;letter-spacing:.06em;">SOTTOCATEGORIA</span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;">
      <button style="display:inline-flex;align-items:center;gap:5px;padding:6px 13px;border-radius:9px;font-size:14px;border:1px dashed var(--line);background:transparent;color:var(--ink-2);">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Aggiungi
      </button>
    </div>`;
  plus.after(panel);
});
await page.evaluate(() => {
  const sc = [...document.querySelectorAll('div')].find((d) => d.className.includes('overflow-y-auto') && d.scrollHeight > d.clientHeight + 50);
  if (sc) sc.scrollTop = sc.scrollHeight;
});
await shot('04-created');

// ── The subcategory, added where it is missing ──────────────────────────
// A chip, not a sheet: a subcategory IS a word. Tapping the dashed chip turns
// it into a field in place, and Enter makes it - the panel never leaves the
// screen and the transaction is never interrupted.
await page.evaluate(() => {
  const panel = document.getElementById('mk-panel');
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;height:24px;">
      <span style="color:var(--ink-2);font-size:11px;font-weight:600;letter-spacing:.06em;">SOTTOCATEGORIA</span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
      <span style="padding:6px 14px;border-radius:9px;font-size:14px;border:1px solid var(--line-2);background:var(--bg-card);color:var(--ink-2);">Taglio</span>
      <span style="padding:6px 14px;border-radius:9px;font-size:14px;border:1px solid var(--line-2);background:var(--bg-card);color:var(--ink-2);">Barba</span>
      <span style="display:inline-flex;align-items:center;padding:5px 12px;border-radius:9px;font-size:14px;border:1.5px solid #4F74F3;background:var(--bg-card);color:var(--ink);min-width:120px;">Piega<span style="display:inline-block;width:1.5px;height:17px;background:#4F74F3;margin-left:2px;"></span></span>
    </div>`;
});
await page.evaluate(() => {
  const sc = [...document.querySelectorAll('div')].find((d) => d.className.includes('overflow-y-auto') && d.scrollHeight > d.clientHeight + 50);
  if (sc) sc.scrollTop = sc.scrollHeight;
});
await shot('05-sub-inline');

// ── The variant worth arguing about: the + beside the label ─────────────
// It never touches the grid, so it cannot be hit while reaching for the last
// category - but it is also not where the eye is when the gap is felt.
await page.evaluate(() => {
  document.getElementById('mk-plus')?.remove();
  document.getElementById('mk-panel')?.remove();
  const label = document.querySelector('[data-category-picker] h3');
  label.parentElement.insertAdjacentHTML('beforeend',
    `<button style="display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:2px 9px;background:var(--bg-field);color:var(--accent-ink);font-size:11px;font-weight:600;">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Nuova</button>`);
});
await page.evaluate(() => {
  const sc = [...document.querySelectorAll('div')].find((d) => d.className.includes('overflow-y-auto') && d.scrollHeight > d.clientHeight + 50);
  if (sc) sc.scrollTop = sc.scrollHeight;
});
await shot('06-label-variant');

await browser.close();
console.log('done');
