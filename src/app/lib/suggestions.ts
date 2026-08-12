import { toDateStr } from './recurrence';
import type { Category, Source, Transaction } from '../types';

// A row offered under the Description field while typing. Picking one fills
// the description and pre-selects the merchant's usual category/subcategory
// and source - `hint` is the human-readable preview of those side effects
// ("Groceries · Revolut"), shown so the tap holds no surprises.
export interface DescriptionSuggestion {
  description: string;
  categoryId: string | null; // null when that category no longer exists
  subcategory: string | null;
  sourceId: string | null;
  hint: string;
}

// Suggestions come from the transactions the user already has - nothing new
// is stored anywhere. Grouped by description (case-insensitive), each group
// carrying its MOST RECENT usage's category/subcategory/source: merchants
// drift ("Esselunga" was Groceries, then became Household), and the latest
// habit is the one worth repeating.
//
// Ranking: matches that start with the query beat mid-word matches; within a
// tier, how often you use the merchant, with a small boost when you used it
// recently. Capped low deliberately - this is a shortcut to notice, not a
// list to read.
export function buildDescriptionSuggestions(
  transactions: Transaction[],
  type: 'expense' | 'income',
  query: string,
  categories: Category[],
  sources: Source[],
  max: number = 3,
): DescriptionSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // Newest first, so the first transaction seen per description is its most
  // recent usage.
  const pool = [...transactions]
    .filter((t) => (t.type ?? 'expense') === type && t.description?.trim())
    .sort((a, b) => b.date.localeCompare(a.date));

  const groups = new Map<string, { latest: Transaction; count: number }>();
  for (const t of pool) {
    const key = t.description.trim().toLowerCase();
    if (!key.includes(q)) continue;
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { latest: t, count: 1 });
  }

  // Local, not toISOString(): in UTC+2 before 2am the UTC day is yesterday,
  // which shifted the recency boost by a day at exactly the wrong moment.
  const today = toDateStr(new Date());
  const daysAgo = (date: string) =>
    Math.max(0, (Date.parse(today) - Date.parse(date)) / 86400000);

  const ranked = [...groups.entries()]
    .map(([key, g]) => {
      const age = daysAgo(g.latest.date);
      const recencyBoost = age <= 31 ? 2 : age <= 92 ? 1 : 0;
      return {
        key,
        g,
        prefix: key.startsWith(q),
        score: g.count + recencyBoost,
      };
    })
    .sort((a, b) => {
      if (a.prefix !== b.prefix) return a.prefix ? -1 : 1;
      if (a.score !== b.score) return b.score - a.score;
      return b.g.latest.date.localeCompare(a.g.latest.date);
    })
    .slice(0, max);

  return ranked.map(({ g }) => {
    const t = g.latest;
    // Resolve against the CURRENT lists - the transaction's embedded category
    // may have been renamed or deleted since. A dead reference fills the
    // description only.
    const cat =
      categories.find((c) => c.id === t.category?.id) ??
      categories.find((c) => c.name === t.category?.name) ??
      null;
    const subcategory =
      cat && t.subcategory && cat.subcategories?.includes(t.subcategory) ? t.subcategory : null;
    const source = t.sourceId ? sources.find((s) => s.id === t.sourceId) ?? null : null;
    return {
      description: t.description.trim(),
      categoryId: cat?.id ?? null,
      subcategory,
      sourceId: source?.id ?? null,
      hint: [cat?.name, source?.name].filter(Boolean).join(' · '),
    };
  });
}
