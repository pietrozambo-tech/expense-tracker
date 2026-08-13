import { open, OUT } from './drive.mjs';

const { browser, page } = await open();
await page.getByText('Or look around with sample data').click();
await page.waitForTimeout(1700);
const shot = async (n, clip) => { await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/after-${n}.png`, ...(clip ? { clip } : {}) }); console.log('shot', n); };

const AV = (l, c, size, dim) =>
  `<span style="width:${size}px;height:${size}px;border-radius:999px;background:${c};color:#fff;font-size:${Math.round(size * 0.42)}px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;${dim ? 'opacity:.30;' : ''}">${l}</span>`;
const SWITCH_B = (mineActive) => `
  <button id="mk-switch" style="display:inline-flex;align-items:center;padding:3px;border-radius:999px;background:var(--bg-track);margin-right:10px;">
    <span style="display:inline-flex;">${AV('P', '#0B0B0D', 30, !mineActive)}</span>
    <span style="display:inline-flex;margin-left:-9px;">${AV('G', '#7C5CFF', 30, mineActive)}</span>
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

const I = {
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
  back: '<path d="m9 14 4-4 4 4"/><path d="M3 12a9 9 0 1 0 9-9"/>',
};
const chev = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="m9 18 6-6-6-6"/></svg>`;
const navChev = (d) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${d === 'l' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'}"/></svg>`;

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

// ── 1. Shared view with the month hero ─────────────────────────────
const SHARED_MONTHLY = `
<div style="padding:0 24px 24px;">
  <div style="border-radius:24px;padding:16px 18px 20px;background:linear-gradient(160deg,#26262F 0%,#17171D 55%,#191A22 100%);box-shadow:0 6px 22px rgba(0,0,0,.16);">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      ${navChev('l')}
      <span style="color:#fff;font-size:17px;font-weight:700;">August 2026 <span style="opacity:.5;font-size:13px;">⌄</span></span>
      ${navChev('r')}
    </div>
    <div style="text-align:center;margin-bottom:16px;">
      <div style="color:rgba(255,255,255,.55);font-size:12.5px;margin-bottom:5px;">We spent together</div>
      <div class="tabular-nums" style="color:#fff;font-size:36px;font-weight:800;letter-spacing:-.02em;line-height:1;">1,330<span style="font-size:.55em;font-weight:600;opacity:.65;">€</span></div>
    </div>
    <div style="display:flex;border-top:1px solid rgba(255,255,255,.08);padding-top:14px;">
      <div style="flex:1;display:flex;align-items:center;gap:9px;justify-content:center;">
        ${AV('P', '#3C3C46', 26)}
        <div><div style="color:rgba(255,255,255,.5);font-size:11px;">You paid</div>
        <div class="tabular-nums" style="color:#fff;font-size:15px;font-weight:700;">1,012€</div></div>
      </div>
      <div style="width:1px;background:rgba(255,255,255,.08);"></div>
      <div style="flex:1;display:flex;align-items:center;gap:9px;justify-content:center;">
        ${AV('G', '#7C5CFF', 26)}
        <div><div style="color:rgba(255,255,255,.5);font-size:11px;">Giulia paid</div>
        <div class="tabular-nums" style="color:#fff;font-size:15px;font-weight:700;">318€</div></div>
      </div>
    </div>
  </div>

  <div style="margin-top:16px;background:var(--bg-card);border-radius:16px;padding:15px 18px;box-shadow:0 1px 4px rgba(0,0,0,.04);">
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="flex:1;">
        <div style="color:var(--ink-2);font-size:12px;margin-bottom:3px;">Giulia owes you · running</div>
        <div class="tabular-nums" style="color:var(--ink);font-size:22px;font-weight:800;">347.00<span style="font-size:.6em;font-weight:600;opacity:.6;">€</span></div>
      </div>
      <button style="padding:10px 16px;border-radius:12px;background:#4F74F3;color:#fff;font-size:14px;font-weight:600;">Settle up</button>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding-top:10px;border-top:1px solid var(--line-2);">
      <span style="color:var(--ink-2);font-size:12px;">Since you settled on 28 July — months don&rsquo;t reset it</span>
      <span style="color:#4F74F3;font-size:13px;font-weight:600;white-space:nowrap;">All items ›</span>
    </div>
  </div>

  <div style="margin-top:16px;background:var(--bg-card);border-radius:16px;padding:16px 18px 8px;box-shadow:0 1px 4px rgba(0,0,0,.04);">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
      <span style="color:var(--ink);font-size:17px;font-weight:700;">What we spend</span>
      <span style="color:var(--ink-2);font-size:12px;">August</span>
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
  const header = document.querySelector('h1').closest('div').parentElement;
  let sib = header.nextElementSibling;
  while (sib) { const nx = sib.nextElementSibling; sib.remove(); sib = nx; }
  const holder = document.createElement('div');
  holder.innerHTML = html;
  header.parentElement.appendChild(holder);
}, { html: SHARED_MONTHLY });
await mountSwitch(SWITCH_B(false));
await shot('shared-monthly');

// ── 2. Drill-down, August-scoped, over the new view ────────────────
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
  d.id = 'mk-sheet';
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
    <span style="color:var(--ink-2);font-size:12px;">What we spend · August</span>
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
await page.evaluate(() => document.getElementById('mk-sheet')?.remove());

// ── 3. "All items" — the ledger, clearly off the Dashboard ─────────
const item = (icon, tint, fg, name, sub, delta, positive, last) => `
  <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;${last ? '' : 'border-bottom:1px solid var(--line-2);'}">
    <div style="width:34px;height:34px;border-radius:10px;background:${tint};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${fg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
    </div>
    <div style="flex:1;min-width:0;">
      <div style="color:var(--ink);font-size:14.5px;font-weight:500;line-height:1.25;">${name}</div>
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
      <div class="tabular-nums" style="color:var(--ink);font-size:20px;font-weight:800;">347.00<span style="font-size:.6em;font-weight:600;opacity:.6;">€</span></div>
    </div>
    <button style="padding:9px 15px;border-radius:11px;background:#4F74F3;color:#fff;font-size:13.5px;font-weight:600;">Settle up</button>
  </div>

  <div style="color:var(--ink-2);font-size:11.5px;line-height:1.5;padding:14px 4px 0;">
    <b style="color:#4F74F3;">Blue</b> raises what she owes you · <b style="color:var(--ink);">Grey</b> brings it back down
  </div>

  ${monthLabel('AUGUST', '+417.50 to the balance')}
  ${card(
    item(I.cart, '#E4F7EC', '#16A34A', 'Conad', 'Giulia paid 130.00€ · half yours', '−65.00', false) +
    item(I.cart, '#E4F7EC', '#16A34A', 'Esselunga', 'You paid 70.00€ · half yours', '+35.00', true) +
    item(I.home, '#E8F0FE', '#3B82F6', 'Monthly rent', 'You paid 900.00€ · half yours', '+450.00', true) +
    item(I.zap, '#FEF3C7', '#D97706', 'Electricity', 'Giulia paid 90.00€ · half yours', '−45.00', false) +
    item(I.cart, '#E4F7EC', '#16A34A', 'Esselunga', 'Giulia paid 60.00€ · half yours', '−30.00', false) +
    item(I.wifi, '#EDE9FE', '#7C3AED', 'Internet', 'Giulia paid 45.00€ · half yours', '−22.50', false, true))}

  ${monthLabel('JULY', 'settled &middot; −200.00')}
  ${card(
    item(I.back, '#F1F5F9', '#64748B', 'Settled up', 'Received to Revolut · 28 Jul', '−200.00', false) +
    item(I.home, '#E8F0FE', '#3B82F6', 'Monthly rent', 'You paid 900.00€ · half yours', '+450.00', true, true))}

  <div style="color:var(--ink-2);font-size:12px;line-height:1.55;padding:18px 4px 0;">
    Opened from the balance card on the shared Dashboard. Months are groups here, not filters — the balance runs through them until you settle.
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
await shot('allitems');
await page.evaluate(() => {
  const sc = [...document.querySelectorAll('div')].find((d) => d.className.includes('overflow-y-auto') && d.scrollHeight > d.clientHeight + 40);
  if (sc) sc.scrollTop = 420;
});
await shot('allitems-scrolled');

// ── 4. Add screen with the joint card as the source ────────────────
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1300);
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
  // Swap the source tile for the joint card's paired badge.
  const pill = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Select source');
  const tile = pill.querySelector('span[aria-hidden="true"]');
  tile.outerHTML = `<span aria-hidden="true" style="display:inline-flex;align-items:center;">
    <span style="width:24px;height:24px;border-radius:999px;background:#0B0B0D;color:#fff;font-size:10px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;">P</span>
    <span style="width:24px;height:24px;border-radius:999px;background:#7C5CFF;color:#fff;font-size:10px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;margin-left:-8px;border:2px solid var(--bg-card);">G</span>
  </span>`;
  // The chip states what the source decided.
  const amountBlock = document.querySelector('input[inputmode="decimal"]').closest('.px-6');
  const wrap = document.createElement('div');
  wrap.className = 'px-6';
  wrap.style.cssText = 'margin-top:-14px;padding-bottom:22px;';
  wrap.innerHTML = `<button style="display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 11px 5px 9px;background:var(--bg-inset);color:var(--ink-2);font-size:12.5px;font-weight:500;line-height:1;">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M21 3l-7.5 7.5"/><path d="M3 3l7.5 7.5"/><path d="M12 12v9"/></svg>
    <span>Joint card &middot; shared 50/50 &middot; yours <b style="color:var(--ink);font-weight:600;">42€</b></span>
  </button>`;
  amountBlock.after(wrap);
});
await shot('add-joint');

// ── 5. The real source picker, with the joint card in the list ─────
await page.evaluate(() => {
  const pill = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Select source');
  pill.click();
});
await page.waitForTimeout(800);
const injected = await page.evaluate(() => {
  const label = [...document.querySelectorAll('*')].find(
    (x) => x.children.length === 0 && x.textContent.trim() === 'Revolut');
  if (!label) return 'no Revolut row';
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
  row.parentElement.insertBefore(clone, row);
  return 'ok';
});
console.log('source picker:', injected);
await shot('add-sources');

console.log('done');
await browser.close();
