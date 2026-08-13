import { open, OUT } from './drive.mjs';

const { browser, page } = await open();
await page.getByText('Or look around with sample data').click();
await page.waitForTimeout(1700);
const shot = async (n, clip) => { await page.waitForTimeout(430); await page.screenshot({ path: `${OUT}/after-${n}.png`, ...(clip ? { clip } : {}) }); console.log('shot', n); };

const AV = (l, c, size, dim) =>
  `<span style="width:${size}px;height:${size}px;border-radius:999px;background:${c};color:#fff;font-size:${Math.round(size * 0.42)}px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;${dim ? 'opacity:.30;' : ''}">${l}</span>`;

// The switcher, with an unread dot riding Giulia's half.
const SWITCH = (mineActive, dot) => `
  <button id="mk-switch" style="position:relative;display:inline-flex;align-items:center;padding:3px;border-radius:999px;background:var(--bg-track);margin-right:10px;">
    <span style="display:inline-flex;">${AV('P', '#0B0B0D', 30, !mineActive)}</span>
    <span style="display:inline-flex;margin-left:-9px;">${AV('G', '#7C5CFF', 30, mineActive)}</span>
    ${dot ? `<span style="position:absolute;top:0;right:0;width:11px;height:11px;border-radius:999px;background:#4F74F3;border:2px solid var(--bg-page);"></span>` : ''}
  </button>`;

const mountSwitch = async (html) => {
  await page.evaluate((h) => {
    document.getElementById('mk-switch')?.remove();
    const pill = [...document.querySelectorAll('*')].find((x) => x.children.length === 0 && x.textContent.trim() === 'Monthly');
    const holder = pill.closest('button') || pill.parentElement;
    const span = document.createElement('span');
    span.innerHTML = h;
    holder.parentElement.insertBefore(span.firstElementChild, holder);
    holder.parentElement.style.display = 'flex';
    holder.parentElement.style.alignItems = 'center';
  }, html);
};

// ── 1. Personal dashboard: dot + the one line that earns its place ──
await page.evaluate(() => {
  const set = (from, to, all) => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let x, hits = 0;
    while ((x = w.nextNode())) if (x.nodeValue.trim() === from) { x.nodeValue = x.nodeValue.replace(from, to); hits++; if (!all) break; }
    return hits;
  };
  set('1,039', '663', true); set('2,341', '2,717'); set('69%', '80%');
  set('900', '450'); set('87', '68'); set('47% used', '30% used'); set('64', '85');
  set('39', '113');
  const fill = [...document.querySelectorAll('div')].find((d) => /width:\s*4[5-9](\.\d+)?%/.test(d.getAttribute('style') || ''));
  if (fill) fill.style.width = '30.1%';

  // The nudge sits above the budget bar: her spending moved YOUR budget.
  const budget = [...document.querySelectorAll('*')].find((x) => x.children.length === 0 && x.textContent.trim() === 'Monthly Budget');
  const bcard = budget.closest('div[class*="rounded"]');
  const el = document.createElement('div');
  el.style.cssText = 'margin-bottom:14px;background:var(--bg-card);border-radius:14px;box-shadow:0 1px 4px rgba(0,0,0,.04);padding:13px 15px;display:flex;align-items:center;gap:11px;';
  el.innerHTML = `
    <span style="width:34px;height:34px;border-radius:999px;background:#7C5CFF;color:#fff;font-size:14px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">G</span>
    <div style="flex:1;min-width:0;">
      <div style="color:var(--ink);font-size:14px;font-weight:600;line-height:1.25;">Giulia added 3 shared expenses</div>
      <div style="color:var(--ink-2);font-size:12px;margin-top:2px;">+74&euro; in your August &middot; she owes you 273&euro; now</div>
    </div>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="m9 18 6-6-6-6"/></svg>`;
  bcard.parentElement.insertBefore(el, bcard);
});
await mountSwitch(SWITCH(true, true));
await shot('nudge-dash');
await shot('nudge-switcher', { x: 240, y: 24, width: 190, height: 66 });

// ── 2. The shared view she is nudging you toward ────────────────────
const I = {
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
};
const chev = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="m9 18 6-6-6-6"/></svg>`;
const newRow = (icon, tint, fg, name, sub, amount, last) => `
  <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;${last ? '' : 'border-bottom:1px solid var(--line-2);'}">
    <div style="position:relative;width:34px;height:34px;border-radius:10px;background:${tint};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${fg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
      <span style="position:absolute;right:-5px;bottom:-5px;width:17px;height:17px;border-radius:999px;background:#7C5CFF;color:#fff;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid var(--bg-card);">G</span>
    </div>
    <div style="flex:1;min-width:0;">
      <div style="color:var(--ink);font-size:14.5px;font-weight:500;">${name}
        <span style="display:inline-flex;vertical-align:middle;margin-left:6px;padding:2px 6px;border-radius:999px;background:#4F74F3;color:#fff;font-size:9px;font-weight:800;letter-spacing:.04em;">NEW</span></div>
      <div style="color:var(--ink-2);font-size:11.5px;margin-top:2px;">${sub}</div>
    </div>
    <div class="tabular-nums" style="color:var(--ink);font-size:15px;font-weight:700;">${amount}<span style="font-size:.72em;font-weight:500;opacity:.6;">€</span></div>
    ${chev}
  </div>`;

const SHARED = `<div style="padding:0 24px 24px;">
  <div style="border-radius:24px;padding:16px 18px 20px;background:linear-gradient(160deg,#26262F 0%,#17171D 55%,#191A22 100%);box-shadow:0 6px 22px rgba(0,0,0,.16);">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      <span style="color:#fff;font-size:17px;font-weight:700;">August 2026 <span style="opacity:.5;font-size:13px;">⌄</span></span>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
    </div>
    <div style="text-align:center;margin-bottom:16px;">
      <div style="color:rgba(255,255,255,.55);font-size:12.5px;margin-bottom:5px;">We spent together</div>
      <div class="tabular-nums" style="color:#fff;font-size:36px;font-weight:800;letter-spacing:-.02em;line-height:1;">1,478<span style="font-size:.55em;font-weight:600;opacity:.65;">€</span></div>
    </div>
    <div style="display:flex;border-top:1px solid rgba(255,255,255,.08);padding-top:14px;">
      <div style="flex:1;display:flex;align-items:center;gap:9px;justify-content:center;">
        ${AV('P', '#3C3C46', 26)}<div><div style="color:rgba(255,255,255,.5);font-size:11px;">You paid</div>
        <div class="tabular-nums" style="color:#fff;font-size:15px;font-weight:700;">1,012€</div></div>
      </div>
      <div style="width:1px;background:rgba(255,255,255,.08);"></div>
      <div style="flex:1;display:flex;align-items:center;gap:9px;justify-content:center;">
        ${AV('G', '#7C5CFF', 26)}<div><div style="color:rgba(255,255,255,.5);font-size:11px;">Giulia paid</div>
        <div class="tabular-nums" style="color:#fff;font-size:15px;font-weight:700;">466€</div></div>
      </div>
    </div>
  </div>

  <div style="margin-top:16px;background:var(--bg-card);border-radius:16px;box-shadow:0 1px 4px rgba(0,0,0,.04);overflow:hidden;">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid var(--line-2);">
      <span style="color:var(--ink);font-size:14px;font-weight:600;">New since you last looked</span>
      <span style="color:var(--ink-2);font-size:11.5px;">9 Aug &middot; 148&euro;</span>
    </div>
    ${newRow(I.cart, '#E4F7EC', '#16A34A', 'Conad', 'Giulia paid · Tue 11 Aug', '86.00')}
    ${newRow(I.zap, '#FEF3C7', '#D97706', 'Electricity', 'Giulia paid · Mon 10 Aug', '48.00')}
    ${newRow(I.cart, '#E4F7EC', '#16A34A', 'Esselunga', 'Giulia paid · Sun 9 Aug', '14.00', true)}
  </div>

  <div style="margin-top:16px;background:var(--bg-card);border-radius:16px;padding:14px 18px;box-shadow:0 1px 4px rgba(0,0,0,.04);display:flex;align-items:center;gap:12px;">
    <div style="flex:1;">
      <div style="color:var(--ink-2);font-size:12px;margin-bottom:3px;">Giulia owes you · running</div>
      <div class="tabular-nums" style="color:var(--ink);font-size:22px;font-weight:800;">273.00<span style="font-size:.6em;font-weight:600;opacity:.6;">€</span>
        <span style="color:var(--ink-2);font-size:12px;font-weight:500;margin-left:6px;">was 347</span></div>
    </div>
    <button style="padding:10px 16px;border-radius:12px;background:#4F74F3;color:#fff;font-size:14px;font-weight:600;">Settle up</button>
  </div>
</div>`;

await page.evaluate(({ html }) => {
  const h1 = document.querySelector('h1');
  if (h1) h1.textContent = 'Shared';
  const header = document.querySelector('h1').closest('div').parentElement;
  let sib = header.nextElementSibling;
  while (sib) { const nx = sib.nextElementSibling; sib.remove(); sib = nx; }
  const holder = document.createElement('div');
  holder.innerHTML = html;
  header.parentElement.appendChild(holder);
}, { html: SHARED });
await mountSwitch(SWITCH(false, false));
await shot('nudge-shared');

console.log('done');
await browser.close();
