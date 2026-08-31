// Hover is for pointers that hover. On a phone it is a stuck highlight.
//
// Reported from a device, dark mode only: swiping down the Settings list lit
// the row under the finger and KEPT it lit until the next tap. That is iOS
// applying :hover to whatever the scroll first touched - and the reason only
// dark mode did it is an asymmetry in the CSS. Tailwind v4 guards its own
// hover: utilities behind @media (hover: hover), so a touch screen never
// paints them; the dark shim in index.css restated those same utilities for
// dark WITHOUT the guard. One theme obeyed the guard, the other routed around
// it.
//
// The pseudo-state is FORCED via CDP rather than swiped, deliberately: the
// browser's scroll heuristics differ from iOS's, but whether a :hover rule is
// allowed to paint on a hover-incapable device is pure CSS, and that is the
// whole bug. Four cells of a matrix - theme x pointer - and press feedback,
// which must survive the fix.
const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const URL = 'http://127.0.0.1:5199/';
const OUT = process.env.CHECK_OUT ?? new globalThis.URL('.artifacts', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });

const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const fail = []; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

const seed = ([theme]) => {
  const put = (k, v) => localStorage.setItem(`expense-tracker.v1.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  put('guest', 'true');
  put('settings', { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true, weekStartsOn: 1, language: 'en' });
  put('nudges', { tips: false, recap: false });
  localStorage.setItem('expense-tracker.v1.theme', theme);
};

// A Settings row: 32 of them carry hover:bg-neutral-50, which is the utility
// the report was about.
const ROW = 'button.hover\\:bg-neutral-50';

const open = async ({ theme, touch }) => {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: touch, isMobile: touch,
    locale: 'en-GB',
    colorScheme: theme === 'dark' ? 'dark' : 'light',
  });
  await ctx.route(/supabase\.co/, (r) => r.abort());
  await ctx.addInitScript(seed, [theme]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  await p.getByRole('button', { name: 'Settings' }).first().click();
  await p.waitForTimeout(700);
  return { ctx, p };
};

const bgOf = (p) => p.evaluate((sel) => getComputedStyle(document.querySelector(sel)).backgroundColor, ROW);

// What iOS does to the touched row, distilled: the :hover state applied to a
// row on a screen that cannot hover.
const forcePseudo = async (ctx, p, pseudo) => {
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: ROW });
  await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [pseudo] });
  // Past the touch-press transition (110ms delay + 150ms) so the value read
  // is the settled one, not a frame of the animation.
  await p.waitForTimeout(450);
};

// ── a touch phone: hover paints in NEITHER theme ──────────────────────────
for (const theme of ['light', 'dark']) {
  const { ctx, p } = await open({ theme, touch: true });
  ok(await p.evaluate(() => matchMedia('(hover: none)').matches),
    `${theme}: the emulated phone really cannot hover`);
  const before = await bgOf(p);
  await forcePseudo(ctx, p, 'hover');
  const after = await bgOf(p);
  ok(after === before,
    `${theme}: :hover on a touch screen paints nothing - no row lights up under a scroll (${before} -> ${after})`);
  if (theme === 'dark') await p.screenshot({ path: `${OUT}/touchhover-dark.png` });
  await ctx.close();
}

// ── press feedback is not hover, and it stays ─────────────────────────────
{
  const { ctx, p } = await open({ theme: 'dark', touch: true });
  const before = await bgOf(p);
  await forcePseudo(ctx, p, 'active');
  const after = await bgOf(p);
  ok(after !== before && after === 'rgb(49, 49, 57)',
    `dark: a real press still recolours the row, in the dark grey (${after})`);
  await ctx.close();
}

// ── a desktop pointer keeps its hover, in both themes ─────────────────────
for (const theme of ['light', 'dark']) {
  const { ctx, p } = await open({ theme, touch: false });
  const before = await bgOf(p);
  await p.locator(ROW).first().hover();
  await p.waitForTimeout(450);
  const after = await bgOf(p);
  const want = theme === 'dark' ? after === 'rgb(44, 44, 52)' : after !== before;
  ok(after !== before && want,
    `${theme}: a mouse still gets its hover${theme === 'dark' ? ', in the dark grey' : ''} (${before} -> ${after})`);
  await ctx.close();
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good');
await b.close();
process.exit(fail.length ? 1 : 0);
