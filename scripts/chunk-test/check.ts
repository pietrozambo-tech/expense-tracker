// Cutting a file in half so two reads can answer it.
//
// The failure this guards against is silent and expensive: a half that
// arrives without its column header is a wall of unlabelled numbers, and the
// model's confident reading of it is wrong on every row - after the day's
// read has been spent on it.
import { splitLedgerText, splitForReads, countRows, AI_MAX_ROWS, AI_MAX_READS, type AiFile } from '../../src/app/lib/aiImport';

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

// ── when to split at all ─────────────────────────────────────────────────
{
  ok(splitForReads([file(sheet('t', 500))]) === null, 'a file that fits is left alone');
  ok(splitForReads([file(sheet('t', AI_MAX_ROWS - 5))]) === null, 'and so is one just under the line');
  const two = splitForReads([file(sheet('t', AI_MAX_ROWS + 100))]);
  ok(two !== null && two.length === 2, 'one just over it becomes two reads');
  ok(two !== null && countRows(two[0][0].text!) <= AI_MAX_ROWS && countRows(two[1][0].text!) <= AI_MAX_ROWS,
    'each of which is under the ceiling it was split for');
  ok(two !== null && two[0][0].bytes === new TextEncoder().encode(two[0][0].text!).byteLength,
    'and carries its own byte count, not the whole file\'s');
  ok(splitForReads([file(sheet('t', AI_MAX_ROWS * AI_MAX_READS + 500))]) === null,
    'past two reads it is not split - that is a refusal, made in readFiles before anything is claimed');
  // A photo or a PDF has no rows to cut along; half a scanned statement is
  // not a file. Those go as they are and the server decides.
  const photo: AiFile = { media_type: 'image/png', data: 'x', name: 'p.png', bytes: 10, text: null };
  ok(splitForReads([file(sheet('t', AI_MAX_ROWS + 100)), photo]) === null,
    'a photo in the set stops the split rather than being halved');
  ok(splitLedgerText('no dates here\njust words\nand more words', 2) === null,
    'and text with no dated line has nothing to cut along');
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\ntwo halves, every row once, both with their headers');
process.exit(fail.length ? 1 : 0);
