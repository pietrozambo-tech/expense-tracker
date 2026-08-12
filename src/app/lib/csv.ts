import type { Source, Transaction } from '../types';
import { homeAmount } from '../utils/currency';

// Spreadsheet export - the way OUT of the app into Excel / Google Sheets /
// Numbers, complementing the JSON backup (which only TracklyLab itself can
// read back).
//
// Deliberate choices for spreadsheet apps rather than parsers:
//   - a UTF-8 BOM, or Excel on Windows renders "Caffè" as mojibake
//   - '.' decimals and NO thousands separators, so amounts arrive as numbers
//   - the home amount is signed (income +, expense -), so a plain SUM over the
//     column gives net; the Type column still makes filtering trivial
//   - the original amount/currency only when it differs from the home
//     currency - for most rows it would just repeat the same number
export function buildTransactionsCsv(
  transactions: Transaction[],
  homeCurrency: string,
  sources: Source[],
): string {
  const esc = (v: string | number) => {
    let s = String(v ?? '');
    // Formula-injection guard: Excel and Sheets execute cells that start with
    // = + @ or a tab. A transaction described as "=HYPERLINK(...)" must open
    // as text, not run. (Only user-entered strings pass through here - the
    // numeric columns are emitted directly.)
    if (/^[=+\-@\t]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const sourceName = (id?: string) => (id ? sources.find((s) => s.id === id)?.name ?? id : '');

  const header = [
    'Date',
    'Type',
    'Description',
    'Category',
    'Subcategory',
    `Amount (${homeCurrency})`,
    'Original Amount',
    'Original Currency',
    'Source',
    'Recurring',
  ];

  const rows = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((t) => {
      const home = homeAmount(t, homeCurrency);
      const signed = (t.type === 'income' ? 1 : -1) * home;
      const foreign = t.currency && t.currency !== homeCurrency;
      return [
        t.date,
        t.type === 'income' ? 'Income' : 'Expense',
        esc(t.description),
        esc(t.category?.name ?? ''),
        esc(t.subcategory ?? ''),
        signed.toFixed(2),
        foreign ? t.amount.toFixed(2) : '',
        foreign ? t.currency : '',
        esc(sourceName(t.sourceId)),
        t.recurrence && t.recurrence !== 'Never repeat' ? esc(t.recurrence) : '',
      ].join(',');
    });

  return '\ufeff' + [header.join(','), ...rows].join('\r\n') + '\r\n';
}

// Trigger a client-side download of the CSV. `basename` distinguishes the
// full export from a filtered Activity view; the date is appended to both.
export function downloadTransactionsCsv(csv: string, basename = 'tracklylab-transactions') {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${basename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
