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
  sameVersion,
  samePayload,
  type SyncPayload,
} from './lib/cloud';
import { db } from './lib/supabase';

const OLD = process.argv.includes('--before');
const USER = 'user-shared-account';

// Stamps must be distinct and ordered even inside one test tick.
let STAMP = 0;
const nextStamp = () => new Date(Date.parse('2026-07-01T00:00:00Z') + ++STAMP * 1000).toISOString();

const tx = (id: string, description: string, amount: number, date = '2026-07-28') => ({
  id,
  description,
  amount,
  updatedAt: nextStamp(),
  currency: 'EUR',
  baseAmount: amount,
  category: { id: 'c1', name: 'Groceries', icon: 'ShoppingCart', color: 'text-green-500', bgColor: 'bg-green-50', selectedBg: 'bg-green-100', type: 'expense' as const, subcategories: [] },
  date,
  type: 'expense' as const,
  recurrence: 'Never repeat',
});

class Phone {
  name: string;
  transactions: any[] = [];
  rules: any[] = [];
  categories: any[] = [];
  budget: number | undefined = undefined;
  userName = '';
  language: 'en' | 'it' | undefined = undefined;
  base: SyncPayload | null = null;
  version: string | null = null;

  constructor(name: string) {
    this.name = name;
  }

  private payload(): SyncPayload {
    return {
      transactions: this.transactions,
      recurringRules: this.rules,
      categories: this.categories,
      incomeCategories: [],
      sources: [],
      settings: {
        onboarded: true,
        userName: this.userName,
        currency: 'EUR',
        hasSeenIntro: true,
        monthlyBudget: this.budget,
        language: this.language,
      },
    };
  }

  async openApp() {
    const cloud = await loadCloud(USER);
    if (cloud) {
      // App.tsx: merge the cloud into whatever this device already holds,
      // against the base persisted from the last agreement.
      const merged = mergePayloads(this.base, this.payload(), cloud.payload);
      this.transactions = merged.transactions;
      this.rules = merged.recurringRules ?? [];
      this.categories = merged.categories;
      this.budget = merged.settings.monthlyBudget;
      this.userName = merged.settings.userName;
      this.language = merged.settings.language;
      this.base = cloud.payload;
      this.version = cloud.version;
    }
    say(`${this.name} opens the app  -> sees ${this.list()}${this.budget ? ` (budget ${this.budget})` : ' (no budget)'}`);
  }

  add(id: string, description: string, amount: number, date?: string) {
    this.transactions = [...this.transactions, tx(id, description, amount, date)];
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
      this.rules = merged.recurringRules ?? [];
      this.categories = merged.categories;
      this.budget = merged.settings.monthlyBudget;
      this.userName = merged.settings.userName;
      this.language = merged.settings.language;
      this.base = remote.payload;
      this.version = remote.version;
    }
  }

  // The 20-second poll App.tsx runs while the app is open and visible
  // (pullRemote). Two counters, because the two costs are different: `pulls`
  // is bandwidth, `refreshes` is the screen - App keys Dashboard and Trend on
  // refreshKey, so a refresh remounts them and the charts visibly redraw.
  pulls = 0;
  refreshes = 0;

  async poll() {
    const version = await loadCloudVersion(USER);
    // OLD: a string compare, which never recognised this device's own write
    // because the server hands the stamp back in a different text form.
    const unchanged = OLD ? version === this.version : sameVersion(version, this.version);
    if (!version || unchanged) return;
    const remote = await loadCloud(USER);
    if (!remote) return;
    this.pulls++;
    const local = this.payload();
    const merged = mergePayloads(this.base, local, remote.payload);
    this.base = remote.payload;
    this.version = remote.version;
    // OLD: applied whatever came back, even when it was what we already had.
    if (!OLD && samePayload(merged, local)) {
      say(`${this.name} polls -> stamp moved but the data is identical, nothing to do`);
      return;
    }
    this.transactions = merged.transactions;
    this.rules = merged.recurringRules ?? [];
    this.categories = merged.categories;
    this.budget = merged.settings.monthlyBudget;
    this.userName = merged.settings.userName;
    this.language = merged.settings.language;
    this.refreshes++;
    say(`${this.name} polls -> pulls changes and re-renders  -> ${this.list()}`);
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
          this.rules = merged.recurringRules ?? [];
          this.categories = merged.categories;
          this.budget = merged.settings.monthlyBudget;
          this.userName = merged.settings.userName;
          this.language = merged.settings.language;
          this.base = remote.payload;
          this.version = remote.version;
          say(`${this.name} pulls what changed  -> phone now has ${this.list()}`);
        }
      }
    }
    await this.sync();
  }

  // Settings > Import data with a full backup file: replaces everything held
  // locally. Deliberately does NOT touch base/version - restoring is a local
  // edit like any other, and the next sync pushes it up.
  restore(ids: [string, string][]) {
    this.transactions = ids.map(([id, d]) => tx(id, d, 1));
    say(`${this.name} restores a backup  -> phone now has ${this.list()}`);
  }

  // Signing out. The data stays on the device either way; the question is the
  // base. App.tsx used to clear it when userId went null - and a base-less
  // merge cannot tell "deleted elsewhere" from "added here", so the next
  // sign-in resurrected every deletion this device had not yet heard about
  // and pushed them back to the cloud. Now the base survives sign-out: it is
  // a statement about the server, and signing out changes nothing there.
  // (A lapsed session took the same path with the user touching nothing.)
  signOut() {
    if (OLD) {
      this.base = null;
      this.version = null;
    }
    say(`${this.name} signs out${OLD ? ' (base wiped - the old behaviour)' : ' (base kept)'}`);
  }

  // The involuntary version of what sign-out used to do: the persisted base
  // evicted (iOS clears localStorage under pressure) while the data survived.
  // Sign-out no longer takes this path, but eviction still can, so the
  // deletions-survive-a-lost-base scenarios stay pointed at a real hazard.
  loseBase() {
    this.base = null;
    this.version = null;
    say(`${this.name} loses its sync base (storage evicted)`);
  }

  // A device that still holds a base from an earlier session but has no local
  // transactions - e.g. a browser whose site data was cleared, or a profile
  // that never finished hydrating.
  loseLocalData() {
    this.transactions = [];
    say(`${this.name} has no local transactions (base kept from last session)`);
  }

  // Category gestures, mirroring App.tsx: every edit stamps the category.
  seedCategory(id: string, name: string, chips: string[]) {
    this.categories = [...this.categories, { id, name, icon: 'X', color: '', bgColor: '', selectedBg: '', type: 'expense', subcategories: chips }];
  }

  addChip(catId: string, chip: string) {
    this.categories = this.categories.map((c) =>
      c.id === catId ? { ...c, subcategories: [...(c.subcategories || []), chip], updatedAt: nextStamp() } : c,
    );
    say(`${this.name} adds subcategory "${chip}"  -> ${this.chips(catId)}`);
  }

  removeChip(catId: string, chip: string) {
    this.categories = this.categories.map((c) =>
      c.id === catId ? { ...c, subcategories: (c.subcategories || []).filter((x: string) => x !== chip), updatedAt: nextStamp() } : c,
    );
    say(`${this.name} deletes subcategory "${chip}"  -> ${this.chips(catId)}`);
  }

  renameCategory(catId: string, newName: string) {
    this.categories = this.categories.map((c) =>
      c.id === catId ? { ...c, name: newName, updatedAt: nextStamp() } : c,
    );
    say(`${this.name} renames the category to "${newName}"`);
  }

  chips(catId: string): string {
    const c = this.categories.find((x) => x.id === catId);
    return c ? `${c.name}[${(c.subcategories || []).join(',')}]` : 'missing';
  }

  // Change only the DATE of an existing transaction - the reported case:
  // salaries moved from the 31st to the 28th.
  editDate(id: string, newDate: string) {
    this.transactions = this.transactions.map((t) =>
      t.id === id ? { ...t, date: newDate, updatedAt: nextStamp() } : t
    );
    say(`${this.name} moves ${id} to ${newDate}`);
  }

  // Restore stamps every row with one timestamp - both devices end up holding
  // identical copies with identical stamps once it propagates.
  restampAll() {
    const stamp = nextStamp();
    this.transactions = this.transactions.map((t) => ({ ...t, updatedAt: stamp }));
    say(`${this.name} restores a backup (all rows restamped)`);
  }

  edit(id: string, description: string, amount: number) {
    this.transactions = this.transactions.map((t) =>
      t.id === id ? { ...t, description, amount, baseAmount: amount, updatedAt: nextStamp() } : t
    );
    say(`${this.name} edits ${id} -> "${description}"  -> phone now has ${this.list()}`);
  }

  setBudget(v: number | undefined) {
    this.budget = v;
    say(`${this.name} sets the budget to ${v ?? '(none)'}`);
  }

  list() { return fmt(this.transactions); }
}

const fmt = (list: any[]) => (list?.length ? list.map((t) => t.description).join(' + ') : '(nothing)');
const serverList = () => fmt(((db.rows[0]?.data as any)?.transactions) ?? []);
const say = (s: string) => console.log('   ' + s);
const heading = (s: string) => console.log(`\n${s}\n${'-'.repeat(s.length)}`);
const reset = () => { db.rows = []; };

let failures = 0;
// Unlike expect(), does NOT sort - for asserting the actual array order.
function expectExact(label: string, actual: string, expected: string) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`\n   ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  console.log(`         expected: ${expected}`);
  if (!ok) console.log(`         actual:   ${actual}`);
}
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


async function scenarioOfflineThenRestart() {
  heading('7. Offline edit, app closed before reconnecting, then reopened');
  reset();
  const phone = new Phone('Phone ');
  await phone.openApp();
  phone.add('t1', 'Rent 900EUR', 900);
  await phone.sync();

  console.log('');
  say('Now offline. The user adds a transaction; the save cannot go out:');
  phone.add('t2', 'Market 25EUR', 25);
  say('...and closes the app before reconnecting.');

  console.log('');
  say('Next launch, back online - hydrate reads the cloud:');
  const relaunch = new Phone('Phone ');
  relaunch.transactions = phone.transactions; // localStorage survives the close
  relaunch.base = phone.base;                 // and so does the persisted sync base
  relaunch.version = phone.version;
  await relaunch.openApp();

  expect('the offline edit survives the relaunch', relaunch.list(), 'Rent 900EUR + Market 25EUR');
}

// The report: restore a full backup on the phone, then sign in on a PC that
// has used the account before.
async function scenarioRestoreThenOtherDevice() {
  heading('8. Restore a backup on the phone, then open the app on a PC');
  reset();
  const phone = new Phone('Phone ');
  const pc = new Phone('PC    ');

  await phone.openApp();
  phone.add('t1', 'Rent', 1);
  phone.add('t2', 'Coffee', 1);
  await phone.sync();

  // The PC has seen this account before, so it holds a base.
  await pc.openApp();

  console.log('');
  phone.restore([['t1', 'Rent'], ['t2', 'Coffee'], ['t3', 'Tennis']]);
  await phone.sync();

  console.log('');
  await pc.openApp();
  expect('the PC sees the restored data', pc.list(), 'Rent + Coffee + Tennis');
  await pc.sync();
  expect('and does not wipe the server', serverList(), 'Rent + Coffee + Tennis');
}

// Same, but the PC's local copy is gone while its base survives.
async function scenarioStaleBaseNoLocal() {
  heading('9. A device whose local data is gone but whose base is not');
  reset();
  const phone = new Phone('Phone ');
  const pc = new Phone('PC    ');

  await phone.openApp();
  phone.add('t1', 'Rent', 1);
  phone.add('t2', 'Coffee', 1);
  await phone.sync();

  await pc.openApp(); // PC now holds base = {Rent, Coffee}

  console.log('');
  pc.loseLocalData();
  await pc.openApp();
  expect('the PC pulls the data back down', pc.list(), 'Rent + Coffee');
  await pc.sync();
  expect('and the server still has it', serverList(), 'Rent + Coffee');
}

// The report: budget shows on the phone, missing on a PC signing in fresh.
async function scenarioSettingsNewDevice() {
  heading('10. A new device signs in - does it get the budget and the name?');
  reset();
  const phone = new Phone('Phone ');
  await phone.openApp();
  phone.userName = 'Pietro';
  phone.add('t1', 'Rent', 1);
  phone.setBudget(3200);
  await phone.sync();

  console.log('');
  const pc = new Phone('PC    '); // never seen this account: no base, no budget
  await pc.openApp();
  expect('the PC shows the budget', String(pc.budget), '3200');
  expect('the PC shows the name', pc.userName, 'Pietro');

  await pc.sync();
  const serverBudget = String(((db.rows[0]?.data as any)?.settings)?.monthlyBudget);
  expect('and the PC does not wipe it on the server', serverBudget, '3200');
}

// The other half: a budget deliberately changed on one device must still win.
async function scenarioSettingsEdit() {
  heading('11. Changing the budget on one device still wins');
  reset();
  const phone = new Phone('Phone ');
  const pc = new Phone('PC    ');
  await phone.openApp();
  phone.add('t1', 'Rent', 1);
  phone.setBudget(3200);
  await phone.sync();
  await pc.openApp();

  console.log('');
  pc.setBudget(2500);
  await pc.sync();
  const serverBudget = String(((db.rows[0]?.data as any)?.settings)?.monthlyBudget);
  expect('the edit reaches the server', serverBudget, '2500');

  console.log('');
  await phone.foreground();
  expect('and the phone picks it up', String(phone.budget), '2500');
}

// Language follows the same field-by-field rules as the budget: a choice made
// on one device reaches the others, and a device with no opinion cannot revert
// it just by syncing.
async function scenarioSettingsLanguage() {
  heading("12b. The app language syncs like any other setting");
  reset();
  const phone = new Phone('Phone ');
  const pc = new Phone('PC    ');
  await phone.openApp();
  phone.add('t1', 'Affitto', 1);
  phone.language = 'it';
  say('Phone  switches the app to Italian');
  await phone.sync();

  console.log('');
  await pc.openApp();
  expect('a new device comes up in Italian', String(pc.language), 'it');
  await pc.sync();
  const serverLang = String(((db.rows[0]?.data as any)?.settings)?.language);
  expect('and does not revert the server', serverLang, 'it');

  console.log('');
  pc.language = 'en';
  say('PC     switches back to English');
  await pc.sync();
  await phone.foreground();
  expect('the phone follows', String(phone.language), 'en');
}

// Clearing a budget is a real edit, not a missing value - it must stick.
async function scenarioSettingsClear() {
  heading('12. Clearing the budget is not mistaken for "no opinion"');
  reset();
  const phone = new Phone('Phone ');
  const pc = new Phone('PC    ');
  await phone.openApp();
  phone.add('t1', 'Rent', 1);
  phone.setBudget(3200);
  await phone.sync();
  await pc.openApp();

  console.log('');
  phone.setBudget(undefined);
  await phone.sync();
  const serverBudget = String(((db.rows[0]?.data as any)?.settings)?.monthlyBudget);
  expect('the server drops the budget', serverBudget, 'undefined');

  console.log('');
  await pc.foreground();
  expect('and it does not come back on the PC', String(pc.budget), 'undefined');
}

// The report: edit an amount on the laptop, close it, open the phone - the
// phone still shows the old value, and then writes it back over the edit.
async function scenarioEditPropagates() {
  heading('13. An edit made on the laptop reaches a phone that was closed');
  reset();
  const laptop = new Phone('Laptop');
  const phone = new Phone('Phone ');

  await laptop.openApp();
  laptop.add('t1', 'Coffee 4EUR', 4);
  await laptop.sync();
  await phone.openApp(); // phone has seen the data; then it is closed

  console.log('');
  laptop.edit('t1', 'Coffee 5EUR', 5);
  await laptop.sync();

  console.log('');
  await phone.openApp(); // cold launch: local copy + persisted base + pull
  expect('the phone shows the edited value', phone.list(), 'Coffee 5EUR');
  await phone.sync();
  expect('and does not write the old value back', serverList(), 'Coffee 5EUR');
}

// Both devices edit the same transaction before either syncs: the device in
// hand keeps its own edit; nothing reverts once both have synced.
async function scenarioEditConflict() {
  heading('14. Both edit the same transaction - deliberate edits never revert');
  reset();
  const laptop = new Phone('Laptop');
  const phone = new Phone('Phone ');
  await laptop.openApp();
  laptop.add('t1', 'Coffee 4EUR', 4);
  await laptop.sync();
  await phone.openApp();

  console.log('');
  laptop.edit('t1', 'Coffee 6EUR', 6);
  phone.edit('t1', 'Coffee 7EUR', 7);
  await laptop.sync();
  await phone.sync(); // conflict: phone changed it too, so its edit stands
  expect('the later deliberate edit wins', serverList(), 'Coffee 7EUR');

  console.log('');
  await laptop.foreground();
  expect('and the laptop converges to it', laptop.list(), 'Coffee 7EUR');
}

// A device still running an older build pushes its stale copies over the
// server wholesale. The stamps are the only defence: the up-to-date device
// must recognise its own edit as newer and put it back.
async function scenarioStaleDevice() {
  heading('15. A device on an old build overwrites the server with stale copies');
  reset();
  const laptop = new Phone('Laptop');
  await laptop.openApp();
  laptop.add('t1', 'Coffee 4EUR', 4);
  await laptop.sync();

  // A stale phone captured the row back then and force-writes it now,
  // old-build style: no version check, no merge.
  const staleCopy = JSON.parse(JSON.stringify(db.rows[0].data));

  console.log('');
  laptop.edit('t1', 'Coffee 5EUR', 5);
  await laptop.sync();

  console.log('');
  say('Stale phone force-writes its old copy over the server');
  db.rows[0].data = staleCopy;
  db.rows[0].updated_at = new Date().toISOString();

  await laptop.foreground();
  expect('the laptop keeps its newer edit', laptop.list(), 'Coffee 5EUR');
  expect('and repairs the server', serverList(), 'Coffee 5EUR');
}

// The other report: rows visibly moved after a sync. Merged output must come
// back date-ordered, newest day first, regardless of which side added what.
async function scenarioMergeOrder() {
  heading('16. Merged transactions come back in date order');
  reset();
  const laptop = new Phone('Laptop');
  const phone = new Phone('Phone ');
  await laptop.openApp();
  laptop.add('t1', 'Day 20', 1, '2026-07-20');
  laptop.add('t2', 'Day 10', 1, '2026-07-10');
  await laptop.sync();
  await phone.openApp();

  console.log('');
  phone.add('t3', 'Day 15', 1, '2026-07-15');
  await phone.sync();

  console.log('');
  await laptop.foreground();
  expectExact('the laptop lists newest day first', laptop.list(), 'Day 20 + Day 15 + Day 10');
  expectExact('the server holds the same order', serverList(), 'Day 20 + Day 15 + Day 10');
}

// The report: salaries' DATES edited on the phone after a restore had given
// both devices identical stamps. The laptop must adopt the new dates and the
// hero note (median income day) must follow.
async function scenarioDateEdits() {
  heading('17. Salary dates moved from the 31st to the 28th on the phone');
  reset();
  const phone = new Phone('Phone ');
  const laptop = new Phone('Laptop');

  await phone.openApp();
  phone.add('s1', 'Salary May', 3500, '2026-05-31');
  phone.add('s2', 'Salary Jun', 3500, '2026-06-30');
  phone.add('s3', 'Salary Jul', 3500, '2026-07-31');
  phone.restampAll(); // the subcategorised-backup restore
  await phone.sync();
  await laptop.openApp(); // laptop now holds identical rows, identical stamps

  console.log('');
  phone.editDate('s1', '2026-05-28');
  phone.editDate('s2', '2026-06-28');
  phone.editDate('s3', '2026-07-28');
  await phone.sync();

  console.log('');
  await laptop.openApp();
  const dates = laptop.transactions.map((t: any) => t.date).sort().join(' ');
  expect('the laptop shows the new dates', dates, '2026-05-28 2026-06-28 2026-07-28');
  await laptop.sync();
  const serverDates = (((db.rows[0]?.data as any)?.transactions) ?? []).map((t: any) => t.date).sort().join(' ');
  expect('and does not push the old dates back', serverDates, '2026-05-28 2026-06-28 2026-07-28');
}


// The user's report: edit categories on the iPhone, they must arrive
// everywhere. Sequential edits first - the everyday case.
async function scenarioCategoryEdits() {
  heading('19. A category edit made on one phone arrives on the other');
  reset();
  const a = new Phone('iPhone');
  const b = new Phone('iPad');
  a.seedCategory('others', 'Others', ['Donations']);
  await a.sync();
  await b.openApp();

  a.addChip('others', 'Tobacco');
  await a.sync();
  await b.foreground();
  expect('the new subcategory is on the iPad', b.chips('others'), 'Others[Donations,Tobacco]');

  b.removeChip('others', 'Donations');
  await b.sync();
  await a.foreground();
  expect('and a deletion travels back', a.chips('others'), 'Others[Tobacco]');
}

// Both devices touch the SAME category while one is stale. Item-level
// last-writer-wins made this silently destructive: whichever copy won arrived
// without the other's chip. The chip lists merge three-way now.
async function scenarioCategoryConcurrent() {
  heading('20. Two devices edit the same category at the same time');
  reset();
  const a = new Phone('iPhone');
  const b = new Phone('iPad');
  a.seedCategory('others', 'Others', ['Donations']);
  await a.sync();
  await b.openApp();

  a.addChip('others', 'Tobacco');
  await a.sync();
  b.addChip('others', 'Gym'); // stale: has not seen Tobacco
  await b.sync();
  await a.foreground();
  expect('the iPad kept both additions', b.chips('others'), 'Others[Donations,Gym,Tobacco]');
  // Same three chips on both; only the append order differs by which side
  // merged first, and the next quiet sync aligns even that.
  expect('the iPhone converged to the same', a.chips('others'), 'Others[Donations,Tobacco,Gym]');
}

// A rename on one side, a chip on the other: the rename must not eat the chip.
async function scenarioCategoryRenameVsChip() {
  heading('21. A rename on one device, a new subcategory on the other');
  reset();
  const a = new Phone('iPhone');
  const b = new Phone('iPad');
  a.seedCategory('others', 'Others', ['Donations']);
  await a.sync();
  await b.openApp();

  a.addChip('others', 'Tobacco');
  await a.sync();
  b.renameCategory('others', 'Misc'); // stale copy, newer stamp
  await b.sync();
  await a.foreground();
  await b.foreground();
  expect('the rename stands and the chip survives (iPad)', b.chips('others'), 'Misc[Donations,Tobacco]');
  expect('both devices agree (iPhone)', a.chips('others'), 'Misc[Donations,Tobacco]');
}

// The two that matter for a phone sitting still: the poll must recognise this
// device's own last write, and a pull that changes nothing must not touch the
// screen. Getting either wrong redraws the dashboard every twenty seconds.
async function scenarioIdlePolling() {
  heading('22. A phone left open on the dashboard is left alone');
  reset();
  const a = new Phone('iPhone');
  a.add('t1', 'Coffee', 3);
  await a.sync();

  say('nobody else is signed in; the app just sits there for a minute');
  for (let i = 0; i < 3; i++) await a.poll();

  expect('a minute of polling downloads nothing', String(a.pulls), '0');
  expect('and the charts are never re-rendered', String(a.refreshes), '0');
}

async function scenarioNoOpPull() {
  heading('23. Another device re-uploading the same data does not redraw ours');
  reset();
  const a = new Phone('iPhone');
  const b = new Phone('iPad');
  a.add('t1', 'Coffee', 3);
  a.add('t2', 'Bus', 2);
  await a.sync();
  await b.openApp();
  say('the iPad returns to the foreground and pushes - same data, new stamp');
  await b.sync();

  await a.poll();
  expect('the phone downloads once to see what moved', String(a.pulls), '1');
  expect('finds nothing new, and leaves the screen alone', String(a.refreshes), '0');
  expect('and still has everything', a.list(), 'Coffee + Bus');

  say('a real change on the iPad, however, must come through');
  b.add('t3', 'Lunch', 12);
  await b.sync();
  await a.poll();
  expect('this one does re-render', String(a.refreshes), '1');
  expect('with the new transaction', a.list(), 'Coffee + Bus + Lunch');
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
  await scenarioOfflineThenRestart();
  await scenarioRestoreThenOtherDevice();
  await scenarioStaleBaseNoLocal();
  await scenarioSettingsNewDevice();
  await scenarioSettingsEdit();
  await scenarioSettingsLanguage();
  await scenarioSettingsClear();
  await scenarioEditPropagates();
  await scenarioEditConflict();
  await scenarioStaleDevice();
  await scenarioMergeOrder();
  await scenarioDateEdits();
  await scenarioCategoryEdits();
  await scenarioCategoryConcurrent();
  await scenarioCategoryRenameVsChip();
  await scenarioIdlePolling();
  await scenarioNoOpPull();
  await scenarioChipDeletionFuzz();
  await scenarioChipDeleteThenBaseLoss();
  await scenarioNewDeviceDefaultChips();
  await scenarioRecurringDeleteSignOut();
  await scenarioStaleRuleTombstones();

  console.log('\n================================================================');
  console.log(failures === 0 ? ' All checks passed - nothing lost.' : ` ${failures} check(s) FAILED.`);
  console.log('================================================================\n');
  process.exit(failures === 0 ? 0 : 1);
}

void main();

// ---------------------------------------------------------------------------
// Fuzz: a deleted subcategory must never come back.
//
// Reported live: chips deleted on the phone reappeared after closing the app,
// while the laptop still showed them. The eight-case truth table inside
// mergeChips is correct, so any resurrection has to come from an interleaving
// that leaves a device merging against the wrong base - which is exactly the
// kind of thing a hand-written scenario misses and a fuzz finds.
//
// Chips are never re-added once deleted, so the invariant is unambiguous:
// anything deleted at any point must be absent everywhere at quiescence.
async function scenarioChipDeletionFuzz() {
  heading('24. Fuzz: a deleted subcategory never comes back');
  const CHIPS = ['Rewe', 'Lidl', 'Aldi', 'Edeka', 'Netto'];
  let firstFailure: string | null = null;
  let runs = 0;

  const quiet = console.log;
  for (let seed = 1; seed <= 400 && !firstFailure; seed++) {
    // Deterministic PRNG so a failure is reproducible from its seed alone.
    let s = seed;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];

    console.log = () => {};
    reset();
    const a = new Phone('iPhone');
    const b = new Phone('laptop');
    a.seedCategory('groceries', 'Groceries', [...CHIPS]);
    await a.sync();
    await b.openApp();

    const deleted = new Set<string>();
    const log: string[] = [];
    const live = () => CHIPS.filter((c) => !deleted.has(c));

    for (let step = 0; step < 12; step++) {
      const who = rnd() < 0.5 ? a : b;
      const op = pick(['delete', 'sync', 'open', 'poll', 'foreground']);
      try {
        if (op === 'delete') {
          const avail = live();
          if (!avail.length) continue;
          const chip = pick(avail);
          deleted.add(chip);
          who.removeChip('groceries', chip);
          log.push(`${who.name} deletes ${chip}`);
        } else if (op === 'sync') { await who.sync(); log.push(`${who.name} sync`); }
        else if (op === 'open') { await who.openApp(); log.push(`${who.name} open`); }
        else if (op === 'poll') { await who.poll(); log.push(`${who.name} poll`); }
        else if (op === 'foreground') { await who.foreground(); log.push(`${who.name} foreground`); }
        else { who.signOut(); await who.openApp(); log.push(`${who.name} signs out and back in`); }
      } catch { /* network-ish failures are not what this is looking for */ }
    }

    // Settle: everyone syncs and pulls until nothing moves.
    for (let i = 0; i < 6; i++) { await a.sync(); await b.sync(); await a.poll(); await b.poll(); }

    console.log = quiet;
    runs++;
    const want = `Groceries[${live().join(',')}]`;
    for (const [name, got] of [['iPhone', a.chips('groceries')], ['laptop', b.chips('groceries')]]) {
      if (got !== want) {
        firstFailure = `seed ${seed}: ${name} has ${got}, expected ${want}\n` +
          log.map((l) => `           ${l}`).join('\n');
        break;
      }
    }
  }
  console.log = quiet;
  say(`ran ${runs} randomised sessions`);
  expectExact(
    'no deleted subcategory ever came back',
    firstFailure ? `FAILED -> ${firstFailure}` : 'clean',
    'clean',
  );
}

// The deliberate version of what the fuzz gropes for: a deletion that has not
// yet reached the server, on a device that then loses its base.
async function scenarioChipDeleteThenBaseLoss() {
  heading('25. A chip deleted offline, then the base is lost before it syncs');
  reset();
  const a = new Phone('iPhone');
  const b = new Phone('laptop');
  a.seedCategory('groceries', 'Groceries', ['Rewe', 'Lidl']);
  await a.sync();
  await b.openApp();

  a.removeChip('groceries', 'Rewe');   // deleted, not yet pushed
  a.loseBase();                         // storage evicted the base
  await a.openApp();                    // merges against a null base
  expect('the deletion survives losing the base', a.chips('groceries'), 'Groceries[Lidl]');
  await a.sync();
  await b.foreground();
  expect('and the laptop agrees', b.chips('groceries'), 'Groceries[Lidl]');
}

// The likeliest way to meet this in the wild, with no sign-out involved: a
// second device signing in for the first time has no base either, and it
// starts from the SEEDED categories - which ship with default chips. Union
// meant those defaults came back and overwrote a deletion made elsewhere.
async function scenarioNewDeviceDefaultChips() {
  heading('26. A new device must not resurrect chips deleted on the old one');
  reset();
  const a = new Phone('iPhone');
  const b = new Phone('laptop');
  a.seedCategory('groceries', 'Groceries', ['Supermarket', 'Rewe']);
  await a.sync();

  a.removeChip('groceries', 'Rewe');
  a.removeChip('groceries', 'Supermarket');
  await a.sync();

  // Fresh browser: seeded defaults, never synced, so no base at all.
  b.seedCategory('groceries', 'Groceries', ['Supermarket', 'Rewe']);
  await b.openApp();
  expect('the new device honours the deletions', b.chips('groceries'), 'Groceries[]');
  await b.sync();
  await a.foreground();
  expect('and does not push them back', a.chips('groceries'), 'Groceries[]');
}

// ---------------------------------------------------------------------------
// The reported loop, end to end. An Amex fee was deleted on the phone; a PC
// holding a stale copy signed out and back in, and the deleted row came back
// on every device - because sign-out wiped the sync base, and a base-less
// merge reads "I still have a row the cloud lacks" as an addition, never as
// the deletion it actually was. Worse, the PC's stale RULE also won the
// merge, un-remembering the skipDate, so even deleting again could not stick.
async function scenarioRecurringDeleteSignOut() {
  heading('27. A deleted occurrence survives another device signing out and in');
  reset();
  const phone = new Phone('iPhone');
  const pc = new Phone('PC');

  phone.rules = [{
    id: 'r-amex', rule: 'Every month', anchorDate: '2026-06-09',
    template: { description: 'Amex fee', amount: 20, currency: 'EUR', category: { id: 'c1', name: 'Fees' }, type: 'expense' },
  }];
  phone.add('rec-r-amex-2026-07-09', 'Amex fee', 20, '2026-07-09');
  phone.add('rec-r-amex-2026-08-09', 'Amex fee', 20, '2026-08-09');
  await phone.sync();
  await pc.openApp(); // the PC now holds a full copy, and a base

  // The phone deletes the August 9th occurrence, exactly as
  // confirmRecurringDelete does: row out, skipDate recorded, rule stamped.
  phone.transactions = phone.transactions.filter((t) => t.id !== 'rec-r-amex-2026-08-09');
  phone.rules = phone.rules.map((r) =>
    r.id === 'r-amex' ? { ...r, skipDates: ['2026-08-09'], updatedAt: nextStamp() } : r);
  say('iPhone deletes the Aug 9 fee (skipDate recorded on the rule)');
  await phone.sync();

  // The PC - which never pulled the deletion - signs out and back in, then
  // its next edit pushes. Under the old behaviour the sign-out wiped its
  // base, so the merge saw the stale row as a local addition.
  pc.signOut();
  await pc.openApp();
  await pc.sync();
  await phone.poll();

  const feesOn = (list: any[]) => list.filter((t) => t.description === 'Amex fee').map((t) => t.date).sort().join(',');
  expect('the PC does not resurrect the deleted fee', feesOn(pc.transactions), '2026-07-09');
  expect('the phone keeps its deletion', feesOn(phone.transactions), '2026-07-09');
  const server = await loadCloud(USER);
  expect('the server holds one fee', feesOn(server!.payload.transactions), '2026-07-09');
  const serverRule = (server!.payload.recurringRules ?? []).find((r) => r.id === 'r-amex');
  expect('and the rule still remembers the deletion', (serverRule?.skipDates ?? []).join(','), '2026-08-09');
}

// The rule-level half on its own: even when a stale copy of the RULE wins the
// per-item merge (no base, no stamp on the stale side), the tombstones must
// survive, because skipDates only ever grow and endedAt only ever moves
// earlier. Whole-copy-wins silently dropped both.
async function scenarioStaleRuleTombstones() {
  heading('28. A stale rule copy cannot un-remember a skip or an end');
  reset();
  const phone = new Phone('iPhone');
  const pc = new Phone('PC');

  // The phone's copy: one skip recorded, and the chain stopped.
  phone.rules = [{
    id: 'r-gym', rule: 'Every month', anchorDate: '2026-01-05',
    skipDates: ['2026-05-05'], endedAt: '2026-08-01', updatedAt: nextStamp(),
    template: { description: 'Gym', amount: 45, currency: 'EUR', category: { id: 'c1', name: 'Sport' }, type: 'expense' },
  }];
  await phone.sync();

  // The PC holds the rule as it looked months ago - live, nothing skipped,
  // never stamped - and merges with no base at all (evicted storage).
  pc.rules = [{
    id: 'r-gym', rule: 'Every month', anchorDate: '2026-01-05',
    template: { description: 'Gym', amount: 45, currency: 'EUR', category: { id: 'c1', name: 'Sport' }, type: 'expense' },
  }];
  pc.loseBase();
  await pc.openApp();
  await pc.sync();

  const server = await loadCloud(USER);
  const rule = (server!.payload.recurringRules ?? []).find((r) => r.id === 'r-gym');
  expect('the skip survives the stale copy', (rule?.skipDates ?? []).join(','), '2026-05-05');
  expect('the end survives the stale copy', rule?.endedAt ?? '(gone)', '2026-08-01');
}
