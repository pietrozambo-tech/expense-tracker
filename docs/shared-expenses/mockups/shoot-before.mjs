import { open, OUT } from './drive.mjs';

const { browser, page } = await open();

// Seed the sample dataset from the empty-state CTA.
await page.getByText('Or look around with sample data').click();
await page.waitForTimeout(1500);

const shot = async (name) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/before-${name}.png` });
  console.log('shot', name);
};

await shot('dashboard');

// Activity
await page.getByRole('button', { name: /^Activity$/ }).click();
await page.waitForTimeout(800);
await shot('activity');

// Trend
await page.getByRole('button', { name: /^Trend$/ }).click();
await page.waitForTimeout(1000);
await shot('trend');

// Settings
await page.getByRole('button', { name: /^Settings$/ }).click();
await page.waitForTimeout(800);
await shot('settings');

// Add screen — the dock's centre button
await page.getByRole('button', { name: /^Dashboard$/ }).click();
await page.waitForTimeout(400);
const addBtn = await page.locator('button').filter({ hasText: '' }).all();
console.log('add buttons', addBtn.length);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label')?.match(/add/i));
  if (b) b.click();
});
await page.waitForTimeout(900);
await shot('add');

console.log(await page.evaluate(() => document.body.innerText.slice(0, 600)));
await browser.close();
