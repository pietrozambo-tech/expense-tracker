import { open, OUT } from './drive.mjs';

const { browser, page } = await open();
await page.getByText('Or look around with sample data').click();
await page.waitForTimeout(1700);
const shot = async (n, clip) => { await page.waitForTimeout(430); await page.screenshot({ path: `${OUT}/after-${n}.png`, ...(clip ? { clip } : {}) }); console.log('shot', n); };

const I = {
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  back: '<path d="m9 14 4-4 4 4"/><path d="M3 12a9 9 0 1 0 9-9"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
};

// ── 1. Her edit landing in your Activity ───────────────────────────
await page.getByRole('button', { name: /^Activity$/ }).click();
await page.waitForTimeout(1000);
await page.evaluate(() => {
  const p = [...document.querySelectorAll('p')].find((x) => x.textContent === 'Weekly groceries');
  const row = p.closest('button');
  const ps = row.querySelectorAll('p');
  ps[0].innerHTML = `Esselunga <span style="display:inline-flex;align-items:center;gap:3px;vertical-align:middle;margin-left:6px;padding:2px 7px;border-radius:999px;background:var(--bg-inset);color:var(--ink-2);font-size:9.5px;font-weight:700;letter-spacing:.04em;">UPDATED</span>`;
  ps[1].innerHTML = 'Groceries &middot; Supermarket';
  const tile = row.firstElementChild;
  tile.style.position = 'relative';
  tile.insertAdjacentHTML('beforeend',
    `<span style="position:absolute;right:-4px;bottom:-4px;width:16px;height:16px;border-radius:999px;background:#7C5CFF;color:#fff;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid var(--bg-card);">G</span>`);
  row.lastElementChild.innerHTML =
    `<div><p class="text-neutral-900 font-bold tabular-nums text-sm">-37<span style="font-size:.8em;">.50</span><span style="font-size:.72em;font-weight:500;opacity:.6;">€</span></p>
     <p class="text-neutral-500 text-[10px] tabular-nums mt-0.5 font-medium">Giulia paid 75<span style="font-size:.8em;opacity:.7;">€</span></p></div>`;
});
await page.evaluate(() => {
  const sc = [...document.querySelectorAll('div')].find((d) => d.className.includes('overflow-y-auto') && d.scrollHeight > d.clientHeight + 50);
  if (sc) sc.scrollTop = 340;
});
await shot('prop-activity');

// ── 2. Tapping it: what changed, and what it did to the balance ────
await page.evaluate(() => {
  const d = document.createElement('div');
  d.id = 'mk-sheet';
  d.innerHTML = `
  <div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:70;display:flex;align-items:flex-end;justify-content:center;">
   <div style="width:100%;max-width:430px;background:var(--bg-card);border-radius:22px 22px 0 0;padding:22px 22px 30px;">
    <div style="width:38px;height:4px;border-radius:99px;background:var(--bg-track);margin:0 auto 20px;"></div>
    <div style="display:flex;align-items:center;gap:11px;margin-bottom:18px;">
      <span style="width:38px;height:38px;border-radius:999px;background:#7C5CFF;color:#fff;font-size:15px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;">G</span>
      <div><div style="color:var(--ink);font-size:16.5px;font-weight:700;line-height:1.2;">Esselunga</div>
      <div style="color:var(--ink-2);font-size:12.5px;margin-top:2px;">Giulia&rsquo;s entry &middot; edited 2 hours ago</div></div>
    </div>

    <div style="background:var(--bg-inset);border-radius:14px;padding:14px 16px;margin-bottom:16px;">
      <div style="color:var(--ink-2);font-size:11.5px;font-weight:700;letter-spacing:.1em;margin-bottom:10px;">WHAT SHE CHANGED</div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="color:var(--ink-2);font-size:14px;">She paid</span>
        <span class="tabular-nums" style="font-size:14px;"><s style="color:var(--ink-2);">60.00€</s>
          <span style="color:var(--ink-2);margin:0 6px;">&rarr;</span>
          <b style="color:var(--ink);font-weight:700;">75.00€</b></span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:9px;">
        <span style="color:var(--ink-2);font-size:14px;">Your share</span>
        <span class="tabular-nums" style="font-size:14px;"><s style="color:var(--ink-2);">30.00€</s>
          <span style="color:var(--ink-2);margin:0 6px;">&rarr;</span>
          <b style="color:var(--ink);font-weight:700;">37.50€</b></span>
      </div>
    </div>

    <div style="background:var(--bg-inset);border-radius:14px;padding:14px 16px;margin-bottom:18px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:7px;">
        <span style="color:var(--ink-2);font-size:13.5px;">Your Groceries, August</span>
        <span class="tabular-nums" style="color:var(--ink);font-size:13.5px;font-weight:600;">+7.50€</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:var(--ink-2);font-size:13.5px;">Giulia owes you</span>
        <span class="tabular-nums" style="color:#4F74F3;font-size:13.5px;font-weight:700;">−7.50€ → 339.50€</span>
      </div>
    </div>

    <div style="display:flex;align-items:flex-start;gap:9px;padding:0 2px;">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <div style="color:var(--ink-2);font-size:12px;line-height:1.5;">Her edit arrived on its own — nothing to accept. The badge clears once you have seen it.</div>
    </div>
   </div>
  </div>`;
  document.body.appendChild(d);
});
await shot('prop-detail');
await page.evaluate(() => document.getElementById('mk-sheet')?.remove());

// ── 3. All items: corrections and removals as their own lines ──────
const item = (icon, tint, fg, name, sub, delta, positive, last, strike) => `
  <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;${last ? '' : 'border-bottom:1px solid var(--line-2);'}">
    <div style="width:34px;height:34px;border-radius:10px;background:${tint};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${fg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
    </div>
    <div style="flex:1;min-width:0;">
      <div style="color:var(--ink);font-size:14.5px;font-weight:500;line-height:1.25;${strike ? 'text-decoration:line-through;opacity:.65;' : ''}">${name}</div>
      <div style="color:var(--ink-2);font-size:11.5px;margin-top:2px;">${sub}</div>
    </div>
    <div class="tabular-nums" style="color:${positive ? '#4F74F3' : 'var(--ink-2)'};font-size:14.5px;font-weight:700;white-space:nowrap;">${delta}</div>
  </div>`;
const monthLabel = (m, sum) => `
  <div style="display:flex;justify-content:space-between;align-items:baseline;padding:20px 4px 8px;">
    <span style="color:var(--ink-2);font-size:11.5px;font-weight:700;letter-spacing:.13em;">${m}</span>
    <span class="tabular-nums" style="color:var(--ink-2);font-size:11.5px;">${sum}</span>
  </div>`;
const card = (i) => `<div style="background:var(--bg-card);border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.04);">${i}</div>`;

const ALLITEMS = `<div style="padding:0 20px 28px;">
  <div style="background:var(--bg-card);border-radius:16px;padding:14px 18px;box-shadow:0 1px 4px rgba(0,0,0,.04);display:flex;align-items:center;gap:12px;">
    <div style="flex:1;">
      <div style="color:var(--ink-2);font-size:11.5px;">Giulia owes you</div>
      <div class="tabular-nums" style="color:var(--ink);font-size:20px;font-weight:800;">274.50<span style="font-size:.6em;font-weight:600;opacity:.6;">€</span></div>
    </div>
    <button style="padding:9px 15px;border-radius:11px;background:#4F74F3;color:#fff;font-size:13.5px;font-weight:600;">Settle up</button>
  </div>

  ${monthLabel('AUGUST', '+344.50 to the balance')}
  ${card(
    item(I.pencil, '#F1F5F9', '#64748B', 'Adjustment · Conad (July)', 'Giulia corrected 130.00€ → 145.00€', '−7.50', false) +
    item(I.trash, '#F1F5F9', '#64748B', 'Removed · Aperitivo (July)', 'Giulia deleted it after you settled', '+17.50', true) +
    item(I.cart, '#E4F7EC', '#16A34A', 'Esselunga', 'Giulia paid 75.00€ · half yours', '−37.50', false) +
    item(I.home, '#E8F0FE', '#3B82F6', 'Monthly rent', 'You paid 900.00€ · half yours', '+450.00', true) +
    item(I.zap, '#FEF3C7', '#D97706', 'Electricity', 'Giulia paid 90.00€ · half yours', '−45.00', false, true))}

  ${monthLabel('JULY', 'settled · −200.00')}
  ${card(
    item(I.back, '#F1F5F9', '#64748B', 'Settled up', 'Received to Revolut · 28 Jul — closed', '−200.00', false) +
    item(I.cart, '#E4F7EC', '#16A34A', 'Conad', 'Giulia paid 130.00€ · corrected since', '−65.00', false) +
    item(I.cart, '#FFF1E6', '#EA580C', 'Aperitivo', 'Removed by Giulia', '+35.00', true, true, true))}

  <div style="color:var(--ink-2);font-size:12px;line-height:1.55;padding:18px 4px 0;">
    A settlement closes what came before it. Later corrections to a closed item post an <b style="color:var(--ink);">adjustment</b> into the running balance instead of rewriting the settled figure — so the 200&nbsp;&euro; she already sent stays true.
  </div>
</div>`;

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1300);
await page.getByRole('button', { name: /^Settings$/ }).click();
await page.waitForTimeout(800);
await page.getByText('Appearance').first().click();
await page.waitForTimeout(900);
await page.evaluate(({ html }) => {
  const h = [...document.querySelectorAll('*')].find((x) => x.children.length === 0 && x.textContent.trim() === 'Appearance');
  if (h) h.textContent = 'All items';
  const root = [...document.querySelectorAll('div')].find((d) => (d.getAttribute('style') || '').includes('margin-bottom: -128px'));
  while (root.children.length > 1) root.lastElementChild.remove();
  const holder = document.createElement('div');
  holder.innerHTML = html;
  root.appendChild(holder);
}, { html: ALLITEMS });
await shot('prop-allitems');

console.log('done');
await browser.close();
