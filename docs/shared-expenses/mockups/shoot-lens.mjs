import { open, OUT } from './drive.mjs';

const { browser, page } = await open();
await page.getByText('Or look around with sample data').click();
await page.waitForTimeout(1700);
const shot = async (n, clip) => { await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/after-${n}.png`, ...(clip ? { clip } : {}) }); console.log('shot', n); };

const AV = (l, c, size, dim) =>
  `<span style="width:${size}px;height:${size}px;border-radius:999px;background:${c};color:#fff;font-size:${Math.round(size * 0.42)}px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;${dim ? 'opacity:.30;' : ''}">${l}</span>`;

// Option B: both faces in one pill, the active one lit.
const SWITCH_B = (mineActive) => `
  <button id="mk-switch" style="display:inline-flex;align-items:center;padding:3px;border-radius:999px;background:var(--bg-track);margin-right:10px;">
    <span style="display:inline-flex;">${AV('P', '#0B0B0D', 30, !mineActive)}</span>
    <span style="display:inline-flex;margin-left:-9px;">${AV('G', '#7C5CFF', 30, mineActive)}</span>
  </button>`;

const mountSwitch = async (html) => {
  await page.evaluate((h) => {
    document.getElementById('mk-switch')?.remove();
    const pill = [...document.querySelectorAll('*')].find((x) => x.children.length === 0 && x.textContent.trim() === 'Monthly' || x.children.length === 0 && x.textContent.trim() === 'Since 28 Jul');
    const holder = pill.closest('button') || pill.parentElement;
    const span = document.createElement('span');
    span.innerHTML = h;
    holder.parentElement.insertBefore(span.firstElementChild, holder);
    holder.parentElement.style.display = 'flex';
    holder.parentElement.style.alignItems = 'center';
  }, html);
};

// ── 1. Personal dashboard, option B switcher, split numbers ────────
await page.evaluate(() => {
  const set = (from, to, all) => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let x, hits = 0;
    while ((x = w.nextNode())) if (x.nodeValue.trim() === from) { x.nodeValue = x.nodeValue.replace(from, to); hits++; if (!all) break; }
    return hits;
  };
  set('1,039', '589', true); set('2,341', '2,791'); set('69%', '83%');
  set('900', '450'); set('87', '76'); set('47% used', '27% used'); set('64', '89');
  const fill = [...document.querySelectorAll('div')].find((d) => /width:\s*4[5-9](\.\d+)?%/.test(d.getAttribute('style') || ''));
  if (fill) fill.style.width = '26.8%';
});
await mountSwitch(SWITCH_B(true));
await shot('dash-toggle');

// ── 2. Shared view, option B switcher, tappable category rows ──────
const I = {
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
};
const chev = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="m9 18 6-6-6-6"/></svg>`;

const catRow = (icon, tint, fg, name, pct, amount, last) => `
  <div style="display:flex;align-items:center;gap:12px;padding:12px 4px;${last ? '' : 'border-bottom:1px solid var(--line-2);'}">
    <div style="width:34px;height:34px;border-radius:10px;background:${tint};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${fg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
    </div>
    <div style="flex:1;min-width:0;">
      <div style="color:var(--ink);font-size:14.5px;font-weight:500;">${name}</div>
      <div style="height:4px;border-radius:99px;background:var(--bg-track);margin-top:6px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:${fg};opacity:.55;"></div></div>
    </div>
    <div class="tabular-nums" style="color:var(--ink);font-size:15px;font-weight:700;">${amount}<span style="font-size:.72em;font-weight:500;opacity:.6;">€</span></div>
    ${chev}
  </div>`;

const SHARED_VIEW = `
<div style="padding:0 24px 24px;">
  <div style="border-radius:20px;padding:20px 22px 18px;background:linear-gradient(145deg,#26262F 0%,#1A1A21 55%,#191A22 100%);box-shadow:0 6px 22px rgba(0,0,0,.16);">
    <div style="color:rgba(255,255,255,.62);font-size:13px;margin-bottom:5px;">Giulia owes you</div>
    <div class="tabular-nums" style="color:#fff;font-size:38px;font-weight:800;letter-spacing:-.02em;line-height:1;">347.00<span style="font-size:.5em;font-weight:600;opacity:.65;margin-left:2px;">€</span></div>
    <div style="color:rgba(255,255,255,.42);font-size:11.5px;margin-top:7px;">Running since you settled on 28 July</div>
    <div style="display:flex;gap:10px;margin-top:16px;">
      <button style="flex:1;padding:11px;border-radius:12px;background:#4F74F3;color:#fff;font-size:14.5px;font-weight:600;">Settle up</button>
      <button style="padding:11px 16px;border-radius:12px;background:rgba(255,255,255,.10);color:#fff;font-size:14.5px;font-weight:600;">All items</button>
    </div>
  </div>

  <div style="margin-top:16px;background:var(--bg-card);border-radius:16px;padding:16px 18px;box-shadow:0 1px 4px rgba(0,0,0,.04);">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:11px;">
      <span style="color:var(--ink);font-size:14.5px;font-weight:600;">Who has been paying</span>
      <span style="color:var(--ink-2);font-size:11.5px;">14 items</span>
    </div>
    <div style="display:flex;height:9px;border-radius:99px;overflow:hidden;background:var(--bg-track);">
      <div style="width:76%;background:#4F74F3;"></div><div style="width:24%;background:#7C5CFF;"></div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:9px;">
      <span style="color:var(--ink-2);font-size:12px;"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#4F74F3;margin-right:6px;"></span>You 1,012€</span>
      <span style="color:var(--ink-2);font-size:12px;"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#7C5CFF;margin-right:6px;"></span>Giulia 318€</span>
    </div>
  </div>

  <div style="margin-top:16px;background:var(--bg-card);border-radius:16px;padding:16px 18px 8px;box-shadow:0 1px 4px rgba(0,0,0,.04);">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
      <span style="color:var(--ink);font-size:17px;font-weight:700;">What we spend</span>
      <span style="color:var(--ink-2);font-size:12px;">1,330€ together</span>
    </div>
    <div style="color:var(--ink-2);font-size:11.5px;margin-bottom:6px;">Household totals — the full amounts, not your half</div>
    ${catRow(I.home, '#E8F0FE', '#3B82F6', 'Housing', 100, '900')}
    ${catRow(I.cart, '#E4F7EC', '#16A34A', 'Groceries', 29, '260')}
    ${catRow(I.zap, '#FEF3C7', '#D97706', 'Utilities', 15, '135')}
    ${catRow(I.utensils, '#FFF1E6', '#EA580C', 'Food &amp; Drinks', 4, '35', true)}
  </div>
</div>`;

await page.evaluate(({ html }) => {
  const h1 = document.querySelector('h1');
  if (h1) h1.textContent = 'Shared';
  const pill = [...document.querySelectorAll('*')].find((x) => x.children.length === 0 && x.textContent.trim() === 'Monthly');
  if (pill) pill.textContent = 'Since 28 Jul';
  const header = document.querySelector('h1').closest('div').parentElement;
  let sib = header.nextElementSibling;
  while (sib) { const nx = sib.nextElementSibling; sib.remove(); sib = nx; }
  const holder = document.createElement('div');
  holder.innerHTML = html;
  header.parentElement.appendChild(holder);
}, { html: SHARED_VIEW });
await mountSwitch(SWITCH_B(false));
await shot('dash-shared');

// ── 3. Category drill-down: Groceries, full amounts, payer badges ──
const dRow = (payer, pc, name, sub, amount, last) => `
  <div style="display:flex;align-items:center;gap:12px;padding:12px 0;${last ? '' : 'border-bottom:1px solid var(--line-2);'}">
    <div style="position:relative;width:34px;height:34px;border-radius:10px;background:#E4F7EC;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I.cart}</svg>
      <span style="position:absolute;right:-5px;bottom:-5px;width:17px;height:17px;border-radius:999px;background:${pc};color:#fff;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid var(--bg-card);">${payer}</span>
    </div>
    <div style="flex:1;min-width:0;">
      <div style="color:var(--ink);font-size:14.5px;font-weight:500;">${name}</div>
      <div style="color:var(--ink-2);font-size:11.5px;margin-top:2px;">${sub}</div>
    </div>
    <div class="tabular-nums" style="color:var(--ink);font-size:15px;font-weight:700;">${amount}<span style="font-size:.72em;font-weight:500;opacity:.6;">€</span></div>
    ${chev}
  </div>`;

await page.evaluate((html) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  document.body.appendChild(d);
}, `
<div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:70;display:flex;align-items:flex-end;justify-content:center;">
 <div style="width:100%;max-width:430px;background:var(--bg-card);border-radius:22px 22px 0 0;padding:20px 22px 28px;">
  <div style="width:38px;height:4px;border-radius:99px;background:var(--bg-track);margin:0 auto 18px;"></div>
  <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:2px;">
    <span style="color:var(--ink);font-size:18px;font-weight:700;">Groceries</span>
    <span class="tabular-nums" style="color:var(--ink);font-size:18px;font-weight:800;">260.00<span style="font-size:.62em;font-weight:600;opacity:.6;">€</span></span>
  </div>
  <div style="display:flex;justify-content:space-between;margin-bottom:14px;">
    <span style="color:var(--ink-2);font-size:12px;">What we spend · since 28 Jul</span>
    <span style="color:var(--ink-2);font-size:12px;">costs you 130.00€</span>
  </div>

  ${dRow('G', '#7C5CFF', 'Esselunga', 'Giulia · Sat 1 Aug', '60.00')}
  ${dRow('P', '#0B0B0D', 'Esselunga', 'You · Sun 9 Aug', '70.00')}
  ${dRow('G', '#7C5CFF', 'Conad', 'Giulia · Tue 11 Aug', '130.00', true)}

  <div style="display:flex;height:8px;border-radius:99px;overflow:hidden;background:var(--bg-track);margin-top:16px;">
    <div style="width:27%;background:#4F74F3;"></div><div style="width:73%;background:#7C5CFF;"></div>
  </div>
  <div style="display:flex;justify-content:space-between;margin-top:8px;">
    <span style="color:var(--ink-2);font-size:12px;"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#4F74F3;margin-right:6px;"></span>You paid 70€</span>
    <span style="color:var(--ink-2);font-size:12px;"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#7C5CFF;margin-right:6px;"></span>Giulia paid 190€</span>
  </div>
  <div style="color:var(--ink-2);font-size:11.5px;text-align:center;margin-top:14px;line-height:1.5;">Full amounts — this is the household&rsquo;s money. Tap a row for the split; hers are read-only.</div>
 </div>
</div>`);
await shot('drilldown');

console.log('done');
await browser.close();
