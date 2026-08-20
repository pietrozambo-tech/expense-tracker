// Apple's "client secret" is not a secret you are given - it is a JWT you
// sign yourself, with the .p8 key from the developer portal. Supabase's Apple
// provider asks for the result, and Apple rejects anything older than six
// months, so this has to be run again twice a year.
//
//   node scripts/apple-client-secret.mjs \
//     --key ~/Downloads/AuthKey_ABCD1234.p8 \
//     --team TEAMID1234 \
//     --kid ABCD1234 \
//     --services com.tracklylab.web
//
// Prints the JWT. Paste it into Supabase → Authentication → Providers →
// Apple → "Secret Key (for OAuth)".
//
// The .p8 never leaves the machine this runs on. Do not paste its contents
// anywhere - into a chat, a web tool, or a repository. If it leaks, revoke the
// key in the developer portal and make a new one; it is the credential that
// proves your app is your app.
//
// No dependencies: Node signs ES256 natively, and 'ieee-p1363' asks for the
// raw r||s form JWT wants rather than the DER form OpenSSL defaults to - the
// single detail that makes a hand-rolled Apple JWT work or fail.

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1];
};

const keyPath = arg('key');
const team = arg('team');
const kid = arg('kid');
const services = arg('services');
const months = Number(arg('months') ?? 6);

if (!keyPath || !team || !kid || !services) {
  console.error(`
Missing an argument. All four are required:

  --key       path to the AuthKey_XXXXXXXXXX.p8 downloaded from Apple
  --team      your Team ID          (developer portal, top right)
  --kid       the Key ID            (shown beside the key you created)
  --services  the Services ID       (e.g. com.tracklylab.web)

Optional:
  --months    lifetime, max 6 (Apple's limit). Default 6.
`);
  process.exit(1);
}

if (!(months > 0 && months <= 6)) {
  console.error('Apple rejects a client secret valid for more than 6 months.');
  process.exit(1);
}

let privateKey;
try {
  privateKey = readFileSync(keyPath, 'utf8');
} catch (e) {
  console.error(`Could not read ${keyPath}: ${e.message}`);
  process.exit(1);
}
if (!privateKey.includes('BEGIN PRIVATE KEY')) {
  console.error('That file does not look like a .p8 private key.');
  process.exit(1);
}

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const now = Math.floor(Date.now() / 1000);
const exp = now + Math.round(months * 30.4 * 24 * 60 * 60);

const header = b64url(JSON.stringify({ alg: 'ES256', kid }));
const payload = b64url(JSON.stringify({
  iss: team,
  iat: now,
  exp,
  aud: 'https://appleid.apple.com',
  sub: services,
}));

const signature = b64url(
  createSign('SHA256')
    .update(`${header}.${payload}`)
    .sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }),
);

console.log(`${header}.${payload}.${signature}`);
console.error(`\n(valid until ${new Date(exp * 1000).toISOString().slice(0, 10)} - Apple's cap is 6 months, so diarise it)`);
