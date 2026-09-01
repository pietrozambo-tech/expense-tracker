// The split-file reader: does it come out with the number the source app
// shows, on files that are shaped nothing like each other?
//
// The ground truth in the first block is not invented. It is a real Splitwise
// trip whose own summary screen reads "Total spent 3.680,99 €" and "Your
// share 955,77 €" - the numbers this file has to reproduce to the cent, from
// the export alone. The app had offered to import 200 EUR of it.
//
// The other blocks exist because the owner's point stands: Splitwise,
// Tricount and somebody's own spreadsheet are three different files, and a
// reader that only knows one of them is a reader that guesses on the other
// two. Nothing here matches on a header's promise; the shape is worked out
// from what the columns hold.
import { myShareCsv, splitShareTotal } from '../../src/app/lib/splitFile';

let failed = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failed += 1;
};

// ── Splitwise: BALANCES, and the one that was wrong on a real phone ───────
//
// Names changed; every amount, sign and blank is the real file's. The rows
// that matter are the awkward ones: "Voli Pietro" and "Taxi" carry zeros
// across the board (one person paid and consumed the lot), "Telo mare" and
// "Multa" work out to nothing of mine, and four rows have two payers.
const SPLITWISE = `Date,Description,Category,Cost,Currency,Pietro Zamboni,Franco B,Andrea G,Vera,Elena A

2026-05-21,Voli Pietro,General,195.00,EUR,0.00,0.00,0.00,0.00,0.00
2026-05-21,Casa Solea,General,1110.00,EUR,-222.00,-222.00,-222.00,888.00,-222.00
2026-06-03,Motorini,General,181.03,EUR,144.82,-36.21,-36.20,-36.20,-36.21
2026-06-24,Liquidar todas las deudas,General,307.40,EUR,0.00,307.40,0.00,-307.40,0.00
2026-07-17,Ferry a/r,Transportation - Other,246.40,EUR,-61.60,-61.60,184.80,-61.60,0.00
2026-07-17,Spesa,General,105.18,EUR,-21.04,-21.03,84.15,-21.04,-21.04
2026-07-17,Les Illetes,General,15.00,EUR,11.25,-3.75,-3.75,-3.75,0.00
2026-07-17,pranzo,General,102.00,EUR,-25.50,76.50,-25.50,-25.50,0.00
2026-07-18,Cena,Dining out,332.00,EUR,-83.00,-83.00,249.00,-83.00,0.00
2026-07-18,Ape,General,60.00,EUR,48.00,-12.00,-12.00,-12.00,-12.00
2026-07-18,Taxi,Taxi,50.00,EUR,0.00,0.00,0.00,0.00,0.00
2026-07-18,Ses illetes,General,15.00,EUR,2.00,-3.00,7.00,-3.00,-3.00
2026-07-18,Telo mare,General,11.00,EUR,11.00,-5.50,0.00,-5.50,0.00
2026-07-18,Pranzo sabato,General,163.00,EUR,-32.60,-32.60,-32.60,-32.60,130.40
2026-07-18,Multa,General,45.00,EUR,45.00,0.00,-45.00,0.00,0.00
2026-07-19,Cena ,Dining out,379.00,EUR,303.20,-75.80,-75.80,-75.80,-75.80
2026-07-19,Benza,General,10.00,EUR,8.00,-2.00,-2.00,-2.00,-2.00
2026-07-19,Taxi,Taxi,20.90,EUR,-4.18,-4.18,-4.18,-4.18,16.72
2026-07-19,locker,General,27.50,EUR,7.00,-5.50,-5.50,9.50,-5.50
2026-07-19,Benza,General,5.00,EUR,-1.00,-1.00,4.00,-1.00,-1.00
2026-07-19,Birre e bibite varie,General,34.00,EUR,-6.80,27.20,-6.80,-6.80,-6.80
2026-07-19,Spesa,Groceries,99.98,EUR,-19.99,-20.00,-19.99,-20.00,79.98
2026-07-19,Barca,General,254.00,EUR,-50.80,-50.80,-50.80,-50.80,203.20
2026-07-19,Barca,General,100.00,EUR,-20.00,-20.00,80.00,-20.00,-20.00
2026-07-19,Franco B. paid Vera,Payment,125.33,EUR,0.00,125.33,0.00,-125.33,0.00
2026-07-20,Multe parcheggio ,General,80.00,EUR,64.00,-16.00,-16.00,-16.00,-16.00
2026-07-20,Multa dio santo,General,40.00,EUR,-8.00,32.00,-8.00,-8.00,-8.00
2026-07-20,Vera paid Pietro Z.,Payment,24.00,EUR,-24.00,0.00,0.00,24.00,0.00
2026-07-20,Franco B. paid Andrea G.,Payment,42.83,EUR,0.00,42.83,-42.83,0.00,0.00
2026-07-20,Franco B. paid Pietro Z.,Payment,63.76,EUR,-63.76,63.76,0.00,0.00,0.00

2026-09-01,Total balance, , ,EUR,0.00,-0.95,0.00,0.00,0.95
`;

{
  const got = splitShareTotal(SPLITWISE, 'Pietro');
  ok(got !== null, 'a Splitwise export is read at all');
  ok(got?.kind === 'balances', `its columns are recognised as balances (${got?.kind})`);
  ok(got?.column === 'Pietro Zamboni', `and my column is found from my first name (${got?.column})`);
  // What the export can prove on its own.
  ok(got?.total === 905.77, `my share from what the file actually says: 905.77 (got ${got?.total})`);
  // THE assertion. One row - "Taxi", 50.00, every column 0.00 - is a payer
  // the CSV does not record: Splitwise knows who paid it, its export does
  // not say. Add it back and the reading lands on Splitwise's own screen,
  // "Your share 955,77 €", to the cent.
  ok(got !== null && got.unclear === 1 && got.unclearTotal === 50,
    `the unrecorded row is held apart, not guessed (${got?.unclear} row, ${got?.unclearTotal})`);
  ok(got !== null && Math.round((got.total + got.unclearTotal) * 100) / 100 === 955.77,
    `and with it, the reading is Splitwise's own number: 955.77 (got ${got && got.total + got.unclearTotal})`);
  // And the group figure it shows above it: 3.680,99 €.
  ok(got?.groupTotal === 3680.99, `the group total matches too: 3680.99 (got ${got?.groupTotal})`);
}
{
  // The full name, and a surname-only column, both find me.
  ok(splitShareTotal(SPLITWISE, 'Pietro Zamboni')?.total === 905.77, 'my full name finds the same column');
  // Somebody else's share is somebody else's number - the reader is not
  // hardwired to one person.
  const franco = splitShareTotal(SPLITWISE, 'Franco B');
  ok(franco !== null && franco.total > 0 && franco.total !== 955.77,
    `another column reads as that person's own share (${franco?.total})`);
  ok(splitShareTotal(SPLITWISE, 'Giacomo') === null,
    'a name that is in no column returns nothing rather than a guess');
}

// ── the file the model actually gets ─────────────────────────────────────
//
// The reason this module exists at all. Given the raw export, the model got
// the arithmetic wrong twice on one screen: a +144.82 balance came back as a
// 144.82 EXPENSE (the share is 36.21), and a +11.25 one came back as INCOME
// under Salary (the share is 3.75). Neither is a reading mistake - they are
// sums, the app can do them exactly, so the model is handed the answer and
// asked only to read.
{
  const found = splitShareTotal(SPLITWISE, 'Pietro')!;
  const csv = myShareCsv(found);
  const lines = csv.split('\n');
  ok(lines[0] === 'date,description,category,amount', `it is a plain four-column list (${lines[0]})`);
  const row = (name: string) => lines.find((l) => l.includes(name));
  ok(row('Motorini')?.endsWith(',36.21'),
    `the row the model read as 144.82 leaves as my share (${row('Motorini')})`);
  ok(row('Les Illetes')?.endsWith(',3.75'),
    `and the one it called income leaves as 3.75 of spending (${row('Les Illetes')})`);
  ok(row('Voli Pietro')?.endsWith(',195.00'), `my own all-zero row keeps its full cost (${row('Voli Pietro')})`);
  ok(row('Casa Solea')?.includes('2026-05-21,'), 'the booking date is carried across as it stands');
  ok(!csv.includes('paid Vera') && !csv.includes('Total balance'),
    'settlements and the summary line never make it into the file');
  ok(!/,-\d/.test(csv), 'nothing leaves as a negative number, so nothing can read as money coming back');
  // Telo mare (11.00, share 0) and Multa (45.00, share 0) are fully paid back.
  ok(!csv.includes('Telo mare') && !csv.includes('Multa,'),
    'rows that work out to nothing of mine are not sent at all');
  // What the model is being asked to total, and what the screen checks it
  // against: the provable share plus the one unattributed row.
  const sum = lines.slice(1).reduce((s, l) => s + Number(l.split(',').pop()), 0);
  ok(Math.round(sum * 100) / 100 === 955.77,
    `and the list adds up to Splitwise's own figure: 955.77 (got ${Math.round(sum * 100) / 100})`);
}

// ── Tricount: SHARES, a different header, no currency column ─────────────
//
// Values all positive and summing to the row's total. Read with the balances
// rule this file would come out badly wrong, which is exactly why the kind is
// decided by arithmetic and not by the header.
const TRICOUNT = `date,description,category,paid_by,total,Pit,Merlo,Max
2026-08-22,Ferry,Transport,Merlo,90.00,30.00,30.00,30.00
2026-08-22,Hotel,Stay,Pit,300.00,100.00,100.00,100.00
2026-08-23,Cena,Food,Max,60.00,20.00,20.00,20.00
2026-08-23,Museo solo Pit,Culture,Pit,12.00,12.00,0.00,0.00
`;
{
  const got = splitShareTotal(TRICOUNT, 'Pit');
  ok(got?.kind === 'shares', `a Tricount export is recognised as shares (${got?.kind})`);
  ok(got?.total === 162, `and my share is my own column, added up: 162 (got ${got?.total})`);
  ok(got?.groupTotal === 462, `with the group total from the cost column (${got?.groupTotal})`);
  // The header names paid_by BEFORE the total; if it were read as a person,
  // its text would poison the people run.
  ok(got?.column === 'Pit', `the payer column is not mistaken for a person (${got?.column})`);
}

// ── somebody's own spreadsheet: neither shape's header, notes after ───────
//
// The owner's point: "un excel different che un user potrebbe caricare".
// Money column called Importo, people in the middle, a free-text column
// after them that must not be read as a fourth participant.
const HOMEMADE = `Data,Cosa,Importo,Anna,Bea,Carlo,Note
2026-04-02,Spesa,60.00,20.00,20.00,20.00,pagata da Anna
2026-04-03,Benzina,45.00,15.00,15.00,15.00,
2026-04-05,Cena fuori,90.00,45.00,45.00,0.00,Carlo non c'era
2026-04-07,Biglietti,30.00,10.00,10.00,10.00,
`;
{
  const got = splitShareTotal(HOMEMADE, 'Bea');
  ok(got !== null, "a home-made sheet with its own words is read too");
  ok(got?.kind === 'shares', `its positive columns say shares (${got?.kind})`);
  ok(got?.total === 90, `and Bea's share adds up (got ${got?.total})`);
  ok(got?.column === 'Bea' && got?.rows === 4,
    `the notes column is not a person (${got?.column}, ${got?.rows} rows)`);
}

// ── and the files this must stay away from ───────────────────────────────
{
  const bank = `Date,Description,Amount,Balance
2026-08-01,Coffee,-3.50,1200.00
2026-08-02,Salary,2000.00,3200.00
2026-08-03,Rent,-800.00,2400.00
2026-08-04,Groceries,-52.10,2347.90
`;
  ok(splitShareTotal(bank, 'Pietro') === null,
    'a bank statement is not a split file, and is left alone');
  ok(splitShareTotal('date,description,amount\n2026-08-01,A,10\n', 'Pietro') === null,
    'and neither is a plain two-column list');
}

console.log(failed ? `\n${failed} FAILED` : '\nthe file says what the app it came from says');
process.exit(failed ? 1 : 0);
