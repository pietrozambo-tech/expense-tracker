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
 * This spoofs the Android app's User-Agent because the endpoint requires it.
 * It is for getting your own trip out, at your own scale - two requests. Do
 * not point it at anything that is not yours.
 */
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const API = 'https://api.tricount.bunq.com';
// The endpoint refuses anything that does not look like the app.
const APP_UA = 'com.bunq.tricount.android:RELEASE:7.0.7:3174:ANDROID:13:C';

// Entry types, as they appear in `type_transaction`. Settlements are money
// moving between people; only NORMAL rows are spending. These are the values
// seen in the wild - an unknown one is a hard stop rather than a guess,
// because guessing wrong here either invents spending or hides some.
const SPENDING_TYPES = new Set(['NORMAL']);
const SETTLEMENT_TYPES = new Set(['BALANCE', 'INCOME', 'REIMBURSEMENT', 'TRANSFER']);

function usage(msg) {
  if (msg) console.error(`\n${msg}`);
  console.error(`
Usage:
  node scripts/tricount-import.mjs --url <share link> --me "<your name>" [options]

  --url <link>      the Tricount share link (tricount.com/…), or --key <token>
  --me <name>       your display name IN the tricount, exactly as it appears
  --out <file>      where to write the import file (default tricount-import.json)
  --currency <ISO>  your home currency for the file (default EUR)
  --inspect         report what the trip contains and write the raw JSON; no conversion
  --raw <file>      also save the raw API response (default with --inspect)

First run:
  node scripts/tricount-import.mjs --url <link> --inspect
`);
  process.exit(msg ? 1 : 0);
}

function parseArgs(argv) {
  const args = { currency: 'EUR', out: 'tricount-import.json' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) usage(`${a} needs a value.`);
      i += 1;
      return v;
    };
    if (a === '--url') args.url = next();
    else if (a === '--key') args.key = next();
    else if (a === '--me') args.me = next();
    else if (a === '--out') args.out = next();
    else if (a === '--raw') args.raw = next();
    else if (a === '--currency') args.currency = next().toUpperCase();
    else if (a === '--inspect') args.inspect = true;
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
export function convertEntry(entry, me, homeCurrency) {
  const type = entry.type_transaction ?? '(missing)';
  if (SETTLEMENT_TYPES.has(type)) return { skip: 'settlement' };
  if (!SPENDING_TYPES.has(type)) {
    throw new Error(
      `Entry "${entry.description ?? entry.id}" has type_transaction "${type}", which this script ` +
        'does not know how to treat.\nRun with --inspect and tell me what you see - guessing here ' +
        'either invents spending or hides some.',
    );
  }

  const allocations = entry.allocations ?? [];
  if (!allocations.length) {
    throw new Error(`Entry "${entry.description ?? entry.id}" has no allocations, so no share can be worked out.`);
  }

  const mine = allocations.find((a) => displayName(a.membership) === me);
  if (!mine) return { skip: 'not mine' };

  // Values arrive signed from the payer's point of view; a share is a
  // magnitude. Rounded to cents because floating point sums of thirds do not
  // land clean and a ledger should not carry 33.33333333333333.
  const share = Math.round(Math.abs(num(mine.amount?.value)) * 100) / 100;
  if (!Number.isFinite(share)) {
    throw new Error(`Entry "${entry.description ?? entry.id}" has an unreadable allocation amount.`);
  }
  if (share === 0) return { skip: 'zero share' };

  // Reconciliation: the shares must add up to what the thing cost. If they do
  // not, the field being read is not the one being assumed, and every number
  // in the output is suspect - so say so here rather than let it through.
  const total = Math.abs(num(entry.amount?.value));
  const summed = allocations.reduce((sum, a) => sum + Math.abs(num(a.amount?.value)), 0);
  if (Number.isFinite(total) && total > 0 && Math.abs(summed - total) > 0.02 + total * 0.001) {
    throw new Error(
      `Entry "${entry.description ?? entry.id}": the shares add up to ${summed.toFixed(2)} but the ` +
        `expense is ${total.toFixed(2)}.\nThe amount fields are not what this script assumes - stop and check ` +
        'with --inspect rather than import these numbers.',
    );
  }

  const currency = mine.amount?.currency ?? entry.amount?.currency ?? homeCurrency;
  const date = String(entry.date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Entry "${entry.description ?? entry.id}" has an unreadable date: ${entry.date}`);
  }

  const record = {
    date,
    amount: share,
    type: 'expense',
    // Tricount's own category, passed through as a name. Whatever does not
    // match one of yours lands in the catch-all, and the app counts those and
    // offers the review filter - which is a better place to sort them out
    // than a mapping table guessed at here.
    category: entry.category_custom || entry.category || 'Others',
    description: entry.description || undefined,
  };
  // Only when it differs from the file's currency: TracklyLab converts, and it
  // wants the amount exactly as it was spent.
  if (currency && currency !== homeCurrency) record.currency = currency;
  return { record, currency };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url && !args.key) usage('Give me the trip: --url <share link> (or --key <token>).');
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

  const transactions = [];
  const skipped = { settlement: 0, 'not mine': 0, 'zero share': 0 };
  const currencies = new Set();
  for (const entry of entries) {
    const out = convertEntry(entry, args.me, args.currency);
    if (out.skip) {
      skipped[out.skip] += 1;
      continue;
    }
    transactions.push(out.record);
    currencies.add(out.currency);
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date));
  const payload = { version: 1, currency: args.currency, transactions };
  writeFileSync(args.out, JSON.stringify(payload, null, 2));

  const byCurrency = new Map();
  for (const t of transactions) {
    const c = t.currency ?? args.currency;
    byCurrency.set(c, (byCurrency.get(c) ?? 0) + t.amount);
  }

  console.log(`\nTrip:      ${registry.title ?? '(untitled)'}`);
  console.log(`You:       ${args.me}`);
  console.log(`Written:   ${args.out}  (${transactions.length} transactions)`);
  console.log(`Left out:  ${skipped.settlement} settling-up, ${skipped['not mine']} you were not part of, ${skipped['zero share']} zero-share`);
  console.log('\nYour share of this trip:');
  for (const [c, total] of byCurrency) console.log(`  ${total.toFixed(2)} ${c}`);
  console.log(`
Check that against what Tricount shows as your own total before importing.
If the two agree, the mapping is right. If they do not, do not import this
file - run --inspect and we will look at why.

Then: Settings -> Import -> choose ${args.out}.`);
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
