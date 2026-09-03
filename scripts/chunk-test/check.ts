// Cutting a file in half so two reads can answer it.
//
// The failure this guards against is silent and expensive: a half that
// arrives without its column header is a wall of unlabelled numbers, and the
// model's confident reading of it is wrong on every row - after the day's
// read has been spent on it.
import { splitLedgerText, splitForReads, countRows, AI_ROWS_PER_READ, AI_MAX_READS, AI_MAX_ROWS, type AiFile } from '../../src/app/lib/aiImport';

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

console.log(fail.length ? `\n${fail.length} FAILED` : '\ntwo halves, every row once, both with their headers');
process.exit(fail.length ? 1 : 0);
