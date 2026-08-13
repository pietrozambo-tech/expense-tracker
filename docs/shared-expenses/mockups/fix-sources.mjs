import { open, OUT } from './drive.mjs';
const { browser, page } = await open();
await page.getByText('Or look around with sample data').click();
await page.waitForTimeout(1600);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label')?.match(/add/i));
  b?.click();
});
await page.waitForTimeout(900);
await page.locator('input[inputmode="decimal"]').fill('84');
await page.locator('input[type="text"]').nth(1).fill('Esselunga');
await page.getByText('Groceries', { exact: true }).first().click();
await page.waitForTimeout(400);
await page.evaluate(() => {
  const pill = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Select source');
  const tile = pill.querySelector('span[aria-hidden="true"]');
  tile.outerHTML = `<span aria-hidden="true" style="display:inline-flex;align-items:center;">
    <span style="width:24px;height:24px;border-radius:999px;background:#0B0B0D;color:#fff;font-size:10px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;">P</span>
    <span style="width:24px;height:24px;border-radius:999px;background:#7C5CFF;color:#fff;font-size:10px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;margin-left:-8px;border:2px solid var(--bg-card);">G</span>
  </span>`;
  const amountBlock = document.querySelector('input[inputmode="decimal"]').closest('.px-6');
  const wrap = document.createElement('div');
  wrap.className = 'px-6';
  wrap.style.cssText = 'margin-top:-14px;padding-bottom:22px;';
  wrap.innerHTML = `<button style="display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 11px 5px 9px;background:var(--bg-inset);color:var(--ink-2);font-size:12.5px;font-weight:500;line-height:1;">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M21 3l-7.5 7.5"/><path d="M3 3l7.5 7.5"/><path d="M12 12v9"/></svg>
    <span>Joint card &middot; shared 50/50 &middot; yours <b style="color:var(--ink);font-weight:600;">42€</b></span>
  </button>`;
  amountBlock.after(wrap);
  pill.click();
});
await page.waitForTimeout(800);
const r = await page.evaluate(() => {
  const label = [...document.querySelectorAll('*')].find((x) => x.children.length === 0 && x.textContent.trim() === 'Revolut');
  if (!label) return 'no row';
  const row = label.closest('button');
  const clone = row.cloneNode(true);
  const nameEl = [...clone.querySelectorAll('*')].find((x) => x.children.length === 0 && x.textContent.trim() === 'Revolut');
  nameEl.textContent = 'Joint card';
  const sub = document.createElement('div');
  sub.style.cssText = 'color:var(--ink-2);font-size:11px;margin-top:2px;';
  sub.textContent = 'Splits 50/50 with Giulia';
  nameEl.after(sub);
  const tile = clone.querySelector('span[aria-hidden="true"]');
  if (tile) tile.outerHTML = `<span aria-hidden="true" style="display:inline-flex;align-items:center;">
    <span style="width:28px;height:28px;border-radius:999px;background:#0B0B0D;color:#fff;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;">P</span>
    <span style="width:28px;height:28px;border-radius:999px;background:#7C5CFF;color:#fff;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;margin-left:-9px;border:2px solid var(--bg-card);">G</span>
  </span>`;
  // The check belongs to the joint card only: strip it from the Revolut original.
  const check = row.querySelector('svg')?.closest('div,span');
  const blue = [...row.querySelectorAll('*')].find((x) => (x.getAttribute('class') || '').match(/bg-blue|text-blue/) && x.querySelector('svg'));
  (blue || check)?.remove();
  row.parentElement.insertBefore(clone, row);
  return 'ok';
});
console.log(r);
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/after-add-sources.png` });
console.log('shot add-sources');
await browser.close();
