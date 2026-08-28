#!/usr/bin/env node
/**
 * Turn a Tricount trip into a TracklyLab import file.
 *
 * Tricount has no self-service export: its own FAQ tells you to email
 * support@bunq.com and wait. It does, however, serve every shared trip to the
 * public share link over an API, which is what this reads - your own data,
 * through the access mechanism Tricount itself hands out. Two requests, from
 * your machine, nothing through anyone else's server.
 *
 *   node scripts/tricount-import.mjs --url <share link> --me "<your name>"
 *
 * WHAT IT IMPORTS, AND WHY THAT IS THE INTERESTING PART
 *
 * A tricount records what each expense COST and who PAID it. Neither is your
 * spending. If you put €400 on the hotel for four people, €300 of that is a
 * loan you get back; your expense is €100. So every row here is your own
 * allocation - your share - and money moving between people (settling up) is
 * not spending at all and is left out entirely.
 *
 * WHY IT WOULD RATHER FAIL THAN FINISH
 *
 * The API is undocumented and was mapped by reading open-source clients, so
 * some field meanings are inferred rather than known. The failure that matters
 * is not a crash - it is a file full of plausible wrong numbers, which imports
 * cleanly and quietly misstates a trip. So anything unrecognised stops the run
 * and says what it saw, and every conversion is reconciled against the
 * expense's own total before it is written. Run --inspect first: it reports
 * what your trip actually contains, from your data rather than my assumptions.
 *
 * Check the reported total against the figure Tricount shows for you. If they
 * agree, the mapping is right; if they do not, do not import the file.
 *
 * A second opinion, if you want one: tricount-exporter.pages.dev does the
 * same fetch entirely in the browser and shows per-person totals. Two
 * independent readings of the same trip agreeing is about as much assurance
 * as an undocumented API allows.
 *
 * This spoofs the Android app's User-Agent because the endpoint requires it.
 * It is for getting your own trip out, at your own scale - two requests. Do
 * not point it at anything that is not yours.
 */
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const API = 'https://api.tricount.bunq.com';
// The endpoint refuses anything that does not look like the app.
const APP_UA = 'com.bunq.tricount.android:RELEASE:7.0.7:3174:ANDROID:13:C';

// Entry types, as they appear in `type_transaction`.
//
// These two, and ONLY these two, are what two independent working clients
// agree on: NORMAL rows are spending, BALANCE rows are people settling up.
// An earlier version of this list also carried INCOME, REIMBURSEMENT and
// TRANSFER, invented here on the reasoning that they sounded like
// settlements. That was the very mistake this script is meant to avoid: a
// guess that silently DROPS rows is no better than one that silently invents
// them, and Tricount is known to emit at least INCOME. So the list stays at
// what is confirmed, and anything else stops the run to be identified.
const SPENDING_TYPES = new Set(['NORMAL']);
const SETTLEMENT_TYPES = new Set(['BALANCE']);

function usage(msg) {
  if (msg) console.error(`\n${msg}`);
  console.error(`
Usage:
  node scripts/tricount-import.mjs --from-json <export.json> --me "<your name>"
  node scripts/tricount-import.mjs --url <share link> --me "<your name>" [options]

  --from-json <f>   a JSON export from tricount-exporter.pages.dev (no network)
  --url <link>      the Tricount share link (tricount.com/…), or --key <token>
  --me <name>       your display name IN the tricount, exactly as it appears
  --out <file>      where to write the import file (default tricount-import.json)
  --currency <ISO>  your home currency for the file (default EUR)
  --categories <f>  a TracklyLab backup, so subcategories use YOUR names
  --trip-name <n>   prefix every description ("Formentera - Cena porto"), so this
                    trip stays searchable next to the other trips in the app
  --no-trip         keep each row's own category instead of filing it all under Travel
  --inspect         report what the trip contains and write the raw JSON; no conversion
  --raw <file>      also save the raw API response (default with --inspect)

First run:
  node scripts/tricount-import.mjs --url <link> --inspect
`);
  process.exit(msg ? 1 : 0);
}

function parseArgs(argv) {
  // Trip mode by default: this reads Tricounts, and a Tricount is nearly
  // always one trip. --no-trip is there for a flatshare or a standing group.
  const args = { currency: 'EUR', out: 'tricount-import.json', trip: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) usage(`${a} needs a value.`);
      i += 1;
      return v;
    };
    if (a === '--from-json') args.fromJson = next();
    else if (a === '--categories') args.categories = next();
    else if (a === '--url') args.url = next();
    else if (a === '--key') args.key = next();
    else if (a === '--me') args.me = next();
    else if (a === '--out') args.out = next();
    else if (a === '--raw') args.raw = next();
    else if (a === '--currency') args.currency = next().toUpperCase();
    else if (a === '--inspect') args.inspect = true;
    else if (a === '--trip-name') args.tripName = next();
    else if (a === '--no-trip') args.trip = false;
    else if (a === '--trip') args.trip = true;
    else if (a === '--help' || a === '-h') usage();
    else usage(`Unknown option: ${a}`);
  }
  return args;
}

/**
 * The share key is the last path segment of the link. Tricount has used a few
 * link shapes over the years (/t/<key>, /<key>, with or without a query), so
 * take the last non-empty segment rather than matching one of them.
 */
function keyFromUrl(url) {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean);
    const key = seg[seg.length - 1];
    if (!key) throw new Error('no path');
    return key;
  } catch {
    usage(`That does not look like a Tricount link: ${url}`);
    return '';
  }
}

async function api(path, { method = 'GET', body, token, appId }) {
  const headers = {
    'User-Agent': APP_UA,
    'app-id': appId,
    // Unique per request, which is what a client request id means. The
    // open-source clients happen to hardcode one; if the endpoint ever
    // objects to a fresh one, that is the first thing to try changing.
    'X-Bunq-Client-Request-Id': randomUUID(),
  };
  if (token) headers['X-Bunq-Client-Authentication'] = token;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Tricount API said ${res.status}.\n${text.slice(0, 400)}\n\n` +
        'If this is 401/403 the anonymous share-link flow may have changed, or the\n' +
        'link may no longer be shared. Open the link in a browser to check it still works.',
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Tricount API returned something that is not JSON:\n${text.slice(0, 400)}`);
  }
}

/**
 * Register an anonymous session. The keypair is generated for this run and
 * thrown away with it - the public half is what the endpoint wants, and the
 * private half is never needed for the share-link flow.
 */
async function openSession() {
  const appId = randomUUID();
  const { publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const data = await api('/v1/session-registry-installation', {
    method: 'POST',
    appId,
    body: {
      app_installation_uuid: appId,
      client_public_key: publicKey,
      device_description: 'Android',
    },
  });

  const items = data?.Response;
  if (!Array.isArray(items)) throw new Error('The session response had no Response array.');
  const token = items.find((x) => x?.Token)?.Token?.token;
  const userId = items.find((x) => x?.UserPerson)?.UserPerson?.id;
  if (!token || !userId) {
    throw new Error('The session response carried no token / user id - the handshake has changed.');
  }
  return { token, userId, appId };
}

const displayName = (m) => m?.RegistryMembershipNonUser?.alias?.display_name ?? null;
const num = (v) => (v === null || v === undefined ? NaN : Number(v));

/** Registry entries, unwrapped from their one-key envelopes. */
function entriesOf(registry) {
  const raw = registry?.all_registry_entry;
  if (!Array.isArray(raw)) throw new Error('The registry had no all_registry_entry array.');
  return raw.map((e) => e?.RegistryEntry ?? e).filter(Boolean);
}

function inspect(registry, entries) {
  const people = (registry.memberships ?? []).map(displayName).filter(Boolean);
  const types = new Map();
  const currencies = new Set();
  for (const e of entries) {
    const k = e.type_transaction ?? '(missing)';
    types.set(k, (types.get(k) ?? 0) + 1);
    if (e.amount?.currency) currencies.add(e.amount.currency);
    if (e.amount_local?.currency) currencies.add(e.amount_local.currency);
  }

  console.log(`\nTrip:        ${registry.title ?? '(untitled)'}`);
  console.log(`People:      ${people.join(', ') || '(none found)'}`);
  console.log(`Entries:     ${entries.length}`);
  console.log(`Currencies:  ${[...currencies].join(', ') || '(none)'}`);
  console.log('\nEntry types (this is what decides expense vs settling up):');
  for (const [k, n] of types) {
    const role = SPENDING_TYPES.has(k) ? 'spending' : SETTLEMENT_TYPES.has(k) ? 'settling up' : 'UNKNOWN - would stop the run';
    console.log(`  ${String(n).padStart(4)}  ${k.padEnd(16)} ${role}`);
  }

  const sample = entries[0];
  if (sample) {
    console.log('\nOne entry, so the field mapping can be eyeballed:');
    console.log(`  description   ${sample.description}`);
    console.log(`  date          ${sample.date}`);
    console.log(`  amount        ${sample.amount?.value} ${sample.amount?.currency}`);
    console.log(`  amount_local  ${sample.amount_local?.value} ${sample.amount_local?.currency}`);
    console.log(`  paid by       ${displayName(sample.membership_owned)}`);
    console.log(`  category      ${sample.category}${sample.category_custom ? ` / ${sample.category_custom}` : ''}`);
    console.log(`  allocations   ${(sample.allocations ?? []).length}`);
    for (const al of sample.allocations ?? []) {
      console.log(`     ${displayName(al.membership)}: ${al.amount?.value} ${al.amount?.currency} (${al.type ?? 'no type'})`);
    }
  }
  console.log('\nNames must be passed to --me exactly as shown under People.');
}

/**
 * One tricount entry -> at most one of my transactions.
 *
 * Returns {skip: reason} rather than throwing for the ordinary reasons a row
 * is not mine to record, and throws only when the row cannot be understood -
 * the case where carrying on would mean inventing a number.
 */
/**
 * The same job, starting from a JSON export instead of the API.
 *
 * tricount-exporter.pages.dev does the fetch in the browser and hands you
 * `[{date, description, category, paid_by, total, shares:{name: amount}}]`.
 * Converting that needs no network at all, and it is the safer of the two
 * roads here: the export has been eyeballed by a human before it arrives,
 * whereas the API path is written from other people's clients and untested.
 *
 * Its `shares` are COSTS - what each person's portion came to - which is
 * worth stating because the neighbouring format everyone assumes (Splitwise)
 * puts BALANCES in those columns instead: paid minus consumed, sign and all.
 * Read one as the other and every number comes out wrong while looking
 * perfectly reasonable.
 */
export function convertExported(row, me, trip = true, taxonomy = DEFAULT_TAXONOMY) {
  const label = row.description ?? '(no description)';
  const problem = (kind, message) => ({ problem: { kind, label, message } });

  const shares = row.shares ?? {};
  const names = Object.keys(shares);
  if (!names.length) return problem('no allocations', 'has no shares, so no portion can be worked out');

  const total = Number(row.total);
  const summed = Math.round(names.reduce((sum, n) => sum + Number(shares[n]), 0) * 100) / 100;
  if (Number.isFinite(total) && total > 0 && Math.abs(summed - total) > 0.02 + total * 0.001) {
    return problem('does not reconcile', `shares add up to ${summed.toFixed(2)} but the expense is ${total.toFixed(2)}`);
  }

  if (!(me in shares)) return { skip: 'not mine' };
  const share = Math.round(Number(shares[me]) * 100) / 100;
  if (!Number.isFinite(share)) return problem('bad amount', 'has an unreadable share');
  if (share === 0) return { skip: 'zero share' };

  const date = String(row.date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return problem('bad date', `has an unreadable date: ${row.date}`);

  const { category, subcategory } = categorise(row, trip, taxonomy);

  return {
    record: {
      date,
      amount: share,
      type: 'expense',
      category,
      ...(subcategory ? { subcategory } : {}),
      description: row.description || undefined,
    },
  };
}

// The exporter's category enum, onto the default category names. A miss is not
// a disaster - the app files an unknown name in the catch-all and COUNTS it,
// which is what puts the row in front of you in the review filter rather than
// pretending it was categorised - but a hit saves that work.
const CATEGORY_NAMES = {
  FOOD_AND_DRINK: 'Food & Drinks',
  FOOD: 'Food & Drinks',
  GROCERIES: 'Groceries',
  TRANSPORT: 'Transports',
  TRAVEL: 'Travel',
  ACCOMMODATION: 'Travel',
  ENTERTAINMENT: 'Leisure',
  LEISURE: 'Leisure',
  SHOPPING: 'Shopping',
  HEALTH: 'Health & Care',
  HOUSING: 'Housing',
};

// A trip is one thing that happened, so it belongs under one category, with
// the shape of it in the subcategories - which is also what makes the Trend
// card's "share of Travel" read as a breakdown of the trip.
//
// What those subcategories are CALLED is not for this script to decide. It
// used to name them from the app's seed list, which meant a file could carry
// "Hotel" to somebody who had deliberately deleted "Hotel" in favour of
// "Accomodation" - and since the import dialog starts every proposed chip
// ticked, one tap on Import put the deleted one back. Every import undid the
// same deletion again. So rows are sorted into BUCKETS here, and the naming
// is resolved against the user's own category list when it is available.
const BUCKETS = {
  // In preference order: the first of the user's own subcategories that
  // matches one of these names is the one used for that bucket.
  flights: ['flights', 'flight', 'voli', 'volo', 'aerei'],
  lodging: ['accomodation', 'accommodation', 'alloggio', 'alloggi', 'hotel', 'hotels'],
  food: ['food', 'cibo', 'restaurant', 'ristorante', 'pasti', 'meals'],
  transport: ['transportation', 'transport', 'transports', 'trasporti', 'trasporto'],
  activities: ['activities', 'activity', 'attivita', 'escursioni', 'esperienze'],
};

// Only used when the user's real categories were not supplied. These are the
// app's seeded names, which is the best available guess and still only a
// guess - main() says so out loud when it falls back to them.
const SEEDED_NAMES = {
  flights: 'Flights',
  lodging: 'Hotel',
  food: 'Food',
  transport: 'Transportation',
  activities: 'Activities',
};

const fold = (s) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Work out what to call things, from the user's own category list.
 *
 * Found by id rather than by name: the seeded travel category keeps the id
 * "travel" in every language, so this still works for somebody whose category
 * reads "Viaggi". A bucket with no matching subcategory of theirs resolves to
 * null, and rows in it are written without one - proposing a new chip is the
 * behaviour that caused the problem.
 */
export function travelTaxonomy(categories) {
  if (!Array.isArray(categories)) {
    return { name: 'Travel', sub: { ...SEEDED_NAMES }, resolved: false, missing: [] };
  }
  const travel =
    categories.find((c) => c.id === 'travel') ??
    categories.find((c) => ['travel', 'viaggi', 'viaggio', 'trips', 'trip'].includes(fold(c.name)));
  if (!travel) {
    return { name: 'Travel', sub: { ...SEEDED_NAMES }, resolved: false, missing: [] };
  }
  const theirs = travel.subcategories ?? [];
  const sub = {};
  const missing = [];
  for (const [bucket, names] of Object.entries(BUCKETS)) {
    let pick = null;
    for (const wanted of names) {
      const hit = theirs.find((x) => fold(x) === wanted);
      if (hit) { pick = hit; break; }
    }
    sub[bucket] = pick;
    if (!pick) missing.push(bucket);
  }
  return { name: travel.name, sub, resolved: true, missing, theirs };
}

const DEFAULT_TAXONOMY = { name: 'Travel', sub: { ...SEEDED_NAMES }, resolved: false, missing: [] };

// The exporter's category enum, onto BUCKETS rather than onto names - see
// travelTaxonomy for why naming is resolved separately.
const TRAVEL_SUBS = {
  FOOD_AND_DRINK: 'food',
  FOOD: 'food',
  GROCERIES: 'food',
  TRANSPORT: 'transport',
  ACCOMMODATION: 'lodging',
  ENTERTAINMENT: 'activities',
  LEISURE: 'activities',
};

// Note what is NOT here: TRAVEL itself. On a trip export that value carries
// no information - everything is travel - so rows marked with it are read
// from their description instead, which is how "Hotel PD Sud" lands beside
// the other hotels rather than in a different subcategory from them.
//
// Only where the word is decisive. Anything else is left without a
// subcategory rather than filed on a hunch: an empty one is a gap you can
// see and fill, a wrong one is a gap that looks filled. Italian and English
// both, because trip descriptions are written in whatever language the trip
// was had in. The text is accent-folded before matching (see fold).
const TRAVEL_WORDS = [
  [/\b(volo|voli|flight|aereo|ryanair|easyjet|azul|tap)\b/i, 'flights'],
  // "camper" and "roulotte" are deliberately absent: on this trip they turned
  // up in "Birre camper aperitivo" and "Cena roulotte insular", where the
  // meal is the expense and the vehicle is just where it happened.
  [/\b(hotel|hostel|airbnb|b&b|alloggio|apartment|appartamento|camping)\b/i, 'lodging'],
  [/\b(pranzo|cena|colazione|merenda|caff?e|bar|birr\w*|ristorante|pizza|toast|yogurt|empanadas|acqua|acque|aperitivo|ape|snack|dinner|lunch|breakfast|drinks?)\b/i, 'food'],
  [/\b(taxi|traghetto|ferry|benzina|benza|gasolio|macchina|auto|hertz|noleggio|bus|treno|train|parcheggio|barca|boat)\b/i, 'transport'],
  [/\b(escursione|tour|balene|whale|canoa|kayak|terme|biliardo|museo|ticket|ingresso|trip|diving|snorkel)\b/i, 'activities'],
];

export function categorise(row, trip, taxonomy = DEFAULT_TAXONOMY) {
  const raw = row.category;
  const named = raw && raw !== 'UNCATEGORIZED' && raw !== 'OTHER';

  if (!trip) {
    // UNCATEGORIZED and OTHER mean "nobody said", which is not a category to
    // map: they go to the catch-all to be sorted out.
    return { category: (named && (CATEGORY_NAMES[raw] ?? raw)) || 'Others', subcategory: null };
  }

  // Trip mode: everything is Travel, and what KIND of travel spending comes
  // from the source category when that says something specific, and from the
  // description when it does not. A specific enum beats a keyword hunt; a
  // keyword beats an enum that only says "travel".
  let bucket = named ? TRAVEL_SUBS[raw] ?? null : null;
  if (!bucket) {
    // Accents stripped before matching. Not for tidiness: JavaScript's \b
    // does not treat "é" as a letter, so /\bcafe\b/ never matches "Café" -
    // the word boundary fails on the accent itself. Folding the text once is
    // more reliable than spelling every accented variant into every pattern.
    const text = fold(row.description);
    bucket = TRAVEL_WORDS.find(([re]) => re.test(text))?.[1] ?? null;
  }

  // A bucket the user has no subcategory for is written WITHOUT one. Naming
  // it anyway is what put a deleted "Hotel" back on every import.
  return { category: taxonomy.name, subcategory: (bucket && taxonomy.sub[bucket]) || null };
}

/**
 * The exporter's CSV, as rows shaped like its JSON.
 *
 * Header: date,description,category,paid_by,total,<person>,<person>,…
 * The per-person columns are that person's SHARE, blank when they were not in
 * it - the same costs-not-balances distinction as the JSON, in a layout that
 * looks even more like a Splitwise export than the JSON does.
 */
export function parseExportedCsv(text) {
  // Fields can be quoted, and a description may legitimately contain a comma.
  const parseLine = (line) => {
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };

  const lines = text.replace(/\r\n?/g, '\n').trim().split('\n').filter((l) => l.trim());
  if (!lines.length) throw new Error('The CSV is empty.');
  const header = parseLine(lines[0]).map((h) => h.trim());
  const FIXED = ['date', 'description', 'category', 'paid_by', 'total'];
  for (let i = 0; i < FIXED.length; i += 1) {
    if (header[i]?.toLowerCase() !== FIXED[i]) {
      throw new Error(
        `This is not the exporter's CSV: column ${i + 1} is "${header[i]}", expected "${FIXED[i]}".\n` +
          `Header seen: ${header.join(', ')}`,
      );
    }
  }
  const people = header.slice(FIXED.length).filter(Boolean);
  if (!people.length) throw new Error('The CSV has no per-person columns, so no share can be read.');

  return lines.slice(1).map((line) => {
    const c = parseLine(line);
    const shares = {};
    people.forEach((p, i) => {
      const v = c[FIXED.length + i];
      if (v !== undefined && v.trim() !== '') shares[p] = Number(v);
    });
    return {
      date: c[0],
      description: c[1],
      category: c[2],
      paid_by: c[3],
      total: Number(c[4]),
      shares,
    };
  });
}

export function convertEntry(entry, me, homeCurrency, trip = true, taxonomy = DEFAULT_TAXONOMY) {
  const label = entry.description ?? `entry ${entry.id}`;
  // Problems are RETURNED, not thrown, so one run can report every one of them
  // at once. Stopping at the first sent you round the loop again for the
  // second, which for a trip with a few odd rows is a miserable way to find
  // out what they are.
  const problem = (kind, message) => ({ problem: { kind, label, message } });

  const type = entry.type_transaction ?? '(missing)';
  if (SETTLEMENT_TYPES.has(type)) return { skip: 'settlement' };
  if (!SPENDING_TYPES.has(type)) {
    return problem('unknown type', `type_transaction "${type}" is neither known spending nor known settling up`);
  }

  const allocations = entry.allocations ?? [];
  if (!allocations.length) return problem('no allocations', 'has no allocations, so no share can be worked out');

  const mine = allocations.find((a) => displayName(a.membership) === me);
  if (!mine) return { skip: 'not mine' };

  // Values arrive signed from the payer's point of view; a share is a
  // magnitude. Rounded to cents because floating point sums of thirds do not
  // land clean and a ledger should not carry 33.33333333333333.
  const share = Math.round(Math.abs(num(mine.amount?.value)) * 100) / 100;
  if (!Number.isFinite(share)) return problem('bad amount', 'has an unreadable allocation amount');
  if (share === 0) return { skip: 'zero share' };

  // Reconciliation: the shares must add up to what the thing cost. If they do
  // not, the field being read is not the one being assumed, and every number
  // in the output is suspect - so say so rather than let it through.
  const total = Math.abs(num(entry.amount?.value));
  const summed = allocations.reduce((sum, a) => sum + Math.abs(num(a.amount?.value)), 0);
  if (Number.isFinite(total) && total > 0 && Math.abs(summed - total) > 0.02 + total * 0.001) {
    return problem(
      'does not reconcile',
      `shares add up to ${summed.toFixed(2)} but the expense is ${total.toFixed(2)}`,
    );
  }

  const currency = mine.amount?.currency ?? entry.amount?.currency ?? homeCurrency;
  const date = String(entry.date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return problem('bad date', `has an unreadable date: ${entry.date}`);
  }

  const { category, subcategory } = categorise(
    { category: entry.category_custom || entry.category, description: entry.description },
    trip,
    taxonomy,
  );
  const record = {
    date,
    amount: share,
    type: 'expense',
    category,
    ...(subcategory ? { subcategory } : {}),
    description: entry.description || undefined,
  };
  // Only when it differs from the file's currency: TracklyLab converts, and it
  // wants the amount exactly as it was spent.
  if (currency && currency !== homeCurrency) record.currency = currency;
  return { record, currency };
}

/** Shared by both roads: convert, refuse on anything unclear, write, report. */
function finish(rows, convert, { me, currency, out, title, tripName, ledger }) {
  const transactions = [];
  const skipped = { settlement: 0, 'not mine': 0, 'zero share': 0 };
  const problems = [];
  for (const row of rows) {
    const res = convert(row);
    if (res.problem) problems.push(res.problem);
    else if (res.skip) skipped[res.skip] += 1;
    else transactions.push(res.record);
  }

  // Nothing is written when anything was not understood. A partial file is
  // the worst outcome available here: it imports cleanly, looks complete, and
  // is quietly missing a piece of the trip.
  if (problems.length) {
    const byKind = new Map();
    for (const p of problems) {
      if (!byKind.has(p.kind)) byKind.set(p.kind, []);
      byKind.get(p.kind).push(p);
    }
    console.error(`\nStopped: ${problems.length} row(s) could not be read with confidence. Nothing was written.\n`);
    for (const [kind, list] of byKind) {
      console.error(`  ${kind} (${list.length}):`);
      for (const p of list.slice(0, 5)) console.error(`    - "${p.label}" ${p.message}`);
      if (list.length > 5) console.error(`    …and ${list.length - 5} more`);
    }
    console.error('\nSend me what --inspect prints for these. A guess here would either invent spending or hide some.');
    process.exit(1);
  }

  // The trip's name, onto every description. Dates cannot group a trip -
  // most of one is booked months before it is taken - so a searchable word
  // in the description is the only grouping that survives export, backup and
  // another trip arriving next month. Idempotent on purpose: a description
  // that already starts with the name is left alone.
  if (tripName) {
    for (const t of transactions) {
      const d = t.description ?? '';
      if (!d.toLowerCase().startsWith(tripName.toLowerCase())) {
        t.description = d ? `${tripName} - ${d}` : tripName;
      }
    }
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date));
  writeFileSync(out, JSON.stringify({ version: 1, currency, transactions }, null, 2));

  const byCurrency = new Map();
  const byMonth = new Map();
  for (const t of transactions) {
    const c = t.currency ?? currency;
    byCurrency.set(c, (byCurrency.get(c) ?? 0) + t.amount);
    const m = t.date.slice(0, 7);
    byMonth.set(m, Math.round(((byMonth.get(m) ?? 0) + t.amount) * 100) / 100);
  }

  // The API road knows a settlement when it sees one (type_transaction is
  // BALANCE). An export has no such field, so a "Marco pays Anna" row would
  // come through here as ordinary spending and inflate the trip. Structure
  // cannot decide it - a row with one person's share is far more often
  // somebody paying for you alone - so these are REPORTED rather than
  // dropped, and you say which they are.
  const SETTLEMENT_WORDS = /\b(rimbors\w*|risarcim\w*|payment|paid|pays|paga|pagat\w*|settle\w*|saldo|refund|reimburs\w*|bonifico|transfer)\b/i;
  const suspicious = transactions.filter((t) => SETTLEMENT_WORDS.test(t.description ?? ''));

  console.log(`\nTrip:      ${title ?? '(untitled)'}`);
  console.log(`You:       ${me}`);
  console.log(`Written:   ${out}  (${transactions.length} transactions)`);
  console.log(`Left out:  ${skipped.settlement} settling-up, ${skipped['not mine']} you were not part of, ${skipped['zero share']} zero-share`);
  console.log('\nYour share of this trip:');
  for (const [c, total] of byCurrency) console.log(`  ${total.toFixed(2)} ${c}`);

  // Trips get booked months before they are taken, and those bookings keep
  // the date the money actually left - which is right, and surprising if
  // nobody says so first.
  if (byMonth.size > 1) {
    console.log('\nIt lands across several months, because that is when it was paid:');
    for (const [m, v] of [...byMonth].sort()) console.log(`  ${m}  ${v.toFixed(2)}`);
  }
  if (suspicious.length) {
    console.log(`
Worth a look - these read like people settling up rather than spending, and an
export does not mark them the way the API does. If any of them IS a settlement,
delete it from ${out} before importing:`);
    for (const t of suspicious) console.log(`  ${t.date}  ${t.amount.toFixed(2).padStart(9)}  ${t.description}`);
  }

  // Against what is already in the ledger, when a backup was supplied.
  //
  // Loading a trip midway and again at the end is the normal way to use this,
  // and the app handles the ordinary case itself: a row it has already
  // imported is recognised and skipped. What it CANNOT recognise is a row
  // that changed in Tricount after the first import - somebody added to an
  // old expense, an amount corrected - because the app matches on the
  // amount. That row arrives as new, and the ledger quietly ends up holding
  // both figures. Only a human can say which is right, so it is named here
  // rather than resolved.
  if (ledger) {
    const fold = (d) => (d ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const byKey = new Map();
    for (const t of ledger) {
      if (t?.type !== 'expense' && t?.type !== 'income') continue;
      byKey.set(`${t.date}|${fold(t.description)}`, Math.round(Number(t.amount) * 100) / 100);
    }
    let known = 0;
    const changed = [];
    for (const t of transactions) {
      const had = byKey.get(`${t.date}|${fold(t.description)}`);
      if (had === undefined) continue;
      if (Math.abs(had - t.amount) < 0.005) known += 1;
      else changed.push({ ...t, was: had });
    }
    const fresh = transactions.length - known - changed.length;
    console.log(`\nAgainst your backup: ${known} already imported, ${fresh} new, ${changed.length} changed.`);
    if (changed.length) {
      console.log(`
These exist in your ledger with a DIFFERENT amount - someone edited them in
Tricount after your last import. The app matches on the amount, so it will not
recognise them: they would import ALONGSIDE the old figures, counting twice.
Fix each one in the app (or delete the old row) before importing:`);
      for (const t of changed) {
        console.log(`  ${t.date}  was ${t.was.toFixed(2)} -> now ${t.amount.toFixed(2)}   ${t.description}`);
      }
    }
  }

  console.log(`
Check the total against what Tricount shows as yours before importing.
Then: Settings -> Import -> choose ${out}.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // What to call the trip's subcategories. Read from the user's own export
  // when they give one, because the alternative is naming chips they may have
  // deliberately deleted - and the import dialog ticks every proposed chip by
  // default, so a name invented here comes back as a real one on one tap.
  let taxonomy = DEFAULT_TAXONOMY;
  let ledger = null;
  if (args.categories) {
    let backup;
    try {
      backup = JSON.parse(readFileSync(args.categories, 'utf8'));
    } catch (e) {
      throw new Error(`Could not read ${args.categories}: ${e.message}`);
    }
    taxonomy = travelTaxonomy(backup.categories ?? backup);
    // The same file also says what is already in the ledger, which is what
    // makes a second import of the same trip safe to reason about.
    ledger = Array.isArray(backup.transactions) ? backup.transactions : null;
    if (!taxonomy.resolved) {
      throw new Error(`No travel category found in ${args.categories}. Is it a TracklyLab backup?`);
    }
  }
  if (args.trip && !args.inspect && !args.tripName) {
    console.log(
      'Tip: --trip-name "Azzorre" prefixes every description, so this trip stays\n' +
        '     searchable in the app next to the next one. Skipping it is fine for a\n' +
        '     first or only trip. (Pick one spelling and keep it: the name is part of\n' +
        '     each row\'s dedupe identity, so re-importing under a different name\n' +
        '     would import the same trip twice.)',
    );
  }
  if (args.trip && !args.inspect) {
    if (taxonomy.resolved) {
      const used = Object.entries(taxonomy.sub).filter(([, v]) => v).map(([k, v]) => `${k} -> ${v}`);
      console.log(`Using your own subcategories: ${used.join(', ') || '(none matched)'}`);
      if (taxonomy.missing.length) {
        console.log(`No subcategory of yours for: ${taxonomy.missing.join(', ')} - those rows get none.`);
      }
    } else {
      console.log(
        'Note: filing subcategories under the app\'s default names ' +
          `(${Object.values(SEEDED_NAMES).join(', ')}).\n` +
          '      If yours are spelled differently, the import will OFFER these as new\n' +
          '      subcategories - unticked, so unless you tick them the rows arrive with\n' +
          '      none at all. Pass --categories <your-backup.json> to use your own names.',
      );
    }
  }

  // The offline road: an export somebody already produced and looked at.
  if (args.fromJson) {
    if (!args.me) usage('Give me your name as it appears in the export: --me "Pit".');
    let text;
    try {
      text = readFileSync(args.fromJson, 'utf8');
    } catch (e) {
      throw new Error(`Could not read ${args.fromJson}: ${e.message}`);
    }
    // The exporter offers both, and which one you clicked is not something to
    // have to remember: decide from the content, not the file extension.
    let rows;
    if (text.trimStart().startsWith('[') || text.trimStart().startsWith('{')) {
      rows = JSON.parse(text);
      if (!Array.isArray(rows)) throw new Error(`${args.fromJson} is not a list of expenses.`);
    } else {
      rows = parseExportedCsv(text);
    }
    const people = [...new Set(rows.flatMap((r) => Object.keys(r?.shares ?? {})))];
    if (!people.includes(args.me)) {
      throw new Error(`"${args.me}" is not in this export.\nThe people in it are: ${people.join(', ')}`);
    }
    finish(rows, (row) => convertExported(row, args.me, args.trip, taxonomy), {
    tripName: args.tripName,
      ledger,
      me: args.me,
      currency: args.currency,
      out: args.out,
      title: args.fromJson,
    });
    return;
  }

  if (!args.url && !args.key) usage('Give me the trip: --url <share link>, --key <token>, or --from-json <file>.');
  if (!args.inspect && !args.me) {
    usage('Give me your name in the tricount: --me "Pietro".\nRun --inspect first if you are not sure how it is spelled.');
  }
  const key = args.key ?? keyFromUrl(args.url);

  console.log('Opening an anonymous session…');
  const { token, userId, appId } = await openSession();

  console.log('Fetching the trip…');
  const data = await api(`/v1/user/${userId}/registry?public_identifier_token=${encodeURIComponent(key)}`, {
    token,
    appId,
  });

  const registry = data?.Response?.[0]?.Registry;
  if (!registry) throw new Error('No Registry in the response - is the link still shared?');
  const entries = entriesOf(registry);

  const rawPath = args.raw ?? (args.inspect ? 'tricount-raw.json' : null);
  if (rawPath) {
    writeFileSync(rawPath, JSON.stringify(data, null, 2));
    console.log(`Raw response saved to ${rawPath}`);
  }

  if (args.inspect) {
    inspect(registry, entries);
    return;
  }

  const people = (registry.memberships ?? []).map(displayName).filter(Boolean);
  if (!people.includes(args.me)) {
    throw new Error(
      `"${args.me}" is not one of the people in this trip.\nThey are: ${people.join(', ')}\n` +
        'Pass --me exactly as it is spelled there.',
    );
  }

  finish(entries, (entry) => convertEntry(entry, args.me, args.currency, args.trip, taxonomy), {
    tripName: args.tripName,
      ledger,
    me: args.me,
    currency: args.currency,
    out: args.out,
    title: registry.title,
  });
}

export { keyFromUrl, entriesOf, displayName };

// Only when run as a command. The conversion is imported by its test, which
// must not set a session going.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`\n${e.message}`);
    process.exit(1);
  });
}
