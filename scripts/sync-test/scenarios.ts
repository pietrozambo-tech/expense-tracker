// Two phones, one account. Does anything get lost?
//
// Runs the REAL src/app/lib/cloud.ts (copied in unchanged) against an
// in-memory stand-in for Supabase. The Phone class mirrors what App.tsx does:
//
//   - hydrate once on sign-in, remembering the server's version stamp
//   - after any change, write the whole payload BUT ONLY IF that stamp still
//     matches; on a mismatch, pull, three-way merge, write again
//   - returning to the foreground checks the stamp and pulls if it moved
//
// Run with:  pnpm test:sync   (add --before for the pre-fix behaviour)
// a foreground that only ever writes) and watch the same scenarios fail.

import {
  loadCloud,
  loadCloudVersion,
  saveCloudChecked,
  mergePayloads,
  type SyncPayload,
} from './lib/cloud';
import { db } from './lib/supabase';

const OLD = process.argv.includes('--before');
const USER = 'user-shared-account';

const tx = (id: string, description: string, amount: number) => ({
  id,
  description,
  amount,
  currency: 'EUR',
  baseAmount: amount,
  category: { id: 'c1', name: 'Groceries', icon: 'ShoppingCart', color: 'text-green-500', bgColor: 'bg-green-50', selectedBg: 'bg-green-100', type: 'expense' as const, subcategories: [] },
  date: '2026-07-28',
  type: 'expense' as const,
  recurrence: 'Never repeat',
});

class Phone {
  name: string;
  transactions: any[] = [];
  base: SyncPayload | null = null;
  version: string | null = null;

  constructor(name: string) {
    this.name = name;
  }

  private payload(): SyncPayload {
    return {
      transactions: this.transactions,
      recurringRules: [],
      categories: [],
      incomeCategories: [],
      sources: [],
      settings: { onboarded: true, userName: 'Shared', currency: 'EUR', hasSeenIntro: true },
    };
  }

  async openApp() {
    const cloud = await loadCloud(USER);
    this.transactions = cloud?.payload.transactions ?? [];
    this.base = cloud?.payload ?? null;
    this.version = cloud?.version ?? null;
    say(`${this.name} opens the app  -> sees ${this.list()}`);
  }

  add(id: string, description: string, amount: number) {
    this.transactions = [...this.transactions, tx(id, description, amount)];
    say(`${this.name} adds "${description}"  -> phone now has ${this.list()}`);
  }

  remove(description: string) {
    this.transactions = this.transactions.filter((t) => t.description !== description);
    say(`${this.name} deletes "${description}"  -> phone now has ${this.list()}`);
  }

  async sync() {
    for (let attempt = 0; attempt < 3; attempt++) {
      const payload = this.payload();
      // The old behaviour: write regardless of what is on the server.
      const res = OLD
        ? await saveCloudChecked(USER, payload, this.version ?? null).then(async (r) => {
            if (r.ok) return r;
            // Emulate the unconditional upsert by forcing the write through.
            const cur = await loadCloud(USER);
            return saveCloudChecked(USER, payload, cur?.version ?? null);
          })
        : await saveCloudChecked(USER, payload, this.version);

      if (res.ok) {
        this.base = payload;
        this.version = res.version;
        say(`${this.name} syncs  -> server now has ${serverList()}`);
        return;
      }
      const remote = await loadCloud(USER);
      if (!remote) { this.version = null; continue; }
      const merged = mergePayloads(this.base, payload, remote.payload);
      say(`${this.name} hits a conflict -> merges -> ${fmt(merged.transactions)}`);
      this.transactions = merged.transactions;
      this.base = remote.payload;
      this.version = remote.version;
    }
  }

  async foreground() {
    say(`${this.name} reopens the app from the background`);
    if (!OLD) {
      const version = await loadCloudVersion(USER);
      if (version && version !== this.version) {
        const remote = await loadCloud(USER);
        if (remote) {
          const merged = mergePayloads(this.base, this.payload(), remote.payload);
          this.transactions = merged.transactions;
          this.base = remote.payload;
          this.version = remote.version;
          say(`${this.name} pulls what changed  -> phone now has ${this.list()}`);
        }
      }
    }
    await this.sync();
  }

  list() { return fmt(this.transactions); }
}

const fmt = (list: any[]) => (list?.length ? list.map((t) => t.description).join(' + ') : '(nothing)');
const serverList = () => fmt(((db.rows[0]?.data as any)?.transactions) ?? []);
const say = (s: string) => console.log('   ' + s);
const heading = (s: string) => console.log(`\n${s}\n${'-'.repeat(s.length)}`);
const reset = () => { db.rows = []; };

let failures = 0;
function expect(label: string, actual: string, expected: string) {
  const norm = (v: string) => v.split(' + ').sort().join(' + ');
  const ok = norm(actual) === norm(expected);
  if (!ok) failures++;
  console.log(`\n   ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  console.log(`         expected: ${expected}`);
  if (!ok) console.log(`         actual:   ${actual}`);
}

// ---------------------------------------------------------------------------

async function scenarioSequential() {
  heading('1. One person, phone then laptop - opened one after the other');
  reset();
  const phone = new Phone('Phone ');
  await phone.openApp();
  phone.add('t1', 'Coffee 4EUR', 4);
  await phone.sync();

  const laptop = new Phone('Laptop');
  await laptop.openApp();
  laptop.add('t2', 'Books 20EUR', 20);
  await laptop.sync();

  expect('both transactions survive', serverList(), 'Coffee 4EUR + Books 20EUR');
}

async function scenarioCouple() {
  heading('2. A couple sharing one login - both apps already open');
  reset();
  const hers = new Phone('Anna  ');
  const his = new Phone('Pietro');
  await hers.openApp();
  await his.openApp();

  console.log('');
  hers.add('t1', 'Groceries 40EUR', 40);
  await hers.sync();

  console.log('');
  his.add('t2', 'Lunch 12EUR', 12);
  await his.sync();

  expect('both transactions survive', serverList(), 'Groceries 40EUR + Lunch 12EUR');
}

async function scenarioReopen() {
  heading('3. Anna reopens her app afterwards');
  reset();
  const hers = new Phone('Anna  ');
  const his = new Phone('Pietro');
  await hers.openApp();
  await his.openApp();
  hers.add('t1', 'Groceries 40EUR', 40);
  await hers.sync();
  his.add('t2', 'Lunch 12EUR', 12);
  await his.sync();

  console.log('');
  await hers.foreground();
  expect('nothing is lost when Anna returns', serverList(), 'Groceries 40EUR + Lunch 12EUR');

  console.log('');
  const fresh = new Phone('Pietro');
  await fresh.openApp();
  expect('a fresh launch sees both', fresh.list(), 'Groceries 40EUR + Lunch 12EUR');
}

async function scenarioDelete() {
  heading('4. A deletion must stay deleted (not resurrected by the merge)');
  reset();
  const hers = new Phone('Anna  ');
  await hers.openApp();
  hers.add('t1', 'Rent 900EUR', 900);
  hers.add('t2', 'Gym 30EUR', 30);
  await hers.sync();

  const his = new Phone('Pietro');
  await his.openApp(); // both now hold Rent + Gym

  console.log('');
  hers.remove('Gym 30EUR');
  await hers.sync();

  console.log('');
  his.add('t3', 'Taxi 18EUR', 18); // stale: his copy still lists the gym
  await his.sync();

  expect('the gym stays deleted, the taxi arrives', serverList(), 'Rent 900EUR + Taxi 18EUR');
}

async function scenarioOffline() {
  heading('5. Offline edits are not lost when the app comes back');
  reset();
  const hers = new Phone('Anna  ');
  const his = new Phone('Pietro');
  await hers.openApp();
  await his.openApp();

  console.log('');
  hers.add('t1', 'Train 9EUR', 9);
  await hers.sync();

  console.log('');
  say('Pietro was offline and typed this with no connection:');
  his.add('t2', 'Cinema 14EUR', 14);
  say('...now he is back online and the app reopens:');
  await his.foreground();

  expect('the offline entry survives alongside the newer one', serverList(), 'Train 9EUR + Cinema 14EUR');
  expect("Pietro's own screen shows both", his.list(), 'Train 9EUR + Cinema 14EUR');
}


async function scenarioRecurringNoDupes() {
  heading('6. Both phones materialise the same recurring occurrence - no duplicate');
  reset();
  // Occurrence ids are deterministic (rec-<ruleId>-<date>), so when two
  // devices both back-fill the same missed occurrence, the merge must
  // recognise them as ONE transaction, not two Netflix charges.
  const hers = new Phone('Anna  ');
  const his = new Phone('Pietro');
  await hers.openApp();
  await his.openApp();

  console.log('');
  hers.add('rec-r1-2026-07-28', 'Netflix 13EUR', 13);
  await hers.sync();

  console.log('');
  say("Pietro's app, still on this morning's snapshot, back-fills the same occurrence:");
  his.add('rec-r1-2026-07-28', 'Netflix 13EUR', 13);
  await his.sync();

  expect('exactly one Netflix survives the merge', serverList(), 'Netflix 13EUR');
}

async function main() {
  console.log('\n================================================================');
  console.log(` Cloud sync - two devices, one account   [${OLD ? 'BEFORE the fix' : 'AFTER the fix'}]`);
  console.log(' (running the real src/app/lib/cloud.ts)');
  console.log('================================================================');

  await scenarioSequential();
  await scenarioCouple();
  await scenarioReopen();
  await scenarioDelete();
  await scenarioOffline();
  await scenarioRecurringNoDupes();

  console.log('\n================================================================');
  console.log(failures === 0 ? ' All checks passed - nothing lost.' : ` ${failures} check(s) FAILED.`);
  console.log('================================================================\n');
  process.exit(failures === 0 ? 0 : 1);
}

void main();
