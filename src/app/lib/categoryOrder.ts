/**
 * The order the category grid is offered in.
 *
 * Alphabetical is the honest default: it is stable, so the tile you want is in
 * the place it was last time and your thumb learns it. But a ledger is not
 * evenly spread - most people file half their rows under three categories -
 * and hunting alphabetically past nine tiles you never use is a tax paid on
 * every single expense.
 *
 * So it is a choice, and it is remembered. Not a per-entry toggle: an order
 * that changes under you is worse than either order.
 */

export type CategoryOrder = 'alpha' | 'used';

export const DEFAULT_CATEGORY_ORDER: CategoryOrder = 'alpha';

/** Locale-aware and case-insensitive, matching what the grid always did. */
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/**
 * Categories in the chosen order.
 *
 * 'used' counts the WHOLE ledger, every time, rather than keeping a tally
 * beside the data: a stored count is one more thing to migrate, to sync, and
 * to be wrong. Counting is cheap next to what the screen does anyway, and it
 * cannot drift from the transactions it describes.
 *
 * Ties fall back to alphabetical, which matters more than it looks: it is what
 * keeps the nine categories you have never used in a stable, learnable order
 * at the bottom instead of shuffling on every render.
 */
export function orderCategories<T extends { id: string; name: string }>(
  categories: T[],
  transactions: { category?: { id?: string } | null }[],
  order: CategoryOrder = DEFAULT_CATEGORY_ORDER,
): T[] {
  const sorted = [...categories];
  if (order !== 'used') return sorted.sort(byName);

  const uses = new Map<string, number>();
  for (const t of transactions) {
    const id = t.category?.id;
    if (id) uses.set(id, (uses.get(id) ?? 0) + 1);
  }
  return sorted.sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || byName(a, b));
}
