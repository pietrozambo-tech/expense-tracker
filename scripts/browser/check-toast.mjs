// The toast is readable in both themes.
//
// It was not: the stock shadcn Toaster asked next-themes for the theme (a
// library this app does not use - no provider, so "system"), which made
// sonner paint its DARK text palette whenever the phone was dark, over a
// card forced white by --popover, whose dark value sits under a `.dark`
// class nothing ever sets. Near-white description on a white card - the
// "Demo data loaded" subtitle was invisible at night. The Toaster now reads
// <html data-theme>, the one place the app's dark mode actually lives.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';

const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

const sample = async (mode) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, locale: 'en-GB', colorScheme: mode });
  await ctx.addInitScript((m) => {
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    localStorage.setItem('expense-tracker.v1.theme', m);
    localStorage.setItem('expense-tracker.v1.guest', 'true');
    localStorage.setItem('expense-tracker.v1.settings', JSON.stringify({
      onboarded: true, userName: 'Pietro', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en',
    }));
    localStorage.setItem('expense-tracker.v1.nudges', JSON.stringify({ tips: false, recap: false }));
  }, mode);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Settings' }).first().click();
  await p.waitForTimeout(600);
  // Demo data raises the exact toast that was unreadable: title + subtitle.
  await p.getByText('Load demo data', { exact: false }).first().click();
  await p.waitForTimeout(500);
  await p.locator('button').filter({ hasText: /Load/ }).last().click();
  await p.waitForSelector('[data-sonner-toast]', { timeout: 6000 }).catch(() => {});
  const info = await p.evaluate(() => {
    const t = document.querySelector('[data-sonner-toast]');
    if (!t) return null;
    const lum = (c) => {
      const [r, g, bb] = c.match(/\d+/g).map(Number);
      const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bb);
    };
    const bg = getComputedStyle(t).backgroundColor;
    const desc = t.querySelector('[data-description]');
    if (!desc) return { bg, contrast: 0 };
    const dc = getComputedStyle(desc).color;
    const contrast = (Math.max(lum(bg), lum(dc)) + 0.05) / (Math.min(lum(bg), lum(dc)) + 0.05);
    return { bg, contrast };
  });
  await ctx.close();
  return info;
};

const dark = await sample('dark');
const light = await sample('light');
ok(dark !== null && light !== null, 'the demo-data toast appears in both themes');
// 4.5:1 is WCAG AA for body text; the real values sit above 10.
ok(dark !== null && dark.contrast >= 4.5,
  `in dark mode the subtitle is readable (${dark?.contrast.toFixed(2)}:1 on ${dark?.bg})`);
ok(light !== null && light.contrast >= 4.5,
  `and in light mode too (${light?.contrast.toFixed(2)}:1 on ${light?.bg})`);
ok(dark !== null && light !== null && dark.bg !== light.bg,
  'and the card itself follows the app theme rather than staying one colour');

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await b.close();
process.exit(fail.length ? 1 : 0);
