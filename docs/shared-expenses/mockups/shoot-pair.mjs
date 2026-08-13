import { open, OUT } from './drive.mjs';

const { browser, page } = await open();
await page.getByText('Or look around with sample data').click();
await page.waitForTimeout(1600);
const shot = async (n) => { await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/after-${n}.png` }); console.log('shot', n); };

const card = (i) => `<div style="background:var(--bg-card);border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.04);">${i}</div>`;
const sectionLabel = (s) => `<div style="color:var(--ink-2);font-size:11.5px;font-weight:700;letter-spacing:.13em;padding:22px 4px 8px;">${s}</div>`;
const avatar = (l, c, s = 26) => `<span style="width:${s}px;height:${s}px;border-radius:999px;background:${c};color:#fff;font-size:${Math.round(s * 0.42)}px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">${l}</span>`;

const ICON = {
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  dumbbell: '<path d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z"/><path d="m2.5 21.5 1.4-1.4"/><path d="m20.1 3.9 1.4-1.4"/>',
  film: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/>',
  utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
};

const mapRow = (icon, tint, fg, hers, mine, state, last) => `
  <div style="display:flex;align-items:center;gap:11px;padding:13px 16px;${last ? '' : 'border-bottom:1px solid var(--line-2);'}">
    <div style="width:32px;height:32px;border-radius:9px;background:${tint};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${fg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
    </div>
    <div style="flex:1;min-width:0;">
      <div style="display:flex;align-items:center;gap:7px;">
        <span style="color:var(--ink-2);font-size:13.5px;">${hers}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink-2)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        <span style="color:${state === 'todo' ? 'var(--ink-2)' : 'var(--ink)'};font-size:14px;font-weight:${state === 'todo' ? '400' : '600'};font-style:${state === 'todo' ? 'italic' : 'normal'};">${mine}</span>
      </div>
      <div style="color:${state === 'auto' ? '#16A34A' : state === 'todo' ? '#D97706' : 'var(--ink-2)'};font-size:11px;margin-top:3px;font-weight:500;">
        ${state === 'auto' ? '✓ matched automatically' : state === 'todo' ? '! needs your choice' : 'you chose this'}
      </div>
    </div>
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
  </div>`;

// ─────────────────────────────── A. Pair devices
const PAIR = `<div style="padding:0 20px 28px;">
  <div style="display:flex;align-items:center;justify-content:center;gap:14px;padding:22px 0 20px;">
    ${avatar('P', '#0B0B0D', 54)}
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#4F74F3" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>
    ${avatar('G', '#7C5CFF', 54)}
  </div>
  <div style="text-align:center;color:var(--ink);font-size:19px;font-weight:700;margin-bottom:6px;">Connect with Giulia</div>
  <div style="text-align:center;color:var(--ink-2);font-size:13.5px;line-height:1.5;margin-bottom:22px;padding:0 10px;">
    Two accounts, two devices, one shared ledger. Each of you keeps your own app.
  </div>

  <div style="background:var(--bg-inset);border-radius:16px;padding:20px;text-align:center;margin-bottom:22px;">
    <div style="color:var(--ink-2);font-size:11.5px;font-weight:700;letter-spacing:.13em;margin-bottom:10px;">YOUR PAIRING CODE</div>
    <div class="tabular-nums" style="color:var(--ink);font-size:31px;font-weight:800;letter-spacing:.16em;">4KQ&nbsp;71M</div>
    <div style="color:var(--ink-2);font-size:11.5px;margin-top:8px;">Expires in 9:41 · she enters this on her device</div>
  </div>

  ${sectionLabel('WHAT SHE WILL SEE')}
  ${card(`
    <div style="display:flex;gap:11px;padding:13px 16px;border-bottom:1px solid var(--line-2);">
      <span style="color:#16A34A;font-weight:700;">✓</span>
      <div><div style="color:var(--ink);font-size:14.5px;font-weight:500;">Only what you mark as shared</div>
      <div style="color:var(--ink-2);font-size:12px;margin-top:2px;">Amount, date, description, category and the split.</div></div>
    </div>
    <div style="display:flex;gap:11px;padding:13px 16px;">
      <span style="color:#C2352B;font-weight:700;">✕</span>
      <div><div style="color:var(--ink);font-size:14.5px;font-weight:500;">Nothing else, ever</div>
      <div style="color:var(--ink-2);font-size:12px;margin-top:2px;">Not your other spending, income, budget, balances or accounts.</div></div>
    </div>`)}

  <div style="color:var(--ink-2);font-size:12px;line-height:1.55;padding:16px 4px 0;">
    Either of you can disconnect at any time. Items already shared stay in both ledgers as ordinary transactions — your history never disappears because someone left.
  </div>
</div>`;

// ─────────────────────────────── B. Category mapping
const MAPPING = `<div style="padding:0 20px 28px;">
  <div style="background:var(--bg-inset);border-radius:14px;padding:15px 17px;margin-bottom:6px;">
    <div style="color:var(--ink);font-size:14px;font-weight:600;margin-bottom:5px;">Her categories, in your words</div>
    <div style="color:var(--ink-2);font-size:12.5px;line-height:1.5;">Giulia&rsquo;s app is in Italian. Shared items arrive filed under her categories and land in yours — you decide where.</div>
  </div>

  ${sectionLabel('MATCHED ON THEIR OWN')}
  ${card(
    mapRow(ICON.cart, '#E4F7EC', '#16A34A', 'Spesa', 'Groceries', 'auto') +
    mapRow(ICON.home, '#E8F0FE', '#3B82F6', 'Casa', 'Housing', 'auto') +
    mapRow(ICON.utensils, '#FFF1E6', '#EA580C', 'Cibo &amp; Bevande', 'Food &amp; Drinks', 'auto') +
    mapRow(ICON.film, '#F3E8FF', '#9333EA', 'Tempo Libero', 'Leisure', 'auto', true))}

  ${sectionLabel('NEEDS YOU')}
  ${card(mapRow(ICON.dumbbell, '#E4F7EC', '#059669', 'Palestra Barry&rsquo;s', 'choose a category', 'todo', true))}

  <div style="color:var(--ink-2);font-size:12px;line-height:1.55;padding:14px 4px 0;">
    Her starter categories carry the same internal ids as yours, so they pair themselves — even across languages. Only the ones she invented need a decision, and the app suggests one from the icon.
  </div>
</div>`;

const renderSubpage = async (html, title, name) => {
  // Reload between renders: the previous pass renamed the row we navigate by.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /^Settings$/ }).click();
  await page.waitForTimeout(700);
  await page.getByText('Appearance').first().click();
  await page.waitForTimeout(800);
  await page.evaluate(({ html, title }) => {
    const h = [...document.querySelectorAll('*')].find((x) => x.children.length === 0 && x.textContent.trim() === 'Appearance');
    if (h) h.textContent = title;
    const root = [...document.querySelectorAll('div')].find((d) => (d.getAttribute('style') || '').includes('margin-bottom: -128px'));
    while (root.children.length > 1) root.lastElementChild.remove();
    const holder = document.createElement('div');
    holder.innerHTML = html;
    root.appendChild(holder);
  }, { html, title });
  await shot(name);
};

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await renderSubpage(PAIR, 'Connect', 'pair');
await renderSubpage(MAPPING, 'Her categories', 'mapping');

// ─────────────────────────────── C. Activity with her entry
await page.getByRole('button', { name: /^Activity$/ }).click();
await page.waitForTimeout(1000);
await page.evaluate(() => {
  const p = [...document.querySelectorAll('p')].find((x) => x.textContent === 'Weekly groceries');
  const row = p.closest('button');
  const ps = row.querySelectorAll('p');
  ps[0].textContent = 'Esselunga';
  ps[1].innerHTML = 'Groceries &middot; Supermarket';
  // A small avatar rides the icon tile: whose entry this is, at a glance.
  const tile = row.firstElementChild;
  tile.style.position = 'relative';
  tile.insertAdjacentHTML('beforeend',
    `<span style="position:absolute;right:-4px;bottom:-4px;width:16px;height:16px;border-radius:999px;background:#7C5CFF;color:#fff;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid var(--bg-card);">G</span>`);
  row.lastElementChild.innerHTML =
    `<div><p class="text-neutral-900 font-bold tabular-nums text-sm">-30<span style="font-size:.72em;font-weight:500;opacity:.6;">€</span></p>
     <p class="text-neutral-500 text-[10px] tabular-nums mt-0.5 font-medium">Giulia paid 60<span style="font-size:.8em;opacity:.7;">€</span></p></div>`;
});
await page.evaluate(() => {
  const sc = [...document.querySelectorAll('div')].find((d) => d.className.includes('overflow-y-auto') && d.scrollHeight > d.clientHeight + 50);
  if (sc) sc.scrollTop = 340;
});
await shot('activity-hers');

// ─────────────────────────────── D. Tapping it
await page.evaluate(() => {
  const d = document.createElement('div');
  d.innerHTML = `
  <div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:70;display:flex;align-items:flex-end;justify-content:center;">
   <div style="width:100%;max-width:430px;background:var(--bg-card);border-radius:22px 22px 0 0;padding:22px 22px 30px;">
    <div style="width:38px;height:4px;border-radius:99px;background:var(--bg-track);margin:0 auto 20px;"></div>
    <div style="display:flex;align-items:center;gap:11px;margin-bottom:20px;">
      <span style="width:38px;height:38px;border-radius:999px;background:#7C5CFF;color:#fff;font-size:15px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;">G</span>
      <div><div style="color:var(--ink);font-size:16.5px;font-weight:700;line-height:1.2;">Esselunga</div>
      <div style="color:var(--ink-2);font-size:12.5px;margin-top:2px;">Giulia&rsquo;s entry &middot; Sat 1 Aug</div></div>
    </div>
    <div style="background:var(--bg-inset);border-radius:14px;padding:4px 16px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--line-2);">
        <span style="color:var(--ink-2);font-size:14px;">She paid</span><span class="tabular-nums" style="color:var(--ink);font-size:14px;font-weight:600;">60.00€</span></div>
      <div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--line-2);">
        <span style="color:var(--ink-2);font-size:14px;">Split</span><span style="color:var(--ink);font-size:14px;font-weight:600;">Equally, 2 ways</span></div>
      <div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--line-2);">
        <span style="color:var(--ink-2);font-size:14px;">Your share</span><span class="tabular-nums" style="color:var(--ink);font-size:14px;font-weight:700;">30.00€</span></div>
      <div style="display:flex;justify-content:space-between;padding:12px 0;">
        <span style="color:var(--ink-2);font-size:14px;">You now owe her</span><span class="tabular-nums" style="color:#4F74F3;font-size:14px;font-weight:700;">30.00€</span></div>
    </div>
    <div style="background:var(--bg-inset);border-radius:14px;padding:14px 16px;margin-bottom:18px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div><div style="color:var(--ink-2);font-size:11.5px;margin-bottom:3px;">Filed in your app under</div>
        <div style="color:var(--ink);font-size:14.5px;font-weight:600;">Groceries &middot; Supermarket</div></div>
        <span style="color:#4F74F3;font-size:13.5px;font-weight:600;">Change</span>
      </div>
      <div style="color:var(--ink-2);font-size:11.5px;margin-top:9px;line-height:1.45;">She filed it under <b style="color:var(--ink);">Spesa</b>. Where it sits in your Dashboard is your choice and does not change anything on her side.</div>
    </div>
    <div style="display:flex;align-items:flex-start;gap:9px;padding:0 2px;">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <div style="color:var(--ink-2);font-size:12px;line-height:1.5;">The amount, date and split belong to Giulia — only she can change them. Yours is the category and nothing else.</div>
    </div>
   </div>
  </div>`;
  document.body.appendChild(d);
});
await shot('hers-detail');

console.log('done');
await browser.close();
