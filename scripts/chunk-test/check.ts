// Cutting a file in half so two reads can answer it.
//
// The failure this guards against is silent and expensive: a half that
// arrives without its column header is a wall of unlabelled numbers, and the
// model's confident reading of it is wrong on every row - after the day's
// read has been spent on it.
import {
  splitLedgerText, splitForReads, sampleLedgerText, sampleForTriage, resolveCategoryMap, mappingNeedsScreen,
  countRows, countDataRows, mergeReadings,
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

// ── the model's mapping, checked against what I actually have ────────────
// The MODEL maps ("Attivita fisica" is Sport); the phone only checks that
// each target exists, in the catalogue of the right type. An earlier version
// had the phone map by string equality and turned fifteen readings into
// fifteen questions on a real file.
{
  const mine = { expense: ['Cibo & Bevande', 'Casa', 'Trasporti', 'Sport', 'Regali', 'Altro'], income: ['Stipendio', 'Altre entrate'] };
  const m = (source: string, type: 'expense' | 'income', target: string | null) => ({ source, type, target });

  const r = resolveCategoryMap([
    m('Attività fisica', 'expense', 'Sport'),
    m('Regalo', 'expense', 'Regali'),
    m('Casa', 'expense', 'Casa'),
    m('Scommesse', 'expense', null),
    m('Bollette', 'expense', 'Utenze'),          // a target that does not exist
    m('Stipendio', 'income', 'Stipendio'),
    m('Welfare aziendale', 'income', null),
  ], mine);
  const line = (s: string) => r.find((x) => x.source === s)!;
  ok(line('Attività fisica').settled && line('Attività fisica').target === 'Sport',
    'a judgement the model made lands as settled, on the category it named');
  ok(line('Regalo').settled && line('Regalo').target === 'Regali', 'plural or not, that is the model\'s call and it is kept');
  ok(!line('Scommesse').settled && line('Scommesse').target === null, 'a null from the model is a gap');
  ok(!line('Bollette').settled && line('Bollette').target === null,
    'and so is a target that does not exist - the model named a category I do not have');
  ok(line('Stipendio').settled && line('Stipendio').type === 'income', 'income is checked against the income list');
  ok(!line('Welfare aziendale').settled && line('Welfare aziendale').type === 'income', 'and an income gap stays income');

  // Type is the whole point: the same word can be an expense in one sheet and
  // income in another, and "Regalo" mapped onto the EXPENSE list is not a
  // hit for the income row.
  const typed = resolveCategoryMap([m('Regalo', 'income', 'Regali')], mine);
  ok(typed.length === 1 && !typed[0].settled, 'an income word pointed at an expense category is not settled');
  const both = resolveCategoryMap([m('Regalo', 'expense', 'Regali'), m('Regalo', 'income', 'Altre entrate')], mine);
  ok(both.length === 2, 'the same word on both sides is two lines, not one');

  // Case and spaces are not a different category, and the catalogue's own
  // spelling wins on the way out.
  const spelled = resolveCategoryMap([m('cibo', 'expense', '  cibo & bevande ')], mine);
  ok(spelled[0].settled && spelled[0].target === 'Cibo & Bevande', 'a target matched loosely comes back spelled my way');

  // "No category" words are never gaps - the catch-all is what they are for.
  const none = resolveCategoryMap([m('Altro', 'expense', null), m('Other', 'expense', null), m('N/A', 'income', null)], mine);
  ok(none.length === 0, '"no category" words with no target are left to the catch-all, not offered as categories to create');
  const noneKept = resolveCategoryMap([m('Altro', 'expense', 'Altro')], mine);
  ok(noneKept.length === 1 && noneKept[0].settled, 'but one the model pointed at my own catch-all is kept, settled');

  // When the screen is worth showing at all.
  ok(!mappingNeedsScreen(resolveCategoryMap([m('Casa', 'expense', 'Casa'), m('Sport', 'expense', 'sport')], mine)),
    'a mapping of words matched to themselves is not a screen - nobody needs to confirm that Casa is Casa');
  ok(mappingNeedsScreen(resolveCategoryMap([m('Casa', 'expense', 'Casa'), m('Regalo', 'expense', 'Regali')], mine)),
    'one judgement call is worth a glance');
  ok(mappingNeedsScreen(resolveCategoryMap([m('Scommesse', 'expense', null)], mine)), 'and one gap is worth a choice');
  ok(resolveCategoryMap([m('  ', 'expense', null)], mine).length === 0, 'blanks are not categories');
}

// ── counting what went out, so the answer can be held up against it ──────
//
// The two counters exist for opposite reasons and must not drift into each
// other. countRows guards a timeout and is allowed to run high; countDataRows
// is compared against the rows that came BACK, so it has to be exact - an
// overcount invents missing rows, an undercount hides real ones.
{
  const one = sheet('elenco spese per il periodo 9 settembre 2024 - 3 settembre 2026', 1117);
  const two = sheet('elenco entrate per il periodo 9 settembre 2024 - 3 settembre 2026', 91);
  const text = `### Sheet: Spese\n${one}\n\n### Sheet: Entrate\n${two}`;

  ok(countDataRows(text) === 1208, `it counts the rows and nothing else (${countDataRows(text)} of 1208)`);
  // The titles carry "2024" and "2026", which is a digit apiece: countRows
  // takes them and is meant to.
  ok(countRows(text) > countDataRows(text),
    `while countRows still runs high, as its own job needs (${countRows(text)})`);

  // A title, a header, a blank line and a sheet that is all preamble are not
  // rows, however many digits they carry.
  ok(countDataRows('elenco spese 2024 - 2026\n' + HEAD + '\n\n') === 0,
    'a file with no dated line counts zero, not "some"');
  // A photo or a PDF has no text at all: no opinion, and the caller must not
  // read that as "nothing was sent".
  ok(countDataRows('') === 0, 'and so does one with nothing in it');

  // The number survives the split, which is the whole point: it is counted on
  // the files as picked, so five parts cannot disagree with it.
  const parts = splitForReads([file(one)])!;
  ok(parts.reduce((n, p) => n + countDataRows(p[0].text!), 0) === 1117,
    'the parts between them carry exactly the rows that were counted');
}

// ── two readings of the same rows, merged ────────────────────────────────
//
// The repair pass exists because a long generation occasionally skips an
// item: a part handed 241 rows came back with 236 and nothing failed. It is
// read again and the two answers are merged - and the merge is the dangerous
// part, because getting it wrong doubles a reading instead of completing it.
{
  const r = (date: string, amount: number, description: string) =>
    ({ date, amount, type: 'expense' as const, category: 'Spesa', description, currency: 'EUR' });

  const first = [r('2026-01-01', 10, 'A'), r('2026-01-03', 30, 'C')];
  const second = [r('2026-01-01', 10, 'A'), r('2026-01-02', 20, 'B'), r('2026-01-03', 30, 'C')];
  const both = mergeReadings(first, second);
  ok(both.length === 3, `a row only the second reading found is kept (${both.length} of 3)`);
  ok(both.filter((x) => x.description === 'A').length === 1, 'and a row both found is kept once, not twice');
  ok(mergeReadings(second, first).length === 3, 'whichever way round the two readings arrive');

  // The one that would be silent and wrong: two identical coffees on one day
  // are two transactions. A merge that deduped on identity alone would eat
  // the second every time - a real charge, gone, in the name of tidiness.
  const twice = [r('2026-01-01', 3, 'Caffè'), r('2026-01-01', 3, 'Caffè')];
  const once = [r('2026-01-01', 3, 'Caffè')];
  ok(mergeReadings(twice, once).length === 2, 'two identical rows in one file stay two');
  ok(mergeReadings(once, twice).length === 2, 'and the reading that found both is the one believed');
  ok(mergeReadings(twice, twice).length === 2, 'while the same pair read twice is still a pair, not four');

  // Case and spacing in a description are not an identity. The model writes
  // "Cena  con Kevin" one time and "Cena con Kevin" the next, and two
  // readings of one row must not become two rows.
  const spaced = [{ ...r('2026-01-01', 12, 'Cena  con Kevin') }];
  const tidy = [{ ...r('2026-01-01', 12, 'cena con kevin') }];
  ok(mergeReadings(spaced, tidy).length === 1, 'a description respaced between readings is still the same row');

  // Nothing to merge, either way round.
  ok(mergeReadings([], second).length === 3 && mergeReadings(second, []).length === 3,
    'an empty reading contributes nothing and destroys nothing');
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\ntwo halves, every row once, both with their headers');
process.exit(fail.length ? 1 : 0);
