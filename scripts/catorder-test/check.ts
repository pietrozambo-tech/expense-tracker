// The order the category grid is offered in.
//
// Alphabetical is stable, which is why it is the default: the tile you want is
// where it was last time. "Most used" trades that for reach, and the trade is
// only worth it if the order is itself stable - hence the tie-break, which is
// what keeps the nine categories you never touch from shuffling every render.

import { DEFAULT_CATEGORY_ORDER, orderCategories } from '../../src/app/lib/categoryOrder';

let failed = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failed += 1;
};

const cats = [
  { id: 'sport', name: 'Sport' },
  { id: 'groceries', name: 'Groceries' },
  { id: 'app', name: 'App' },
  { id: 'housing', name: 'Housing' },
  { id: 'food', name: 'Food & Drinks' },
];
const use = (id: string, n: number) => Array.from({ length: n }, () => ({ category: { id } }));
const names = (list: { name: string }[]) => list.map((c) => c.name).join(', ');

ok(DEFAULT_CATEGORY_ORDER === 'alpha', 'alphabetical is the default');

ok(names(orderCategories(cats, [], 'alpha')) === 'App, Food & Drinks, Groceries, Housing, Sport',
  'alphabetical, and case-insensitive');
ok(names(orderCategories(cats, use('sport', 99), 'alpha')) === 'App, Food & Drinks, Groceries, Housing, Sport',
  'which no amount of spending disturbs');

{
  const ledger = [...use('groceries', 12), ...use('food', 7), ...use('housing', 7), ...use('app', 1)];
  ok(names(orderCategories(cats, ledger, 'used')) === 'Groceries, Food & Drinks, Housing, App, Sport',
    `most used first (${names(orderCategories(cats, ledger, 'used'))})`);
  // Food and Housing are both on 7. Alphabetical between them, every time -
  // an order that reshuffles on a tie is worse than either order.
  ok(names(orderCategories(cats, ledger, 'used')).indexOf('Food') < names(orderCategories(cats, ledger, 'used')).indexOf('Housing'),
    'a tie falls back to alphabetical rather than to array order');
  ok(names(orderCategories(cats, ledger, 'used')).endsWith('Sport'),
    'and a category never used sits at the end');
}

// Counted from the ledger every time, so it follows the data with no stored
// tally to migrate, sync, or be wrong.
{
  const before = orderCategories(cats, use('app', 3), 'used');
  const after = orderCategories(cats, [...use('app', 3), ...use('sport', 9)], 'used');
  ok(before[0].id === 'app', 'the count follows the transactions...');
  ok(after[0].id === 'sport', '...and moves as they do');
}

// Rows with no category at all - imports land some - must not throw or count.
{
  const messy = [{ category: null }, { category: undefined }, {}, ...use('app', 2)];
  ok(orderCategories(cats, messy as never, 'used')[0].id === 'app', 'rows with no category are skipped, not counted');
}

// Purity: the caller's array is theirs.
{
  const mine = [...cats];
  const was = mine.map((c) => c.id).join(',');
  orderCategories(mine, use('food', 5), 'used');
  ok(mine.map((c) => c.id).join(',') === was, 'the input array is left in the order it came');
}

// An unknown value behaves like the default rather than like nothing.
ok(names(orderCategories(cats, [], 'wat' as never)) === 'App, Food & Drinks, Groceries, Housing, Sport',
  'an unrecognised order falls back to alphabetical');

console.log(failed ? `\n${failed} FAILED` : '\nThe grid orders itself the way it says it does.');
process.exit(failed ? 1 : 0);
