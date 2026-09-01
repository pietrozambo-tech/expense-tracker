// A split-expense export, read for ONE number: what my share of it comes to.
//
// Not an importer. The model does the reading - the descriptions, the dates,
// the categories, which of my categories each row belongs in - and it is good
// at that. What it is not reliably good at is doing the same arithmetic
// three dozen times without drifting, and that arithmetic is the part where a
// mistake is invisible: a trip that imports cleanly and quietly misstates the
// money. Reported from a device on a real Splitwise export - the app offered
// to add 200 EUR of a trip whose own app says 955.77.
//
// So the phone works out the total itself, from the file, and the ready
// screen shows both numbers. Two independent readings agreeing is the
// assurance; disagreeing, it says so rather than importing quietly.
//
// The two shapes, and why telling them apart is the whole job:
//
//   SHARES    every value is what that person's portion cost. They add up to
//             the row's total. (Tricount.) My share is my own value.
//   BALANCES  every value is what that person PAID minus what they owed, so
//             the row cancels to zero and carries both signs. (Splitwise.)
//             My share has to be reconstructed - see shareOf below.
//
// Reading one as the other gives right answers on evenly-split rows and wrong
// ones everywhere else, which is exactly the error nobody catches by eye.

/** One person's column, as the file spells it. */
export interface SplitTotal {
  /** The column taken as mine, verbatim from the header. */
  column: string;
  kind: 'shares' | 'balances';
  /** My share across every row that counts, in the file's own currency. */
  total: number;
  /** What the whole group spent - the figure the source app shows on top. */
  groupTotal: number;
  /** Rows that counted (settlements and summaries excluded). */
  rows: number;
  /** Rows whose owner the export does not record: every value zero, and no
   *  name in the words. One person paid and consumed the lot - Splitwise
   *  knows who, its CSV does not say. Their cost is NOT in `total`. */
  unclear: number;
  /** What those rows come to. total + unclearTotal is the ceiling: the number
   *  the source app shows when all of them turn out to be mine - which is how
   *  the real Formentera export reconciles to its own 955.77 to the cent. */
  unclearTotal: number;
}

/** A CSV line split on commas, honouring "quoted, fields". */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; }
        else quoted = false;
      } else cur += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const num = (s: string): number | null => {
  const t = s.replace(/[€$£\s]/g, '').replace(/,(\d{1,2})$/, '.$1').replace(/,/g, '');
  if (!t || !/^-?\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Money moving between people, or a summary line - never spending. */
const isSettlement = (description: string, category: string): boolean =>
  /^(payment|reimbursement|rimborso|settle\w*)$/i.test(category.trim()) ||
  /\bpaid\b/i.test(description) ||
  /\bha (pagato|rimborsato)\b/i.test(description) ||
  /total balance|saldo totale/i.test(description) ||
  /liquidar|settle up|pareggi/i.test(description);

/**
 * My share of one BALANCES row.
 *
 * net = paid - owed, so:
 *  - negative: I paid nothing (or less than my share) and my share is what I
 *    still owe on it. |net| exactly, when I fronted nothing.
 *  - positive: I fronted money. What I actually consumed is the cost minus
 *    what everyone else owes me, split between the people who fronted it -
 *    the rest comes back to me and was never my spending.
 *  - zero, with the row all zeros: one person paid and consumed the lot. Whose
 *    it was cannot be read from the numbers; the caller decides by the words.
 *  - zero, with others non-zero: I was not in that expense.
 */
function shareOf(cost: number, mine: number, all: number[]): number | null {
  if (mine < 0) return -mine;
  const negatives = all.filter((v) => v < 0).reduce((s, v) => s - v, 0);
  const positives = all.filter((v) => v > 0).length;
  if (mine > 0) return positives > 0 ? Math.max(0, (cost - negatives) / positives) : cost;
  return all.every((v) => v === 0) ? null : 0;
}

/**
 * Which header column is me. Matched on the WHOLE name and on its parts, so
 * "Pietro" finds "Pietro Zamboni" and "Pietro Z." alike - but never on a
 * fragment, or "Ele" would answer for "Elena" as happily as for "Eleonora".
 */
function myColumn(headers: string[], me: string): number {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\.$/, '');
  const mine = norm(me);
  if (!mine) return -1;
  const first = mine.split(/\s+/)[0];
  const exact = headers.findIndex((h) => norm(h) === mine);
  if (exact !== -1) return exact;
  return headers.findIndex((h) => {
    const parts = norm(h).split(/\s+/);
    return parts[0] === first || parts.includes(mine);
  });
}

/**
 * The file's own answer to "what did this trip cost ME".
 *
 * Returns null - silently, no guess - whenever the file is not this shape or
 * my column cannot be told: a wrong second opinion is worse than none.
 */
export function splitShareTotal(text: string, me: string): SplitTotal | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 4) return null;

  // The header, found by what the columns CONTAIN rather than by what they
  // are called. Splitwise puts a Currency column between the cost and the
  // people; Tricount puts paid_by before the total and no currency at all;
  // somebody's own spreadsheet does neither and may carry notes columns
  // after the people. Naming every variant is a losing game, so: find a
  // column of money, then keep as people only the columns to its right that
  // hold a number (or nothing) on nearly every row.
  let headerAt = -1;
  let costCol = -1;
  const MONEY = /^(cost|total|totale|importo|amount|spesa|prezzo|price|somma|valore|value)$/;
  for (let i = 0; i < Math.min(lines.length, 6); i += 1) {
    const cells = splitCsvLine(lines[i]).map((c) => c.toLowerCase());
    const cost = cells.findIndex((c) => MONEY.test(c));
    if (cost === -1 || cells.length - cost < 3) continue;
    headerAt = i; costCol = cost;
    break;
  }
  if (headerAt === -1) return null;

  const header = splitCsvLine(lines[headerAt]);
  const body = lines.slice(headerAt + 1).map(splitCsvLine)
    // A row of the file's own data: it has a cost. Blank separators and the
    // trailing "Total balance" line are not evidence about any column.
    .filter((cells) => num(cells[costCol] ?? '') !== null);
  if (body.length < 3) return null;

  const numericish = (col: number) => {
    let seen = 0;
    let ok = 0;
    for (const cells of body) {
      const raw = (cells[col] ?? '').trim();
      seen += 1;
      if (!raw || num(raw) !== null) ok += 1;
    }
    return seen > 0 && ok / seen >= 0.8;
  };

  // People run from the first numeric column after the cost to the last one
  // that is still numeric - a text column (Currency, a notes field) ends the
  // run, so neither can be mistaken for somebody's share.
  const cols: number[] = [];
  for (let c = costCol + 1; c < header.length; c += 1) {
    if (!header[c]?.trim()) { if (cols.length) break; else continue; }
    if (numericish(c)) cols.push(c);
    else if (cols.length) break;
  }
  if (cols.length < 2) return null;

  const people = cols.map((c) => header[c]);
  const mineAt = myColumn(people, me);
  if (mineAt === -1) return null;

  const labelled = (re: RegExp) => header.findIndex((h) => re.test(h.trim()));
  const descCol = labelled(/^(description|descrizione|title|titolo|what|cosa)$/i);
  const catCol = labelled(/^(category|categoria|type|tipo)$/i);

  interface Row { cost: number; mine: number; all: number[]; description: string; category: string }
  const rows: Row[] = [];
  for (const cells of body) {
    const cost = num(cells[costCol] ?? '');
    if (cost === null || cost === 0) continue;
    if (cols.every((c) => !(cells[c] ?? '').trim())) continue;
    const all = cols.map((c) => num(cells[c] ?? '') ?? 0);
    rows.push({
      cost,
      mine: all[mineAt],
      all,
      description: descCol === -1 ? '' : (cells[descCol] ?? ''),
      category: catCol === -1 ? '' : (cells[catCol] ?? ''),
    });
  }
  if (rows.length < 3) return null;

  // Which kind, decided by arithmetic on rows with three or more people in
  // them - never by the header's promise, since the file can come from
  // anywhere. A row of shares sums to its cost; a row of balances cancels.
  let sharesEvidence = 0;
  let balancesEvidence = 0;
  for (const r of rows) {
    const sum = r.all.reduce((s, v) => s + v, 0);
    const scale = Math.max(1, r.cost) * 0.02;
    if (Math.abs(sum - r.cost) <= scale) sharesEvidence += 1;
    else if (Math.abs(sum) <= scale) balancesEvidence += 1;
  }
  if (sharesEvidence === 0 && balancesEvidence === 0) return null;
  const kind: 'shares' | 'balances' = balancesEvidence > sharesEvidence ? 'balances' : 'shares';

  let total = 0;
  let counted = 0;
  let unclear = 0;
  let unclearTotal = 0;
  let groupTotal = 0;
  for (const r of rows) {
    if (isSettlement(r.description, r.category)) continue;
    groupTotal += r.cost;
    const share = kind === 'shares'
      ? (r.mine > 0 ? r.mine : 0)
      : shareOf(r.cost, r.mine, r.all);
    if (share === null) {
      // An all-zero row: one person paid and consumed all of it. Mine only if
      // the words say so ("Voli Pietro" - my flights); otherwise unknown, and
      // counted as unknown rather than dropped into either total.
      const first = me.trim().split(/\s+/)[0].toLowerCase();
      if (first && r.description.toLowerCase().includes(first)) {
        total += r.cost;
        counted += 1;
      } else {
        unclear += 1;
        unclearTotal += r.cost;
      }
      continue;
    }
    if (share > 0) { total += share; counted += 1; }
  }
  if (counted === 0) return null;
  return {
    column: people[mineAt],
    kind,
    total: Math.round(total * 100) / 100,
    groupTotal: Math.round(groupTotal * 100) / 100,
    rows: counted,
    unclear,
    unclearTotal: Math.round(unclearTotal * 100) / 100,
  };
}
