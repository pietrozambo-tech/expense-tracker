// The AI-import prompt: the two language bodies, checked against each other.
//
// This used to be reachable only through a browser, because the prompt was 280
// lines of template literal inside a JSX branch. It is a pure function now, so
// the rules can be asserted directly - and the parity table below is the only
// thing standing between "a rule was added in English" and an Italian user
// getting different behaviour for months, which is what the component's own
// history records.

import { buildImportPrompt } from '../../src/app/lib/importPrompt';
import type { Category, Source, Transaction } from '../../src/app/types';

let failed = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failed += 1;
};

const FLAG = 'Azores \u{1F1F5}\u{1F1F9}';
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_IT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

const cat = (id: string, name: string, subs: string[] = [], type: 'expense' | 'income' = 'expense'): Category => ({
  id, name, type, icon: 'Plane', color: 'text-sky-600',
  bgColor: 'bg-sky-50', selectedBg: 'bg-sky-100', subcategories: subs,
});
const travel = cat('travel', 'Travel', ['Hotel', 'Food', 'Flights']);
const others = cat('others', 'Others');
const salary = cat('sal', 'Salary', [], 'income');
const sources: Source[] = [{ id: 'cash', kind: 'cash', mark: 'banknote', name: 'Cash', brand: '#2FA84F' } as Source];

const rows = (name: string): Transaction[] =>
  ['Cena', 'Hotel', 'Volo'].map((d, i) => ({
    id: `t${i}`, date: `2026-08-2${i + 1}`, type: 'expense', amount: 20, currency: 'EUR',
    category: travel, subcategory: 'Food', description: `${name} - ${d}`,
  }) as Transaction);

const build = (language: 'en' | 'it', transactions: Transaction[] = rows(FLAG)) =>
  buildImportPrompt({
    categories: [travel, others],
    incomeCategories: [salary],
    sources,
    transactions,
    userName: 'Pietro',
    userCurrency: 'EUR',
    defaultSourceExpense: 'cash',
    language,
    monthsShort: language === 'it' ? MONTHS_IT : MONTHS_EN,
  });

const en = build('en');
const it = build('it');

// ── every rule, in both languages ─────────────────────────────────────────
// name, English marker, Italian marker.
const RULES: [string, string, string][] = [
  ['the JSON skeleton', '"version": 1', '"version": 1'],
  ['ask before converting', 'BEFORE YOU CONVERT', 'PRIMA DI CONVERTIRE'],
  ['everything in one message', 'I need from you:', 'Mi serve da te:'],
  ['which column is me', 'WHICH COLUMN IS ME', 'QUALE COLONNA SONO IO'],
  ['whether it is a trip at all', 'WHETHER IT IS A TRIP', 'SE È UN VIAGGIO'],
  ['a file with no year', 'no YEAR anywhere', "non c'è l'ANNO"],
  ['rows that are monthly totals', 'monthly or weekly TOTAL', 'TOTALE mensile o settimanale'],
  ['every sheet and tab', 'Open EVERY sheet', 'Apri OGNI foglio'],
  ['read my answers back first', 'repeat my answers back', 'ripetimi le mie risposte'],
  ['dates as YYYY-MM-DD', '"date": YYYY-MM-DD', '"date": YYYY-MM-DD'],
  ['decimal point, not comma', 'decimal POINT not comma', 'punto decimale'],
  ['negative amounts are two things', 'A NEGATIVE amount', 'Un importo NEGATIVO'],
  ['never convert a foreign amount', 'do NOT convert it', 'NON convertirlo'],
  ['clean up cryptic statement text', 'Blue Bottle', 'Blue Bottle'],
  ['exactly one of my categories', 'exactly ONE of MY categories', 'esattamente UNA delle MIE categorie'],
  ['do not invent subcategories', 'EXISTING subcategories', 'ESISTENTI'],
  ['statement noise is skipped', 'balance brought forward', 'saldo riportato'],
  ['bank fees are expenses', 'Bank fees', 'Commissioni bancarie'],
  ['shares versus balances', 'the columns are SHARES', 'le colonne sono QUOTE'],
  ['the share total, checkable in seconds', 'THE TOTAL OF MY SHARE', 'IL TOTALE DELLA MIA QUOTA'],
  ['stop when the rows disagree', 'STOP and ask me', 'FERMATI e chiedimi'],
  ['a zero share means skip the row', 'was not part of that expense', 'non facevo parte di quella spesa'],
  ['a one-name row is not a settlement', 'NOT automatically a settlement', 'NON è automaticamente un pareggio'],
  ['settlement categories, in English too', 'Reimbursement', 'Reimbursement'],
  ['who paid is not what it cost me', 'never my cost', 'Non è mai il mio costo'],
  ['booking dates are kept', 'dated when they were BOOKED', 'data della PRENOTAZIONE'],
  ['a trip is filed as one thing', 'A TRIP IS ONE THING', 'UN VIAGGIO È UNA COSA SOLA'],
  ['ask for the trip name', 'ASK me for a SHORT NAME', 'CHIEDIMI un NOME BREVE'],
  ['use the answer verbatim', 'EXACTLY AS I WRITE IT', 'ESATTAMENTE COME LA SCRIVO'],
  ["the app's limits on that name", "THE APP'S LIMITS", "I LIMITI dell'app"],
  ['ask rather than trim', 'never trim it yourself', 'non accorciarlo mai'],
  ['my categories are listed', 'MY EXPENSE categories', 'Le MIE categorie di SPESA'],
  ['only the JSON goes in the FILE', 'ONLY the JSON in the FILE', 'Nel FILE metti SOLO il JSON'],
];

for (const [name, mEn, mIt] of RULES) {
  const hasEn = en.includes(mEn);
  const hasIt = it.includes(mIt);
  ok(hasEn && hasIt, `${name}${hasEn && hasIt ? '' : hasEn ? ' - MISSING IN ITALIAN' : ' - MISSING IN ENGLISH'}`);
}

// ── the trip name, which is where this all started ────────────────────────
ok(en.includes(FLAG), 'the English body shows a flagged name as the example of what to keep');
ok(it.includes('Azzorre \u{1F1F5}\u{1F1F9}'), 'and the Italian shows its own');
// The limits are the app's, not a guess: tripNameOf enforces exactly these.
ok(/3 words and 24 characters/.test(en) && /3 parole e 24 caratteri/.test(it),
  'both state the real limits - 3 words, 24 characters');
ok(/a flag costs 4/.test(en) && /una bandiera ne vale 4/.test(it),
  'and warn that a flag is not one character');

// ── the trips the ledger already holds ────────────────────────────────────
ok(en.includes(`- "${FLAG}" (Aug 2026)`), 'English quotes the existing trip by exact name and month');
ok(it.includes(`- "${FLAG}" (Ago 2026)`), 'Italian does too, with the month in Italian');
{
  // "Weekend lungo con i ragazzi" is four words: not a trip name the app can
  // read, so nothing is detected and the list must not appear as a heading
  // promising something.
  const bare = build('en', rows('Weekend lungo con i ragazzi'));
  ok(!/Trips I ALREADY have/.test(bare), 'no trips detected: no empty heading promising a list');
  ok(/USE MY ANSWER EXACTLY AS I WRITE IT/.test(bare), 'while the verbatim rule still stands');
}

// ── the template is fully resolved ────────────────────────────────────────
// A stray ${...} means an interpolation was broken by an edit, and it ships
// straight to the assistant as literal text.
for (const [label, body] of [['English', en], ['Italian', it]] as const) {
  ok(!body.includes('${'), `no unresolved interpolation left in the ${label} body`);
}
// The user's own setup reaches the assistant, or it matches against nothing.
ok(en.includes('- Travel (subcategories: Hotel, Food, Flights)') &&
   it.includes('- Travel (subcategories: Hotel, Food, Flights)'),
  'both list my categories with their subcategories');
ok(en.includes('cash = Cash') && it.includes('cash = Cash'), 'and my sources by id');
ok(en.includes('My name is Pietro') && it.includes('Mi chiamo Pietro'), 'and say who I am');

console.log(failed ? `\n${failed} FAILED` : '\nThe prompt says the same thing in both languages.');
process.exit(failed ? 1 : 0);
