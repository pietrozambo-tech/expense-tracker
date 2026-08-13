import { open, OUT } from './drive.mjs';

const { browser, page } = await open();
await page.getByText('Or look around with sample data').click();
await page.waitForTimeout(1500);

const shot = async (name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/after-${name}.png` });
  console.log('shot', name);
};

const SPLIT_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M21 3l-7.5 7.5"/><path d="M3 3l7.5 7.5"/><path d="M12 12v9"/></svg>`;

// Retarget by TEXT NODE: amounts are `<span>-900<span>€</span></span>`, so the
// figure is a text node and element.textContent always carries the symbol too.
const HELPERS = `
window.mkText = (from, to, all) => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n, hits = 0;
  while ((n = w.nextNode())) {
    if (n.nodeValue.trim() === from) { n.nodeValue = n.nodeValue.replace(from, to); hits++; if (!all) break; }
  }
  return hits;
};`;

// ─────────────────────────────────────────────────────── ACTIVITY
await page.getByRole('button', { name: /^Activity$/ }).click();
await page.waitForTimeout(900);
await page.evaluate(HELPERS);

const actLog = await page.evaluate((svg) => {
  const log = {};
  const p = [...document.querySelectorAll('p')].find((x) => x.textContent === 'Monthly rent');
  const row = p.closest('button');
  // The amount column is the row's LAST child div, not the icon tile.
  const amt = row.lastElementChild;
  log.amtBefore = amt.textContent;
  amt.innerHTML =
    `<span style="color:#8E8E93;display:inline-flex;flex-shrink:0;">${svg}</span>` +
    `<div><p class="text-neutral-900 font-bold tabular-nums text-sm">-450<span style="font-size:.72em;font-weight:500;opacity:.6;">€</span></p>` +
    `<p class="text-neutral-500 text-[10px] tabular-nums mt-0.5 font-medium">of 900<span style="font-size:.8em;opacity:.7;">€</span></p></div>`;
  log.out = window.mkText('1,039', '589');
  log.band = window.mkText('+2,244', '+2,694');
  return log;
}, SPLIT_SVG);
console.log('activity', JSON.stringify(actLog));

// Scroll so the rent row clears the dock.
await page.evaluate(() => {
  const sc = [...document.querySelectorAll('div')].find(
    (d) => d.className.includes('overflow-y-auto') && d.scrollHeight > d.clientHeight + 50);
  if (sc) sc.scrollTop = 330;
});
await shot('activity');

// ─────────────────────────────────────────────────────── DASHBOARD
await page.getByRole('button', { name: /^Dashboard$/ }).click();
await page.waitForTimeout(1000);
await page.evaluate(HELPERS);

const dashLog = await page.evaluate(() => {
  const log = {};
  log.spending = window.mkText('1,039', '589', true);   // hero + budget bar
  log.savings  = window.mkText('2,341', '2,791');
  log.rate     = window.mkText('69%', '83%');
  log.housing  = window.mkText('900', '450');
  log.hShare   = window.mkText('87%', '76%');
  log.used     = window.mkText('47% used', '27% used');
  log.daily    = window.mkText('64', '89');
  const fill = [...document.querySelectorAll('div')].find(
    (d) => /width:\s*4[5-9](\.\d+)?%/.test(d.getAttribute('style') || ''));
  if (fill) { fill.style.width = '26.8%'; log.fill = true; }
  return log;
});
console.log('dashboard', JSON.stringify(dashLog));
await shot('dashboard');

console.log('done');
await browser.close();
