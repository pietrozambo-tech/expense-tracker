import { open, OUT } from './drive.mjs';
const { browser, page } = await open();
await page.getByText('Or look around with sample data').click();
await page.waitForTimeout(1600);
await page.getByRole('button', { name: /^Trend$/ }).click();
await page.waitForTimeout(1500);
const log = await page.evaluate(() => {
  const set = (from, to) => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let x; while ((x = w.nextNode())) if (x.nodeValue.trim() === from) { x.nodeValue = x.nodeValue.replace(from, to); return 1; }
    return 0;
  };
  return {
    total: set('20,062', '16,462'),
    avg1: set('2,718', '2,268'),
    avg2: set('2,718', '2,268'),
    housing: set('900', '450'),
    share: set('33', '20'),
  };
});
console.log(JSON.stringify(log));
await page.screenshot({ path: `${OUT}/after-trend.png` });
await browser.close();
