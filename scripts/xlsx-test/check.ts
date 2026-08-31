// The xlsx reader: does the sheet arrive saying what it said?
//
// The treacherous part is dates - Excel stores them as day counts, and a
// "45123" reaching the model as a number would come back as an amount. So
// half of this file is about the styles table deciding which numbers are
// calendar days.
import { xlsxToCsv, xlsxToText } from '../../src/app/lib/xlsx';
// @ts-expect-error plain mjs fixture, no types
import { buildWorkbook, buildZip, serialOf } from './fixture.mjs';

let failed = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failed += 1;
};

const buf = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

const sheets = await xlsxToCsv(buf(buildWorkbook()));
const rows = sheets[0]?.csv.split('\n') ?? [];

ok(sheets.length === 2, `both sheets come out (${sheets.length})`);
ok(sheets[0]?.name === 'Spese' && sheets[1]?.name === 'Entrate', 'named as the workbook names them');
ok(rows[0] === 'date,description,amount', `the header row is itself (${rows[0]})`);
// The builtin date format (14) and a custom dd/mm/yyyy both mean "date".
ok(rows[1] === '2026-08-22,Ferry ride,30',
  `a builtin-format serial becomes a calendar day, and split text runs join (${rows[1]})`);
ok(rows[2]?.startsWith('2026-08-22,"Lunch, at the port & bar"'),
  `a custom date format counts too, commas are quoted, entities unescaped (${rows[2]})`);
ok(rows[3] === '2026-08-23,Burger,9', `inline strings read like any other (${rows[3]})`);
ok(rows[4]?.startsWith('2026-08-23 12:00'),
  `a serial with a fraction keeps its time of day (${rows[4]})`);
// The income sheet: a gap column stays a gap, booleans say their name.
ok(sheets[1]?.csv === '2026-08-27,,2400,TRUE',
  `gaps hold their place and booleans read as words (${sheets[1]?.csv})`);

// One workbook, one text file: the sheets under their own headers, because
// splitting them would eat the function's four-file limit.
const text = await xlsxToText(buf(buildWorkbook()));
ok(text.includes('### Sheet: Spese') && text.includes('### Sheet: Entrate'),
  'multi-sheet workbooks travel as one text with per-sheet headers');

// The same number WITHOUT a date style must stay a number - deciding by
// magnitude instead of by style would turn big amounts into dates.
{
  const plain = buildZip([
    ['xl/workbook.xml', '<workbook><sheets><sheet name="S" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', `<worksheet><sheetData><row r="1"><c r="A1"><v>${serialOf(2026, 8, 22)}</v></c></row></sheetData></worksheet>`],
  ]);
  const [s] = await xlsxToCsv(buf(plain));
  ok(s.csv === String(serialOf(2026, 8, 22)), `an unstyled day-count stays the number it is (${s.csv})`);
}

// Not-a-zip is a thrown error for the caller's sentence, never a silent [].
{
  let threw = false;
  try { await xlsxToCsv(buf(Buffer.from('PK just kidding'))); } catch { threw = true; }
  ok(threw, 'bytes that are not a zip throw rather than answering nothing');
}

console.log(failed ? `\n${failed} FAILED` : '\nThe workbook says what it said.');
process.exit(failed ? 1 : 0);
