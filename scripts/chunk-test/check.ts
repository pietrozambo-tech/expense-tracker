// Cutting a file in half so two reads can answer it.
//
// The failure this guards against is silent and expensive: a half that
// arrives without its column header is a wall of unlabelled numbers, and the
// model's confident reading of it is wrong on every row - after the day's
// read has been spent on it.
import {
  splitLedgerText, splitForReads, sampleLedgerText, sampleForTriage, categoryGaps, countRows,
  AI_ROWS_PER_READ, AI_MAX_READS, AI_MAX_ROWS, type AiFile,
} from '../../src/app/lib/aiImport';

const fail: string[] = [];
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

const HEAD = 'Data e ora,Categoria,Conto,Importo,Valuta,Commento';
const row = (i: number) => `2026-${String((i % 12) + 1).padStart(2, '0')}-0${(i % 9) + 1},Alimentari,Principale,${10 + i},EUR,Riga ${i}`;
const sheet = (title: string, n: number, from = 0) =>
  [title, HEAD, ...Array.from({ length: n }, (_, i) => row(from + i))].join('\n');

const file = (text: string): AiFile => ({
  media_type: 'text/csv', data: '', name: 'export.csv', bytes: text.length, text,
});

// ── one file, cut in two ─────────────────────────────────────────────────
{
  const text = sheet('elenco spese per il periodo', 3000);
  const parts = splitLedgerText(text, 2)!;
  ok(parts.length === 2, 'a long export becomes two');
  const [a, b] = parts;
  ok(a.split('\n').filter((l) => /^20\d\d-/.test(l)).length === 1500
    && b.split('\n').filter((l) => /^20\d\d-/.test(l)).length === 1500,
    'split down the middle, 1500 rows apiece');
  ok(a.includes(HEAD) && b.includes(HEAD),
    'and BOTH halves carry the column header - a half without it is a wall of unlabelled numbers');
  ok(a.startsWith('elenco spese') && b.startsWith('elenco spese'),
    'the title above it rides along too, because it says what the numbers are');
  // Every row exactly once, in order, across the two.
  const back = [...a.split('\n'), ...b.split('\n')].filter((l) => /^20\d\d-/.test(l));
  ok(back.length === 3000 && new Set(back).size === 3000, 'no row is lost and none is read twice');
  ok(back[0] === row(0) && back[2999] === row(2999), 'and the order across the seam is unbroken');
}

// ── a workbook of several sheets ─────────────────────────────────────────
// xlsxToText writes "### Sheet:" blocks, each with its own columns. Cutting
// blind would hand the second half a sheet's rows without that sheet's
// header - the exact shape of the file that started all this.
{
  const text = [
    `### Sheet: Spese\n${sheet('elenco spese', 2500)}`,
    `### Sheet: Entrate\n${sheet('elenco entrate', 500, 9000)}`,
    '### Sheet: Bonifici\nelenco bonifici\nData,In uscita,In entrata',
  ].join('\n');
  const [a, b] = splitLedgerText(text, 2)!;
  ok(/### Sheet: Spese/.test(a) && /### Sheet: Spese/.test(b),
    'a sheet spanning the cut is named in both halves');
  ok((a.match(new RegExp(HEAD, 'g')) ?? []).length >= 1 && (b.match(new RegExp(HEAD, 'g')) ?? []).length >= 1,
    'with its columns repeated, not left behind in the first half');
  ok(/### Sheet: Entrate/.test(b) && !/### Sheet: Entrate/.test(a),
    'a sheet that falls entirely on one side is not mentioned on the other');
  ok(/Bonifici/.test(a) && !/Bonifici/.test(b),
    'and an empty sheet rides with the first half only, rather than being duplicated');
  const rows = [...a.split('\n'), ...b.split('\n')].filter((l) => /^20\d\d-/.test(l));
  ok(rows.length === 3000 && new Set(rows).size === 3000, 'still every row, exactly once');
}

// ── how many reads, and when to refuse ───────────────────────────────────
// The number is time, not tokens: a Supabase Edge Function is killed at 150
// seconds of wall clock and the model writes ~4 rows a second, so a read is
// sized to finish well inside that and the parts run at the same time.
{
  ok(splitForReads([file(sheet('t', 50))]) === null, 'a file that fits one read is left alone');
  ok(splitForReads([file(sheet('t', AI_ROWS_PER_READ - 5))]) === null, 'and so is one just under the line');

  const over = splitForReads([file(sheet('t', AI_ROWS_PER_READ + 10))]);
  ok(over !== null && over.length === 2, 'one row over becomes two reads, not one long one');

  // The file that started all this: 1,206 rows, five minutes in one go,
  // killed by the platform at 150 seconds with 600 rows on screen.
  const real = splitForReads([file(sheet('t', 1206))]);
  ok(real !== null && real.length === Math.ceil(1206 / AI_ROWS_PER_READ),
    `the 1,206-row export becomes ${real?.length} reads that run together, not one that cannot finish`);
  ok(real !== null && real.every((part) => countRows(part[0].text!) <= AI_ROWS_PER_READ),
    'each of them inside the size a read can answer in time');
  const every = real!.flatMap((part) => part[0].text!.split('\n')).filter((l) => /^20\d\d-/.test(l));
  ok(every.length === 1206 && new Set(every).size === 1206,
    'and between them they carry every row, exactly once');
  ok(real !== null && real.every((part) => part[0].text!.includes(HEAD)),
    'each with the column header, because a part without it is unlabelled numbers');
  ok(real !== null && real[0][0].bytes === new TextEncoder().encode(real[0][0].text!).byteLength,
    'and its own byte count, not the whole file\'s');

  ok(splitForReads([file(sheet('t', AI_MAX_ROWS + 500))])!.length === AI_MAX_READS,
    'past the ceiling the split stops widening - the refusal is readFiles\' job, before anything is claimed');

  // A photo or a PDF has no rows to cut along; half a scanned statement is
  // not a file. Those go whole and the server decides.
  const photo: AiFile = { media_type: 'image/png', data: 'x', name: 'p.png', bytes: 10, text: null };
  ok(splitForReads([file(sheet('t', AI_ROWS_PER_READ + 100)), photo]) === null,
    'a photo in the set stops the split rather than being halved');
  ok(splitLedgerText('no dates here\njust words\nand more words', 2) === null,
    'and text with no dated line has nothing to cut along');
}

// ── the sample the triage read looks at ──────────────────────────────────
// Enough to show the columns, the date format and the flavour of the
// descriptions; not enough to be worth converting. The middle is replaced
// by a line that says how much is missing, so the model knows it is a
// sample and does not report the file as 80 rows long.
{
  const text = sheet('elenco spese per il periodo', 3000);
  const s = sampleLedgerText(text)!;
  const dated = s.split('\n').filter((l) => /^20\d\d-/.test(l));
  ok(dated.length === 80, `a 3,000-row file samples to 80 rows (${dated.length})`);
  ok(dated[0] === row(0) && dated[79] === row(2999), 'the first forty and the last forty, in order');
  ok(s.includes(HEAD) && s.includes('elenco spese'), 'under the same title and column header as the file');
  ok(/2920 rows left out/.test(s), 'and says how many rows are missing, so it cannot be mistaken for the file');
  ok(/this sheet has 3000 rows/.test(s), 'and how many it really holds, so the count is never in doubt');
  // A sheet the sample shows whole still SAYS it is whole. Without that line
  // the model cannot tell "small" from "sampled", and on a real workbook it
  // spent a question asking whether the empty sheet had data in the full file.
  const small = sampleLedgerText(sheet('t', 50))!;
  ok(small.includes(sheet('t', 50)) && /this sheet has 50 rows, all of them shown/.test(small),
    'a small sheet is sent whole, and says so');
  ok(/no dated rows at all - it is empty/.test(sampleLedgerText('### Sheet: Bonifici\nelenco\nData,In uscita') ?? 'x') === false,
    'a workbook of nothing but empty sheets has no sample at all');
  ok(sampleLedgerText('no dates\nnothing to sample') === null, 'text with no dated rows has no sample');
}
{
  // Per sheet, so every sheet's columns are in the sample and a sheet that is
  // all preamble comes through untouched.
  const text = [
    `### Sheet: Spese\n${sheet('elenco spese', 2000)}`,
    `### Sheet: Entrate\n${sheet('elenco entrate', 30, 9000)}`,
    '### Sheet: Bonifici\nelenco bonifici\nData,In uscita,In entrata',
  ].join('\n');
  const s = sampleLedgerText(text)!;
  ok(/### Sheet: Spese[\s\S]*### Sheet: Entrate[\s\S]*### Sheet: Bonifici/.test(s), 'every sheet is named, in order');
  ok(/no dated rows at all - it is empty/.test(s),
    'and the empty sheet is declared empty - the one question a real import wasted on the sample');
  ok(s.split('\n').filter((l) => /^20\d\d-/.test(l)).length === 80 + 30, 'the long sheet is sampled, the short one sent whole');
  const files = [file(text)];
  const t = sampleForTriage(files)!;
  ok(t[0].bytes === new TextEncoder().encode(t[0].text!).byteLength && t[0].bytes < files[0].bytes,
    'the triage file carries the sample in both its text and its bytes, and is far smaller than the file');
  const photo: AiFile = { media_type: 'image/png', data: 'x', name: 'p.png', bytes: 10, text: null };
  ok(sampleForTriage([file(text), photo]) === null, 'a photo in the set means no triage: nothing to sample it by');
}

// ── the categories the file needs and I have not got ─────────────────────
// Worked out on the phone from the triage's answer, before a row is read -
// the last moment a new category still changes where those rows land.
{
  const mine = ['Cibo & Bevande', 'Casa', 'Trasporti', 'Altro'];
  const got = categoryGaps(['Alimentari', 'Casa', 'Scommesse', 'Trasporti'], mine);
  ok(JSON.stringify(got) === JSON.stringify(['Alimentari', 'Scommesse']),
    `only what has no home comes back, in the file's own spelling (${JSON.stringify(got)})`);

  ok(categoryGaps(['casa', '  CASA  '], mine).length === 0,
    'case and stray spaces are not a different category');
  // A near-miss IS asked about, on purpose. Folding plurals wants a stemmer,
  // a stemmer wants two languages, and every rule loose enough to catch
  // "Trasporto" for "Trasporti" also swallows a real gap. Offering one tap
  // too many is the cheap error; missing a gap costs every row that needed it.
  ok(categoryGaps(['Trasporto'], mine).length === 1,
    'a near-miss is asked about rather than assumed - the cheap error, not the expensive one');
  ok(categoryGaps(['Sport', 'sport', 'SPORT '], mine).length === 1,
    'the same gap named three ways is asked about once');

  // A word meaning "none of the above" is not a gap: those rows belong in
  // the catch-all, which is what it is for.
  ok(categoryGaps(['Other', 'Altro', 'Uncategorized', 'varie', 'N/A'], mine).length === 0,
    'and "no category" words are never offered as categories to create');

  ok(categoryGaps([], mine).length === 0, 'a file that names no categories asks nothing');
  ok(categoryGaps(['Sport'], []).length === 1, 'an account with no categories at all is all gap');
  ok(categoryGaps(['  ', ''], mine).length === 0, 'blanks are not categories');
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\ntwo halves, every row once, both with their headers');
process.exit(fail.length ? 1 : 0);
