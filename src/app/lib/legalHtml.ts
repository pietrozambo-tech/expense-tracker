import type { LegalDoc } from './legalContent';

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Renders a legal document as a standalone page.
//
// App Store Connect wants a privacy policy at a real URL rather than a screen
// buried in the app, and the two have to say the same thing. Building these
// pages from the same module the app renders means they cannot drift: the text
// is edited once and both follow.
export function renderLegalHtml(doc: LegalDoc): string {
  const sections = doc.sections
    .map(
      (section) =>
        `  <h2>${escapeHtml(section.heading)}</h2>\n` +
        section.body.map((p) => `  <p>${escapeHtml(p)}</p>`).join('\n'),
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(doc.title)} - TracklyLab</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0 auto; padding: 40px 24px 80px; max-width: 680px;
         font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
         color: #1C1C1E; background: #fff; }
  header { border-bottom: 1px solid var(--line); padding-bottom: 20px; margin-bottom: 28px; }
  .brand { font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #4F74F3; }
  h1 { font-size: 30px; letter-spacing: -.5px; margin: 8px 0 6px; }
  .updated { color: var(--ink-2); font-size: 14px; margin: 0; }
  .intro { font-size: 17px; color: #3A3A3C; }
  h2 { font-size: 17px; margin: 32px 0 8px; }
  p { color: #48484A; margin: 0 0 10px; }
  footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid var(--line); color: var(--ink-2); font-size: 13px; }
  a { color: #4F74F3; }
  @media (prefers-color-scheme: dark) {
    body { color: #F2F1ED; background: #1C1C1E; }
    header, footer { border-color: #3A3A3C; }
    .intro { color: #D1D1D6; }
    p { color: #C7C7CC; }
  }
</style>
</head>
<body>
  <header>
    <div class="brand">TracklyLab</div>
    <h1>${escapeHtml(doc.title)}</h1>
    <p class="updated">Last updated ${escapeHtml(doc.updated)}</p>
  </header>
  <p class="intro">${escapeHtml(doc.intro)}</p>
${sections}
  <footer>&copy; ${new Date().getFullYear()} TracklyLab &middot; <a href="./">Home</a></footer>
</body>
</html>
`;
}
