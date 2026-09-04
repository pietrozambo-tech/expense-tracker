// The subcategory chip, in the three states it passes through.
//
// Cropped to the panel rather than the whole phone: the question this answers
// is "what does tapping it actually do", and three full screenshots of an
// unchanged form would bury the one thing that changes.
import pw from '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'shots');
const APP = 'http://127.0.0.1:5199/';
const CATS = JSON.parse(readFileSync(join(here, 'cats-it.json'), 'utf8'));

const browser = await pw.chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-proxy-server'],
});
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, locale: 'it-IT' });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.evaluate((cats) => {
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
await page.getByText('Provali con dati di esempio', { exact: false }).first().click().catch(() => {});
await page.waitForTimeout(1800);
await page.getByRole('button', { name: 'Aggiungi movimento' }).first().click();
await page.waitForTimeout(700);

// One panel, redrawn three times, shot on its own each time.
const CHIP = 'padding:7px 15px;border-radius:9px;font-size:14.5px;border:1px solid var(--line-2);background:var(--bg-card);color:var(--ink-2);';
const panel = (inner, caption) => `
  <div style="width:390px;padding:20px;background:var(--bg-app,#FAFAF8);">
    <div style="font-family:ui-monospace,monospace;font-size:10.5px;letter-spacing:.13em;color:var(--ink-3);margin-bottom:11px;">${caption}</div>
    <div style="border-radius:12px;padding:13px 15px;background:var(--bg-card);border:1px solid var(--line-2);box-shadow:0 1px 4px rgba(0,0,0,.05);">
      <div style="color:var(--ink-2);font-size:11px;font-weight:600;letter-spacing:.06em;margin-bottom:10px;">SOTTOCATEGORIA</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">${inner}</div>
    </div>
  </div>`;

const states = [
  ['01', 'A RIPOSO', `
    <span style="${CHIP}">Taglio</span>
    <span style="${CHIP}">Barba</span>
    <span style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:9px;font-size:14.5px;border:1px dashed var(--line);background:transparent;color:var(--ink-2);">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Aggiungi</span>`],
  ['02', 'TOCCATA: DIVENTA UN CAMPO, QUI', `
    <span style="${CHIP}">Taglio</span>
    <span style="${CHIP}">Barba</span>
    <span style="display:inline-flex;align-items:center;gap:8px;padding:5px 5px 5px 14px;border-radius:9px;font-size:14.5px;border:1.5px solid #4F74F3;background:var(--bg-card);color:var(--ink);">
      <span>Piega<span style="display:inline-block;width:1.5px;height:17px;background:#4F74F3;margin-left:2px;vertical-align:-3px;"></span></span>
      <span style="width:26px;height:26px;border-radius:7px;background:#4F74F3;display:inline-flex;align-items:center;justify-content:center;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
      </span></span>`],
  ['03', 'CONFERMATA: CREATA E GIÀ SCELTA', `
    <span style="${CHIP}">Taglio</span>
    <span style="${CHIP}">Barba</span>
    <span style="padding:7px 15px;border-radius:9px;font-size:14.5px;border:1px solid #BFDBFE;background:#EFF6FF;color:#2563EB;font-weight:500;">Piega</span>
    <span style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:9px;font-size:14.5px;border:1px dashed var(--line);background:transparent;color:var(--ink-2);">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Aggiungi</span>`],
];

for (const [n, caption, inner] of states) {
  await page.evaluate((html) => {
    document.getElementById('mk-strip')?.remove();
    const d = document.createElement('div');
    d.id = 'mk-strip';
    d.setAttribute('style', 'position:fixed;left:0;top:0;z-index:200;');
    d.innerHTML = html;
    document.body.appendChild(d);
  }, panel(inner, caption));
  await page.waitForTimeout(320);
  await page.locator('#mk-strip > div').screenshot({ path: `${OUT}/sub-${n}.png` });
  console.log('shot', `sub-${n}`);
}

await browser.close();
console.log('done');
