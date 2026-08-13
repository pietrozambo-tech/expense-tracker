import { open, OUT } from './drive.mjs';

const { browser, page } = await open();
await page.getByText('Or look around with sample data').click();
await page.waitForTimeout(1700);
const shot = async (n, clip) => { await page.waitForTimeout(420); await page.screenshot({ path: `${OUT}/after-${n}.png`, ...(clip ? { clip } : {}) }); console.log('shot', n); };

const SPLIT = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M21 3l-7.5 7.5"/><path d="M3 3l7.5 7.5"/><path d="M12 12v9"/></svg>`;
const XM = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:.55;"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
const UNDO = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`;

const CHIP = {
  // Off, but offered: dashed outline reads as "available", not "active".
  invite: `<button style="display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 12px 5px 10px;background:transparent;border:1.5px dashed var(--line);color:var(--ink-2);font-size:12.5px;font-weight:500;line-height:1;">
    ${SPLIT}<span>Split with Giulia</span></button>`,
  on: (rule) => `<button style="display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 9px 5px 10px;background:var(--bg-inset);color:var(--ink-2);font-size:12.5px;font-weight:500;line-height:1;">
    ${SPLIT}<span>${rule} &middot; shared 50/50 &middot; yours <b style="color:var(--ink);font-weight:600;">42&euro;</b></span>${XM}</button>`,
  offOverride: `<button style="display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 11px 5px 10px;background:transparent;border:1.5px solid var(--line);color:var(--ink-2);font-size:12.5px;font-weight:500;line-height:1;">
    ${UNDO}<span>Not shared &middot; all <b style="color:var(--ink);font-weight:600;">84&euro;</b> yours</span></button>`,
};

const TILE = {
  cash: `<span aria-hidden="true" style="width:24px;height:24px;border-radius:7px;background:#16A34A;display:inline-flex;align-items:center;justify-content:center;color:#fff;">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/></svg></span>`,
  joint: `<span aria-hidden="true" style="display:inline-flex;align-items:center;">
    <span style="width:24px;height:24px;border-radius:999px;background:#0B0B0D;color:#fff;font-size:10px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;">P</span>
    <span style="width:24px;height:24px;border-radius:999px;background:#7C5CFF;color:#fff;font-size:10px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;margin-left:-8px;border:2px solid var(--bg-card);">G</span></span>`,
};

const setupAdd = async ({ desc, category, tile, chip }) => {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label')?.match(/add/i));
    b?.click();
  });
  await page.waitForTimeout(850);
  await page.locator('input[inputmode="decimal"]').fill('84');
  await page.locator('input[type="text"]').nth(1).fill(desc);
  await page.getByText(category, { exact: true }).first().click();
  await page.waitForTimeout(350);
  await page.evaluate(({ tile, chip }) => {
    const pill = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Select source');
    pill.querySelector('span[aria-hidden="true"]').outerHTML = tile;
    const amountBlock = document.querySelector('input[inputmode="decimal"]').closest('.px-6');
    const wrap = document.createElement('div');
    wrap.className = 'px-6';
    wrap.style.cssText = 'margin-top:-14px;padding-bottom:22px;';
    wrap.innerHTML = chip;
    amountBlock.after(wrap);
  }, { tile, chip });
};

// The four states, cropped to the part that carries the answer.
const CROP = { x: 0, y: 108, width: 430, height: 420 };

await setupAdd({ desc: 'Aperitivo', category: 'Food & Drinks', tile: TILE.cash, chip: CHIP.invite });
await shot('case-a', CROP);

await setupAdd({ desc: 'Esselunga', category: 'Groceries', tile: TILE.cash, chip: CHIP.on('Groceries') });
await shot('case-b', CROP);

await setupAdd({ desc: 'Aperitivo', category: 'Food & Drinks', tile: TILE.joint, chip: CHIP.on('Joint card') });
await shot('case-c', CROP);

await setupAdd({ desc: 'My protein bars', category: 'Groceries', tile: TILE.cash, chip: CHIP.offOverride });
await shot('case-d', CROP);

// Full-screen version of the one that answers the question most directly.
await setupAdd({ desc: 'Esselunga', category: 'Groceries', tile: TILE.cash, chip: CHIP.on('Groceries') });
await shot('case-b-full');

console.log('done');
await browser.close();
