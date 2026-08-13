import { open, OUT } from './drive.mjs';

const { browser, page } = await open();
await page.getByText('Or look around with sample data').click();
await page.waitForTimeout(1600);

const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/after-${name}.png` }); console.log('shot', name); };
const shotB = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/before-${name}.png` }); console.log('shot before', name); };

const HELPERS = `
window.mkText = (from, to, all) => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n, hits = 0;
  while ((n = w.nextNode())) {
    if (n.nodeValue.trim() === from) { n.nodeValue = n.nodeValue.replace(from, to); hits++; if (!all) break; }
  }
  return hits;
};`;
const SPLIT_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M21 3l-7.5 7.5"/><path d="M3 3l7.5 7.5"/><path d="M12 12v9"/></svg>`;

// ───────────────────────────────────────── TREND (before, then after)
await page.getByRole('button', { name: /^Trend$/ }).click();
await page.waitForTimeout(1400);
await shotB('trend');
await page.evaluate(HELPERS);
const trendLog = await page.evaluate(() => ({
  a: window.mkText('1,039', '589', true),
  b: window.mkText('2,341', '2,791', true),
}));
console.log('trend', JSON.stringify(trendLog));
await shot('trend');

// ───────────────────────────────────────── ACTIVITY
await page.getByRole('button', { name: /^Activity$/ }).click();
await page.waitForTimeout(1000);
await page.evaluate(HELPERS);
const actLog = await page.evaluate((svg) => {
  const log = {};
  const p = [...document.querySelectorAll('p')].find((x) => x.textContent === 'Monthly rent');
  const amt = p.closest('button').lastElementChild;
  amt.innerHTML =
    `<span style="color:#8E8E93;display:inline-flex;flex-shrink:0;">${svg}</span>` +
    `<div><p class="text-neutral-900 font-bold tabular-nums text-sm">-450<span style="font-size:.72em;font-weight:500;opacity:.6;">€</span></p>` +
    `<p class="text-neutral-500 text-[10px] tabular-nums mt-0.5 font-medium">of 900<span style="font-size:.8em;opacity:.7;">€</span></p></div>`;
  log.out = window.mkText('1,039', '589');
  log.band = window.mkText('2,244', '2,694');
  return log;
}, SPLIT_SVG);
console.log('activity', JSON.stringify(actLog));
await page.evaluate(() => {
  const sc = [...document.querySelectorAll('div')].find(
    (d) => d.className.includes('overflow-y-auto') && d.scrollHeight > d.clientHeight + 50);
  if (sc) sc.scrollTop = 340;
});
await shot('activity');

// ───────────────────────────────────────── DASHBOARD
await page.getByRole('button', { name: /^Dashboard$/ }).click();
await page.waitForTimeout(1100);
await page.evaluate(HELPERS);
const dashLog = await page.evaluate(() => {
  const log = {};
  log.spending = window.mkText('1,039', '589', true);
  log.savings = window.mkText('2,341', '2,791');
  log.rate = window.mkText('69%', '83%');
  log.housing = window.mkText('900', '450');
  log.hShare = window.mkText('87', '76');
  log.used = window.mkText('47% used', '27% used');
  log.daily = window.mkText('64', '89');
  const fill = [...document.querySelectorAll('div')].find(
    (d) => /width:\s*4[5-9](\.\d+)?%/.test(d.getAttribute('style') || ''));
  if (fill) { fill.style.width = '26.8%'; log.fill = true; }
  return log;
});
console.log('dashboard', JSON.stringify(dashLog));
await shot('dashboard');

// ───────────────────────────────────────── SETTINGS (new row)
await page.getByRole('button', { name: /^Settings$/ }).click();
await page.waitForTimeout(900);
const setLog = await page.evaluate(() => {
  const el = [...document.querySelectorAll('*')].find(
    (x) => x.children.length === 0 && x.textContent.trim() === 'Recurring');
  const row = el.closest('button') || el.closest('div[class*="flex"]');
  const clone = row.cloneNode(true);
  const txt = [...clone.querySelectorAll('*')].find((x) => x.children.length === 0 && x.textContent.trim() === 'Recurring');
  txt.textContent = 'Shared';
  const val = [...clone.querySelectorAll('*')].find((x) => x.children.length === 0 && x.textContent.trim() === '0');
  if (val) val.textContent = 'Giulia';
  const tile = clone.querySelector('div');
  if (tile) tile.className = tile.className.replace(/bg-\w+-\d+/, 'bg-violet-100');
  const svg = clone.querySelector('svg');
  if (svg) {
    svg.innerHTML = '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M21 3l-7.5 7.5"/><path d="M3 3l7.5 7.5"/><path d="M12 12v9"/>';
    svg.setAttribute('class', svg.getAttribute('class').replace(/text-\w+-\d+/, 'text-violet-600'));
  }
  row.after(clone);
  return { ok: true };
});
console.log('settings', JSON.stringify(setLog));
await shot('settings');

// ───────────────────────────────────────── SHARED SETUP (new subpage)
// Built inside a REAL Settings subpage so the header, geometry and back
// button are the app's own, not a drawing of them.
await page.getByText('Appearance').first().click();
await page.waitForTimeout(900);

const card = (inner) => `<div style="background:var(--bg-card);border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.04);">${inner}</div>`;
const rowHtml = (label, value, sub) => `
  <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line-2);">
    <div style="flex:1;min-width:0;">
      <div style="color:var(--ink);font-size:15px;font-weight:500;">${label}</div>
      ${sub ? `<div style="color:var(--ink-2);font-size:12px;margin-top:2px;">${sub}</div>` : ''}
    </div>
    <div style="color:var(--ink-2);font-size:14px;">${value}</div>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
  </div>`;
const toggleRow = (label, sub, on) => `
  <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;">
    <div style="flex:1;min-width:0;">
      <div style="color:var(--ink);font-size:15px;font-weight:500;">${label}</div>
      <div style="color:var(--ink-2);font-size:12px;margin-top:3px;line-height:1.35;">${sub}</div>
    </div>
    <div style="width:46px;height:28px;border-radius:999px;background:${on ? '#4F74F3' : 'var(--bg-track)'};position:relative;flex-shrink:0;">
      <div style="position:absolute;top:3px;${on ? 'right:3px' : 'left:3px'};width:22px;height:22px;border-radius:999px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);"></div>
    </div>
  </div>`;
const catRow = (icon, tint, fg, name, value, last) => `
  <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;${last ? '' : 'border-bottom:1px solid var(--line-2);'}">
    <div style="width:32px;height:32px;border-radius:9px;background:${tint};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${fg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
    </div>
    <div style="flex:1;color:var(--ink);font-size:15px;font-weight:500;">${name}</div>
    <div style="color:${value === 'Personal' ? 'var(--ink-2)' : '#4F74F3'};font-size:13.5px;font-weight:${value === 'Personal' ? '400' : '600'};">${value}</div>
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
  </div>`;

const ICON = {
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  cup: '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/>',
  card: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
};

await page.evaluate(({ html, title }) => {
  const h = [...document.querySelectorAll('*')].find((x) => x.children.length === 0 && x.textContent.trim() === 'Appearance');
  if (h) h.textContent = title;
  const sc = [...document.querySelectorAll('div')].find((d) => d.className.includes('overflow-y-auto'));
  sc.innerHTML = html;
}, {
  title: 'Shared',
  html: `<div style="padding:0 20px 24px;">
    ${card(rowHtml('Household', 'Home', null) + rowHtml('Members', '<span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:22px;height:22px;border-radius:999px;background:#7C5CFF;color:#fff;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;">G</span>Giulia</span>', null) + rowHtml('Default split', '50 / 50', null).replace('border-bottom:1px solid var(--line-2);', '') )}
    <div style="height:22px;"></div>
    ${card(toggleRow('Track who owes whom', 'Off — amounts are split correctly, but no balance is kept and nothing needs settling.', false))}
    <div style="height:26px;"></div>
    <div style="color:var(--ink-2);font-size:12.5px;font-weight:600;letter-spacing:.2px;padding:0 4px 8px;">ALWAYS SHARED</div>
    ${card(
      catRow(ICON.home, '#E8F0FE', '#3B82F6', 'Housing', 'Shared 50/50') +
      catRow(ICON.cart, '#E4F7EC', '#16A34A', 'Groceries', 'Shared 50/50') +
      catRow(ICON.zap, '#FEF3C7', '#D97706', 'Utilities', 'Shared 50/50') +
      catRow(ICON.cup, '#FEF9C3', '#CA8A04', 'Office Food', 'Personal') +
      catRow(ICON.card, '#F1F5F9', '#64748B', 'Joint account', 'Shared 50/50', true))}
    <div style="color:var(--ink-2);font-size:12.5px;line-height:1.5;padding:12px 4px 0;">Set once. Anything you add in these categories is split automatically — nothing to tap when you enter it.</div>
  </div>`,
});
await shot('shared-setup');

console.log('done');
await browser.close();
