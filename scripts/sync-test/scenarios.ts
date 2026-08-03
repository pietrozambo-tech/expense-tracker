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
  categories: any[] = [];
  budget: number | undefined = undefined;
  userName = '';
  base: SyncPayload | null = null;
  version: string | null = null;

  constructor(name: string) {
    this.name = name;
  }

  private payload(): SyncPayload {
    return {
      transactions: this.transactions,
      recurringRules: [],
      categories: this.categories,
      incomeCategories: [],
      sources: [],
      settings: {
        onboarded: true,
        userName: this.userName,
        currency: 'EUR',
        hasSeenIntro: true,
        monthlyBudget: this.budget,
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
      this.categories = merged.categories;
      this.budget = merged.settings.monthlyBudget;
      this.userName = merged.settings.userName;
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
      this.categories = merged.categories;
      this.budget = merged.settings.monthlyBudget;
      this.userName = merged.settings.userName;
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
          this.categories = merged.categories;
          this.budget = merged.settings.monthlyBudget;
          this.userName = merged.settings.userName;
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

  // Signing out clears the persisted base along with the session (App.tsx
  // does this when userId goes null), but the transactions stay on the device.
  signOut() {
    this.base = null;
    this.version = null;
    say(`${this.name} signs out`);
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
  await scenarioSettingsClear();
  await scenarioEditPropagates();
  await scenarioEditConflict();
  await scenarioStaleDevice();
  await scenarioMergeOrder();
  await scenarioDateEdits();
  await scenarioCategoryEdits();
  await scenarioCategoryConcurrent();
  await scenarioCategoryRenameVsChip();

  console.log('\n================================================================');
  console.log(failures === 0 ? ' All checks passed - nothing lost.' : ` ${failures} check(s) FAILED.`);
  console.log('================================================================\n');
  process.exit(failures === 0 ? 0 : 1);
}

void main();
