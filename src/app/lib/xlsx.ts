// An .xlsx workbook, turned into CSV text on the phone.
//
// The AI import accepts "whatever file you have", and the file people have
// most is an Excel sheet. It cannot travel as it is: an .xlsx is a ZIP of
// XML, and a model handed zip bytes produces a confident reading of nothing
// (the Edge Function refuses them for exactly that reason). So the phone
// unpacks it and sends what the sheet SAYS - which also keeps the upload a
// few KB instead of the workbook's megabytes.
//
// Deliberately minimal, and dependency-free: the full xlsx ecosystem is a
// megabyte of parser for features (formulas, charts, merged styling) that a
// list of transactions never uses. This reads exactly what such a list is
// made of: the zip directory, shared strings, cell values, and - the one
// genuinely treacherous part - DATES, which Excel stores as day counts
// ("45123") that would otherwise arrive at the model as large meaningless
// numbers and come back as amounts.
//
// DecompressionStream does the actual inflating. It is in every browser this
// app supports (iOS 16.4+) and in Node, which is what lets the whole file be
// unit-tested without a browser.

const decoder = new TextDecoder();

// ── the zip ───────────────────────────────────────────────────────────────

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
}

const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

/** The central directory, found from the end-of-directory record. */
function zipEntries(bytes: Uint8Array): ZipEntry[] {
  // The EOCD record is at the very end, before an optional comment capped at
  // 64KB. Scan backwards for its signature.
  let eocd = -1;
  const stop = Math.max(0, bytes.length - 65558);
  for (let i = bytes.length - 22; i >= stop; i -= 1) {
    if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip');
  const count = u16(bytes, eocd + 10);
  let at = u32(bytes, eocd + 16);
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n += 1) {
    if (u32(bytes, at) !== 0x02014b50) break;
    const nameLen = u16(bytes, at + 28);
    const extraLen = u16(bytes, at + 30);
    const commentLen = u16(bytes, at + 32);
    out.push({
      name: decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen)),
      method: u16(bytes, at + 10),
      compressedSize: u32(bytes, at + 20),
      localOffset: u32(bytes, at + 42),
    });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function readEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  // The local header repeats the name and carries its own extra field, whose
  // length can differ from the central directory's copy - so both are read
  // from the local header itself.
  const at = entry.localOffset;
  if (u32(bytes, at) !== 0x04034b50) throw new Error('bad local header');
  const nameLen = u16(bytes, at + 26);
  const extraLen = u16(bytes, at + 28);
  const data = bytes.subarray(at + 30 + nameLen + extraLen, at + 30 + nameLen + extraLen + entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method !== 8) throw new Error(`unsupported compression ${entry.method}`);
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ── the XML, read with a small regex parser ───────────────────────────────
//
// Machine-written OOXML is regular enough for this; a DOM parser would be
// more principled and also does not exist in Node, where this is tested.

const unescapeXml = (s: string) =>
  s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
   .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
   .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
   .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const attrs = (tag: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
};

/** Every <t> run inside a fragment, joined - a styled cell splits its text. */
const textRuns = (xml: string) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)]
    .map((m) => unescapeXml(m[1] ?? '')).join('');

// ── dates ─────────────────────────────────────────────────────────────────

/** Built-in format ids that mean a date or time. */
const BUILTIN_DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/** A custom format code that talks about days, months, years or hours is a
 *  date format - once quoted literals and [colour] tags are out of the way,
 *  since "0.00" is not a date but '"day "0' would otherwise read as one. */
const isDateCode = (code: string) =>
  /[dmyhs]/i.test(code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, ''));

/** Excel's day zero, chosen so the sheet's fictional 29 Feb 1900 cancels out. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

function serialToIso(serial: number): string {
  const ms = Math.round(serial * 86400000);
  const d = new Date(EXCEL_EPOCH_UTC + ms);
  const date = d.toISOString().slice(0, 10);
  // A whole serial is a date; a fraction is a time of day worth keeping.
  return Number.isInteger(serial) ? date : `${date} ${d.toISOString().slice(11, 16)}`;
}

// ── cells ─────────────────────────────────────────────────────────────────

const colIndex = (ref: string): number => {
  let n = 0;
  for (const ch of ref) {
    if (ch < 'A' || ch > 'Z') break;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
};

// A cell can hold a line break - someone pressed alt-enter while typing a
// comment. CSV allows that, quoted, and a real CSV parser reads it back
// whole. But nothing downstream of here is a CSV parser: the row counter, the
// splitter that cuts a long file into parallel reads, the sample the triage
// is built from and the model itself all read LINE BY LINE, and a row spread
// over two lines is a row one of them will get wrong. The break carries
// nothing a ledger needs - "Pranzo\nKevin" says the same as "Pranzo Kevin" -
// so it becomes a space here, where it is still one cell and cannot be
// mistaken for the end of a row.
const csvField = (v: string) => {
  const flat = v.replace(/[\r\n]+/g, ' ').trimEnd();
  return /[",]/.test(flat) ? `"${flat.replace(/"/g, '""')}"` : flat;
};

export interface SheetCsv {
  name: string;
  csv: string;
}

/**
 * The workbook's sheets as CSV, in workbook order. Throws on anything that
 * is not an xlsx - the caller owns the sentence shown for that.
 */
export async function xlsxToCsv(buf: ArrayBuffer): Promise<SheetCsv[]> {
  const bytes = new Uint8Array(buf);
  const entries = new Map(zipEntries(bytes).map((e) => [e.name, e]));
  const read = async (name: string): Promise<string | null> => {
    const e = entries.get(name);
    return e ? decoder.decode(await readEntry(bytes, e)) : null;
  };

  const workbook = await read('xl/workbook.xml');
  if (!workbook) throw new Error('no workbook');

  // Shared strings: most text cells point into this table.
  const shared: string[] = [];
  const sst = await read('xl/sharedStrings.xml');
  if (sst) for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textRuns(m[1]));

  // Styles: which cell formats mean "this number is a date".
  const dateStyles = new Set<number>();
  const styles = await read('xl/styles.xml');
  if (styles) {
    const custom = new Map<number, string>();
    for (const m of styles.matchAll(/<numFmt\s+numFmtId="(\d+)"\s+formatCode="([^"]*)"/g)) {
      custom.set(Number(m[1]), unescapeXml(m[2]));
    }
    const xfs = styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/);
    if (xfs) {
      [...xfs[1].matchAll(/<xf\b[^>]*>/g)].forEach((m, i) => {
        const id = Number(attrs(m[0]).numFmtId ?? 0);
        if (BUILTIN_DATE_IDS.has(id) || (custom.has(id) && isDateCode(custom.get(id)!))) dateStyles.add(i);
      });
    }
  }

  // Sheet names to files, via the relationship ids; fall back to file order
  // for a workbook whose rels are missing.
  const rels = new Map<string, string>();
  const relXml = await read('xl/_rels/workbook.xml.rels');
  if (relXml) {
    for (const m of relXml.matchAll(/<Relationship\b[^>]*>/g)) {
      const a = attrs(m[0]);
      if (a.Id && a.Target) rels.set(a.Id, a.Target.replace(/^\//, '').replace(/^(?!xl\/)/, 'xl/'));
    }
  }
  const sheets: { name: string; path: string }[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const a = attrs(m[0]);
    const path = rels.get(a['r:id'] ?? '') ?? `xl/worksheets/sheet${sheets.length + 1}.xml`;
    sheets.push({ name: unescapeXml(a.name ?? `Sheet${sheets.length + 1}`), path });
  }

  const out: SheetCsv[] = [];
  for (const sheet of sheets) {
    const xml = await read(sheet.path);
    if (!xml) continue;
    const lines: string[] = [];
    for (const rowM of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const fields: string[] = [];
      for (const cellM of rowM[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const a = attrs(`<c ${cellM[1]}>`);
        const body = cellM[2] ?? '';
        const col = a.r ? colIndex(a.r) : fields.length;
        while (fields.length < col) fields.push('');
        let value = '';
        const v = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1] ?? '';
        if (a.t === 's') value = shared[Number(v)] ?? '';
        else if (a.t === 'inlineStr') value = textRuns(body);
        else if (a.t === 'str') value = unescapeXml(v);
        else if (a.t === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
        else if (a.t === 'e') value = '';
        else if (v !== '') {
          const num = Number(v);
          value = Number.isFinite(num) && dateStyles.has(Number(a.s ?? -1)) && num > 0
            ? serialToIso(num)
            : unescapeXml(v);
        }
        fields[col] = value;
      }
      lines.push(fields.map(csvField).join(','));
    }
    // A sheet of nothing (formatting rows only) says nothing worth sending.
    if (lines.some((l) => l.replace(/,/g, '').trim())) out.push({ name: sheet.name, csv: lines.join('\n') });
  }
  return out;
}

/**
 * The whole workbook as ONE text file for the model, each sheet under its own
 * header - the import prompt already insists on reading every sheet, and a
 * multi-sheet workbook split into separate uploads would eat into the
 * function's four-file limit.
 */
export async function xlsxToText(buf: ArrayBuffer): Promise<string> {
  const sheets = await xlsxToCsv(buf);
  if (sheets.length === 0) throw new Error('empty workbook');
  if (sheets.length === 1) return sheets[0].csv;
  return sheets.map((s) => `### Sheet: ${s.name}\n${s.csv}`).join('\n\n');
}
