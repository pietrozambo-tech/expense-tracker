import { open, OUT } from './drive.mjs';

const { browser, page } = await open();
await page.getByText('Or look around with sample data').click();
await page.waitForTimeout(1600);

const shot = async (n) => { await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/after-${n}.png` }); console.log('shot', n); };

const I = {
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
  back: '<path d="m9 14 4-4 4 4"/><path d="M3 12a9 9 0 1 0 9-9"/>',
};

const euro = (n) => `${n}<span style="font-size:.72em;font-weight:500;opacity:.6;">€</span>`;

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

const monthLabel = (m) => `<div style="color:var(--ink-2);font-size:11.5px;font-weight:700;letter-spacing:.13em;padding:20px 4px 8px;">${m}</div>`;
const card = (inner) => `<div style="background:var(--bg-card);border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.04);">${inner}</div>`;

const LEDGER = `
<div style="padding:0 20px 28px;">

  <div style="border-radius:20px;padding:22px 22px 20px;background:linear-gradient(145deg,#26262F 0%,#1A1A21 55%,#191A22 100%);box-shadow:0 6px 22px rgba(0,0,0,.16);">
    <div style="color:rgba(255,255,255,.62);font-size:13.5px;margin-bottom:6px;">Giulia owes you</div>
    <div class="tabular-nums" style="color:#fff;font-size:40px;font-weight:800;letter-spacing:-.02em;line-height:1;">347.00<span style="font-size:.5em;font-weight:600;opacity:.65;margin-left:2px;">€</span></div>
    <div style="color:rgba(255,255,255,.45);font-size:12px;margin-top:8px;">Running since you settled on 28 July</div>
    <button style="width:100%;margin-top:18px;padding:12px;border-radius:12px;background:#4F74F3;color:#fff;font-size:15px;font-weight:600;">Settle up</button>
  </div>

  <div style="margin-top:18px;background:var(--bg-card);border-radius:16px;padding:16px 18px;box-shadow:0 1px 4px rgba(0,0,0,.04);">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:11px;">
      <span style="color:var(--ink);font-size:14.5px;font-weight:600;">Who has been paying</span>
      <span style="color:var(--ink-2);font-size:11.5px;">14 shared items</span>
    </div>
    <div style="display:flex;height:9px;border-radius:99px;overflow:hidden;background:var(--bg-track);">
      <div style="width:76%;background:#4F74F3;"></div><div style="width:24%;background:#7C5CFF;"></div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:9px;">
      <span style="color:var(--ink-2);font-size:12px;"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#4F74F3;margin-right:6px;"></span>You 1,012€</span>
      <span style="color:var(--ink-2);font-size:12px;"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#7C5CFF;margin-right:6px;"></span>Giulia 318€</span>
    </div>
  </div>

  <div style="color:var(--ink-2);font-size:11.5px;line-height:1.5;padding:14px 4px 0;">
    <b style="color:#4F74F3;">Blue</b> raises what she owes you · <b style="color:var(--ink);">Grey</b> brings it back down
  </div>

  ${monthLabel('AUGUST')}
  ${card(
    item(I.cart, '#E4F7EC', '#16A34A', 'Weekly groceries', 'You paid 70.00€ · half yours', '+35.00', true) +
    item(I.home, '#E8F0FE', '#3B82F6', 'Monthly rent', 'You paid 900.00€ · half yours', '+450.00', true) +
    item(I.zap, '#FEF3C7', '#D97706', 'Electricity', 'Giulia paid 90.00€ · half yours', '−45.00', false) +
    item(I.wifi, '#EDE9FE', '#7C3AED', 'Internet', 'Giulia paid 45.00€ · half yours', '−22.50', false, true))}

  ${monthLabel('JULY')}
  ${card(
    item(I.back, '#F1F5F9', '#64748B', 'Settled up', 'Received to Revolut · 28 Jul', '−200.00', false) +
    item(I.home, '#E8F0FE', '#3B82F6', 'Monthly rent', 'You paid 900.00€ · half yours', '+450.00', true, true))}

  <div style="color:var(--ink-2);font-size:12px;line-height:1.55;padding:18px 4px 0;">
    Every line here already counts as your share in Dashboard, Activity and Trend. This screen is the only place the difference between what you paid and what you owe each other is kept.
  </div>
</div>`;

const SETTLE_SHEET = `
<div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:70;display:flex;align-items:flex-end;justify-content:center;">
 <div style="width:100%;max-width:430px;background:var(--bg-card);border-radius:22px 22px 0 0;padding:22px 22px 30px;">
  <div style="width:38px;height:4px;border-radius:99px;background:var(--bg-track);margin:0 auto 18px;"></div>
  <div style="text-align:center;margin-bottom:6px;color:var(--ink);font-size:18px;font-weight:700;">Settle up</div>
  <div style="text-align:center;color:var(--ink-2);font-size:13px;margin-bottom:20px;">Giulia owes you 347.00€</div>

  <div style="display:flex;gap:8px;margin-bottom:20px;">
    <div style="flex:1;padding:11px;border-radius:12px;text-align:center;background:var(--bg-card);border:1.5px solid #4F74F3;color:#4F74F3;font-size:14px;font-weight:600;">She paid me</div>
    <div style="flex:1;padding:11px;border-radius:12px;text-align:center;background:var(--bg-inset);border:1.5px solid transparent;color:var(--ink-2);font-size:14px;font-weight:500;">I paid her</div>
  </div>

  <div style="background:var(--bg-inset);border-radius:14px;padding:4px 16px;margin-bottom:16px;">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--line-2);">
      <span style="color:var(--ink-2);font-size:14px;">Amount</span>
      <span class="tabular-nums" style="color:var(--ink);font-size:20px;font-weight:700;">200.00<span style="font-size:.6em;font-weight:500;opacity:.6;">€</span></span>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--line-2);">
      <span style="color:var(--ink-2);font-size:14px;">Date</span><span style="color:var(--ink);font-size:14px;font-weight:500;">Today, 13 Aug</span>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;">
      <span style="color:var(--ink-2);font-size:14px;">Landed in</span>
      <span style="display:inline-flex;align-items:center;gap:7px;">
        <span style="width:22px;height:22px;border-radius:6px;background:#0B0B0D;color:#fff;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;">R</span>
        <span style="color:var(--ink);font-size:14px;font-weight:500;">Revolut</span>
      </span>
    </div>
  </div>

  <div style="display:flex;justify-content:space-between;align-items:baseline;padding:0 4px 18px;">
    <span style="color:var(--ink);font-size:14.5px;font-weight:600;">Balance after this</span>
    <span class="tabular-nums" style="color:#4F74F3;font-size:18px;font-weight:700;">147.00<span style="font-size:.62em;font-weight:600;opacity:.7;">€</span></span>
  </div>

  <button style="width:100%;padding:14px;border-radius:14px;background:#4F74F3;color:#fff;font-size:15.5px;font-weight:600;">Record settlement</button>
  <div style="color:var(--ink-2);font-size:11.5px;text-align:center;margin-top:12px;line-height:1.45;">
    Not income, and not a refund. Your spending, budget and savings rate do not move — only the balance and your Revolut balance do.
  </div>
 </div>
</div>`;

// ── Shared ledger, rendered inside a REAL Settings subpage shell ──
await page.getByRole('button', { name: /^Settings$/ }).click();
await page.waitForTimeout(800);
await page.getByText('Appearance').first().click();
await page.waitForTimeout(900);

await page.evaluate(({ ledger, title }) => {
  const h = [...document.querySelectorAll('*')].find((x) => x.children.length === 0 && x.textContent.trim() === 'Appearance');
  if (h) h.textContent = title;
  const root = [...document.querySelectorAll('div')].find((d) => (d.getAttribute('style') || '').includes('margin-bottom: -128px'));
  // Keep the app's own header block; replace everything after it.
  while (root.children.length > 1) root.lastElementChild.remove();
  const holder = document.createElement('div');
  holder.innerHTML = ledger;
  root.appendChild(holder);
}, { ledger: LEDGER, title: 'Shared' });
await shot('ledger');

await page.evaluate(() => {
  const sc = [...document.querySelectorAll('div')].find((d) => d.className.includes('overflow-y-auto') && d.scrollHeight > d.clientHeight + 40);
  if (sc) sc.scrollTop = 520;
});
await shot('ledger-scrolled');

// ── Settle sheet over it ──
await page.evaluate((html) => {
  const sc = [...document.querySelectorAll('div')].find((d) => d.className.includes('overflow-y-auto') && d.scrollHeight > d.clientHeight + 40);
  if (sc) sc.scrollTop = 0;
  const d = document.createElement('div');
  d.innerHTML = html;
  document.body.appendChild(d);
}, SETTLE_SHEET);
await shot('settle-sheet');

// ── Activity: where the €200 actually shows up ──
await page.evaluate(() => { document.body.lastElementChild.remove(); });
await page.getByRole('button', { name: /^Activity$/ }).click();
await page.waitForTimeout(1000);

await page.evaluate(() => {
  // Header gains a third, quiet segment. In/out are untouched.
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    if (n.nodeValue.trim() === '1,039') { n.nodeValue = n.nodeValue.replace('1,039', '589'); break; }
  }
  const outLabel = [...document.querySelectorAll('*')].find((x) => x.children.length === 0 && x.textContent.trim() === 'out');
  if (outLabel) {
    const extra = document.createElement('span');
    extra.innerHTML = ` · <span style="color:var(--ink);font-weight:600;">200</span><span style="font-size:.72em;font-weight:500;opacity:.6;">€</span> settled`;
    outLabel.after(extra);
  }

  // The settlement row itself, cloned from a real row so the geometry is real.
  const p = [...document.querySelectorAll('p')].find((x) => x.textContent === 'Tennis lesson');
  const row = p.closest('button');
  const clone = row.cloneNode(true);
  clone.querySelector('.flex-shrink-0').outerHTML =
    `<div class="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style="background:var(--bg-inset);">
       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 14 4-4 4 4"/><path d="M3 12a9 9 0 1 0 9-9"/></svg>
     </div>`;
  const t = clone.querySelectorAll('p');
  t[0].textContent = 'Settled up with Giulia';
  t[1].textContent = 'Received to Revolut';
  clone.lastElementChild.innerHTML =
    `<div><p class="font-bold tabular-nums text-sm" style="color:var(--ink-2);">200<span style="font-size:.72em;font-weight:500;opacity:.6;">€</span></p>
     <p class="text-[10px] mt-0.5 font-medium" style="color:var(--ink-2);opacity:.75;">settlement</p></div>`;
  row.parentElement.insertBefore(clone, row);
});
await shot('activity-settlement');

console.log('done');
await browser.close();
