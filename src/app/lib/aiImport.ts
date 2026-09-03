import { supabase, SUPABASE_ANON, SUPABASE_FUNCTIONS_URL } from './supabase';
import { tripSpan, type Trip } from './trips';
import type { ImportPayload } from './importData';

// The client half of the in-app AI import.
//
// The server half (supabase/functions/convert-import) holds the key, builds
// the instructions, enforces the daily cap and cuts the answer into rows as
// the model writes it. This side sends FACTS - the file, the trip answer, the
// language - and draws what comes back. Nothing here composes instructions:
// if the text came from the browser, anyone could send any text and spend the
// owner's key as a free chatbot.
//
// Mirrors of the server's own bounds live here so the obvious mistakes are
// refused before a byte leaves the phone - the server still enforces its own
// copy, because a client is a suggestion, not a guarantee.

/** The server's limits, restated for pre-flight. Keep in step by hand: the
 *  function cannot export them across the trust boundary. */
export const AI_MAX_FILES = 4;
export const AI_MAX_BYTES = 12 * 1024 * 1024;
/**
 * How much TEXT one read can actually take, in characters.
 *
 * The byte ceiling above is about the request; this is about the model's
 * context, and it is the tighter of the two by a mile - 12MB of CSV is some
 * three million tokens against a 200k window. Without it a big export was
 * refused by the API itself, which is the worst place to find out: the day's
 * read is claimed before the call, so the user paid one to be told no.
 * ~350k characters is roughly 90k tokens, which leaves the instructions and
 * the answer their room.
 */
export const AI_MAX_TEXT = 350_000;

/**
 * How many rows one read is given, and why the number is what it is.
 *
 * The binding constraint is TIME, not tokens. Measured on a real two-year
 * current-account export: the model emits about 4 rows a second, and a
 * Supabase Edge Function is killed by the platform at 150 seconds of wall
 * clock - the log says `"reason": "WallClockTime"` and the stream simply
 * stops, with no answer and no error. A 1,206-row file needs about five
 * minutes. It never had a chance, and the person watching had 600 rows go by
 * before the screen told them it had failed.
 *
 * So a read is sized to finish well inside that ceiling: 300 rows is about 75
 * seconds of writing plus a lead-in of ten or twenty while the model reads
 * the file - comfortably under 150 even on a slow day.
 *
 * Smaller is also FASTER overall, because the parts run at the same time: the
 * import takes as long as one part, so halving a part halves the wait. The
 * floor on that is the lead-in, which every part pays whether it holds 300
 * rows or 30 - past a point you are buying requests, not seconds.
 *
 * What does NOT buy seconds, since it comes up: the rows streaming onto the
 * screen. The model generates at its own rate and the server reads a stream
 * that is already flowing; showing the rows costs nothing, and hiding them
 * would save nothing while removing the only thing that makes the wait
 * legible.
 *
 * This replaced a token-derived ceiling of 2,000, which was the wrong
 * quantity entirely - the answer's token count was never what killed it.
 * Raising CONVERT_MAX_TOKENS does nothing here; only shorter reads do.
 */
export const AI_ROWS_PER_READ = 300;

/**
 * The most reads one import may become - and they run at the same time, so
 * this is a width, not a queue.
 *
 * Parallel is the point: eight reads in sequence is eight times the wait and
 * eight chances to be halfway through when something drops. Fired together
 * they finish in about the time of the slowest one, so the 1,206-row file
 * that started this is five reads and ~95 seconds rather than five minutes,
 * and each read is separately inside its own wall clock.
 *
 * Not higher than eight, though the arithmetic would allow it: every part is
 * a separate call on the same API key, and a wide enough fan-out answers
 * itself with a rate limit - which fails the WHOLE import, since every part
 * must land.
 *
 * The number is a cost bound too. The daily cap counts IMPORTS now, not
 * requests (the server claims once per import id), so this is the multiplier
 * on what one claimed import can spend - a known, bounded one.
 */
export const AI_MAX_READS = 8;

/** The refusal ceiling: past this an import cannot be answered at all. */
export const AI_MAX_ROWS = AI_ROWS_PER_READ * AI_MAX_READS;

/**
 * Roughly how many rows of data a text file holds.
 *
 * Lines, not parsed records: this runs on every import to decide how to cut
 * it up, and it must not become a second CSV parser with its own opinions
 * about quoting. Blank lines and a header or two are the only things taken
 * off, so the count runs slightly high - the safe direction when what it
 * guards is a timeout.
 */
export const countRows = (text: string): number => {
  let n = 0;
  for (const line of text.split('\n')) {
    // A row of data has a digit in it somewhere. Titles, sheet headings and
    // the "### Sheet:" separators xlsxToText writes do not.
    if (/\d/.test(line) && line.trim()) n += 1;
  }
  return n;
};

/**
 * Above this many rows, the model is asked what it needs BEFORE the reading
 * starts, on a sample, in a call that takes seconds.
 *
 * Why this exists is a single afternoon on a real 1,206-row export. The
 * reading ran for fifty seconds and then asked "is this a trip?". Answered,
 * it ran again to 80% and asked "which of these names is you?" - names it
 * had found inside descriptions like "pranzo con Mirko", on a personal bank
 * statement. Answered, it ran again from zero and asked which COLUMN was me.
 * Answered, it ran again and asked me to confirm its entire category mapping
 * as a question. Four restarts, every one from 0%, on a file that needed no
 * questions at all.
 *
 * Two things were structurally wrong, and only one of them was the model.
 * Questions were discovered DURING the expensive reading and each answer
 * restarted it; and the phone knew the answers - two years of dates is not a
 * trip, no per-person columns is not a split file - and was not saying so.
 * So now: the phone asserts what it knows, negatives included; a big file
 * gets a triage read on a sample first, and the questions come back in
 * seconds; and the parts that do the reading are told they may not ask.
 *
 * Small files skip the triage. A question after a ten-second read is a
 * ten-second cost; the machinery is for the file where it was minutes.
 */
export const AI_TRIAGE_ROWS = 150;

/** How many rows from each end go into the sample. Enough to show the
 *  columns, the date format, the currency and the flavour of the
 *  descriptions; the model is not converting them. */
const SAMPLE_ROWS = 40;

/** A line carrying a date is a row of data. Everything above the first one -
 *  a title, a column header, a sheet heading - is preamble, and every part
 *  needs its own copy or it arrives as a wall of unlabelled columns. */
const hasDate = (line: string): boolean =>
  DATE_RES.some((re) => {
    re.lastIndex = 0;
    return re.test(line);
  });

/** One file's text, cut into `parts` pieces of roughly equal row counts, each
 *  carrying the preamble of every section it draws from. Null when there is
 *  nothing to cut along - no dated lines at all. */
export function splitLedgerText(text: string, parts: number): string[] | null {
  if (parts < 2) return [text];
  // xlsxToText writes a multi-sheet workbook as "### Sheet: name" blocks, and
  // each block has its own headers. Split along them so a sheet's columns are
  // never separated from its rows.
  const blocks = /^### Sheet: /m.test(text) ? text.split(/\n(?=### Sheet: )/) : [text];
  const sections = blocks.map((block) => {
    const lines = block.split('\n');
    const first = lines.findIndex(hasDate);
    return first < 0
      ? { head: lines, rows: [] as string[] }
      : { head: lines.slice(0, first), rows: lines.slice(first) };
  });
  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  if (total === 0) return null;

  const out: string[] = [];
  const per = Math.ceil(total / parts);
  let taken = 0;
  for (let part = 0; part < parts; part += 1) {
    const want = part === parts - 1 ? total - taken : Math.min(per, total - taken);
    const pieces: string[] = [];
    let left = want;
    let seen = 0;
    for (const section of sections) {
      const from = Math.max(0, taken - seen);
      seen += section.rows.length;
      if (left <= 0 || from >= section.rows.length) continue;
      const rows = section.rows.slice(from, from + left);
      left -= rows.length;
      pieces.push([...section.head, ...rows].join('\n'));
    }
    taken += want - left;
    // Sections that are all preamble (an empty sheet, a title page) ride with
    // the first part only: repeated, they would read as duplicated content.
    if (part === 0) {
      for (const section of sections) if (section.rows.length === 0) pieces.push(section.head.join('\n'));
    }
    out.push(pieces.join('\n\n'));
  }
  return out;
}

/**
 * The first and last rows of a file, with every section's preamble - what
 * the triage read looks at. Null when there is nothing dated to sample.
 */
export function sampleLedgerText(text: string, each = SAMPLE_ROWS): string | null {
  const blocks = /^### Sheet: /m.test(text) ? text.split(/\n(?=### Sheet: )/) : [text];
  const pieces: string[] = [];
  let any = false;
  for (const block of blocks) {
    const lines = block.split('\n');
    const first = lines.findIndex(hasDate);
    if (first < 0) { pieces.push(block); continue; }
    any = true;
    const rows = lines.slice(first);
    if (rows.length <= each * 2) { pieces.push(block); continue; }
    pieces.push([
      ...lines.slice(0, first),
      ...rows.slice(0, each),
      `… ${rows.length - each * 2} rows left out of this sample …`,
      ...rows.slice(-each),
    ].join('\n'));
  }
  return any ? pieces.join('\n\n') : null;
}

/** The files with each text file replaced by its sample. Null when any file
 *  cannot be sampled (a photo, a PDF) - then there is no triage, and the
 *  reading asks its own questions as it always did. */
export function sampleForTriage(files: AiFile[]): AiFile[] | null {
  if (files.some((f) => !f.text)) return null;
  const out: AiFile[] = [];
  for (const f of files) {
    const s = sampleLedgerText(f.text!);
    if (s === null) return null;
    const bytes = new TextEncoder().encode(s);
    out.push({ ...f, text: s, bytes: bytes.byteLength, data: b64(bytes.buffer as ArrayBuffer) });
  }
  return out;
}

/**
 * The files for each read.
 *
 * Null means "send them as they are" - either they fit in one read, or they
 * cannot be cut (a PDF or a photo has no rows to cut along, and half a
 * scanned statement is not a file; those go whole and the server decides).
 */
export function splitForReads(files: AiFile[]): AiFile[][] | null {
  const rows = files.reduce((n, f) => n + (f.text ? countRows(f.text) : 0), 0);
  if (rows <= AI_ROWS_PER_READ) return null;
  const parts = Math.min(AI_MAX_READS, Math.ceil(rows / AI_ROWS_PER_READ));
  if (files.some((f) => !f.text)) return null; // nothing to cut a photo along

  const cut = files.map((f) => splitLedgerText(f.text!, parts));
  if (cut.some((c) => c === null)) return null;
  return Array.from({ length: parts }, (_, i) =>
    files.map((f, j) => {
      // The bytes are rewritten too. The server reads a text file from
      // `text`, but the base64 is what it falls back to - and a part whose
      // two copies disagreed would be a bug nobody could see.
      const bytes = new TextEncoder().encode(cut[j]![i]);
      return { ...f, text: cut[j]![i], bytes: bytes.byteLength, data: b64(bytes.buffer as ArrayBuffer) };
    }),
  );
}

/** The types that travel as they are. Everything else gets a second look:
 *  an .xlsx is unpacked to CSV on the phone (see lib/xlsx.ts - as zip bytes
 *  it reads as nothing), and any unrecognised file whose bytes decode as
 *  text is sent as text - "whatever file you have" is the promise, and an
 *  export with an odd extension is still a list of transactions. Only the
 *  legacy binary spreadsheets (.xls, .numbers) are refused by name, with the
 *  sentence that says what to do instead. */
const ACCEPTED = /^(text\/csv|text\/plain|text\/tab-separated-values|application\/pdf|image\/(png|jpe?g|webp|heic|heif))$/i;
const XLSX_RE = /\.xlsx$/i;
const LEGACY_SHEET_RE = /\.(xls|numbers)$/i;

/** Do these bytes read as text? NUL bytes or a spray of control characters
 *  say binary; a model handed base64 of those reads confidently and wrong. */
const looksLikeText = (bytes: Uint8Array): boolean => {
  const n = Math.min(bytes.length, 4096);
  if (n === 0) return false;
  let control = 0;
  for (let i = 0; i < n; i += 1) {
    const b = bytes[i];
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32)) control += 1;
  }
  return control / n < 0.02;
};

/** Numbers written the way money is - "12", "12.50", "1.234,56", "-8,00". */
const AMOUNT_RE = /(?:^|[\s,;|"'([])[-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?(?=$|[\s,;|"')\]€$£%])/g;

/**
 * Could this text be a list of transactions at all?
 *
 * The cheapest gate there is, and the only one that costs nothing: a text
 * file with no date anywhere in it and barely a number is a CV, a recipe, a
 * chat log - not a ledger. Sending it spends one of the day's reads to be
 * told what the phone could see for free.
 *
 * Deliberately generous in the file's favour: ANY date, or a handful of
 * numbers, is enough to pass. A real export always clears this by a mile,
 * and the cost of a wrong refusal (a file the app won't even try) is much
 * higher than the cost of a wasted read.
 */
export function looksLikeLedger(text: string): boolean {
  const head = text.slice(0, 200_000);
  if (/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}[-. ](?:gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic|jan|may|jun|jul|aug|sep|oct|dec)/i.test(head)) return true;
  return (head.match(AMOUNT_RE) ?? []).length >= 3;
}

/**
 * A file the app can import itself, for free: the .json the manual path
 * produces. Dropped on the AI door - which happens, the two buttons are one
 * screen apart - it used to be sent off to be read by a model, spending a
 * read and a minute on a file that is already in the app's own format.
 * Returns the payload to import directly, or null.
 */
export function readyMadePayload(files: AiFile[]): ImportPayload | null {
  if (files.length !== 1) return null;
  const text = files[0].text;
  if (!text || !/^\s*[[{]/.test(text)) return null;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    // The app's own two shapes: an import file, or a full backup (which the
    // caller turns into a restore, exactly as the .json button does).
    if (Array.isArray(parsed?.transactions)) return parsed as unknown as ImportPayload;
  } catch { /* not JSON, or not ours - the model can have it */ }
  return null;
}

export interface AiFile {
  media_type: string;
  /** base64 of the raw bytes. */
  data: string;
  name: string;
  bytes: number;
  /** UTF-8 text for text-shaped files, so the trip scan can read dates. */
  text: string | null;
}

export class AiImportError extends Error {
  constructor(
    /** One of the app's own reasons (file_type, too_big, too_many) or a code
     *  the server answered with (limit, not_configured, busy, too_big...). */
    public code: string,
    message: string,
    /** The daily cap, when a daily_limit refusal named one - so the screen
     *  can say "all 3 of today's reads" instead of an unexplained wall. */
    public limit?: number,
  ) {
    super(message);
  }
}

/** The cap, remembered for the rest of the UTC day it was hit on - so the
 *  Settings door can warn BEFORE the file picker and the trip question, not
 *  after. The server stays the authority: this only draws a note, it never
 *  blocks a call (the owner can raise the cap mid-day and the note is then
 *  simply wrong until midnight - a note, not a lock). */
const DAY_DONE_KEY = 'expense-tracker.v1.ai-day-done';
const utcToday = () => new Date().toISOString().slice(0, 10);
const markAiDayDone = () => {
  try { localStorage.setItem(DAY_DONE_KEY, utcToday()); } catch { /* storage unavailable */ }
};
export const aiDayDone = (): boolean => {
  try { return localStorage.getItem(DAY_DONE_KEY) === utcToday(); } catch { return false; }
};

const b64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let s = '';
  const CHUNK = 0x8000; // String.fromCharCode has an argument-count ceiling
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
};

/**
 * Read and gate the picked files. Throws AiImportError with the code the
 * screen turns into its own sentence; never a raw browser error.
 */
export async function readFiles(files: File[]): Promise<AiFile[]> {
  if (files.length === 0) throw new AiImportError('no_file', 'nothing picked');
  if (files.length > AI_MAX_FILES) throw new AiImportError('too_many', String(AI_MAX_FILES));
  let total = 0;
  const out: AiFile[] = [];
  const pushText = (name: string, text: string) => {
    const bytes = new TextEncoder().encode(text);
    out.push({ media_type: 'text/csv', data: b64(bytes.buffer as ArrayBuffer), name, bytes: bytes.length, text });
  };
  for (const f of files) {
    if (LEGACY_SHEET_RE.test(f.name)) throw new AiImportError('spreadsheet', f.name);
    total += f.size;
    if (total > AI_MAX_BYTES) throw new AiImportError('too_big', f.name);
    if (XLSX_RE.test(f.name)) {
      // Unpacked here, sent as the CSV it contains - a few KB instead of the
      // workbook, and dates as dates instead of Excel's day counts.
      try {
        const { xlsxToText } = await import('./xlsx');
        pushText(f.name.replace(/\.xlsx$/i, '.csv'), await xlsxToText(await f.arrayBuffer()));
      } catch {
        throw new AiImportError('spreadsheet', f.name);
      }
      continue;
    }
    const type = f.type || (/\.csv$/i.test(f.name) ? 'text/csv' : /\.(txt|tsv)$/i.test(f.name) ? 'text/plain' : '');
    const buf = await f.arrayBuffer();
    if (!ACCEPTED.test(type)) {
      // Not a type this knows by name - but "whatever file you have" is the
      // promise, so anything whose bytes read as text goes through as text.
      const raw = new Uint8Array(buf);
      if (!looksLikeText(raw)) throw new AiImportError('file_type', f.name);
      pushText(f.name, new TextDecoder().decode(buf));
      continue;
    }
    const isText = /^text\//i.test(type);
    out.push({
      media_type: type,
      data: b64(buf),
      name: f.name,
      bytes: f.size,
      text: isText ? new TextDecoder().decode(buf) : null,
    });
  }
  // The two free refusals, made AFTER the files are read and only on the text
  // ones - a PDF or a photo cannot be sniffed and gets the benefit of the
  // doubt. Both exist for the same reason: the day's read is claimed by the
  // server before the model is called, so a file that cannot possibly work
  // must be stopped on this side of the line, where it costs nothing.
  const texts = out.filter((f) => f.text);
  const chars = texts.reduce((sum, f) => sum + (f.text?.length ?? 0), 0);
  if (chars > AI_MAX_TEXT) throw new AiImportError('too_long', String(chars));
  // And the tighter one: what has to come BACK. Counted across every text
  // file together, because they are read as one request and answered as one
  // document.
  //
  // The ceiling here is what the app can SPLIT to, not what one read holds:
  // past AI_ROWS_PER_READ the file is cut up and the parts are read at the
  // same time (see convertWithAi). AI_MAX_ROWS is where even that runs out.
  const rows = texts.reduce((sum, f) => sum + countRows(f.text ?? ''), 0);
  if (rows > AI_MAX_ROWS) throw new AiImportError('too_many_rows', String(rows));
  // Only when EVERY text file looks like something else: one unreadable file
  // beside a real export is the model's problem, not a reason to refuse.
  if (texts.length > 0 && texts.length === out.length && !texts.some((f) => looksLikeLedger(f.text!))) {
    throw new AiImportError('no_data', texts[0].name);
  }
  return out;
}

// ── the trip assertion's evidence ─────────────────────────────────────────
//
// Screen 2 exists only when the app has a REASON to say out loud: the file's
// dates fall inside a trip it already knows. The check is local and costs
// nothing - but it can only read dates out of text, so a PDF or a photo goes
// straight to the reading screen and the trip question, if the model needs
// one, comes back as its own question with the same chips.

const DATE_RES = [
  /\b(\d{4})-(\d{2})-(\d{2})\b/g, // ISO
  /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, // dd/mm/yyyy - day-first, the app's locales
  /\b(\d{1,2})\/(\d{1,2})\/(\d{2})\b/g, // dd/mm/yy
];

/**
 * The window of dates a text file talks about, or null when it has none.
 *
 * from/to are the DOMINANT CLUSTER, not min..max. A trip file carries its
 * bookings - flights bought in March, hotels in June, for rows lived in
 * August - and a min..max window spanning half a year matched no trip and
 * silenced the one screen this scan exists to draw. The cluster is the
 * tightest run holding 70% of the dates, grown to swallow any neighbour
 * within a week of its edge; allIn says whether it holds every date, which
 * is the difference between saying "all" and "most" out loud.
 */
export function scanFileDates(
  text: string,
): { from: string; to: string; count: number; allIn: boolean } | null {
  const found: string[] = [];
  for (const re of DATE_RES) {
    for (const m of text.matchAll(re)) {
      let iso: string | null = null;
      if (m[1].length === 4) iso = `${m[1]}-${m[2]}-${m[3]}`;
      else {
        const [d, mo] = [Number(m[1]), Number(m[2])];
        if (d < 1 || d > 31 || mo < 1 || mo > 12) continue;
        const y = m[3].length === 2 ? `20${m[3]}` : m[3];
        iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
      const t = Date.parse(iso);
      // Sanity fence: statements are about the recent past, and a serial
      // number that happens to slice like a date should not widen the window.
      if (!Number.isFinite(t)) continue;
      const year = Number(iso.slice(0, 4));
      if (year < 2000 || year > 2100) continue;
      found.push(iso);
    }
    if (found.length) break; // one format per file is how real exports look
  }
  if (found.length < 3) return null; // fewer is a header, not a ledger
  found.sort();
  const day = (s: string) => Date.parse(s) / 86_400_000;
  // The tightest run of 70% of the dates, by sliding a fixed-size window.
  const need = Math.ceil(found.length * 0.7);
  let bi = 0;
  let bspan = Infinity;
  for (let i = 0; i + need - 1 < found.length; i += 1) {
    const span = day(found[i + need - 1]) - day(found[i]);
    if (span < bspan) { bspan = span; bi = i; }
  }
  // Grown outward: the 71st percentile is not an outlier.
  let lo = bi;
  let hi = bi + need - 1;
  while (lo > 0 && day(found[lo]) - day(found[lo - 1]) <= 7) lo -= 1;
  while (hi < found.length - 1 && day(found[hi + 1]) - day(found[hi]) <= 7) hi += 1;
  // Only a cluster that is actually tight earns the right to shed dates: a
  // year of groceries has no "trip window", and pretending it did would say
  // "most of them between Jan and Nov" - true and useless.
  const TIGHT_DAYS = 45;
  if (day(found[hi]) - day(found[lo]) <= TIGHT_DAYS && hi - lo + 1 < found.length) {
    return { from: found[lo], to: found[hi], count: found.length, allIn: false };
  }
  return { from: found[0], to: found[found.length - 1], count: found.length, allIn: true };
}

/**
 * The known trip these dates fall into, if any - the reason screen 2 exists.
 * Padded a week each way, since a trip's flights are booked before its rows.
 */
export function tripForWindow(trips: Trip[], from: string, to: string, padDays = 7): Trip | null {
  const DAY = 24 * 60 * 60 * 1000;
  for (const trip of trips) {
    const span = tripSpan(trip);
    const lo = new Date(Date.parse(span.from) - padDays * DAY).toISOString().slice(0, 10);
    const hi = new Date(Date.parse(span.to) + padDays * DAY).toISOString().slice(0, 10);
    if (from >= lo && to <= hi) return trip;
  }
  return null;
}

// ── the conversation with the function ────────────────────────────────────

export interface AiQuestion {
  ask: string;
  options: string[];
}

export interface AiDone {
  status: 'ok' | 'need_input';
  /** The import this answer belongs to. Handed back so a question's re-run
   *  can carry the SAME id: the triage claimed the day's credit under it,
   *  and a re-run under a fresh id would claim a second one for one file. */
  importId?: string;
  payload?: ImportPayload;
  questions?: AiQuestion[];
  notes: string[];
  remaining: number;
}

export interface AiRow {
  n: number;
  row: Record<string, unknown>;
}

export interface ConvertArgs {
  files: AiFile[];
  trip: { is_trip: boolean; name?: string } | null;
  lang: 'en' | 'it';
  answers?: { ask: string; answer: string }[];
  signal?: AbortSignal;
  onRow?: (row: AiRow) => void;
  /** Two true moments, for the waiting screen's narration: 'sent' the
   *  instant the request leaves (the upload is in flight), 'reading' when
   *  the response headers arrive (the server has the file and the model is
   *  working). Everything else the screen says hangs off rows arriving. */
  onPhase?: (phase: 'sent' | 'reading' | 'triage') => void;
  /** The import every part of a split belongs to. The server claims the
   *  day's credit against this, not against the request, so one file the
   *  user picked costs one import however many reads answered it. */
  importId?: string;
  /** What this ONE request is for. 'triage' sends a sample and asks the
   *  model what it needs to know; 'convert' reads for real and forbids
   *  questions. Unset is the old single-read behaviour: read, and ask if you
   *  must. Set by convertWithAi, never by the screen. */
  mode?: 'triage' | 'convert';
  /** How many rows the sample stands for, so the triage instruction can say
   *  so. Only travels with mode 'triage'. */
  sampleOf?: number;
  /** The questions have been asked and answered already - this is the
   *  re-run. Skip the triage and go straight to the reading. Set by the
   *  questions screen when it re-starts the import with the answers. */
  triaged?: boolean;
}

/** An id for one import, unguessable enough that two people's cannot collide
 *  in the same day - which is all the server needs it for. */
const newImportId = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

/** How long silence is tolerated before the flow gives up on its own.
 *  A reading screen that sits mute for minutes is the failure the user
 *  reported, verbatim - so silence itself is now an error. First answer:
 *  the function has to say SOMETHING (headers, a row, anything) within 90s,
 *  which covers a cold start plus a big PDF being ingested. Between events:
 *  60s, since a model mid-answer emits rows far faster than that.
 *  The localStorage override exists for the browser checks, which cannot
 *  wait a minute and a half to see the watchdog bite. */
const stallMs = (key: string, fallback: number): number => {
  try {
    const v = Number(localStorage.getItem(`expense-tracker.v1.${key}`));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
};

/**
 * ONE conversion, streamed. Resolves with the authoritative answer (the parse
 * of the whole document - the rows handed to onRow are a preview and nothing
 * more), or throws AiImportError with the server's code.
 *
 * convertWithAi below is what callers use; this is the single read it is
 * built out of.
 */
async function oneRead(args: ConvertArgs): Promise<AiDone> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new AiImportError('signed_out', 'no session');

  // The watchdog: an internal controller so a stall can abort the request,
  // chained to the caller's signal so leaving the screen still cancels.
  const FIRST_MS = stallMs('ai-first-ms', 90_000);
  const QUIET_MS = stallMs('ai-quiet-ms', 60_000);
  const ctrl = new AbortController();
  let stalled = false;
  const onCallerAbort = () => ctrl.abort();
  args.signal?.addEventListener('abort', onCallerAbort);
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const arm = (ms: number) => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      stalled = true;
      ctrl.abort();
    }, ms);
  };
  const disarm = () => {
    clearTimeout(watchdog);
    args.signal?.removeEventListener('abort', onCallerAbort);
  };
  const aborted = () => args.signal?.aborted === true;
  const bail = (e: unknown): never => {
    disarm();
    if (stalled && !aborted()) throw new AiImportError('stalled', 'the function went quiet');
    throw e;
  };
  arm(FIRST_MS);

  // Said before a byte moves, and said again if the fetch itself dies: a
  // dropped line is the most ordinary failure this flow will ever meet, and
  // it deserves its own sentence, not a shrug. Nothing has been committed
  // either way - the commit is a separate, local act at the end.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new AiImportError('offline', 'no network');
  }

  args.onPhase?.('sent');
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_FUNCTIONS_URL}/convert-import`, {
    method: 'POST',
    signal: ctrl.signal,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON,
    },
    body: JSON.stringify({
      files: args.files.map((f) => ({ media_type: f.media_type, data: f.data })),
      import_id: args.importId,
      mode: args.mode,
      sample_of: args.sampleOf,
      trip: args.trip,
      lang: args.lang,
      answers: args.answers ?? [],
      stream: true,
    }),
    });
  } catch (e) {
    if (aborted()) throw e; // the user left - not a failure to name
    if (stalled) bail(e);
    // fetch throws a bare TypeError for every network-shaped death - DNS,
    // reset, airplane mode engaged between the check above and the send.
    bail(new AiImportError('offline', e instanceof Error ? e.message : 'network'));
  }
  arm(FIRST_MS); // headers arrived; the body now owes its first event
  args.onPhase?.('reading');

  // A refusal (cap reached, file too big, key unset) is a plain JSON answer.
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    let code = `http_${res.status}`;
    let msg = res.statusText;
    let limit: number | undefined;
    try {
      const body = await res.json();
      code = String(body.code ?? code);
      msg = String(body.error ?? msg);
      if (typeof body.limit === 'number') limit = body.limit;
    } catch { /* not JSON - keep the status */ }
    disarm();
    if (code === 'daily_limit') markAiDayDone();
    throw new AiImportError(code, msg, limit);
  }

  // The SSE stream: `event: <name>\ndata: <json>\n\n`, cut on the blank line.
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done: AiDone | null = null;
  let failed: AiImportError | null = null;

  const handle = (chunk: string) => {
    const lines = chunk.split('\n');
    const event = lines.find((l) => l.startsWith('event: '))?.slice(7).trim();
    const dataLine = lines.find((l) => l.startsWith('data: '))?.slice(6);
    if (!event || !dataLine) return;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(dataLine);
    } catch {
      return; // a malformed frame is dropped; the done event is the truth
    }
    if (event === 'row' && args.onRow) {
      args.onRow({ n: Number(data.n ?? 0), row: (data.row ?? {}) as Record<string, unknown> });
    } else if (event === 'done') {
      const status = data.status === 'need_input' ? 'need_input' : 'ok';
      done = {
        status,
        notes: Array.isArray(data.notes) ? (data.notes as unknown[]).filter((n): n is string => typeof n === 'string') : [],
        remaining: typeof data.remaining === 'number' ? data.remaining : 0,
        questions: Array.isArray(data.questions)
          ? (data.questions as Record<string, unknown>[]).map((q) => ({
              ask: String(q.ask ?? ''),
              options: Array.isArray(q.options) ? (q.options as unknown[]).map(String) : [],
            }))
          : undefined,
        // The server's ok shape nests the file under `payload`, already in the
        // exact form buildImport eats: {version, currency, transactions}.
        payload:
          status === 'ok' && data.payload && typeof data.payload === 'object'
            ? (data.payload as ImportPayload)
            : undefined,
      };
      // Only when the server actually SAID zero - a frame with no remaining
      // field parses as 0 above, and that default must not paint the door.
      if (typeof data.remaining === 'number' && data.remaining === 0) markAiDayDone();
    } else if (event === 'failed') {
      failed = new AiImportError(String(data.code ?? 'failed'), String(data.error ?? ''));
      if (failed.code === 'daily_limit') markAiDayDone();
    }
  };

  try {
    for (;;) {
      const { value, done: eof } = await reader.read();
      if (value) {
        arm(QUIET_MS);
        buffer += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buffer.indexOf('\n\n')) !== -1) {
          handle(buffer.slice(0, cut));
          buffer = buffer.slice(cut + 2);
        }
      }
      if (eof) break;
    }
  } catch (e) {
    if (aborted()) throw e;
    if (stalled) bail(e);
    // The line died with the answer half-said. The server had already read
    // the file by then, so no promise of a refund - just the truth: nothing
    // was added, and trying again is allowed.
    bail(new AiImportError('offline', e instanceof Error ? e.message : 'stream lost'));
  }
  disarm();
  if (failed) throw failed;
  if (!done) throw new AiImportError('cut_off', 'the stream ended without an answer');
  return done;
}

/**
 * A question from a read that was told not to ask.
 *
 * It should not happen - the facts, the triage and the answers are all in
 * front of the model by then - but a model is not a contract. When it does,
 * the honest thing is not to put the question on screen (answering would
 * re-run every part from zero, which is the loop this whole arrangement
 * exists to end) but to say what was asked and let the person try again;
 * the day's credit comes back on failure, so a retry costs nothing.
 */
const lateOrDone = (done: AiDone): AiDone => {
  if (done.status !== 'need_input') return done;
  const asked = (done.questions ?? []).map((q) => q.ask).join(' · ');
  throw new AiImportError('asked_late', asked || 'the reading asked a question it could not ask');
};

/**
 * One conversion, however many reads it takes.
 *
 * A file too long for a single read is cut up and the parts are read AT THE
 * SAME TIME, then joined here - so the screen above never learns that
 * anything unusual happened. Rows keep arriving through the same onRow, the
 * running count keeps climbing, and what comes back is one payload.
 *
 * Why parallel, and why it is not an optimisation but the fix: a Supabase
 * Edge Function is killed at 150 seconds of wall clock, and the model writes
 * about 4 rows a second. A 1,206-row file needs five minutes, so ONE read
 * could never finish it - the log said `"reason": "WallClockTime"` and the
 * stream stopped, unanswered, after 600 rows had gone by on screen. Reads
 * sized to 400 rows each finish in ~100 seconds; fired together, so does the
 * whole import.
 *
 * All the parts share one `importId`, and the server claims the day's credit
 * against that rather than per request - one file the user picked is one
 * import, however many reads it took to answer.
 *
 * What it deliberately does NOT do:
 *
 *   carry on past a failure   Every part must land. Half a statement
 *                             imported silently is worse than a failure that
 *                             says so - and the day's credit now comes back
 *                             on failure, so trying again is cheap.
 *   answer questions twice    If a part asks something, that answer is
 *                             returned as it stands and the flow puts the
 *                             question on screen; replying re-runs the whole
 *                             import with the answer attached, which is the
 *                             only way the parts can agree about it.
 */
export async function convertWithAi(args: ConvertArgs): Promise<AiDone> {
  // The re-run after a question carries the id the triage claimed the credit
  // under; only a fresh import mints one.
  const importId = args.importId ?? newImportId();
  const rows = args.files.reduce((n, f) => n + (f.text ? countRows(f.text) : 0), 0);

  // ── the questions, first and once ─────────────────────────────────────
  // A big file's questions are asked on a SAMPLE before the reading starts.
  // The call takes seconds; the reading it protects takes minutes and
  // restarts from zero on every answer. Skipped when the questions have
  // already been asked (this is the re-run with the answers), and when there
  // is nothing to sample (a photo, a PDF - those ask as they always did).
  if (rows > AI_TRIAGE_ROWS && !args.triaged) {
    const sample = sampleForTriage(args.files);
    if (sample) {
      args.onPhase?.('triage');
      const first = await oneRead({
        ...args, files: sample, importId, mode: 'triage', sampleOf: rows,
        onPhase: undefined, onRow: undefined,
      });
      if (first.status === 'need_input' && first.questions?.length) return { ...first, importId };
    }
  }

  const parts = splitForReads(args.files);
  // The read that does the work is told it may not ask. Everything it could
  // need was settled above - by the phone's own facts, by the triage, by the
  // answers it carries - and a question now would throw away minutes of
  // reading, across every part at once.
  const mode = rows > AI_TRIAGE_ROWS ? 'convert' as const : undefined;
  // A small file is read the old way, and the old way may ask: a question
  // after a ten-second read is a ten-second cost, and the answer screen is
  // the right place for it. Only a read that was TOLD not to ask is held to
  // that.
  const settle = (done: AiDone) => (mode === 'convert' ? lateOrDone(done) : done);
  if (!parts) return { ...settle(await oneRead({ ...args, importId, mode })), importId };

  // Rows arrive interleaved from every part at once, so the number on screen
  // counts what has ACTUALLY landed rather than any one part's position - the
  // per-part n restarts at 1 and would walk the count backwards.
  let seen = 0;
  const bump = args.onRow
    ? (r: AiRow) => { seen += 1; args.onRow!({ ...r, n: seen }); }
    : undefined;

  const answers = await Promise.all(parts.map((files, i) => oneRead({
    ...args,
    files,
    importId,
    mode,
    // The phases narrate the first part only. They run 'sent' then 'reading',
    // and eight parts reporting them would walk the screen backwards
    // repeatedly through one wait.
    onPhase: i === 0 ? args.onPhase : undefined,
    onRow: bump,
  })));

  answers.forEach(settle);
  const last = answers[answers.length - 1];
  return {
    ...last, // remaining and status from the last to land: the newer truth
    importId,
    notes: answers.flatMap((a) => a.notes).filter((n, i, all) => all.indexOf(n) === i),
    payload: {
      ...(answers[0].payload ?? last.payload!),
      // In part order, not completion order: the file's own order is the one
      // the user will scroll through on the review screen.
      transactions: answers.flatMap((a) => a.payload?.transactions ?? []),
    },
  };
}
