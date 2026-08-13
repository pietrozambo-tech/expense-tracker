# Mockup harness

These scripts drive the **real app** in Chromium and inject the proposed shared-
expense UI into the live DOM. Nothing here is production code and nothing is
imported by the app — the point is that mockups inherit the app's actual fonts,
spacing, colour tokens and dark-mode behaviour instead of approximating them.

The finished screens are published in the visual spec:
<https://claude.ai/code/artifact/c52327a1-1198-4b58-9ae4-91f849b2546d>

## Running them

```sh
# 1. serve the app on the port drive.mjs expects
npm run dev -- --port 5199 --host 127.0.0.1

# 2. in another shell, from this directory
mkdir -p shots
node shoot-cases.mjs        # the four Add-screen states
node shoot-monthly.mjs      # shared view with month navigation, All items, joint card
node shoot-nudge.mjs        # the three-tier nudge
node shoot-prop.mjs         # her edits/deletions propagating, adjustments
node shoot-lens.mjs         # personal vs shared dashboard, category drill-down
node shoot-pair.mjs         # pairing flow, category mapping, her row in your Activity
node shoot-before.mjs       # untouched "today" screens, for before/after pairs

# 3. rebuild the spec page from whatever is in ./shots
node build-page.mjs         # writes ./shared-mockups.html
```

`shots/` is gitignored — regenerate rather than commit ~9 MB of PNGs.

## How they work

- `drive.mjs` launches Chromium (`/opt/pw-browsers/chromium`, `--no-proxy-server`)
  at 430×932 @2x, seeds `localStorage` with an onboarded guest profile, then
  clicks "Or look around with sample data" to load the demo dataset.
- Each `shoot-*.mjs` navigates to a screen and rewrites the DOM: replacing text
  nodes for changed figures, cloning real rows to build new ones, and injecting
  cards styled with the app's own CSS custom properties (`--bg-card`, `--ink`,
  `--line-2`, …).
- Amounts are `<span>-900<span>€</span></span>`, so the figure is a **text node**
  and `element.textContent` always carries the currency symbol too. Use the
  `mkText` TreeWalker helper rather than matching on `textContent`.
- New full screens are rendered inside a real Settings sub-page shell so the
  header, geometry and back button are the app's, not a drawing of one.

## Caveats

- They are pinned to the DOM as of `b15c7a4`. Selectors will drift as the app
  changes; expect to fix a few when picking this up.
- One number in the spec page is hand-adjusted rather than computed: on Trend the
  chart curve and the year-on-year line were not recomputed. This is stated in
  the page itself.
