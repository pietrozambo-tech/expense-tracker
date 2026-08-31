// A real .xlsx, built by hand, for testing the reader in src/app/lib/xlsx.ts.
//
// Written with node:zlib and forty lines of zip bookkeeping rather than an
// xlsx library, for the same reason the reader has no dependency: the point
// is to know exactly what is in the file. CRCs are written as zero - the
// reader (like DecompressionStream itself) never checks them, and nothing
// else ever opens these bytes.
import { deflateRawSync } from 'node:zlib';

const enc = new TextEncoder();

export function buildZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const u16 = (n) => Buffer.from([n & 0xff, (n >> 8) & 0xff]);
  const u32 = (n) => Buffer.from([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
  for (const [name, content] of files) {
    const nameB = Buffer.from(enc.encode(name));
    const raw = Buffer.from(enc.encode(content));
    const packed = deflateRawSync(raw);
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(8), u16(0), u16(0),
      u32(0), u32(packed.length), u32(raw.length), u16(nameB.length), u16(0), nameB, packed,
    ]);
    central.push({ nameB, packed: packed.length, raw: raw.length, offset });
    chunks.push(local);
    offset += local.length;
  }
  const cd = [];
  for (const e of central) {
    cd.push(Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(8), u16(0), u16(0),
      u32(0), u32(e.packed), u32(e.raw), u16(e.nameB.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(e.offset), e.nameB,
    ]));
  }
  const cdBuf = Buffer.concat(cd);
  const eocd = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
    u32(cdBuf.length), u32(offset), u16(0),
  ]);
  return Buffer.concat([...chunks, cdBuf, eocd]);
}

/** Days since Excel's epoch for a UTC calendar date. */
export const serialOf = (y, m, d) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;

/**
 * A workbook shaped like the thing people actually import: a header row,
 * dated expense rows (dates as styled serials - the treacherous part), a
 * description with a comma, a two-run shared string, and a second sheet.
 * Rows dated inside August 2026 on purpose, so the browser check can drop
 * this straight onto the app's Azores trip.
 */
export function buildWorkbook() {
  const sst = `<?xml version="1.0"?><sst count="6" uniqueCount="6">
    <si><t>date</t></si>
    <si><t>description</t></si>
    <si><t>amount</t></si>
    <si><r><t>Ferry </t></r><r><t>ride</t></r></si>
    <si><t>Lunch, at the port &amp; bar</t></si>
    <si><t>Hotel night</t></si>
  </sst>`;
  const styles = `<?xml version="1.0"?><styleSheet>
    <numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>
    <cellXfs count="3">
      <xf numFmtId="0" fontId="0"/>
      <xf numFmtId="14" fontId="0" applyNumberFormat="1"/>
      <xf numFmtId="164" fontId="0" applyNumberFormat="1"/>
    </cellXfs>
  </styleSheet>`;
  const workbook = `<?xml version="1.0"?><workbook xmlns:r="rel">
    <sheets>
      <sheet name="Spese" sheetId="1" r:id="rId1"/>
      <sheet name="Entrate" sheetId="2" r:id="rId2"/>
    </sheets>
  </workbook>`;
  const rels = `<?xml version="1.0"?><Relationships>
    <Relationship Id="rId1" Target="worksheets/sheet1.xml"/>
    <Relationship Id="rId2" Target="worksheets/sheet2.xml"/>
  </Relationships>`;
  const s1 = `<?xml version="1.0"?><worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
    <row r="2"><c r="A2" s="1"><v>${serialOf(2026, 8, 22)}</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>30</v></c></row>
    <row r="3"><c r="A3" s="2"><v>${serialOf(2026, 8, 22)}</v></c><c r="B3" t="s"><v>4</v></c><c r="C3"><v>26.59</v></c></row>
    <row r="4"><c r="A4" s="1"><v>${serialOf(2026, 8, 23)}</v></c><c r="B4" t="inlineStr"><is><t>Burger</t></is></c><c r="C4"><v>9</v></c></row>
    <row r="5"><c r="A5" s="1"><v>${serialOf(2026, 8, 23) + 0.5}</v></c><c r="B5" t="s"><v>5</v></c><c r="C5"><v>43.34</v></c></row>
  </sheetData></worksheet>`;
  const s2 = `<?xml version="1.0"?><worksheet><sheetData>
    <row r="1"><c r="A1" s="1"><v>${serialOf(2026, 8, 27)}</v></c><c r="C1"><v>2400</v></c><c r="D1" t="b"><v>1</v></c></row>
  </sheetData></worksheet>`;
  return buildZip([
    ['xl/workbook.xml', workbook],
    ['xl/_rels/workbook.xml.rels', rels],
    ['xl/sharedStrings.xml', sst],
    ['xl/styles.xml', styles],
    ['xl/worksheets/sheet1.xml', s1],
    ['xl/worksheets/sheet2.xml', s2],
  ]);
}
