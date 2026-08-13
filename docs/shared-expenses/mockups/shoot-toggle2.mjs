import { open, OUT } from './drive.mjs';

const { browser, page } = await open();
await page.getByText('Or look around with sample data').click();
await page.waitForTimeout(1700);
const shot = async (n, clip) => { await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/after-${n}.png`, ...(clip ? { clip } : {}) }); console.log('shot', n); };

const AV = (l, c, size, dim) =>
  `<span style="width:${size}px;height:${size}px;border-radius:999px;background:${c};color:#fff;font-size:${Math.round(size * 0.42)}px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;${dim ? 'opacity:.30;' : ''}">${l}</span>`;

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

// The personal view must show the SPLIT figures — the household is active.
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

await mountSwitch(`
  <button id="mk-switch" style="display:inline-flex;align-items:center;gap:5px;padding:3px 8px 3px 3px;border-radius:999px;background:var(--bg-card);box-shadow:0 1px 3px rgba(0,0,0,.07);margin-right:10px;">
    ${AV('P', '#0B0B0D', 30)}
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-2)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
  </button>`);
await shot('dash-toggle');
await shot('switcher-single', { x: 0, y: 0, width: 430, height: 120 });

await mountSwitch(`
  <button id="mk-switch" style="display:inline-flex;align-items:center;padding:3px;border-radius:999px;background:var(--bg-track);margin-right:10px;">
    <span style="display:inline-flex;">${AV('P', '#0B0B0D', 30)}</span>
    <span style="display:inline-flex;margin-left:-9px;">${AV('G', '#7C5CFF', 30, true)}</span>
  </button>`);
await shot('switcher-pair', { x: 0, y: 0, width: 430, height: 120 });

// Settings → Shared, now only the setup it actually owns.
const card = (i) => `<div style="background:var(--bg-card);border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.04);">${i}</div>`;
const label = (s) => `<div style="color:var(--ink-2);font-size:11.5px;font-weight:700;letter-spacing:.13em;padding:22px 4px 8px;">${s}</div>`;
const row = (name, value, sub, danger) => `
  <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line-2);">
    <div style="flex:1;min-width:0;">
      <div style="color:${danger ? '#C2352B' : 'var(--ink)'};font-size:15px;font-weight:500;">${name}</div>
      ${sub ? `<div style="color:var(--ink-2);font-size:12px;margin-top:2px;line-height:1.4;">${sub}</div>` : ''}
    </div>
    ${value ? `<div style="color:var(--ink-2);font-size:14px;">${value}</div>` : ''}
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
  </div>`;

const SETTINGS = `<div style="padding:0 20px 28px;">
  <div style="display:flex;align-items:center;gap:12px;padding:6px 4px 18px;">
    ${AV('P', '#0B0B0D', 44)}
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>
    ${AV('G', '#7C5CFF', 44)}
    <div style="flex:1;margin-left:4px;">
      <div style="color:var(--ink);font-size:15.5px;font-weight:600;">Home</div>
      <div style="color:#16A34A;font-size:12px;margin-top:2px;">Connected · synced 2 min ago</div>
    </div>
  </div>

  ${label('HOUSEHOLD')}
  ${card(
    row('Members', 'You, Giulia') +
    row('Default split', '50 / 50') +
    row('Always shared', '3 categories', 'Housing, Groceries, Utilities') +
    row('Her categories', '1 to map', 'Palestra Barry’s has no home in your app yet').replace('border-bottom:1px solid var(--line-2);', ''))}

  ${label('BALANCE')}
  ${card(
    row('Track who owes whom', 'On', 'Off keeps the split but stops the balance — for a joint account you both fund') +
    row('Settlement history', '4 settlements').replace('border-bottom:1px solid var(--line-2);', ''))}

  ${label('')}
  ${card(row('Disconnect from Giulia', '', 'Shared items stay in both apps as ordinary transactions', true).replace('border-bottom:1px solid var(--line-2);', ''))}

  <div style="color:var(--ink-2);font-size:12px;line-height:1.55;padding:16px 4px 0;">
    The balance itself now lives on the Dashboard, behind the avatar. This screen only holds the setup you touch once.
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
  if (h) h.textContent = 'Shared';
  const root = [...document.querySelectorAll('div')].find((d) => (d.getAttribute('style') || '').includes('margin-bottom: -128px'));
  while (root.children.length > 1) root.lastElementChild.remove();
  const holder = document.createElement('div');
  holder.innerHTML = html;
  root.appendChild(holder);
}, { html: SETTINGS });
await shot('settings-shared-slim');

console.log('done');
await browser.close();
