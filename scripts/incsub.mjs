import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const DIST = '/home/user/expense-tracker/dist';
const TYPES = { '.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.ico':'image/x-icon','.json':'application/json' };
const ctFor = p => { const m = p.match(/\.[a-z0-9]+$/i); return (m && TYPES[m[0].toLowerCase()]) || 'application/octet-stream'; };

// Salary already carries a subcategory, the way an import leaves it.
const SAL = { id:'salary', name:'Salary', icon:'Briefcase', color:'text-emerald-600', bgColor:'bg-emerald-50', selectedBg:'bg-emerald-100', type:'income', subcategories:['Base pay'] };
const GROC = { id:'c1', name:'Groceries', icon:'ShoppingCart', color:'text-green-500', bgColor:'bg-green-50', selectedBg:'bg-green-100', type:'expense', subcategories:['Supermarket'] };

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-proxy-server'] });
const ctx = await b.newContext({ viewport:{ width:390, height:844 }, serviceWorkers:'block', hasTouch:true, isMobile:true, deviceScaleFactor:2 });
await ctx.addInitScript(([sal, groc]) => {
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded','1');
  localStorage.setItem('expense-tracker.v1.transactions', JSON.stringify([
    { id:'i1', description:'July salary', amount:3000, currency:'EUR', baseAmount:3000, category:sal, subcategory:'Base pay', date:'2026-07-25', type:'income', recurrence:'Never repeat' },
  ]));
  localStorage.setItem('expense-tracker.v1.categories', JSON.stringify([groc]));
  localStorage.setItem('expense-tracker.v1.income-categories', JSON.stringify([sal]));
  localStorage.setItem('expense-tracker.v1.settings', JSON.stringify({ onboarded:true, userName:'Pietro', currency:'EUR', hasSeenIntro:true }));
  localStorage.setItem('expense-tracker.v1.guest','true');
}, [SAL, GROC]);
const p = await ctx.newPage();
const errors = []; p.on('pageerror', e => errors.push(e.message));
await ctx.route('**/*', route => {
  const u = new URL(route.request().url());
  if (u.hostname !== 'app.local') return route.abort();
  let rel = decodeURIComponent(u.pathname).replace(/^\/expense-tracker\//,'').replace(/^\//,'');
  if (rel === '' || !rel.includes('.')) rel = 'index.html';
  const f = join(DIST, rel);
  if (!existsSync(f)) return route.fulfill({ status:200, contentType:'text/html', body:readFileSync(join(DIST,'index.html')) });
  return route.fulfill({ status:200, contentType:ctFor(f), body:readFileSync(f) });
});
await p.goto('http://app.local/expense-tracker/', { waitUntil:'load' });
await p.waitForTimeout(3000);

let pass = 0, fail = 0;
const check = (label, ok, extra='') => { ok ? pass++ : fail++; console.log(`${ok?'PASS':'FAIL'}  ${label}${extra?`  [${extra}]`:''}`); };
const incSubs = () => p.evaluate(() => (JSON.parse(localStorage.getItem('expense-tracker.v1.income-categories'))[0].subcategories) || []);
const txnSub  = () => p.evaluate(() => JSON.parse(localStorage.getItem('expense-tracker.v1.transactions'))[0].subcategory);

// Settings -> Categories -> Income
await p.getByText('Settings', { exact:true }).last().click();
await p.waitForTimeout(1200);
await p.getByRole('button', { name:/^Categories/ }).click();
await p.waitForTimeout(600);
await p.getByRole('button', { name:'Income', exact:true }).click();
await p.waitForTimeout(400);
check('income tab shows Salary', await p.getByText('Salary').first().isVisible());

// Expand Salary
await p.getByText('Salary').first().click();
await p.waitForTimeout(400);

// --- ADD ---
await p.getByRole('button', { name:/Add subcategory/ }).click();
await p.waitForTimeout(400);
await p.locator('input[placeholder="e.g., Netflix"]').fill('Q4 Bonus');
await p.getByRole('button', { name:/^(Add|Save)$/ }).last().click();
await p.waitForTimeout(700);
let subs = await incSubs();
check('add: persisted to income-categories', subs.includes('Q4 Bonus'), JSON.stringify(subs));
check('add: visible in the list', await p.getByText('Q4 Bonus').first().isVisible().catch(()=>false));

// --- RENAME --- (pencil on the Q4 Bonus row)
const row = p.locator('div').filter({ hasText:/^\s*Q4 Bonus$/ }).last();
await row.locator('xpath=ancestor::div[contains(@class,"justify-between")][1]').locator('button').first().click();
await p.waitForTimeout(400);
await p.locator('input[placeholder="e.g., Netflix"]').fill('Year-end bonus');
await p.getByRole('button', { name:/^(Save|Update)$/ }).last().click();
await p.waitForTimeout(700);
subs = await incSubs();
check('rename: category list updated', subs.includes('Year-end bonus') && !subs.includes('Q4 Bonus'), JSON.stringify(subs));

// Rename the seeded one too, and confirm the income TRANSACTION follows.
const row2 = p.locator('div').filter({ hasText:/^\s*Base pay$/ }).last();
await row2.locator('xpath=ancestor::div[contains(@class,"justify-between")][1]').locator('button').first().click();
await p.waitForTimeout(400);
await p.locator('input[placeholder="e.g., Netflix"]').fill('Monthly pay');
await p.getByRole('button', { name:/^(Save|Update)$/ }).last().click();
await p.waitForTimeout(700);
check('rename: income transaction re-labelled', (await txnSub()) === 'Monthly pay', String(await txnSub()));

// --- DELETE ---
const row3 = p.locator('div').filter({ hasText:/^\s*Year-end bonus$/ }).last();
await row3.locator('xpath=ancestor::div[contains(@class,"justify-between")][1]').locator('button').nth(1).click();
await p.waitForTimeout(400);
check('delete: asks for confirmation', await p.getByText('Delete Subcategory?').isVisible());
await p.getByRole('button', { name:'Delete', exact:true }).click();
await p.waitForTimeout(700);
subs = await incSubs();
check('delete: removed from income-categories', !subs.includes('Year-end bonus'), JSON.stringify(subs));

// Expense side must still work.
await p.getByRole('button', { name:'Expense', exact:true }).click();
await p.waitForTimeout(400);
await p.getByText('Groceries').first().click();
await p.waitForTimeout(400);
await p.getByRole('button', { name:/Add subcategory/ }).click();
await p.waitForTimeout(400);
await p.locator('input[placeholder="e.g., Netflix"]').fill('Butcher');
await p.getByRole('button', { name:/^(Add|Save)$/ }).last().click();
await p.waitForTimeout(700);
const expSubs = await p.evaluate(() => JSON.parse(localStorage.getItem('expense-tracker.v1.categories'))[0].subcategories);
check('expense side unaffected', expSubs.includes('Butcher') && expSubs.includes('Supermarket'), JSON.stringify(expSubs));

check('no page errors', errors.length === 0, errors.join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
