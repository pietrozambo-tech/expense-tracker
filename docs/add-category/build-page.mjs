// Assembles the review page from the shots taken by shoot.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const img = (f) => `data:image/png;base64,${readFileSync(join(here, 'shots', f)).toString('base64')}`;
const strip = (files) =>
  `<div class="strip">${files.map((f) => `<img src="${img(f)}" alt="" loading="lazy">`).join('')}</div>`;
const shot = (f, cap, tone = '') =>
  `<figure class="shot ${tone}"><img src="${img(f)}" alt="${cap.replace(/<[^>]+>/g, '')}" loading="lazy"><figcaption>${cap}</figcaption></figure>`;

const html = `<title>Categoria al volo</title>
<style>
:root{
  --ground:#E9EAEE; --surface:#FFFFFF; --sunk:#DEDFE4;
  --ink:#15161A; --ink-2:#63666F; --ink-3:#8A8D96; --line:#D0D2D9;
  --accent:#4F74F3; --flag:#C2352B; --good:#15803D;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --ground:#121317; --surface:#1C1D22; --sunk:#17181C;
    --ink:#EFF0F3; --ink-2:#9A9DA7; --ink-3:#797C85; --line:#2C2E34;
    --accent:#8AA4FF; --flag:#FF7A6E; --good:#4ADE80;
  }
}
:root[data-theme="dark"]{
  --ground:#121317; --surface:#1C1D22; --sunk:#17181C;
  --ink:#EFF0F3; --ink-2:#9A9DA7; --ink-3:#797C85; --line:#2C2E34;
  --accent:#8AA4FF; --flag:#FF7A6E; --good:#4ADE80;
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.62;-webkit-font-smoothing:antialiased}
.wrap{max-width:1120px;margin:0 auto;padding:52px 22px 90px;display:flex;flex-direction:column;gap:14px}
.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-3);margin:0 0 9px}
h1{font-size:clamp(30px,5vw,42px);line-height:1.08;letter-spacing:-.022em;margin:0 0 14px;text-wrap:balance;font-weight:760}
h2{font-size:clamp(20px,2.6vw,25px);line-height:1.18;letter-spacing:-.014em;margin:0 0 10px;text-wrap:balance;font-weight:700}
h3{font-size:16px;margin:0 0 6px;font-weight:680;letter-spacing:-.005em}
p{margin:0 0 12px;max-width:66ch}
p:last-child{margin-bottom:0}
em{font-style:italic}
section{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:30px 30px 32px}
.lede{font-size:18px;color:var(--ink-2);max-width:60ch}
.masthead{background:none;border:0;padding:0 0 12px}

.rail{display:grid;gap:26px;margin-top:20px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}
.rail.one{grid-template-columns:minmax(0,300px)}
.shot{margin:0;display:flex;flex-direction:column;gap:10px}
.shot img{width:100%;height:auto;display:block;border-radius:16px;border:1px solid var(--line);background:#fff}
.shot figcaption{font-size:13.5px;color:var(--ink-2);line-height:1.45}
.shot.pick img{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 22%,transparent)}
.shot.pick figcaption b{color:var(--accent)}

.strip{display:flex;flex-direction:column;gap:14px;margin-top:20px;max-width:520px}
.strip img{width:100%;height:auto;display:block;border-radius:12px;border:1px solid var(--line)}

.args{display:grid;gap:22px;margin-top:22px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.arg{border-top:2px solid var(--line);padding-top:13px}
.arg.pick{border-top-color:var(--accent)}
.arg .tag{font-family:var(--mono);font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-3);display:block;margin-bottom:7px}
.arg.pick .tag{color:var(--accent)}
.pro,.con{display:flex;gap:9px;font-size:14.5px;color:var(--ink-2);margin:0 0 8px;line-height:1.5;max-width:none}
.pro::before{content:"+";color:var(--good);font-weight:800;flex:0 0 auto;font-family:var(--mono)}
.con::before{content:"\\2212";color:var(--flag);font-weight:800;flex:0 0 auto;font-family:var(--mono)}

.steps{list-style:none;counter-reset:s;padding:0;margin:22px 0 0;display:flex;flex-direction:column;gap:11px;max-width:66ch}
.steps li{display:grid;grid-template-columns:22px 1fr;gap:12px;font-size:15px;color:var(--ink-2);line-height:1.55}
.steps li::before{counter-increment:s;content:counter(s);font-family:var(--mono);font-size:11px;font-weight:700;color:var(--ink-3);border:1px solid var(--line);border-radius:6px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;margin-top:3px}
.steps b{color:var(--ink);font-weight:650}

.rules{list-style:none;padding:0;margin:18px 0 0}
.rules li{display:grid;grid-template-columns:minmax(150px,auto) 1fr;gap:6px 22px;padding:13px 0;border-top:1px solid var(--line);align-items:baseline}
.rules li:first-child{border-top:0;padding-top:4px}
.rules b{font-size:14px;font-weight:650;color:var(--ink)}
.rules span{font-size:14.5px;color:var(--ink-2);line-height:1.5}
@media (max-width:620px){.rules li{grid-template-columns:1fr;gap:2px}}

.qs{counter-reset:q;list-style:none;padding:0;margin:18px 0 0;display:flex;flex-direction:column;gap:18px}
.qs li{display:grid;grid-template-columns:30px 1fr;gap:14px;align-items:start}
.qs li::before{counter-increment:q;content:counter(q);font-family:var(--mono);font-size:12px;font-weight:700;color:var(--accent);background:color-mix(in srgb,var(--accent) 13%,transparent);border-radius:8px;width:30px;height:30px;display:flex;align-items:center;justify-content:center}
.qs p{font-size:14.5px;color:var(--ink-2);margin:0}
.qs .lean{font-size:13.5px;color:var(--ink-3);margin-top:6px}
.qs .lean b{color:var(--ink-2);font-weight:650}
code{font-family:var(--mono);font-size:.88em;background:var(--sunk);padding:1px 5px;border-radius:5px}
</style>

<div class="wrap">

<header class="masthead">
  <p class="eyebrow">TracklyLab &middot; proposta di design</p>
  <h1>Creare una categoria senza uscire da &ldquo;Nuova spesa&rdquo;</h1>
  <p class="lede">Stai scrivendo una spesa, scorri le categorie e quella che ti serve non c&rsquo;&egrave;.
  Oggi devi chiudere il movimento a met&agrave;, andare in Impostazioni, crearla, tornare indietro e
  riscrivere tutto. Sotto: dove mettere la via d&rsquo;uscita, cosa deve chiedere, e le regole che la
  rendono sicura.</p>
</header>

<section>
  <p class="eyebrow">Il punto in cui si sente la mancanza</p>
  <h2>Oggi: la griglia finisce e basta</h2>
  <p>Hai gi&agrave; scritto importo e descrizione. Hai scorso fino in fondo. &ldquo;Barbiere&rdquo; non
  esiste, e la schermata non offre nulla: l&rsquo;unica mossa &egrave; buttare via quello che hai scritto.</p>
  <div class="rail one">
    ${shot('01-today.png', 'La griglia finisce con Viaggi. Non c&rsquo;&egrave; nessun modo di continuare.')}
  </div>
</section>

<section>
  <p class="eyebrow">Prima decisione</p>
  <h2>Dove sta il &ldquo;+&rdquo; &mdash; deciso: A</h2>
  <p>Due posti possibili, e la scelta non era estetica: cambia quanto &egrave; probabile che uno lo trovi
  nel momento in cui gli serve, e quanto &egrave; probabile che lo prema per sbaglio. Va nella griglia.
  B resta qui perch&eacute; il suo argomento &mdash; non toccare l&rsquo;area di tocco delle categorie &mdash;
  &egrave; quello che dovremo guardare se qualcuno si lamenta di tocchi sbagliati.</p>
  <div class="rail">
    ${shot('02-plus-tile.png', '<b>A</b> &mdash; ultima casella della griglia, tratteggiata e senza colore.', 'pick')}
    ${shot('06-label-variant.png', '<b>B</b> &mdash; una pill accanto all&rsquo;etichetta, come quella dell&rsquo;ordinamento.')}
  </div>
  <div class="args">
    <div class="arg pick">
      <span class="tag">A &middot; nella griglia &mdash; scelta</span>
      <p class="pro">&Egrave; esattamente dove guardi quando ti accorgi che manca: hai finito di scorrere, e la lista continua con il modo di allungarla.</p>
      <p class="pro">Si legge come parte dell&rsquo;elenco, non come un&rsquo;impostazione.</p>
      <p class="con">Sta dentro l&rsquo;area di tocco della griglia: chi allunga il pollice verso l&rsquo;ultima categoria vera pu&ograve; prenderla. Mitigato dall&rsquo;essere sempre ultima e visivamente diversa &mdash; tratteggio, nessun colore.</p>
    </div>
    <div class="arg">
      <span class="tag">B &middot; accanto all&rsquo;etichetta &mdash; scartata</span>
      <p class="pro">Non tocca la griglia: zero rischio di tocco sbagliato fra le categorie.</p>
      <p class="pro">Eredita una posizione gi&agrave; stabilita, quella della pill A-Z.</p>
      <p class="con">Sta in cima, ma la mancanza si sente in fondo: con quattordici categorie ci sei passato sopra prima di accorgerti del buco.</p>
      <p class="con">Due pill sulla stessa riga rendono l&rsquo;etichetta un pannello di controllo.</p>
    </div>
  </div>
</section>

<section>
  <p class="eyebrow">Seconda decisione</p>
  <h2>Cosa chiede il foglio &mdash; nome, icona, colore</h2>
  <p>Una riga per <em>cosa &egrave;</em> &mdash; icona e nome insieme, non un&rsquo;anteprima che ripete il
  campo sotto &mdash; poi le due sole cose che vale la pena cambiare, poi un bottone. Il tipo non viene
  chiesto: lo decide lo switch Spesa/Entrata che hai gi&agrave; davanti, e il foglio lo dichiara in alto a
  destra cos&igrave; non finisce nella lista sbagliata in silenzio.</p>
  <p>Il nome &egrave; l&rsquo;unico campo obbligatorio. Icona e colore hanno gi&agrave; un valore: chi ha
  fretta scrive e conferma, chi ci tiene tocca due volte in pi&ugrave;.</p>
  <p>Se il nome esiste gi&agrave;, una riga sotto il campo lo dice prima di creare niente &mdash;
  <em>&ldquo;Ce l&rsquo;hai gi&agrave;: la scelgo io&rdquo;</em> &mdash; e il bottone diventa
  &ldquo;Usa quella&rdquo;. In silenzio sembrerebbe che il bottone non abbia funzionato.</p>
  <div class="rail one">
    ${shot('03-sheet.png', 'Nome, icona, colore, un bottone. Il tag SPESA dice dove andr&agrave; a finire.')}
  </div>
</section>

<section>
  <p class="eyebrow">Terza decisione &mdash; la parte pi&ugrave; delicata</p>
  <h2>La sottocategoria non merita un foglio</h2>
  <p>Una sottocategoria &egrave; una parola. Aprire un overlay per farsi dare una parola &egrave; il churn
  che stiamo cercando di togliere, non di spostare. Quindi non si apre niente: la chip stessa diventa il
  campo, dov&rsquo;&egrave;.</p>
  ${strip(['sub-01.png', 'sub-02.png', 'sub-03.png'])}
  <ol class="steps">
    <li><b>A riposo</b> una chip tratteggiata in fondo alle altre, pi&ugrave; leggera perch&eacute; non &egrave; una scelta ma un modo di farne una.</li>
    <li><b>La tocchi</b> e diventa un campo <em>in quel punto</em>: la tastiera sale, il cursore &egrave; dentro, le altre chip non si spostano. Nessun pannello copre il movimento che stai scrivendo.</li>
    <li><b>Scrivi</b> e dentro il campo compare un &#10003;.</li>
    <li><b>Confermi</b> in due modi che valgono uguale: tocchi il &#10003;, oppure premi il tasto invio della tastiera &mdash; su iOS dice &ldquo;a capo&rdquo;, su Android &egrave; la freccia. Il &#10003; c&rsquo;&egrave; proprio perch&eacute; &ldquo;premi invio&rdquo; non si vede: &egrave; l&rsquo;affordance visibile, il tasto &egrave; la scorciatoia per chi scrive veloce.</li>
    <li><b>Fatto</b> la chip esiste, &egrave; gi&agrave; selezionata, e &ldquo;Aggiungi&rdquo; ricompare dopo di lei per farne subito un&rsquo;altra.</li>
  </ol>
</section>

<section>
  <p class="eyebrow">Dopo</p>
  <h2>Torni dove eri, con la categoria gi&agrave; scelta</h2>
  <p>Il foglio si chiude, la categoria nuova &egrave; nella griglia <em>ed &egrave; selezionata</em> &mdash;
  l&rsquo;hai creata per usarla adesso, chiedertelo di nuovo sarebbe la beffa. Importo, descrizione, data e
  conto sono intatti: la schermata non &egrave; mai stata smontata, il foglio le stava sopra.</p>
  <div class="rail one">
    ${shot('04-created.png', 'Barbiere esiste, &egrave; scelta, e il suo pannello sottocategorie &egrave; gi&agrave; aperto.')}
  </div>
</section>

<section>
  <p class="eyebrow">Il contorno</p>
  <h2>Le regole che lo rendono sicuro</h2>
  <p>Sono queste, non il disegno, la parte che pu&ograve; fare danni. Le scrivo perch&eacute; siano decise
  adesso e non scoperte dopo.</p>
  <ul class="rules">
    <li><b>Nome gi&agrave; esistente</b><span>&ldquo;Barbiere&rdquo; c&rsquo;&egrave; gi&agrave; pi&ugrave; in alto e non l&rsquo;hai vista. Non ne crea una seconda: seleziona quella che c&rsquo;&egrave;. Confronto senza distinzione fra maiuscole e spazi.</span></li>
    <li><b>Tipo</b><span>Segue lo switch Spesa/Entrata e lo dice. Una categoria di entrata finita nella lista delle spese &egrave; sbagliata su ogni riga futura.</span></li>
    <li><b>Annulla</b><span>X, tocco fuori o gesto indietro: non crea niente, e il movimento resta esattamente com&rsquo;era.</span></li>
    <li><b>Tasto indietro</b><span>Chiude il foglio, non la schermata di aggiunta sotto. &Egrave; il punto in cui si perde tutto se sbagliamo l&rsquo;annidamento.</span></li>
    <li><b>Ordinamento &ldquo;Pi&ugrave; usate&rdquo;</b><span>Una categoria nuova ha zero usi e finirebbe in fondo, lontano da dove stavi guardando. Va tenuta a vista finch&eacute; sei su questo movimento.</span></li>
    <li><b>Offline</b><span>Si crea comunque sul telefono e si sincronizza dopo. Nessuna attesa: qui il server non deve vederla, a differenza dell&rsquo;import.</span></li>
    <li><b>Ricorrenze</b><span>Ce l&rsquo;ha anche l&rsquo;editor delle ricorrenze: stessa griglia, stesso bisogno. &Egrave; lo stesso componente, quindi &egrave; un parametro in pi&ugrave;, non una seconda schermata da mantenere.</span></li>
    <li><b>Vale per tutta l&rsquo;app</b><span>Una categoria creata da Aggiungi o da Ricorrenze &egrave; una categoria: compare subito ovunque &mdash; l&rsquo;altra schermata, Impostazioni, i filtri di Attivit&agrave;. Non esiste una categoria &ldquo;locale a questo movimento&rdquo;.</span></li>
  </ul>
</section>

<section>
  <p class="eyebrow">Deciso</p>
  <h2>Quello che &egrave; gi&agrave; fissato</h2>
  <ul class="rules">
    <li><b>Il &ldquo;+&rdquo;</b><span>Ultima casella della griglia (A). Un solo punto d&rsquo;ingresso: due sarebbero churn.</span></li>
    <li><b>Il foglio</b><span>Nome, icona e colore. Il tipo lo decide lo switch Spesa/Entrata e viene dichiarato, non chiesto.</span></li>
    <li><b>Nome duplicato</b><span>Detto, non silenzioso: una riga sotto il campo, e il bottone diventa &ldquo;Usa quella&rdquo;.</span></li>
    <li><b>Dove vive</b><span>Aggiungi <em>e</em> Ricorrenze. Quello che si crea da una delle due esiste in tutta l&rsquo;app.</span></li>
  </ul>
</section>

<section>
  <p class="eyebrow">Le due cose ancora aperte</p>
  <h2>Cosa succede a quello che hai scritto e non hai confermato</h2>
  <ol class="qs">
    <li><div>
      <h3>Scrivi &ldquo;Piega&rdquo; e tocchi altrove senza confermare</h3>
      <p>Per esempio tocchi dritto su &ldquo;Salva Spesa&rdquo;. Due comportamenti possibili, e nessuno dei due &egrave; gratis.</p>
      <p class="lean"><b>Si crea lo stesso.</b> Niente di scritto va perso. Il rischio &egrave; una chip &ldquo;Pie&rdquo; nata da un tocco distratto &mdash; brutta, ma si cancella in due tocchi da Impostazioni.</p>
      <p class="lean"><b>Si perde.</b> Nessuna spazzatura. Il rischio &egrave; che scrivi, tocchi Salva, e la sottocategoria sparisce in silenzio proprio nel momento del salvataggio: esattamente il tipo di perdita muta che abbiamo passato la giornata a togliere dall&rsquo;import.</p>
      <p class="lean">Io farei la <b>prima</b>: una parola persa nel momento del salvataggio non si recupera, una chip di troppo s&igrave;.</p>
    </div></li>
    <li><div>
      <h3>Crei la categoria e poi chiudi la spesa senza salvarla</h3>
      <p>&ldquo;Barbiere&rdquo; resta, perch&eacute; creare una categoria &egrave; un&rsquo;azione a s&eacute; e non un pezzo del movimento. Coerente con la regola qui sopra, ma vale la pena dirlo ad alta voce: chi tocca la X si aspetta che la schermata non lasci tracce.</p>
      <p class="lean">Io la <b>terrei</b> e non direi niente: l&rsquo;hai creata apposta, e un annullamento a cascata sorprende di pi&ugrave; di una categoria in pi&ugrave;.</p>
    </div></li>
  </ol>
</section>

</div>`;

writeFileSync(join(here, 'review.html'), html);
console.log('written', (html.length / 1024).toFixed(0), 'KB');
