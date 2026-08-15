// Regenerates src/app/lib/zones.ts from the system tzdb.
//
//   node scripts/gen-zones.mjs
//
// The table answers one question - which country is this IANA timezone in -
// which the platform will not answer for us: Intl exposes the zone name and
// nothing about where it is. tzdb ships exactly this mapping in zone.tab /
// zone1970.tab, so the table is generated rather than hand-typed, and can be
// regenerated when tzdata moves.
import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) => {
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
};

const zones = new Map();
// zone.tab lists exactly one country per zone, which is the answer we want.
for (const line of read('/usr/share/zoneinfo/zone.tab').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const [cc, , tz] = line.split('\t');
  if (cc && tz) zones.set(tz, cc);
}
// zone1970.tab covers a few zones zone.tab drops, but can name several
// countries that have agreed since 1970; the first is the primary one.
for (const line of read('/usr/share/zoneinfo/zone1970.tab').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const [codes, , tz] = line.split('\t');
  if (codes && tz && !zones.has(tz)) zones.set(tz, codes.split(',')[0]);
}

// Legacy aliases some devices still report. tzdb records these in a
// 'backward' file that is not shipped in compiled form, and the compiled
// tzfiles are not byte-identical to their canonical twins, so there is
// nothing on disk to derive them from - they are listed. Short, and it has
// not changed in years; anything missed simply means the nudge stays quiet.
const ALIASES = {
  'Africa/Asmera': 'Africa/Asmara',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Catamarca': 'America/Argentina/Catamarca',
  'America/Cordoba': 'America/Argentina/Cordoba',
  'America/Coral_Harbour': 'America/Atikokan',
  'America/Godthab': 'America/Nuuk',
  'America/Indianapolis': 'America/Indiana/Indianapolis',
  'America/Jujuy': 'America/Argentina/Jujuy',
  'America/Louisville': 'America/Kentucky/Louisville',
  'America/Mendoza': 'America/Argentina/Mendoza',
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Europe/Kiev': 'Europe/Kyiv',
  'Pacific/Enderbury': 'Pacific/Kanton',
  'Pacific/Ponape': 'Pacific/Pohnpei',
  'Pacific/Truk': 'Pacific/Chuuk',
};
for (const [alias, canonical] of Object.entries(ALIASES)) {
  const cc = zones.get(canonical);
  if (cc && !zones.has(alias)) zones.set(alias, cc);
}

const sorted = [...zones.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
const rows = sorted.map(([tz, cc]) => `  '${tz}': '${cc}',`).join('\n');

const out = `// IANA timezone -> ISO 3166-1 alpha-2 country. GENERATED - do not edit by hand.
//
//   node scripts/gen-zones.mjs
//
// Why this exists: the platform tells us the zone ('Asia/Manila') and nothing
// about where that is, and there is no Intl API for the rest. tzdb ships the
// mapping, so it is generated from the system's own tzdata rather than typed
// out and left to rot.
//
// A zone1970 row can name several countries that have kept the same clock
// since 1970; the first is taken as the primary. That is a real limit - a
// zone shared across a border can name the wrong side - and it is why every
// consumer of this treats a miss as "say nothing" rather than "guess".

export const ZONE_COUNTRY: Record<string, string> = {
${rows}
};

/** The country a timezone sits in, or null when we cannot say. */
export function countryOfZone(zone: string | undefined | null): string | null {
  if (!zone) return null;
  return ZONE_COUNTRY[zone] ?? null;
}
`;
writeFileSync('src/app/lib/zones.ts', out);
console.log(`wrote ${sorted.length} zones`);
