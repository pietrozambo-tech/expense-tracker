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
  ) {
    super(message);
  }
}

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

/** The window of dates a text file talks about, or null when it has none. */
export function scanFileDates(text: string): { from: string; to: string; count: number } | null {
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
  return { from: found[0], to: found[found.length - 1], count: found.length };
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
}

/**
 * One conversion, streamed. Resolves with the authoritative answer (the
 * parse of the whole document - the rows handed to onRow are a preview and
 * nothing more), or throws AiImportError with the server's code.
 */
export async function convertWithAi(args: ConvertArgs): Promise<AiDone> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new AiImportError('signed_out', 'no session');

  // Said before a byte moves, and said again if the fetch itself dies: a
  // dropped line is the most ordinary failure this flow will ever meet, and
  // it deserves its own sentence, not a shrug. Nothing has been committed
  // either way - the commit is a separate, local act at the end.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new AiImportError('offline', 'no network');
  }

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_FUNCTIONS_URL}/convert-import`, {
    method: 'POST',
    signal: args.signal,
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
    if (args.signal?.aborted) throw e; // the user left - not a failure to name
    // fetch throws a bare TypeError for every network-shaped death - DNS,
    // reset, airplane mode engaged between the check above and the send.
    throw new AiImportError('offline', e instanceof Error ? e.message : 'network');
  }

  // A refusal (cap reached, file too big, key unset) is a plain JSON answer.
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    let code = `http_${res.status}`;
    let msg = res.statusText;
    try {
      const body = await res.json();
      code = String(body.code ?? code);
      msg = String(body.error ?? msg);
    } catch { /* not JSON - keep the status */ }
    throw new AiImportError(code, msg);
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
    } else if (event === 'failed') {
      failed = new AiImportError(String(data.code ?? 'failed'), String(data.error ?? ''));
    }
  };

  try {
    for (;;) {
      const { value, done: eof } = await reader.read();
      if (value) {
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
    if (args.signal?.aborted) throw e;
    // The line died with the answer half-said. The server had already read
    // the file by then, so no promise of a refund - just the truth: nothing
    // was added, and trying again is allowed.
    throw new AiImportError('offline', e instanceof Error ? e.message : 'stream lost');
  }
  if (failed) throw failed;
  if (!done) throw new AiImportError('cut_off', 'the stream ended without an answer');
  return done;
}
