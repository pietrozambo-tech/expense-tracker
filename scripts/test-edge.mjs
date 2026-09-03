// The convert-import Edge Function, without a deploy.
//
//   pnpm test:edge
//
// The function is one file because the Supabase dashboard editor deploys one
// file, which means it cannot import anything the app already tests. So the
// parts of it that can be wrong quietly are fenced between "#region" markers,
// and this suite lifts those regions out and runs them - the same arrangement
// admin-stats uses for its arithmetic.
//
// Three things are checked, and each of them has a specific failure in mind:
//
//   the copy      The instructions inside the function are generated from
//                 src/app/lib/importPrompt.ts. Stale is easy to ship and
//                 impossible to see, so staleness is a failing test - and the
//                 copy is rendered and compared against what the app renders,
//                 through a second, independent build, because a bundler that
//                 reformatted a template literal would rewrite the prompt
//                 without changing a line of source.
//   the shape     What the caller may assert, and - the reason this feature
//                 exists - the trip name being written by the app rather than
//                 taken from the answer.
//   the stream    The scanner that pulls finished rows out of a half-written
//                 answer, which draws the waiting screen. A brace counter that
//                 miscounts a "}" inside a description corrupts exactly the
//                 thing it is there to show.
import { execFileSync } from 'node:child_process';
import { globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderFile, targetPath } from './build-edge-prompt.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = globSync(join(root, 'node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild'))[0];
if (!esbuild) {
  console.error('edge-test: esbuild binary not found under node_modules/.pnpm');
  process.exit(1);
}

const fn = readFileSync(targetPath, 'utf8');

// ── the copy is current ───────────────────────────────────────────────────
if (renderFile() !== fn) {
  console.log('FAIL  the function is carrying a stale copy of the instructions - run `pnpm build:edge-prompt`');
  console.log('\n1 FAILED');
  process.exit(1);
}
console.log('PASS  the function is carrying the current instructions');

// ── it is still a file that parses ────────────────────────────────────────
// Nothing else here compiles the whole thing: the regions are lifted out and
// run in isolation, so a broken line in the half between them would reach the
// dashboard editor and only announce itself on deploy. This transforms the
// file as a whole - no bundling, so the remote imports are left alone.
{
  const scratch = mkdtempSync(join(tmpdir(), 'edge-parse-'));
  try {
    execFileSync(process.execPath, [
      esbuild, targetPath, '--format=esm', '--target=es2022',
      `--outfile=${join(scratch, 'parsed.mjs')}`, '--log-level=warning',
    ], { stdio: 'inherit' });
    console.log('PASS  and it is still a file the runtime can parse');
  } catch {
    console.log('FAIL  the function no longer parses');
    process.exit(1);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** One fenced region, insisting there is exactly one of it. */
function region(name) {
  const open = `// #region ${name}`;
  const close = `// #endregion ${name}`;
  const at = (marker) => {
    const re = new RegExp(`^${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gm');
    const hits = [...fn.matchAll(re)];
    if (hits.length !== 1) {
      console.log(`FAIL  the "#region ${name}" fence is gone from the function - what it guards is no longer under test`);
      process.exit(1);
    }
    return hits[0].index;
  };
  return fn.slice(at(open), at(close));
}

const SURFACE = [
  'buildImportPrompt', 'TRIP_SEP', 'isTripName', 'tripBodyOf', 'travelCategoryOf',
  'Refused', 'readTrip', 'readAnswers', 'readUploads', 'shapeAnswer', 'expandRow', 'RowStream',
  'readMode', 'readSampleOf', 'factsBlock',
];

const SCENARIOS = `
import * as edge from './region';
// The app's own builder, resolved to the file that actually ships. Bundled by
// a second, independent esbuild entry: if the generator mangled the template
// literal on its way into the function, these two disagree.
import { buildImportPrompt as app } from '${join(root, 'src/app/lib/importPrompt')}';

let failed = 0;
const ok = (cond, msg) => {
  console.log(\`\${cond ? 'PASS' : 'FAIL'}  \${msg}\`);
  if (!cond) failed += 1;
};
const eq = (name, got, want) => ok(
  JSON.stringify(got) === JSON.stringify(want),
  \`\${name}\${JSON.stringify(got) === JSON.stringify(want) ? '' : \` (got \${JSON.stringify(got)}, want \${JSON.stringify(want)})\`}\`,
);

const FLAG = 'Azores \\u{1F1F5}\\u{1F1F9}';
const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_IT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

const cat = (id, name, subs = [], type = 'expense') => ({
  id, name, type, icon: 'Plane', color: 'text-sky-600',
  bgColor: 'bg-sky-50', selectedBg: 'bg-sky-100', subcategories: subs,
});
const travel = cat('travel', 'Travel', ['Hotel', 'Food', 'Flights']);
const others = cat('others', 'Others');
const salary = cat('sal', 'Salary', [], 'income');
const sources = [{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' }];
const rows = ['Cena', 'Hotel', 'Volo'].map((d, i) => ({
  id: 't' + i, date: '2026-08-2' + (i + 1), type: 'expense', amount: 20, currency: 'EUR',
  category: travel, subcategory: 'Food', description: FLAG + ' - ' + d,
}));
const input = (language) => ({
  categories: [travel, others], incomeCategories: [salary], sources, transactions: rows,
  userName: 'Pietro', userCurrency: 'EUR', defaultSourceExpense: 'cash', language,
  monthsShort: language === 'it' ? MONTHS_IT : MONTHS_EN,
});

// ── the copy renders what the app renders ─────────────────────────────────
for (const language of ['en', 'it']) {
  const mine = edge.buildImportPrompt(input(language));
  const theirs = app(input(language));
  ok(mine === theirs, \`the \${language === 'it' ? 'Italian' : 'English'} instructions are byte-identical to the app's\`);
  ok(mine.includes(\`- "\${FLAG}" (\${language === 'it' ? 'Ago' : 'Aug'} 2026)\`),
    \`and still carry the flagged trip name (\${language})\`);
}
ok(edge.buildImportPrompt(input('en')) !== edge.buildImportPrompt(input('it')),
  'the two languages are not the same string');

// ── what the caller may assert ────────────────────────────────────────────
eq('a trip with no name is read as no trip', edge.readTrip({ trip: { is_trip: true } }), { is_trip: false });
eq('a named trip survives', edge.readTrip({ trip: { is_trip: true, name: ' ' + FLAG + ' ' } }), { is_trip: true, name: FLAG });

// ── what one read is FOR ─────────────────────────────────────────────────
// A long file is read on a sample first (triage: ask now, in seconds) and
// then for real (convert: you may not ask). The two texts are the whole
// mechanism, so they are pinned here word for word where it counts.
eq('mode: unset is the old single read', edge.readMode({}), null);
eq('mode: triage', edge.readMode({ mode: 'triage' }), 'triage');
eq('mode: convert', edge.readMode({ mode: 'convert' }), 'convert');
eq('mode: anything else is ignored, not trusted', edge.readMode({ mode: 'chat' }), null);
eq('sample_of: a count', edge.readSampleOf({ sample_of: 1206 }), 1206);
eq('sample_of: garbage is zero', edge.readSampleOf({ sample_of: 'lots' }), 0);
{
  const base = { today: '2026-09-03', trip: { is_trip: false }, answers: [] };
  const plain = edge.factsBlock({ ...base, mode: null, sampleOf: 0 });
  ok(!/SAMPLE/.test(plain) && !/MAY NOT ASK/.test(plain), 'unset mode adds neither instruction');
  const triage = edge.factsBlock({ ...base, mode: 'triage', sampleOf: 1206 });
  ok(/THIS IS A SAMPLE, NOT THE FILE/.test(triage) && /1206 rows in all/.test(triage),
    'triage says it is a sample and how big the real file is');
  ok(/Do NOT convert it/.test(triage), 'and says not to convert it');
  // This scenario text is a template literal: a bare \\s here would reach the
  // generated file as a plain "s" and the regex would quietly test nothing.
  ok(/ask\\s+everything in this one round/.test(triage), 'and asks for every question at once');
  ok(/WHAT IS WORTH A QUESTION/.test(triage) && /are already fairly sure of/.test(triage),
    'and draws the line at the fork rather than at the subject - four of nine real questions were "right?"');
  ok(/FILL "file_categories" EITHER WAY/.test(triage) && /file's own words/.test(triage),
    "and asks for the file's own category words, which is what the gap screen is built from");
  const convert = edge.factsBlock({ ...base, mode: 'convert', sampleOf: 0 });
  ok(/THIS READING MAY NOT ASK/.test(convert) && /Do not set "status": "need_input"/.test(convert),
    'convert forbids need_input outright');
  ok(/convert EVERY row/.test(convert) && /"notes"/.test(convert),
    'and says what to do instead: read everything, note the doubt');
  ok(/These rows are NOT a trip/.test(convert), 'on top of the facts, not instead of them');
}
eq('no trip key at all means the question was never asked', edge.readTrip({}), null);
eq('an explicit no is not the same as silence', edge.readTrip({ trip: { is_trip: false } }), { is_trip: false });

eq('answers arrive as pairs', edge.readAnswers({ answers: [{ ask: 'Who?', answer: 'Pit' }] }), [{ ask: 'Who?', answer: 'Pit' }]);
eq('half an answer is dropped', edge.readAnswers({ answers: [{ ask: 'Who?' }, 3, null] }), []);
ok(edge.readAnswers({ answers: Array.from({ length: 40 }, () => ({ ask: 'a', answer: 'b' })) }).length === 12,
  'and there is a ceiling on how many can be sent');

// ── the files ─────────────────────────────────────────────────────────────
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const refusal = (fn) => { try { fn(); return null; } catch (e) { return e; } };

{
  // An accented CSV, decoded as UTF-8. Passed as bytes it would reach the
  // model as mojibake, and every description the user reads afterwards would
  // carry it.
  const csv = 'data,importo,descrizione\\n2026-08-03,12.50,Caffè à Ponta Delgada\\n';
  const blocks = edge.readUploads({ file: { name: 'spese.csv', media_type: 'text/csv', data: b64(csv) } });
  eq('a CSV becomes one text document', blocks.length, 1);
  ok(blocks[0].source.type === 'text' && blocks[0].source.data.includes('Caffè à Ponta Delgada'),
    'with its accents intact');
  ok(blocks[0].title === 'spese.csv', 'and its filename, so the model knows what it is looking at');
}
{
  const blocks = edge.readUploads({ file: { media_type: 'application/pdf', data: b64('%PDF-1.4 fake') } });
  ok(blocks[0].type === 'document' && blocks[0].source.media_type === 'application/pdf', 'a PDF goes as a document');
  const img = edge.readUploads({ file: { media_type: 'image/png', data: b64('fake') } });
  ok(img[0].type === 'image' && img[0].source.type === 'base64', 'a screenshot goes as an image');
}
{
  // A spreadsheet is a zip. Sent as bytes it produces a confident reading of
  // nothing, so it is refused by name rather than attempted.
  const e = refusal(() => edge.readUploads({
    file: { media_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: b64('PK') },
  }));
  ok(e && e.status === 415 && e.code === 'wrong_type', 'a spreadsheet is refused rather than guessed at');
  ok(e && /spreadsheetml/.test(e.message), 'and the refusal names the type it got');
}
{
  ok(refusal(() => edge.readUploads({}))?.code === 'no_file', 'nothing sent is refused');
  const many = Array.from({ length: 9 }, () => ({ media_type: 'text/csv', data: b64('a,b\\n1,2\\n') }));
  ok(refusal(() => edge.readUploads({ files: many }))?.code === 'too_many_files', 'nine files at once is refused');
  const huge = { media_type: 'image/png', data: 'A'.repeat(20 * 1024 * 1024) };
  ok(refusal(() => edge.readUploads({ file: huge }))?.status === 413, 'and so is a file past the size ceiling');
}

// ── the answer ────────────────────────────────────────────────────────────
const answer = (over = {}) => JSON.stringify({
  status: 'ok', notes: [], questions: [],
  transactions: [], ...over,
});
const ctx = (over = {}) => ({
  currency: 'EUR', trip: null, travel: { name: 'Travel' },
  remaining: 3, model: 'test', usage: { input: 0, output: 0 }, ...over,
});

// The wire spells rows with one-letter keys (see RECORD_SCHEMA); everything
// the caller receives spells them out. expandRow is that seam, and every
// shapeAnswer fixture below feeds the wire shape on purpose - a fixture in
// the long shape would pass against a function that forgot to expand.
{
  const out = edge.shapeAnswer(answer({
    transactions: [{ d: '2026-08-03', a: 12.5, t: 'e', c: 'Travel', s: '', x: 'Caffè', src: '', cur: '' }],
  }), ctx());
  eq('a wire row leaves saying the words, empty optionals dropped rather than passed on as blanks',
    out.payload.transactions[0],
    { date: '2026-08-03', amount: 12.5, type: 'expense', category: 'Travel', description: 'Caffè' });
  eq('and the payload is the shape buildImport already reads', [out.payload.version, out.payload.currency], [1, 'EUR']);
}
{
  eq('income says its name from one letter',
    edge.expandRow({ d: '2026-08-05', a: 50, t: 'i', c: 'Salary' }).type, 'income');
}
{
  // THE one that matters. The user tapped a chip carrying a flag; the model
  // wrote the name without it (row 1) or - as the addendum now tells it to -
  // wrote no prefix at all (row 2). The app's copy wins either way.
  const out = edge.shapeAnswer(answer({
    transactions: [
      { d: '2026-08-03', a: 12.5, t: 'e', c: 'Others', x: 'Azores - Caffè' },
      { d: '2026-08-04', a: 9, t: 'e', c: 'Travel', x: 'Pranzo' },
      { d: '2026-08-05', a: 50, t: 'i', c: 'Salary', x: 'Rimborso' },
    ],
  }), ctx({ trip: { is_trip: true, name: FLAG } }));
  const t = out.payload.transactions;
  eq('a trip name the model got wrong is replaced with the one the user tapped', t[0].description, FLAG + ' - Caffè');
  eq('a row with no prefix at all gets one - which is now the instructed shape', t[1].description, FLAG + ' - Pranzo');
  eq('and the rows are moved into the travel category, or the trip would be empty', [t[0].category, t[1].category], ['Travel', 'Travel']);
  eq('income is left alone - it is not trip spending', [t[2].description, t[2].category], ['Rimborso', 'Salary']);
}
{
  const out = edge.shapeAnswer(answer({
    transactions: [{ d: '2026-08-03', a: 12.5, t: 'e', c: 'Others', x: 'Azores - Caffè' }],
  }), ctx({ trip: { is_trip: false } }));
  eq('with no trip, nothing is rewritten', out.payload.transactions[0].description, 'Azores - Caffè');
  eq('and the category the model chose stands', out.payload.transactions[0].category, 'Others');
}
{
  const out = edge.shapeAnswer(JSON.stringify({
    status: 'need_input', notes: ['Le colonne sono quote'], transactions: [],
    questions: [{ ask: 'Quale colonna sei tu?', options: ['Pit', 'Merlo', 'Max'] }],
  }), ctx());
  eq('a model that admits it needs more comes back as a question, not an error', out.status, 'need_input');
  eq('with the answers it found in the file, ready to become chips', out.questions[0].options, ['Pit', 'Merlo', 'Max']);
  eq('and what it worked out on its own kept separate', out.notes, ['Le colonne sono quote']);
}
{
  const e = refusal(() => edge.shapeAnswer('{"status":"ok","transactions":[{"d":"2026-0', ctx()));
  ok(e && e.code === 'too_big', 'an answer cut off mid-row is named as too long, not as a parse error');
}

// ── the rows, while they are still arriving ───────────────────────────────
const stream = (chunks) => {
  const s = new edge.RowStream();
  return chunks.flatMap((c) => s.feed(c));
};
{
  const doc = '{"status":"ok","notes":[],"questions":[],"transactions":[' +
    '{"date":"2026-08-03","amount":12.5,"type":"expense","category":"Travel"},' +
    '{"date":"2026-08-04","amount":9,"type":"expense","category":"Travel"}]}';
  eq('rows come out one at a time as they close', stream([doc]).map((r) => r.date), ['2026-08-03', '2026-08-04']);
  // Split every three characters: the real stream arrives in pieces that
  // respect nothing, least of all token boundaries.
  const pieces = doc.match(/.{1,3}/gs);
  eq('and the same rows come out when the document arrives in scraps', stream(pieces).map((r) => r.date), ['2026-08-03', '2026-08-04']);
}
{
  // The one that breaks a brace counter that does not know about strings.
  // Unbalanced on purpose: a matched pair inside a description happens to
  // come out right by accident, so a test using one proves nothing. A photo
  // of a handwritten list is a supported input here, and OCR produces exactly
  // this kind of debris.
  //
  // The quote count is odd on purpose too. Escaped quotes usually arrive in
  // pairs, and a pair cancels a scanner that ignores backslashes - so a test
  // written with "Da Gino" in it passes whether or not escapes are handled.
  // One quote does not cancel.
  //
  // Written with JSON.stringify rather than by hand: this is the document the
  // API would actually send, escaping included, instead of my idea of it.
  const doc = JSON.stringify({
    transactions: [
      { date: '2026-08-03', amount: 5, description: 'Bar }Chiuso{ " 5' },
      { date: '2026-08-04', amount: 6, description: 'Cena' },
    ],
  });
  const got = stream([doc]);
  eq('a stray brace inside a description does not end a row early', got.map((r) => r.date), ['2026-08-03', '2026-08-04']);
  eq('and an escaped quote does not close the string it is inside', got[0].description, 'Bar }Chiuso{ " 5');
}
{
  const doc = '{"notes":["a {b} c"],"transactions":[{"date":"2026-08-03","amount":1}],"questions":[]}';
  eq('an object in an earlier field is not mistaken for a row', stream([doc]).map((r) => r.date), ['2026-08-03']);
}
{
  const doc = '{"transactions":[{"date":"2026-08-03","amount":1}],"questions":[{"ask":"Chi?","options":[]}]}';
  eq('and nothing after the array is read as one either', stream([doc]).map((r) => r.date), ['2026-08-03']);
}
{
  eq('an empty list yields nothing rather than throwing', stream(['{"transactions":[]}']), []);
  eq('and a document that never reaches the array yields nothing', stream(['{"status":"need']), []);
}
{
  // The stream and the seam together: the bytes the model actually writes,
  // to the shape the reading screen is actually handed.
  const doc = '{"transactions":[{"d":"2026-08-03","a":5,"t":"e","c":"Travel","x":"Caffè"}]}';
  eq('a wire row leaves the stream saying the words', stream([doc]).map(edge.expandRow)[0],
    { date: '2026-08-03', amount: 5, type: 'expense', category: 'Travel', description: 'Caffè' });
}

console.log(failed ? \`\\n\${failed} FAILED\` : '\\nthe function holds together');
process.exit(failed ? 1 : 0);
`;

const tmp = mkdtempSync(join(tmpdir(), 'edge-test-'));
let failed = 0;
try {
  writeFileSync(
    join(tmp, 'region.ts'),
    `${region('prompt')}\n${region('shape')}\n${region('rowstream')}\nexport { ${SURFACE.join(', ')} };\n`,
  );
  writeFileSync(join(tmp, 'scenarios.ts'), SCENARIOS);
  const bundle = join(tmp, 'scenarios.mjs');
  execFileSync(process.execPath, [
    esbuild, join(tmp, 'scenarios.ts'),
    '--bundle', '--format=esm', '--platform=node', `--outfile=${bundle}`, '--log-level=warning',
  ], { stdio: 'inherit' });
  execFileSync(process.execPath, [bundle], { stdio: 'inherit' });
} catch {
  failed = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

process.exit(failed);
