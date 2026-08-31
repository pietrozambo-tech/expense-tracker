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
  onPhase?: (phase: 'sent' | 'reading') => void;
}

/**
 * One conversion, streamed. Resolves with the authoritative answer (the
 * parse of the whole document - the rows handed to onRow are a preview and
 * nothing more), or throws AiImportError with the server's code.
 */
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

export async function convertWithAi(args: ConvertArgs): Promise<AiDone> {
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
