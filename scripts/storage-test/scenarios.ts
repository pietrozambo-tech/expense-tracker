// Inside the native iOS shell, localStorage is a cache the system may evict.
// A guest with no cloud account has no second copy, so an eviction is the whole
// ledger gone with nothing to restore from. These scenarios simulate the
// eviction and check that a relaunch still finds the data.
//
// Run with:  pnpm test:storage   (add --before for the localStorage-only build)

import type { Transaction, UserSettings } from './types';
import {
  clearAllData,
  hydrateStorage,
  loadGuest,
  loadSettings,
  loadTransactions,
  saveGuest,
  saveSettings,
  saveTransactions,
} from './lib/storage';
import { flush, __resetForTests } from './lib/kv';
import { store as durable, stats, control, resetStub } from './prefs-stub';

const OLD = process.argv.includes('--before');

const heading = (s: string) => console.log(`\n${s}\n${'-'.repeat(s.length)}`);
const say = (s: string) => console.log('   ' + s);

let failures = 0;
function expect(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) {
    console.log(`         expected: ${e}`);
    console.log(`         actual:   ${a}`);
  }
}

// ── The fake device ─────────────────────────────────────────────────────────

class FakeLocalStorage {
  private map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
  get size() { return this.map.size; }
}

let web = new FakeLocalStorage();
const g = globalThis as any;
Object.defineProperty(g, 'localStorage', { get: () => web, configurable: true });

/** What iOS does under storage pressure: the web view's storage is reclaimed. */
const evictWebStorage = () => web.clear();

function setPlatform(native: boolean) {
  g.window = native ? { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } } : {};
}

/** A cold start: nothing carried over in memory, only what is on the device. */
async function relaunch(native: boolean) {
  __resetForTests();
  setPlatform(native);
  if (!OLD) await hydrateStorage();
}

/** Wipe the simulated device completely and start from a clean install. */
async function freshDevice(native = true) {
  web = new FakeLocalStorage();
  resetStub();
  await relaunch(native);
}

// ── The pre-fix build, copied faithfully ────────────────────────────────────
//
// Written out rather than wrapping the new module, so --before really does
// reproduce what the localStorage-only version did.

const KEY = (n: string) => `expense-tracker.v1.${n}`;
const OLD_KEYS = ['transactions', 'categories', 'income-categories', 'sources', 'settings', 'recurring-rules', 'sync-base'].map(KEY);

const oldRead = <T,>(k: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(k);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch { return fallback; }
};
const oldWrite = (k: string, v: unknown) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
};

const S = OLD
  ? {
      loadTransactions: () => oldRead<Transaction[]>(KEY('transactions'), []),
      saveTransactions: (t: Transaction[]) => oldWrite(KEY('transactions'), t),
      loadSettings: () => oldRead<Partial<UserSettings>>(KEY('settings'), {}),
      saveSettings: (s: UserSettings) => oldWrite(KEY('settings'), s),
      loadGuest: () => { try { return localStorage.getItem(KEY('guest')) === 'true'; } catch { return false; } },
      saveGuest: (v: boolean) => { try { v ? localStorage.setItem(KEY('guest'), 'true') : localStorage.removeItem(KEY('guest')); } catch { /* ignore */ } },
      clearAllData: () => { try { OLD_KEYS.forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ } },
    }
  : { loadTransactions, saveTransactions, loadSettings, saveSettings, loadGuest, saveGuest, clearAllData };

const settled = () => (OLD ? Promise.resolve() : flush());

// ── Fixtures ────────────────────────────────────────────────────────────────

const tx = (id: string, amount: number): Transaction =>
  ({ id, description: `t${id}`, amount, category: { id: 'c1', name: 'Groceries', icon: 'X', color: '', bgColor: '', selectedBg: '', type: 'expense' }, date: '2026-07-04', type: 'expense', currency: 'EUR', recurrence: 'Never repeat' } as Transaction);

const SIX_MONTHS = Array.from({ length: 180 }, (_, i) => tx(`t${i}`, 10 + i));

const SETTINGS = { onboarded: true, userName: 'Pietro', currency: 'EUR', hasSeenIntro: true, monthlyBudget: 1500 } as UserSettings;

const ids = (t: Transaction[]) => t.map((x) => x.id);
const durableKeys = () => [...durable.keys()].map((k) => k.replace('expense-tracker.v1.', '')).sort();

// ── Scenarios ───────────────────────────────────────────────────────────────

console.log(OLD ? '\nRunning the PRE-FIX build (localStorage only)' : '\nRunning the CURRENT build');

// 1. The bug: six months of tracking, no account, and iOS reclaims the web view's
//    storage overnight.
heading('1. iOS evicts the web view storage');
{
  await freshDevice();
  S.saveTransactions(SIX_MONTHS);
  S.saveSettings(SETTINGS);
  S.saveGuest(true);
  await settled();
  say('180 transactions tracked as a guest, app backgrounded');

  evictWebStorage();
  say('iOS reclaims localStorage while the app is closed');

  await relaunch(true);
  expect('the ledger is still there', S.loadTransactions().length, 180);
  expect('the last transaction is intact', ids(S.loadTransactions()).slice(-1), ['t179']);
  expect('settings survived too', S.loadSettings().monthlyBudget, 1500);
  expect('still signed in as a guest', S.loadGuest(), true);
}

// 2. The version that had only localStorage is already installed, with data in
//    it. Upgrading must adopt it, not read as a fresh install.
heading('2. Upgrading from the localStorage-only build');
{
  await freshDevice();
  // What the old build left on the device: localStorage full, nothing durable.
  oldWrite(KEY('transactions'), SIX_MONTHS.slice(0, 12));
  oldWrite(KEY('settings'), SETTINGS);
  expect('nothing durable yet', durable.size, 0);

  await relaunch(true);
  expect('the old data is visible after the upgrade', S.loadTransactions().length, 12);
  await settled();

  evictWebStorage();
  await relaunch(true);
  expect('and it survives the next eviction', S.loadTransactions().length, 12);
  expect('settings carried across as well', S.loadSettings().userName, 'Pietro');
}

// 3. The web build must be untouched by any of this.
heading('3. The web/PWA build is unchanged');
{
  await freshDevice(false);
  S.saveTransactions(SIX_MONTHS.slice(0, 4));
  S.saveSettings(SETTINGS);
  await settled();
  expect('localStorage is the store', JSON.parse(localStorage.getItem(KEY('transactions'))!).length, 4);
  expect('no native plugin was touched', stats.get + stats.set + stats.remove, 0);

  await relaunch(false);
  expect('reads back after a reload', S.loadTransactions().length, 4);
}

// 4. Erasing your data has to reach the durable store, or it comes back.
heading('4. Erase-my-data reaches the durable store');
{
  await freshDevice();
  S.saveTransactions(SIX_MONTHS);
  S.saveGuest(true);
  await settled();

  S.clearAllData();
  await settled();
  expect('nothing left but the guest flag', durableKeys(), ['guest']);

  await relaunch(true);
  expect('and it stays gone after a relaunch', S.loadTransactions().length, 0);
  expect('erasing data did not sign the user out', S.loadGuest(), true);
}

// 5. A burst of edits must land as the latest value, not as whichever write
//    happened to finish last.
heading('5. A burst of edits collapses to the latest value');
{
  await freshDevice();
  control.delayMs = 1; // make each bridge call actually take a turn
  for (let i = 1; i <= 50; i++) S.saveTransactions(SIX_MONTHS.slice(0, i));
  await settled();

  const stored = JSON.parse(durable.get(KEY('transactions')) || 'null');
  expect('the durable copy is the 50th write', stored ? stored.length : 0, OLD ? 0 : 50);
  if (!OLD) expect('50 edits cost a handful of writes', stats.set <= 4, true);

  await relaunch(true);
  expect('and that is what a relaunch reads', S.loadTransactions().length, 50);
}

// 6. A write that arrives mid-flight must not be dropped.
heading('6. A write during an in-flight write still lands');
{
  await freshDevice();
  control.delayMs = 5;
  S.saveTransactions(SIX_MONTHS.slice(0, 3)); // starts draining
  S.saveSettings(SETTINGS); // queued behind it, different key
  S.saveGuest(true);
  await settled();
  expect('all three keys made it', durableKeys(), ['guest', 'settings', 'transactions']);
}

// 7. If the bridge is unavailable the app must still work, not start with no
//    storage at all.
heading('7. The plugin is missing or the bridge fails');
{
  await freshDevice();
  control.broken = true;
  await relaunch(true);
  S.saveTransactions(SIX_MONTHS.slice(0, 5));
  await settled();
  expect('the app still saves', S.loadTransactions().length, 5);

  control.broken = false;
  await relaunch(true);
  expect('and still reads back on the next launch', S.loadTransactions().length, 5);
}

// 8. An edit made seconds before backgrounding: localStorage has it (written
//    synchronously), but iOS suspended the app before the bridge write landed
//    and killed it while suspended. The relaunch must read the NEWER copy.
heading('8. A durable write lost to a suspend-and-kill');
{
  await freshDevice();
  S.saveTransactions(SIX_MONTHS.slice(0, 10));
  await settled();
  say('10 transactions, both copies agree');
  // The 11th: the synchronous localStorage write lands, the bridge write dies
  // with the process.
  oldWrite(KEY('transactions'), SIX_MONTHS.slice(0, 11));
  say('an 11th lands in localStorage only; the app is killed mid-flight');

  await relaunch(true);
  expect('the relaunch reads the newer copy', S.loadTransactions().length, 11);
  await settled();
  expect('and heals the durable one', JSON.parse(durable.get(KEY('transactions')) || '[]').length, 11);
}

// 9. After an eviction is restored, an edit to one key must not make the
//    others look "removed on purpose" on the launch after that.
heading('9. Eviction, then an edit, then another relaunch');
{
  await freshDevice();
  S.saveTransactions(SIX_MONTHS.slice(0, 20));
  S.saveSettings(SETTINGS);
  await settled();
  evictWebStorage();
  await relaunch(true);
  expect('restored after the eviction', S.loadTransactions().length, 20);

  S.saveTransactions(SIX_MONTHS.slice(0, 21)); // the user edits only the ledger
  await settled();
  await relaunch(true);
  expect('the edit survived', S.loadTransactions().length, 21);
  expect('and settings were not mistaken for erased', S.loadSettings().monthlyBudget, 1500);
}

// 10. The mirror image of 8: a durable REMOVE lost with the process. The
//     relaunch must not resurrect what the user removed.
heading('10. A durable remove lost to a suspend-and-kill');
{
  await freshDevice();
  S.saveTransactions(SIX_MONTHS.slice(0, 5));
  S.saveGuest(true);
  await settled();
  // Leaving guest mode: the synchronous localStorage remove lands, the bridge
  // remove dies with the process.
  try { localStorage.removeItem(KEY('guest')); } catch { /* ignore */ }
  say('guest mode left; only the localStorage remove landed');

  await relaunch(true);
  expect('the relaunch does not resurrect it', S.loadGuest(), false);
  await settled();
  expect('and finishes the removal durably', durable.has(KEY('guest')), false);
}

console.log(
  failures === 0
    ? `\nAll scenarios pass${OLD ? ' - the --before build should NOT do that' : ''}\n`
    : `\n${failures} failing\n`
);
process.exit(failures === 0 ? 0 : 1);
