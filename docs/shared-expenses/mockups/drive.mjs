// Drives the real app in Chromium so we can screenshot it.
import pw from '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js';

const URL = 'http://127.0.0.1:5199/';
const OUT = new URL('./shots/', import.meta.url).pathname;

export async function open() {
  const browser = await pw.chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-proxy-server'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    locale: 'en-GB',
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('expense-tracker.v1.guest', 'true');
    localStorage.setItem('expense-tracker.v1.settings', JSON.stringify({
      onboarded: true,
      userName: 'Pietro',
      currency: 'EUR',
      monthlyBudget: 2200,
      insightsEnabled: true,
      hasSeenIntro: true,
      weekStartsOn: 1,
      language: 'en',
    }));
  });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  return { browser, ctx, page };
}

export { OUT };

if (import.meta.url === `file://${process.argv[1]}`) {
  const { browser, page } = await open();
  console.log('TITLE', await page.title());
  const text = await page.evaluate(() => document.body.innerText.slice(0, 1200));
  console.log('----- BODY -----');
  console.log(text);
  await page.screenshot({ path: `${OUT}/probe.png` });
  await browser.close();
}
