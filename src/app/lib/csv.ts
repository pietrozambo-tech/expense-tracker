import type { Settlement, Source, Transaction } from '../types';
import { homeAmount, mineAmount } from '../utils/currency';

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
//   - shared expenses export what they COST you in the main amount column, so
//     a plain SUM still gives real spending, with the household's full figure
//     beside it. Settlements ride along in their own column at zero, because
//     money moving back is neither spending nor income (see the app's own
//     in/out/settled split in Activity).
export function buildTransactionsCsv(
  transactions: Transaction[],
  homeCurrency: string,
  sources: Source[],
  shared?: { partnerName?: string; settlements?: Settlement[] },
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

  const partner = shared?.partnerName ?? '';
  const settlements = shared?.settlements ?? [];

  const header = [
    'Date',
    'Type',
    'Description',
    'Category',
    'Subcategory',
    `Amount (${homeCurrency})`,
    `Shared Total (${homeCurrency})`,
    'Shared With',
    'Paid By',
    `Settled (${homeCurrency})`,
    'Original Amount',
    'Original Currency',
    'Source',
    'Recurring',
  ];

  const txnRows = transactions.map((t) => {
    // The share, not the receipt: this column is what the money actually cost
    // you, so summing it answers "what did I spend".
    const signed = (t.type === 'income' ? 1 : -1) * mineAmount(t, homeCurrency);
    const isSplit = !!t.split && t.type !== 'income';
    const foreign = t.currency && t.currency !== homeCurrency;
    return {
      date: t.date,
      cells: [
        t.date,
        t.type === 'income' ? 'Income' : 'Expense',
        esc(t.description),
        esc(t.category?.name ?? ''),
        esc(t.subcategory ?? ''),
        signed.toFixed(2),
        // Only when it differs from the amount above, like Original Amount.
        isSplit ? homeAmount(t, homeCurrency).toFixed(2) : '',
        isSplit ? esc(partner) : '',
        // A replica is theirs: they paid, you owe your half.
        isSplit ? (t.fromShared ? esc(partner) : 'You') : '',
        '',
        foreign ? t.amount.toFixed(2) : '',
        foreign ? t.currency : '',
        esc(sourceName(t.sourceId)),
        t.recurrence && t.recurrence !== 'Never repeat' ? esc(t.recurrence) : '',
      ],
    };
  });

  // Settlements are neither spending nor income, so their Amount column is
  // zero and the money that moved sits in its own column: a SUM over either
  // column stays meaningful.
  const settlementRows = settlements.map((s) => ({
    date: s.date,
    cells: [
      s.date,
      'Settlement',
      esc(partner ? `Settled up with ${partner}` : 'Settled up'),
      '', '',
      '0.00',
      '',
      esc(partner),
      s.amount >= 0 ? esc(partner) : 'You',
      s.amount.toFixed(2),
      '', '', '', '',
    ],
  }));

  const rows = [...txnRows, ...settlementRows]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((r) => r.cells.join(','));

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
