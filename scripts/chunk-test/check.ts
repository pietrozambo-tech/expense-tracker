// Cutting a file in half so two reads can answer it.
//
// The failure this guards against is silent and expensive: a half that
// arrives without its column header is a wall of unlabelled numbers, and the
// model's confident reading of it is wrong on every row - after the day's
// read has been spent on it.
import {
  splitLedgerText, splitForReads, sampleLedgerText, sampleForTriage, resolveCategoryMap, mappingNeedsScreen,
  countRows, countDataRows, unaccountedLines, fillGaps,
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

// ── which lines did NOT come back, by arithmetic on the file ─────────────
//
// "A long generation occasionally skips an item" is an excuse, not a design.
// The phone knows every line it sent, every one carries a date, and every
// record that comes back carries the same date - so a missing row can be
// NAMED rather than merely suspected, and the repair can be aimed at it.
{
  const r = (date: string, description: string) =>
    ({ date, amount: 10, type: 'expense' as const, category: 'Spesa', description, currency: 'EUR' });
  const file = [
    'elenco spese',
    HEAD,
    '2026-01-04,Alimentari,Principale,10,EUR,Uno',
    '2026-01-04,Alimentari,Principale,10,EUR,Due',
    '2026-01-04,Alimentari,Principale,10,EUR,Tre',
    '2026-01-05,Alimentari,Principale,10,EUR,Quattro',
  ].join('\n');

  const whole = unaccountedLines(file, [r('2026-01-04', 'Uno'), r('2026-01-04', 'Due'), r('2026-01-04', 'Tre'), r('2026-01-05', 'Quattro')]);
  ok(whole.lines.length === 0, 'a reading that accounted for every line leaves nothing to chase');

  const shortOne = unaccountedLines(file, [r('2026-01-04', 'Uno'), r('2026-01-04', 'Due'), r('2026-01-05', 'Quattro')]);
  ok(shortOne.shortBy.get('2026-01-04') === 1, 'one row short on a date is counted as one');
  ok(shortOne.lines.length === 3 && shortOne.lines.every((l) => l.includes('2026-01-04')),
    `and the lines of that date are the ones to ask about again (${shortOne.lines.length})`);
  ok(shortOne.head.includes(HEAD), 'with the column header, or the repair is unlabelled numbers');
  ok(!shortOne.lines.some((l) => l.includes('2026-01-05')), 'the dates that are whole are left alone');

  // Per DATE, not per file: one row dropped and one row read twice come to
  // the same total and would look perfect.
  const masked = unaccountedLines(file, [r('2026-01-04', 'Uno'), r('2026-01-04', 'Due'), r('2026-01-05', 'A'), r('2026-01-05', 'B')]);
  ok(masked.shortBy.get('2026-01-04') === 1,
    'a loss hidden behind a duplicate elsewhere is still found - the total was right, the file was not');
}

// ── and the repair can close a gap without inventing a row ───────────────
{
  const r = (date: string, amount: number, description: string) =>
    ({ date, amount, type: 'expense' as const, category: 'Spesa', description, currency: 'EUR' });
  // The shape this always has: three lines on the day, two of them read. The
  // repair cannot be handed "the missing one" - which one that is is the
  // question - so it is handed all three and answers all three.
  const base = [r('2026-01-04', 10, 'Uno'), r('2026-01-04', 20, 'Due')];
  const shortBy = new Map([['2026-01-04', 1]]);
  const all = [r('2026-01-04', 10, 'Uno'), r('2026-01-04', 20, 'Due'), r('2026-01-04', 30, 'Tre')];

  const closed = fillGaps(base, all, shortBy);
  ok(closed.length === 3, `the row that is new is taken (${closed.length} of 3)`);
  ok(closed.filter((x) => x.amount === 10).length === 1,
    'and the two already in hand are recognised rather than added a second time');
  ok(fillGaps(base, [r('2026-01-04', 30, 'Tre')], shortBy).length === 3,
    'a repair that answers only the missing row works just as well');

  // The failure that shipped: an earlier merge kept two whole readings side by
  // side and keyed identity on the description, so a rewording made a second
  // row out of one. A real 1,206-row import came back as 1,213 movements - one
  // row recovered and seven invented. Money that is not there is worse than
  // money that is missing, because nothing on the screen looks wrong. Rows are
  // matched on the day, the direction and the amount; never on the wording.
  const reworded = [r('2026-01-04', 10, 'Spesa Esselunga'), r('2026-01-04', 20, 'Cena a casa con Glovo'), r('2026-01-04', 30, 'Tre')];
  ok(fillGaps(base, reworded, shortBy).length === 3,
    'a description rewritten between the two passes is the same row, not a new one');

  // And the cap on top of all that: whatever else the repair offers, a date
  // cannot end with more rows than the file has lines for it.
  const generous = [...all, r('2026-01-04', 40, 'Quattro'), r('2026-01-04', 50, 'Cinque')];
  ok(fillGaps(base, generous, shortBy).length === 3,
    'a repair that offers five rows still gives up only the one that was owed');
  ok(fillGaps(base, [r('2026-01-09', 10, 'Altrove')], shortBy).length === 2,
    'a row for a date that was never short is refused outright');
  ok(fillGaps(base, [], shortBy).length === 2, 'and an empty repair changes nothing');

  // The genuinely ambiguous one, decided on purpose. Three identical 3 EUR
  // coffees on a day, two of them read: a repair that comes back with a single
  // 3 EUR coffee has named nothing - there is no way to tell it apart from the
  // ones already in hand. It is left alone and the shortfall stays on screen,
  // because a row copied is money that is not there.
  const coffees = [r('2026-01-04', 3, 'Caffè'), r('2026-01-04', 3, 'Caffè')];
  ok(fillGaps(coffees, [r('2026-01-04', 3, 'Caffè')], shortBy).length === 2,
    'a repair that cannot tell a new row from an old one adds nothing');
  ok(fillGaps(coffees, [r('2026-01-04', 3, 'Caffè'), r('2026-01-04', 3, 'Caffè'), r('2026-01-04', 3, 'Caffè')], shortBy).length === 3,
    'while one that answers all three lines does close the gap');
}

// ── the whole round trip: name the gap, ask again, fold the answer in ─────
//
// The repair pass exists because a long generation occasionally skips an
// item: a part handed 241 rows came back with 236 and nothing failed. The
// dangerous half is not the asking, it is the folding - get that wrong and a
// reading doubles instead of completing.
{
  const r = (date: string, amount: number, description: string) =>
    ({ date, amount, type: 'expense' as const, category: 'Spesa', description, currency: 'EUR' });
  const file = [
    'elenco spese',
    HEAD,
    '2026-02-01,Ristoranti,Consegne,20,EUR,Cena Glovo',
    '2026-02-02,Bar,Caffè,5,EUR,Caffè',
    '2026-02-03,Ristoranti,Pranzo,9,EUR,Pranzo',
  ].join('\n');

  const read = [r('2026-02-01', 20, 'Cena Glovo'), r('2026-02-02', 5, 'Caffè')];
  const gap = unaccountedLines(file, read);
  ok(gap.lines.length === 1 && gap.lines[0].includes('Pranzo'),
    'the line that never came back is named, not guessed at');

  // The one that shipped and had to be taken back. The description is the one
  // field two readings can honestly disagree about - the file says "Cena
  // Glovo" and the second pass writes it back with a word trimmed. The old
  // merge kept the two readings side by side and keyed identity on that
  // description, so each rewording became a SECOND row: a real 1,206-row
  // import came out as 1,213 movements, one row recovered and seven invented.
  // Now the repair can offer whatever it likes; only the shortfall is taken.
  const reworded = [
    r('2026-02-03', 9, 'Pranzo'),
    r('2026-02-01', 20, 'Cena a casa con Glovo'),
    r('2026-02-02', 5, 'Un caffè'),
  ];
  const done = fillGaps(read, reworded, gap.shortBy);
  ok(done.length === 3, `a row reworded in the repair is not a second row (${done.length} of 3)`);
  ok(done.some((x) => x.date === '2026-02-03'), 'and the row that was missing is recovered');
  ok(done.filter((x) => x.date === '2026-02-01').length === 1, 'the date that was whole gains nothing');

  // The one that would be silent and wrong the other way: two identical
  // coffees on one day are two charges. Dedupe on identity would eat the
  // second every time - a real charge, gone, in the name of tidiness.
  const twins = [
    'elenco spese',
    HEAD,
    '2026-01-01,Bar,Caffè,3,EUR,Caffè',
    '2026-01-01,Bar,Caffè,3,EUR,Caffè',
  ].join('\n');
  const half = unaccountedLines(twins, [r('2026-01-01', 3, 'Caffè')]);
  ok(half.shortBy.get('2026-01-01') === 1, 'a file with the same row twice is two rows, and one of them is owed');
  ok(half.lines.length === 2, 'and the repair is handed both lines, since neither can be pointed at');
  const twinsBack = fillGaps([r('2026-01-01', 3, 'Caffè')], [r('2026-01-01', 3, 'Caffè'), r('2026-01-01', 3, 'Caffè')], half.shortBy);
  ok(twinsBack.length === 2, 'and when it answers both, the twin is taken back rather than deduped away');
  ok(unaccountedLines(twins, [r('2026-01-01', 3, 'Caffè'), r('2026-01-01', 3, 'Caffè')]).lines.length === 0,
    'while a reading that found both is left alone');

  // Nothing to fold, either way round.
  ok(fillGaps([], [], new Map()).length === 0 && fillGaps(read, [], gap.shortBy).length === 2,
    'an empty repair contributes nothing and destroys nothing');
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\ntwo halves, every row once, both with their headers');
process.exit(fail.length ? 1 : 0);
