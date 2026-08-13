import { readFileSync, writeFileSync } from 'node:fs';

const SHOTS = new URL('./shots', import.meta.url).pathname;
const img = (f) => `data:image/png;base64,${readFileSync(`${SHOTS}/${f}`).toString('base64')}`;

const frame = (src, label, tone = 'next') =>
  `<figure class="frame ${tone}"><img src="${img(src)}" alt="${label}" loading="lazy"><figcaption>${label}</figcaption></figure>`;

const shots = (list, cls = '') =>
  `<div class="shots ${cls}">${list.map((s) => frame(s.f, s.label, s.tone)).join('')}</div>`;

const deltas = (rows) =>
  `<ul class="deltas">${rows.map((d) => `<li><span class="dk">${d[0]}</span><span class="dv"><s>${d[1]}</s><em>→</em><b>${d[2]}</b></span></li>`).join('')}</ul>`;

const html = `<title>The Shared Balance</title>
<style>
:root{
  --ground:#E7E8EC; --surface:#FFFFFF; --sunk:#DDDEE3;
  --ink:#15161A; --ink-2:#6A6D77; --line:#D2D4DA;
  --accent:#4F74F3; --flag:#C2352B; --good:#15803D;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --ground:#121317; --surface:#1C1D22; --sunk:#17181C;
    --ink:#EFF0F3; --ink-2:#9A9DA7; --line:#2C2E34;
    --accent:#8AA4FF; --flag:#FF7A6E; --good:#4ADE80;
  }
}
:root[data-theme="dark"]{
  --ground:#121317; --surface:#1C1D22; --sunk:#17181C;
  --ink:#EFF0F3; --ink-2:#9A9DA7; --line:#2C2E34;
  --accent:#8AA4FF; --flag:#FF7A6E; --good:#4ADE80;
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--ground); color:var(--ink);
  font-family:var(--sans); font-size:16px; line-height:1.6; -webkit-font-smoothing:antialiased;
}
.wrap{max-width:1180px; margin:0 auto; padding:56px 24px 96px; display:flex; flex-direction:column; gap:22px}
.eyebrow{
  font-family:var(--mono); font-size:11px; letter-spacing:.14em; text-transform:uppercase;
  color:var(--ink-2); margin:0 0 10px;
}
.eyebrow.is-new{color:var(--accent)}
hr.rule{border:0; border-top:1px solid var(--line); margin:42px 0 0}

/* masthead */
.masthead{display:flex; flex-direction:column; gap:18px; max-width:72ch; margin-bottom:20px}
.masthead h1{margin:0; font-size:clamp(30px,4.4vw,46px); line-height:1.08; letter-spacing:-.028em; font-weight:800; text-wrap:balance}
.masthead p{margin:0; color:var(--ink-2); font-size:17px; line-height:1.55}
.masthead b{color:var(--ink); font-weight:600}

.quote{
  border-left:3px solid var(--accent); padding:6px 0 6px 18px; margin:0;
  font-size:17px; line-height:1.55; color:var(--ink);
}
.quote cite{display:block; margin-top:8px; font-style:normal; font-size:13px; color:var(--ink-2); font-family:var(--mono)}

.block{display:flex; flex-direction:column; gap:22px; padding-top:20px}
.block-head{max-width:74ch}
.block-head h2{margin:0 0 8px; font-size:27px; letter-spacing:-.02em; font-weight:750; line-height:1.15}
.block-head h3{margin:26px 0 6px; font-size:18px; letter-spacing:-.01em; font-weight:700}
.claim{margin:0; color:var(--ink-2); font-size:15.5px; line-height:1.62}
.claim + .claim{margin-top:12px}
.claim b{color:var(--ink); font-weight:600}

.shots{display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:22px}
.shots.trio{grid-template-columns:repeat(3,minmax(0,1fr))}
.shots.solo{grid-template-columns:minmax(0,420px)}
.frame{margin:0; display:flex; flex-direction:column; gap:10px}
.frame img{display:block; width:100%; height:auto; border-radius:14px; border:1px solid var(--line); background:var(--surface)}
.frame figcaption{
  font-family:var(--mono); font-size:11px; letter-spacing:.1em; text-transform:uppercase;
  display:flex; align-items:center; gap:8px; color:var(--ink-2);
}
.frame figcaption::before{content:""; width:9px; height:9px; border-radius:2px; background:currentColor; flex:none}
.frame.now figcaption{color:var(--flag)}
.frame.next figcaption{color:var(--good)}

/* annotated split: screenshot beside an explanation of its zones */
.anno{display:grid; grid-template-columns:minmax(0,380px) minmax(0,1fr); gap:34px; align-items:start}
.zones{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:0}
.zones li{padding:16px 0; border-bottom:1px solid var(--line)}
.zones li:first-child{padding-top:0}
.zones li:last-child{border-bottom:0}
.zones h4{margin:0 0 5px; font-size:15.5px; font-weight:650; letter-spacing:-.01em}
.zones p{margin:0; color:var(--ink-2); font-size:14.5px; line-height:1.55}
.zones p b{color:var(--ink); font-weight:600}

.deltas{
  list-style:none; margin:0; padding:0; display:grid; gap:1px;
  background:var(--line); border:1px solid var(--line); border-radius:12px; overflow:hidden;
  grid-template-columns:repeat(auto-fit,minmax(260px,1fr));
}
.deltas li{background:var(--surface); padding:11px 16px; display:flex; align-items:baseline; justify-content:space-between; gap:16px}
.dk{font-size:14px; color:var(--ink-2)}
.dv{font-family:var(--mono); font-size:13.5px; font-variant-numeric:tabular-nums; display:flex; align-items:baseline; gap:8px; white-space:nowrap}
.dv s{color:var(--ink-2); text-decoration-color:var(--flag)}
.dv em{color:var(--ink-2); font-style:normal}
.dv b{color:var(--ink); font-weight:700}

.panel{background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:24px 26px; display:flex; flex-direction:column; gap:14px}
.panel h2{margin:0; font-size:20px; letter-spacing:-.015em; font-weight:750}
.panel h3{margin:6px 0 0; font-size:15px; font-weight:650}
.panel p{margin:0; color:var(--ink-2); font-size:15px; line-height:1.6}
.panel ul{margin:0; padding-left:20px; display:flex; flex-direction:column; gap:9px; color:var(--ink-2); font-size:15px}
.panel li b{color:var(--ink); font-weight:600}
.panel.flag{border-color:var(--accent)}

figure.dia{margin:0; background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:26px 22px 18px}
figure.dia svg{display:block; width:100%; height:auto; color:var(--ink)}
figure.dia figcaption{margin-top:16px; color:var(--ink-2); font-size:14px; line-height:1.55; text-align:center}
.dia .b{fill:none; stroke:currentColor; stroke-width:1.25; opacity:.55}
.dia .bx{fill:none; stroke:var(--accent); stroke-width:1.6}
.dia .t{fill:currentColor; font-family:var(--sans); font-size:12.5px}
.dia .tb{fill:currentColor; font-family:var(--sans); font-size:13px; font-weight:650}
.dia .tm{fill:currentColor; font-family:var(--mono); font-size:11.5px; opacity:.72}
.dia .lbl{fill:currentColor; font-family:var(--mono); font-size:11px; letter-spacing:.06em; opacity:.62}
.dia .acc{fill:var(--accent)}
.dia .ln{stroke:currentColor; stroke-width:1.4; opacity:.6}
.dia .lnacc{stroke:var(--accent); stroke-width:1.8}
.dia .dash{stroke:var(--flag); stroke-width:1.4; stroke-dasharray:4 4; opacity:.8}
.dia .xm{stroke:var(--flag); stroke-width:2; stroke-linecap:round}
.lens-wrap{overflow-x:auto; border:1px solid var(--line); border-radius:12px}
table.lens{width:100%; border-collapse:collapse; font-size:14.5px; min-width:640px}
.lens th{
  text-align:left; padding:10px 16px; background:var(--sunk); color:var(--ink-2);
  font-family:var(--mono); font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; font-weight:600;
}
.lens td{padding:13px 16px; border-top:1px solid var(--line); vertical-align:top; color:var(--ink-2); line-height:1.5; background:var(--surface)}
.lens td:first-child{color:var(--ink); font-weight:600; white-space:nowrap}
.lens td.n{font-family:var(--mono); font-variant-numeric:tabular-nums; white-space:nowrap; color:var(--ink); font-weight:700}
.lens td b{color:var(--ink); font-weight:600}
.ledgerline{
  font-family:var(--mono); font-size:13px; background:var(--sunk); border:1px solid var(--line);
  border-radius:10px; padding:14px 16px; overflow-x:auto; white-space:pre; color:var(--ink);
  font-variant-numeric:tabular-nums;
}

@media (max-width:900px){
  .anno{grid-template-columns:1fr; gap:24px}
  .shots,.shots.trio{grid-template-columns:1fr; max-width:420px}
  .wrap{padding:36px 18px 64px}
}
</style>

<div class="wrap">
  <header class="masthead">
    <p class="eyebrow">Design review &middot; captured from the running app</p>
    <h1>The balance is the product. The splitting is just how it gets fed.</h1>
    <blockquote class="quote">
      I just see that I spend 450 for rent, and for grocery I spent at the Esselunga 70&nbsp;&euro;, so actually it&rsquo;s only 35&nbsp;&euro; for me &mdash; I could have added 35&nbsp;&euro; already.
      <cite>&mdash; and that is correct, which is why the previous version of this page was arguing for the wrong thing</cite>
    </blockquote>
    <p>Typing 35&nbsp;&euro; yourself gets you a right budget and <b>no record that Giulia owes you the other 35</b>. Typing 70 and &ldquo;half&rdquo; gets you both from one entry. That is the entire value: <b>one entry, two outputs</b> &mdash; your spending, and the balance between you.</p>
    <p>So this version leads with <b>where the shared view lives</b> &mdash; on the Dashboard, behind the two-face switcher &mdash; and then pins down the rule that makes the whole thing legible: <b>every screen answers exactly one question, and the amount it shows is the answer to that question.</b> Your ledger shows your share; the shared view shows the household&rsquo;s full amounts; the balance shows deltas. One record, three projections.</p>
  </header>

  <hr class="rule">

  <section class="block">
    <header class="block-head">
      <p class="eyebrow is-new">Where it lives</p>
      <h2>It is the Dashboard, not a Settings screen and not a fifth tab</h2>
      <p class="claim">One switcher in the header, next to the period pill. Three states, and the first one is the one that matters most:</p>
    </header>
    ${deltas([
      ['No household connected', 'today’s header', 'identical — no switcher at all'],
      ['Connected, your view', 'default', 'your avatar · title “Dashboard”'],
      ['Connected, shared view', 'one tap', 'her avatar · title “Shared”'],
    ])}
    ${shots([
      { f: 'after-dash-toggle.png', label: 'Yours — the numbers already net of her half' },
      { f: 'after-shared-monthly.png', label: 'Tap the switcher — same tab, household data' },
    ])}
    <p class="claim">The dock still shows <b>Dashboard</b> lit in both, which is the point: this is not somewhere else you go, it is the same screen answering the other question. And the shared view keeps the Dashboard&rsquo;s own shape &mdash; hero, bar, categories &mdash; so the switch reads as a change of subject, not a change of app.</p>
    <p class="claim"><b>Decided: the two-face switcher.</b> Both avatars share one pill, the active view lit, the other dimmed &mdash; so the control says &ldquo;there are two of these&rdquo; on sight and shows who you are about to switch to. (A Google/Apple profile photo drops into either circle; the initial is the fallback.)</p>
    ${shots([{ f: 'after-switcher-pair.png', label: 'The switcher at real size — personal view active' }], 'solo')}

    <header class="block-head">
      <h3>Months work exactly like they do everywhere else</h3>
      <p class="claim">An earlier draft invented a special &ldquo;since you settled&rdquo; period for this view. Wrong instinct &mdash; it broke the one navigation habit the app has taught you. The shared view now opens with the <b>same dark hero and the same &lsaquo; August 2026 &rsaquo; chevrons</b> as your personal Dashboard: tap through months and &ldquo;We spent together&rdquo;, the you/her totals and every card below re-scope to that month, exactly as your own view does.</p>
      <p class="claim">The one thing months must <b>not</b> touch is the balance. A debt does not reset on the 1st &mdash; browsing back to June cannot make Giulia owe you a different amount. So the balance sits in its own card between the hero and the month-scoped cards, labelled <b>running</b>, always current, with &ldquo;All items&rdquo; as its way in. Two clocks, one screen: months for spending, the last settlement for the debt.</p>
    </header>
  </section>

  <hr class="rule">

  <section class="block">
    <header class="block-head">
      <p class="eyebrow is-new">How the shared view actually works</p>
      <h2>One receipt, three screens, three numbers &mdash; all true</h2>
      <p class="claim">Giulia&rsquo;s 60&nbsp;&euro; Esselunga run is <b>one record</b>. What changes per screen is the question being answered, and the amount shown is always the answer to <i>that screen&rsquo;s</i> question &mdash; never a mixture. That one rule is the whole design.</p>
    </header>

    <figure class="dia">
      <svg viewBox="0 0 940 330" role="img" aria-label="One 60 euro shared grocery record projects three different numbers: 30 euro into your Activity, 60 euro into the shared dashboard, and minus 30 onto the balance.">
        <defs>
          <marker id="ah2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="var(--accent)"/>
          </marker>
        </defs>

        <rect class="bx" x="330" y="18" width="280" height="88" rx="12"/>
        <text class="tb" x="470" y="44" text-anchor="middle">Esselunga &middot; 60.00 &euro;</text>
        <text class="tm" x="470" y="66" text-anchor="middle">Giulia paid &middot; split 50/50</text>
        <text class="tm" x="470" y="86" text-anchor="middle">one shared record</text>

        <line class="lnacc" x1="404" y1="106" x2="180" y2="176" marker-end="url(#ah2)"/>
        <line class="lnacc" x1="470" y1="106" x2="470" y2="176" marker-end="url(#ah2)"/>
        <line class="lnacc" x1="536" y1="106" x2="760" y2="176" marker-end="url(#ah2)"/>

        <text class="lbl" x="164" y="200" text-anchor="middle">WHAT DID IT COST ME?</text>
        <rect class="b" x="24" y="210" width="280" height="92" rx="12"/>
        <text class="tb" x="42" y="236">Activity &middot; your ledger</text>
        <text class="tb acc" x="42" y="260">&minus;30.00 &euro;</text>
        <text class="tm" x="42" y="282">your share, her badge on the row</text>

        <text class="lbl" x="470" y="200" text-anchor="middle">WHAT DO WE SPEND?</text>
        <rect class="b" x="330" y="210" width="280" height="92" rx="12"/>
        <text class="tb" x="348" y="236">Dashboard &middot; shared view</text>
        <text class="tb acc" x="348" y="260">60.00 &euro;</text>
        <text class="tm" x="348" y="282">full amount, inside Groceries 260 &euro;</text>

        <text class="lbl" x="776" y="200" text-anchor="middle">WHO OWES WHOM?</text>
        <rect class="b" x="636" y="210" width="280" height="92" rx="12"/>
        <text class="tb" x="654" y="236">All items &middot; the ledger</text>
        <text class="tb acc" x="654" y="260">&minus;30.00</text>
        <text class="tm" x="654" y="282">what she owes you comes down</text>
      </svg>
      <figcaption>The record is stored once. Each screen projects the number that answers its own question &mdash; share, full amount, or balance delta.</figcaption>
    </figure>

    <div class="lens-wrap"><table class="lens">
      <tr><th>Screen</th><th>The question it answers</th><th>Her 60&nbsp;&euro; appears as</th><th>Why</th></tr>
      <tr><td>Activity</td><td>What did it cost <b>me</b>?</td><td class="n">&minus;30.00&nbsp;&euro;</td><td>Your ledger. Anything that costs you money belongs here &mdash; hers included, at your share, with her badge. Day totals stay honest because they sum your costs.</td></tr>
      <tr><td>Dashboard &middot; yours</td><td>How am <b>I</b> doing?</td><td class="n">30&nbsp;&euro; in Groceries</td><td>Budget, saving rate and category totals all read your share &mdash; same number Activity shows.</td></tr>
      <tr><td>Trend</td><td>How does <b>my</b> spending move?</td><td class="n">30&nbsp;&euro; in history</td><td>Same personal lens as the Dashboard, over time.</td></tr>
      <tr><td>Dashboard &middot; shared</td><td>What do <b>we</b> spend?</td><td class="n">60.00&nbsp;&euro;</td><td>The household&rsquo;s money. Halving it here would hide what living together actually costs.</td></tr>
      <tr><td>All items</td><td>Who owes whom, and why?</td><td class="n">&minus;30.00</td><td>Not spending at all &mdash; the effect on the balance. She fronted it, so what she owes you comes down.</td></tr>
    </table></div>

    <header class="block-head">
      <h3>So: yes, her transactions are in your Activity</h3>
      <p class="claim">Because her Esselunga run <i>did</i> cost you 30&nbsp;&euro;, and a ledger that omitted it would disagree with your Dashboard. It appears at your share with her badge on the tile &mdash; already mocked in the Activity shot further down. A <b>Shared</b> option in Activity&rsquo;s existing filter row narrows to these when you want them alone.</p>
      <p class="claim">The one edge: an item split so that your share is <b>zero</b> shows up only in the shared view. It costs you nothing, so it has no business in your ledger &mdash; but it is still the household&rsquo;s money.</p>
    </header>

    <header class="block-head">
      <h3>And the drill-down you asked about</h3>
      <p class="claim">Tap a category in &ldquo;What we spend&rdquo; and you get the household&rsquo;s items at <b>full amounts</b>, the payer&rsquo;s face on each tile, and the you/her bar for just that category. Tap a row from here and you land on the item sheet from the next section &mdash; where the split is spelled out and hers are read-only.</p>
    </header>
    ${shots([
      { f: 'after-shared-monthly.png', label: 'Category rows are tappable' },
      { f: 'after-drilldown.png', label: 'Groceries in August — full amounts, payer on each tile' },
    ])}
  </section>

  <hr class="rule">

  <section class="block">
    <header class="block-head">
      <p class="eyebrow is-new">The entry point</p>
      <h2>Where &ldquo;shared&rdquo; lives on the Add screen</h2>
      <p class="claim"><b>Short answer: the joint card is never required.</b> Any entry, on any source, can be split &mdash; cash included. The governing rule is that on this screen sharing is a <b>readout, not a form</b>. The defaults you set once &mdash; category, source, recurring rule &mdash; decide; the screen states the outcome and lets you override this one entry. So the question &ldquo;where does the control go&rdquo; is really &ldquo;where does the <i>statement</i> go&rdquo; &mdash; and a statement about the amount belongs against the amount.</p>
    </header>

    <figure class="dia">
      <svg viewBox="0 0 940 372" role="img" aria-label="Anatomy of the Add screen: the shared chip sits directly under the amount; the date row and the source pill alone are rejected placements.">
        <defs>
          <marker id="ah3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="var(--accent)"/>
          </marker>
        </defs>

        <rect class="b" x="40" y="20" width="330" height="332" rx="16"/>
        <rect class="b" x="64" y="42" width="150" height="30" rx="15"/>
        <text class="tm" x="80" y="62">Expense | Income</text>

        <rect class="b" x="64" y="88" width="220" height="40" rx="8"/>
        <text class="tb" x="80" y="113">&euro; 84</text>
        <rect class="b" x="296" y="90" width="52" height="36" rx="18"/>
        <text class="tm" x="306" y="113">P G</text>

        <rect class="bx" x="64" y="140" width="200" height="28" rx="14"/>
        <text class="t" x="78" y="159">&#x2442; shared &middot; yours 42 &euro;</text>

        <rect class="b" x="64" y="182" width="284" height="34" rx="8"/>
        <text class="tm" x="80" y="203">Esselunga</text>

        <rect class="b" x="64" y="228" width="284" height="34" rx="8"/>
        <text class="tm" x="80" y="249">&lsaquo; Today &rsaquo;&#160;&#160;&#160;&#160;&#160;&#160;&#160;Never repeat</text>

        <rect class="b" x="64" y="274" width="284" height="56" rx="8"/>
        <text class="tm" x="80" y="298">Category grid</text>
        <text class="tm" x="80" y="318">Groceries &middot; shared by default</text>

        <line class="lnacc" x1="264" y1="154" x2="470" y2="154" marker-end="url(#ah3)"/>
        <text class="tb" x="482" y="146">The chip &mdash; under the amount</text>
        <text class="t" x="482" y="166">It qualifies the number you just typed: &ldquo;84, of which 42 is yours&rdquo;.</text>
        <text class="t" x="482" y="184">States the decision the defaults made; tap to override once.</text>

        <line class="dash" x1="348" y1="108" x2="470" y2="108"/>
        <text class="tb" x="482" y="100">The source pill &mdash; half the answer</text>
        <text class="t" x="482" y="120">A real joint card auto-shares everything paid with it. But sharing</text>
        <text class="t" x="482" y="138">cannot live <tspan font-style="italic">only</tspan> here: you buy shared things on personal cards too.</text>

        <line class="dash" x1="348" y1="245" x2="470" y2="245"/>
        <line class="xm" x1="474" y1="238" x2="488" y2="252"/>
        <line class="xm" x1="488" y1="238" x2="474" y2="252"/>
        <text class="tb" x="500" y="242">Not the date row</text>
        <text class="t" x="482" y="262">Already two controls; sharing is not scheduling. A third slot</text>
        <text class="t" x="482" y="280">here reads as an input &mdash; the opposite of the design.</text>

        <line class="dash" x1="348" y1="302" x2="470" y2="302"/>
        <text class="tb" x="482" y="308">Categories decide silently</text>
        <text class="t" x="482" y="328">Groceries is marked shared in Settings, so picking it is what</text>
        <text class="t" x="482" y="346">flips the chip on. No extra tap on the fast path, ever.</text>
      </svg>
      <figcaption>One statement under the amount; everything else feeds it. The chip only exists when a household is connected &mdash; without one, the screen is today&rsquo;s, untouched.</figcaption>
    </figure>

    <header class="block-head">
      <h3>No — the joint card is one road in, not the only one</h3>
      <p class="claim">To answer it plainly: <b>you can pay cash and still split with Giulia.</b> The joint card is a shortcut, never a gate. Four combinations, all real screens, all at 84&nbsp;&euro;:</p>
    </header>
    ${shots([
      { f: 'after-case-a.png', label: 'A · Cash + Aperitivo (personal category)' },
      { f: 'after-case-b.png', label: 'B · Cash + Groceries (shared category)' },
    ])}
    ${shots([
      { f: 'after-case-c.png', label: 'C · Joint card + Aperitivo' },
      { f: 'after-case-d.png', label: 'D · Cash + Groceries, un-shared by hand' },
    ])}
    <div class="lens-wrap"><table class="lens">
      <tr><th></th><th>Source</th><th>Category</th><th>The chip says</th><th>Stored</th></tr>
      <tr><td>A</td><td>Cash</td><td>Aperitivo &mdash; personal</td><td><b>&ldquo;Split with Giulia&rdquo;</b>, dashed outline</td><td>Not shared, until you tap it. <b>This is the answer to your question:</b> one tap shares any entry, on any source.</td></tr>
      <tr><td>B</td><td>Cash</td><td>Groceries &mdash; shared</td><td>&ldquo;Groceries &middot; shared 50/50 &middot; yours 42&euro;&rdquo;</td><td>Shared. The <b>category</b> decided; the source is irrelevant.</td></tr>
      <tr><td>C</td><td>Joint card</td><td>Aperitivo &mdash; personal</td><td>&ldquo;Joint card &middot; shared 50/50 &middot; yours 42&euro;&rdquo;</td><td>Shared. The <b>source</b> decided, overriding a personal category.</td></tr>
      <tr><td>D</td><td>Cash</td><td>Groceries &mdash; shared</td><td>&ldquo;Not shared &middot; all 84&euro; yours&rdquo;, with undo</td><td>Not shared. You overrode the default &mdash; your protein bars are not hers.</td></tr>
    </table></div>
    <p class="claim">Three chip states, and the shape carries the meaning before you read a word: <b>dashed outline</b> = available, not on. <b>Filled</b> = on, and it names which rule fired, with an &times; to clear. <b>Solid outline with an undo arrow</b> = a default you deliberately switched off. Case A is the pizza case too &mdash; tap the dashed chip, divide once, done.</p>

    <header class="block-head">
      <h3>The joint card is still worth having, as a real Source</h3>
      <p class="claim">&ldquo;An ad-hoc source like a shared card &mdash; not always though&rdquo; is the right shape, with one refinement: it must be a <b>real</b> source (a bank card with a name and a paired-avatar tile), never a fake &ldquo;Shared&rdquo; pseudo-source. Source answers <i>where the money left from</i>, and that has to stay true &mdash; the settle sheet&rsquo;s &ldquo;landed in&rdquo; depends on it, and so would bank-feed matching later.</p>
      <p class="claim">Priority at save, most specific wins, and the chip always names the winner so a surprising split explains itself: <b>this entry&rsquo;s own choice &rarr; the recurring rule &rarr; the source &rarr; the category &rarr; not shared.</b> Cases C and D are that rule doing its job in both directions.</p>
    </header>
    ${shots([
      { f: 'after-add-joint.png', label: 'Joint card selected — the pill wears both faces' },
      { f: 'after-add-sources.png', label: 'The picker — one real card among the others' },
    ])}
  </section>

  <hr class="rule">

  <section class="block">
    <header class="block-head">
      <p class="eyebrow is-new">Coming back to the app</p>
      <h2>The nudge, and the rule that keeps it from becoming noise</h2>
      <p class="claim">Yes &mdash; with one constraint that decides its wording. A nudge that says <i>&ldquo;Giulia added an expense&rdquo;</i> reports a system event and asks you to go work out what it means. The version worth shipping reports <b>what it did to your numbers</b>: her groceries moved your August, and the balance is no longer what you last saw.</p>
      <p class="claim">Three tiers, escalating only when the news actually justifies it.</p>
    </header>

    ${shots([
      { f: 'after-nudge-dash.png', label: 'Opening the app — dot on the switcher, one line above the budget' },
      { f: 'after-nudge-shared.png', label: 'Tapping through — what arrived, and the balance that moved' },
    ])}

    <div class="lens-wrap"><table class="lens">
      <tr><th>Tier</th><th>When</th><th>What appears</th><th>Clears when</th></tr>
      <tr><td>1 &middot; The dot</td><td>Anything new at all</td><td>An indigo dot on Giulia&rsquo;s half of the switcher. No text, no card, no interruption &mdash; the control that already exists simply says &ldquo;something is over here&rdquo;.</td><td>You open the shared view</td></tr>
      <tr><td>2 &middot; One line</td><td>Her entries changed <b>your</b> figures this month</td><td>A single row above the budget bar: <b>&ldquo;Giulia added 3 shared expenses &middot; +74&euro; in your August &middot; she owes you 273&euro; now&rdquo;</b>. Tapping opens the shared view.</td><td>Tapped, or dismissed</td></tr>
      <tr><td>3 &middot; Push</td><td>Opt-in, and only for the balance &mdash; a settlement received, or a request to settle</td><td>A system notification. Deliberately <i>not</i> wired to every grocery run.</td><td>&mdash;</td></tr>
    </table></div>

    <header class="block-head">
      <h3>Four rules that keep it quiet</h3>
    </header>
    <div class="panel">
      <ul>
        <li><b>One nudge per session, batched.</b> Three of her entries produce one line, not three. The count and the euro total do the work.</li>
        <li><b>Tier 2 only when your numbers moved.</b> If she logs something where your share is zero, the dot appears and nothing else does &mdash; it changed the household total, not your month.</li>
        <li><b>Always the balance, in the same breath.</b> &ldquo;She owes you 273&euro; now&rdquo; is the sentence you actually came for; the shared view repeats it with <b>was 347</b> beside it so the direction of travel is visible.</li>
        <li><b>Never a prompt.</b> Nothing here asks you to approve, accept or confirm. Her entries are already true; the nudge is a courtesy, and dismissing it costs you nothing.</li>
      </ul>
    </div>

    <p class="claim">In the shared view the same information lands as a <b>&ldquo;New since you last looked&rdquo;</b> group at the top &mdash; her three items with NEW markers, at full household amounts, above the balance card showing 273 against its previous 347. Once seen, the group folds back into the normal month.</p>
  </section>

  <hr class="rule">

  <section class="block">
    <header class="block-head">
      <p class="eyebrow is-new">When she changes her mind</p>
      <h2>Her edits and deletions arrive on their own</h2>
      <p class="claim">She owns the amount, the date and the split; your copy is a <b>replica rebuilt from her record</b>, never a merge. So an edit is not a conflict to resolve &mdash; there is nothing of yours to conflict with. It simply becomes true on your device at the next sync, and your Groceries total, your budget and the balance all move with it.</p>
    </header>
    ${shots([
      { f: 'after-prop-activity.png', label: 'Your Activity — 30€ became 37.50€, marked UPDATED' },
      { f: 'after-prop-detail.png', label: 'Tapped — what changed, and what it moved' },
    ])}
    <p class="claim">Silent would be wrong and a permission prompt would be worse. So: the number updates itself, and the row carries a quiet <b>UPDATED</b> badge until you have looked at it. Tapping shows the before &rarr; after on both her amount and your share, plus the two things you actually care about &mdash; what it did to your category this month, and what it did to the balance. Nothing to accept, nothing to dismiss.</p>
    <p class="claim">A <b>deletion</b> is the same mechanism: the replica disappears from your Activity, your spending drops, the balance corrects. The disappearance is the honest outcome &mdash; you never paid for it &mdash; but it must not be silent when money has already moved, which is the next problem.</p>

    <header class="block-head">
      <h3>The edge that matters: she edits something you already settled</h3>
      <p class="claim">You settled at 347&nbsp;&euro; on 28 July and she sent the money. Now she corrects a July receipt. Rewriting July would make the 200&nbsp;&euro; she already transferred wrong in hindsight, and no amount of UI can un-send it.</p>
      <p class="claim">So the rule is the one real accounting uses: <b>a settlement closes the period behind it.</b> Closed items are never rewritten. A later correction posts an <b>adjustment</b> into the <i>current</i> running balance, as its own line with its own explanation &mdash; &ldquo;Adjustment &middot; Conad (July) &middot; Giulia corrected 130.00&euro; &rarr; 145.00&euro; &middot; &minus;7.50&rdquo;. The July row stays as it was, annotated &ldquo;corrected since&rdquo;; a deleted one is struck through rather than vanishing, because it is part of a settled figure.</p>
      <p class="claim">Corrections to items in the <b>open</b> period need none of this &mdash; nothing has been closed, so the item&rsquo;s own line just changes.</p>
    </header>
    ${shots([{ f: 'after-prop-allitems.png', label: 'Adjustments and removals as first-class lines' }], 'solo')}
  </section>

  <hr class="rule">

  <section class="block">
    <header class="block-head">
      <p class="eyebrow is-new">The question &middot; where does the 200&nbsp;&euro; go?</p>
      <h2>Nowhere in your spending. That is the whole answer.</h2>
      <p class="claim">A settlement is not income, not a refund, and not an expense in any category. Your bank balance goes up 200&nbsp;&euro; and what she owes you goes down 200&nbsp;&euro;. Nothing has been earned and nothing has been spent &mdash; so it must not touch Spending, the budget, the saving rate, or any category total.</p>
      <p class="claim">It is the app&rsquo;s first <b>transfer</b>: a movement between money you hold and money you are owed. Which is also why trying to categorise the incoming Revolut line was always going to feel wrong &mdash; there is no honest category for it.</p>
    </header>
    ${shots([
      { f: 'after-settle-sheet.png', label: 'Recording it — one sheet, pre-filled' },
      { f: 'after-activity-settlement.png', label: 'Where it lands in Activity' },
    ])}
    <div class="panel flag">
      <h2>Two details worth arguing about</h2>
      <ul>
        <li><b>The row is grey, not green.</b> Green means income in this app. A settlement rendering in the income colour would be the same lie in a new place, so it renders in the neutral ink and labels itself &ldquo;settlement&rdquo;.</li>
        <li><b>The header gains a third figure, quietly.</b> &ldquo;3,380&euro; in &middot; 589&euro; out &middot; <b>200&euro; settled</b>&rdquo;. In and out stay clean; the settled amount is visible but stands outside them. The day-band total ignores it too.</li>
      </ul>
      <h3>And the part that needs your decision</h3>
      <p>The sheet asks which account it landed in, so your Revolut balance stays right. If bank feeds ever arrive, that incoming 200&nbsp;&euro; gets <b>matched</b> to this settlement and marked as already-known &mdash; never categorised.</p>
    </div>
  </section>

  <hr class="rule">

  <section class="block">
    <header class="block-head">
      <p class="eyebrow is-new">The structured view</p>
      <h2>&ldquo;All items&rdquo; — the full ledger behind the balance</h2>
      <p class="claim">Opened from the <b>balance card on the shared Dashboard</b> &mdash; its back button returns there. Nothing about this screen lives in Settings; Settings never holds anything you read. Every shared item, both directions, with settlements in the same stream so you can watch the number come down.</p>
    </header>
    <div class="anno">
      ${frame('after-allitems.png', 'All items — one tap from the balance card')}
      <ul class="zones">
        <li>
          <h4>The balance rides along, compact</h4>
          <p>The big hero stayed on the Dashboard; here a slim bar restates &ldquo;Giulia owes you 347.00&nbsp;&euro;&rdquo; and keeps Settle up in reach. Never a bare signed number &mdash; the direction flips to &ldquo;You owe Giulia&rdquo; when it goes the other way.</p>
        </li>
        <li>
          <h4>Months are groups, not filters</h4>
          <p>Each month is a section with its own subtotal &mdash; &ldquo;AUGUST&nbsp;&middot;&nbsp;+417.50 to the balance&rdquo; &mdash; and scrolling walks back through them. The balance runs <i>through</i> the months until a settlement cuts it; that is the difference between this list and every other list in the app.</p>
        </li>
        <li>
          <h4>Both directions in one list</h4>
          <p>Blue raises what she owes you (you fronted it), grey brings it down (she fronted it, or she paid you back). Electricity at &minus;45 is her paying for something of yours &mdash; the same event as a settlement, just smaller.</p>
        </li>
        <li>
          <h4>Settlements sit in the same stream</h4>
          <p>&ldquo;Settled up &middot; received to Revolut &middot; &minus;200.00&rdquo; reads as one more line in the ledger, not a separate history. July&rsquo;s label says &ldquo;settled&rdquo; where August&rsquo;s shows a subtotal.</p>
        </li>
        <li>
          <h4>Sub-line always states the arithmetic</h4>
          <p><b>&ldquo;You paid 70.00&euro; &middot; half yours&rdquo;</b> &mdash; so no row is ever a number you have to trust. This is where the Esselunga 70/35 lives.</p>
        </li>
      </ul>
    </div>
    ${shots([{ f: 'after-allitems-scrolled.png', label: 'Scrolled — months stack, settlements interleave' }], 'solo')}
  </section>

  <hr class="rule">

  <section class="block">
    <header class="block-head">
      <p class="eyebrow is-new">Two accounts, two devices</p>
      <h2>Giulia spends 60&nbsp;&euro; at Esselunga. What actually crosses?</h2>
      <p class="claim">One record, published by her, read by both. Each app then keeps its <b>own</b> private copy of just your half, filed in your own categories. Neither app ever sees the other&rsquo;s ordinary spending &mdash; not as a setting, but because nothing else is ever written to the shared row.</p>
    </header>

    <figure class="dia">
      <svg viewBox="0 0 940 404" role="img" aria-label="Giulia's shared 60 euro grocery becomes one shared record and one 30 euro read-only copy in Pietro's app; each person's other spending never leaves their own device.">
        <defs>
          <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="var(--accent)"/>
          </marker>
          <marker id="ahg" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" opacity=".6"/>
          </marker>
        </defs>

        <text class="lbl" x="136" y="18" text-anchor="middle">GIULIA&rsquo;S APP &middot; HER ACCOUNT</text>
        <text class="lbl" x="470" y="18" text-anchor="middle">SHARED LEDGER &middot; HOUSEHOLD ROW</text>
        <text class="lbl" x="804" y="18" text-anchor="middle">YOUR APP &middot; YOUR ACCOUNT</text>

        <rect class="bx" x="24" y="34" width="224" height="118" rx="12"/>
        <text class="tb" x="42" y="60">Esselunga</text>
        <text class="t" x="42" y="82">60.00 &euro; &middot; she paid</text>
        <text class="tm" x="42" y="104">category: Spesa</text>
        <text class="tm" x="42" y="124">marked shared, 50/50</text>
        <text class="tm" x="42" y="144">counts 30.00 &euro; for her</text>

        <line class="lnacc" x1="248" y1="93" x2="350" y2="93" marker-end="url(#ah)"/>
        <text class="lbl acc" x="299" y="84" text-anchor="middle">PUBLISHES</text>

        <rect class="bx" x="358" y="34" width="224" height="118" rx="12"/>
        <text class="tb" x="376" y="60">shared item</text>
        <text class="tm" x="376" y="82">payer: giulia</text>
        <text class="tm" x="376" y="102">amount: 60.00 EUR</text>
        <text class="tm acc" x="376" y="122">categoryKey: groceries</text>
        <text class="tm" x="376" y="142">split: equal, 2</text>

        <line class="lnacc" x1="582" y1="93" x2="684" y2="93" marker-end="url(#ah)"/>
        <text class="lbl acc" x="633" y="84" text-anchor="middle">PROJECTS</text>

        <rect class="bx" x="692" y="34" width="224" height="118" rx="12"/>
        <text class="tb" x="710" y="60">Esselunga</text>
        <text class="t" x="710" y="82">30.00 &euro; &middot; your share</text>
        <text class="tm acc" x="710" y="104">category: Groceries</text>
        <text class="tm" x="710" y="124">read-only replica</text>
        <text class="tm" x="710" y="144">counts in your Dashboard</text>

        <line class="ln" x1="470" y1="152" x2="470" y2="196" marker-end="url(#ahg)"/>
        <rect class="b" x="358" y="200" width="224" height="56" rx="12"/>
        <text class="tb" x="470" y="224" text-anchor="middle">balance</text>
        <text class="tm" x="470" y="244" text-anchor="middle">you owe Giulia 30.00 &euro;</text>

        <rect class="b" x="24" y="300" width="224" height="72" rx="12"/>
        <text class="tb" x="42" y="326">her other spending</text>
        <text class="tm" x="42" y="348">salary, her clothes,</text>
        <text class="tm" x="42" y="364">her budget, her accounts</text>

        <rect class="b" x="692" y="300" width="224" height="72" rx="12"/>
        <text class="tb" x="710" y="326">your other spending</text>
        <text class="tm" x="710" y="348">salary, tennis, Apple,</text>
        <text class="tm" x="710" y="364">your budget, your accounts</text>

        <line class="dash" x1="248" y1="336" x2="330" y2="336"/>
        <line class="xm" x1="342" y1="328" x2="358" y2="344"/>
        <line class="xm" x1="358" y1="328" x2="342" y2="344"/>
        <line class="dash" x1="692" y1="336" x2="610" y2="336"/>
        <line class="xm" x1="582" y1="328" x2="598" y2="344"/>
        <line class="xm" x1="598" y1="328" x2="582" y2="344"/>
        <text class="lbl" x="470" y="380" text-anchor="middle">NEVER WRITTEN TO THE SHARED ROW</text>
      </svg>
      <figcaption>One 60&nbsp;&euro; record, published once by whoever paid. Each side keeps a private 30&nbsp;&euro; copy in its own categories; everything else stays on the device that entered it.</figcaption>
    </figure>

    <header class="block-head">
      <h3>The category problem solves itself &mdash; mostly</h3>
      <p class="claim">I went looking for how bad this would be and found the app already answered it. Her starter categories are seeded from the same table as yours, and <b>the id survives translation</b>: in <code>categories.ts</code> the Italian &ldquo;Spesa&rdquo; is literally <code>id: 'groceries'</code>, &ldquo;Casa&rdquo; is <code>id: 'housing'</code>. The internal id is already a language-independent semantic key, so the common categories pair themselves with no configuration and no string matching.</p>
      <p class="claim">Only categories somebody <i>invented</i> need a decision &mdash; those get <code>category-1723480915</code>, which means nothing across accounts. Those land in a &ldquo;needs you&rdquo; list, with a suggestion drawn from the lucide icon name, which is also language-independent.</p>
    </header>
    ${shots([
      { f: 'after-mapping.png', label: 'Her categories, mapped to yours' },
      { f: 'after-pair.png', label: 'Connecting the two accounts' },
    ])}

    <header class="block-head">
      <h3>Her entry, in your Activity</h3>
      <p class="claim">It shows as your 30&nbsp;&euro; in your Groceries, with her avatar on the tile. Tapping it explains the arithmetic and draws a firm line: <b>the amount, date and split are hers; the category is yours.</b> You can re-file it into any category you like without touching anything on her device.</p>
    </header>
    ${shots([
      { f: 'after-activity-hers.png', label: 'In your list — 30€, marked as hers' },
      { f: 'after-hers-detail.png', label: 'Tapped — read-only, except the category' },
    ])}

    <div class="panel">
      <h2>What the shared row holds</h2>
      <div class="ledgerline">SharedItem {
  id, householdId, authorId, payerId
  date, description, amount, currency
  categoryKey      // 'groceries' — the seed id, identical in both languages
  categoryHint?    // { name, icon } — only for categories someone invented
  subcategory?, split, updatedAt, deletedAt?
}</div>
      <ul>
        <li><b>Row-level security does the privacy, not the UI.</b> Members can read the household&rsquo;s items; only the author can write theirs. There is no code path that could leak the rest of a ledger because the rest of the ledger is never in this table.</li>
        <li><b>Replicas are rebuilt, never merged.</b> Your local copy of her 30&nbsp;&euro; is derived from the shared stream on every sync rather than three-way merged. That removes the entire class of conflicts between her edit and your stale copy — there is nothing of yours to conflict with. It is also what makes her edits and deletions land on your device without a single prompt.</li>
        <li><b>Settlements are immutable checkpoints.</b> Each stores the balance it closed. The reconciler never rewrites a closed item — it emits an adjustment against the open balance instead, so a figure someone already transferred against cannot change under them.</li>
        <li><b>Category resolution, in order:</b> her <code>categoryKey</code> matches one of your ids → done; else your saved mapping for her custom category → done; else park it in &ldquo;needs you&rdquo;, suggest by icon, and file under Others meanwhile so no money goes missing from your totals.</li>
        <li><b>Disconnecting does not delete history.</b> Replicas are frozen into ordinary local transactions on unlink, so neither of you loses months of spending because the other left.</li>
      </ul>
    </div>
  </section>

  <hr class="rule">

  <section class="block">
    <header class="block-head">
      <p class="eyebrow">Supporting evidence</p>
      <h2>What the split buys the rest of the app</h2>
      <p class="claim">You are right that you could type 35&nbsp;&euro; yourself and these screens would look the same. The reason not to is that the 35&nbsp;&euro; you did <i>not</i> pay would then exist nowhere &mdash; and you would be back to remembering it.</p>
      <p class="claim">The scenario below is the one already in your sample data: <b>Monthly rent, &minus;900&nbsp;&euro;, recurring, Housing</b>, split 50/50.</p>
    </header>
    ${shots([
      { f: 'before-dashboard.png', label: 'Dashboard today', tone: 'now' },
      { f: 'after-dashboard.png', label: 'With shared', tone: 'next' },
    ])}
    ${deltas([
      ['Spending', '1,039€', '589€'],
      ['Savings', '2,341€', '2,791€'],
      ['Saving rate', '69%', '83%'],
      ['Budget used', '47%', '27%'],
      ['Daily allowance', '64€', '89€'],
      ['Housing', '900€', '450€'],
    ])}
    ${shots([
      { f: 'before-activity.png', label: 'Activity today', tone: 'now' },
      { f: 'after-activity.png', label: 'With shared', tone: 'next' },
    ])}
    ${shots([
      { f: 'before-trend.png', label: 'Trend today', tone: 'now' },
      { f: 'after-trend.png', label: 'With shared', tone: 'next' },
    ])}
    ${deltas([
      ['Total spent', '20,062€', '16,462€'],
      ['Monthly average', '2,718€', '2,268€'],
      ['Housing share', '33%', '20%'],
    ])}
    <p class="claim">On Trend I adjusted the totals and the Housing row by hand; the chart curve and the year-on-year line above it would also move and I have not recomputed those. Every other number on this page is arithmetic on the real dataset.</p>

    <header class="block-head">
      <h3>Entry stays exactly as fast</h3>
      <p class="claim">Housing is marked shared once, in Settings. Logging the rent is the same number of taps as today &mdash; the chip states what will be recorded rather than asking a question. Tap it only to override this one time.</p>
    </header>
    ${shots([
      { f: 'before-add.png', label: 'Add today', tone: 'now' },
      { f: 'after-add-chip.png', label: 'With shared', tone: 'next' },
      { f: 'after-add-split-open.png', label: 'Chip tapped, to override once', tone: 'next' },
    ], 'trio')}
    ${shots([
      { f: 'after-settings.png', label: 'One new Settings row' },
      { f: 'after-settings-shared-slim.png', label: 'Setup only — no ledger, no balance' },
    ])}
    <p class="claim">Settings keeps exactly what you configure once and then forget: who you are connected to, the default split, which categories are always shared, her categories to map, whether a balance is kept, and how to disconnect. Everything you <i>read</i> moved to the Dashboard.</p>
  </section>

  <hr class="rule">

  <section class="panel">
    <h2>Five things I got wrong before, now corrected</h2>
    <ul>
      <li><b>The shared view was buried in Settings.</b> It is a thing you <i>read</i>, often, so it belongs where you already look &mdash; the Dashboard, behind a header switcher that does not exist at all until a household does. Settings keeps only the setup.</li>
      <li><b>I bound the shared view&rsquo;s time to settlements.</b> The &ldquo;Since 28 Jul&rdquo; pill broke the app&rsquo;s one navigation habit. Months navigate in the shared view exactly as everywhere else; only the balance ignores them, in its own card marked <i>running</i>.</li>
      <li><b>The balance is not optional.</b> I had &ldquo;track who owes whom&rdquo; off by default. If it is off, you are right that the feature is pointless &mdash; you may as well type 35&nbsp;&euro;. It should default <b>on</b>. The off state survives for exactly one case: a joint account you both fund, where costs are shared but nothing is ever owed.</li>
      <li><b>Settlements do not attach to individual expenses.</b> I had specced allocating a payment across specific transactions, oldest first. Your 200&nbsp;&euro; example shows why that is over-built: she pays against a <b>running balance</b>, not against the rent specifically. Settlements simply reduce the balance. That deletes a whole layer of the data model.</li>
      <li><b>A settlement is not a Transaction at all.</b> It is its own record type, in its own list, that never enters a category. That is what makes &ldquo;where does it go&rdquo; answerable instead of arbitrary.</li>
    </ul>
    <div class="ledgerline">balance = Σ(you fronted for her)  −  Σ(she fronted for you)  −  Σ(she paid you back)  +  Σ(you paid her back)</div>
  </section>

  <section class="panel flag">
    <h2>What the two-account choice costs</h2>
    <p>Choosing paired accounts settles the design and opens one real engineering bill. Today <code>user_data</code> is a single row per user, protected by row-level security, written with an optimistic version check. Households need a second, differently-shaped store beside it &mdash; not a rewrite of the first.</p>
    <ul>
      <li><b>New: a household and its items.</b> Two tables, member-scoped reads, author-scoped writes. The existing per-user sync is untouched and keeps working exactly as it does now.</li>
      <li><b>New: pairing.</b> A short-lived code, an accept step on the other device, and a consent screen that states precisely what becomes visible. This is the only genuinely new user-facing flow.</li>
      <li><b>New: the reconciler.</b> The job that turns shared items into local replicas and keeps them in step. Small, but it must be idempotent — running it twice cannot double anyone&rsquo;s groceries.</li>
      <li><b>Unchanged: everything else.</b> Every screen in this page&rsquo;s &ldquo;supporting evidence&rdquo; section works off the ordinary transaction list, so the split, the ledger and the settlement do not care whether the other person is in the app.</li>
    </ul>
    <h3>Two edges worth deciding early</h3>
    <ul>
      <li><b>Categories a language does not have.</b> <code>IT_EXPENSE['office-food']</code> is <code>null</code> &mdash; the Italian starter set drops it deliberately. Share an Office Food item and her app has no home for it, so it lands in her &ldquo;needs you&rdquo; list. The code already tracks this set in <code>droppedCategoryIdsFor</code>.</li>
      <li><b>Different home currencies.</b> Each side locks its own <code>baseAmount</code> at its own rate, and the share travels as a ratio rather than a converted figure &mdash; so neither of you inherits the other&rsquo;s FX assumptions.</li>
    </ul>
  </section>
</div>`;

writeFileSync(new URL('./shared-mockups.html', import.meta.url).pathname, html);
console.log('wrote', (html.length / 1e6).toFixed(2), 'MB');
