import { open, OUT } from './drive.mjs';

const { browser, page } = await open();
await page.getByText('Or look around with sample data').click();
await page.waitForTimeout(1600);

const shot = async (n) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/after-${n}.png` }); console.log('shot', n); };

// Dashboard with the balance ledger ON: the card only exists in this mode.
await page.waitForTimeout(600);
await page.evaluate(() => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  const set = (from, to) => {
    const wk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let x; while ((x = wk.nextNode())) if (x.nodeValue.trim() === from) { x.nodeValue = x.nodeValue.replace(from, to); return true; }
    return false;
  };
  set('1,039', '589'); set('1,039', '589'); set('2,341', '2,791'); set('69%', '83%');
  set('47% used', '27% used'); set('64', '89');
  const fill = [...document.querySelectorAll('div')].find((d) => /width:\s*4[5-9](\.\d+)?%/.test(d.getAttribute('style') || ''));
  if (fill) fill.style.width = '26.8%';

  // The card, inserted under the budget bar.
  const budget = [...document.querySelectorAll('*')].find((x) => x.children.length === 0 && x.textContent.trim() === 'Monthly Budget');
  const bcard = budget.closest('div[class*="rounded"]');
  const el = document.createElement('div');
  el.style.cssText = 'margin-top:16px;background:var(--bg-card);border-radius:16px;box-shadow:0 1px 4px rgba(0,0,0,.04);padding:18px 20px;';
  el.innerHTML = `
    <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:4px;">
      <span style="color:var(--ink);font-size:17px;font-weight:600;">Shared with Giulia</span>
      <span style="color:var(--ink-2);font-size:12.5px;">August</span>
    </div>
    <div style="color:var(--ink-2);font-size:12.5px;margin-bottom:16px;">4 shared expenses this month</div>
    <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
      <span style="color:var(--ink-2);font-size:14px;">You paid</span>
      <span style="color:var(--ink);font-size:14px;font-weight:600;" class="tabular-nums">1,012.00<span style="font-size:.72em;font-weight:500;opacity:.6;">€</span></span></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
      <span style="color:var(--ink-2);font-size:14px;">Giulia paid</span>
      <span style="color:var(--ink);font-size:14px;font-weight:600;" class="tabular-nums">318.00<span style="font-size:.72em;font-weight:500;opacity:.6;">€</span></span></div>
    <div style="height:1px;background:var(--line-2);margin-bottom:12px;"></div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:16px;">
      <span style="color:var(--ink);font-size:15px;font-weight:600;">Giulia owes you</span>
      <span style="color:#4F74F3;font-size:19px;font-weight:700;" class="tabular-nums">347.00<span style="font-size:.66em;font-weight:600;opacity:.7;">€</span></span></div>
    <button style="width:100%;padding:12px;border-radius:12px;background:#4F74F3;color:#fff;font-size:15px;font-weight:600;">Mark as settled</button>
    <div style="color:var(--ink-2);font-size:11.5px;text-align:center;margin-top:10px;line-height:1.4;">One tap. The transfer that arrives in your bank needs no entry.</div>`;
  bcard.after(el);
});
await page.evaluate(() => {
  const sc = [...document.querySelectorAll('div')].find((d) => d.className.includes('overflow-y-auto') && d.scrollHeight > d.clientHeight + 50);
  if (sc) sc.scrollTop = 330;
});
await shot('settle');
console.log('done');
await browser.close();
