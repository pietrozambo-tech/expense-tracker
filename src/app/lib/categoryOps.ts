import type { Category, Transaction } from '../types';
import { getLanguage } from '../i18n/store';

// A category name that acts as the catch-all bucket for anything unmatched.
// Both languages are always recognised: an Italian-seeded "Altro" must be
// found even while the app is being used in English, and vice versa.
export const CATCHALL_RE = /^(other|others|miscellaneous|misc|uncategori[sz]ed|altro|altri|varie|non categorizzat[oaie])$/i;

// Deleting a category must not orphan the transactions that used it. Reassign
// every affected transaction to an "Others" bucket (created if the list has
// none), keeping the deleted category's name as a subcategory so its origin
// isn't lost. Returns the possibly-extended category list and the remapped
// transactions. Pure — the caller persists the results.
export function reassignToOthers(
  deleted: Category,
  allCats: Category[],
  txns: Transaction[],
): { cats: Category[]; txns: Transaction[] } {
  const type = deleted.type;
  const stamp = new Date().toISOString();
  const remaining = allCats.filter((c) => c.id !== deleted.id);
  const hasAffected = txns.some((t) => t.type === type && t.category.id === deleted.id);
  if (!hasAffected) return { cats: remaining, txns };

  let others = remaining.find((c) => CATCHALL_RE.test(c.name.trim()));
  let cats = remaining;
  if (!others) {
    others = {
      id: remaining.some((c) => c.id === 'others') ? `others-${Date.now().toString(36)}` : 'others',
      name: getLanguage() === 'it' ? 'Altro' : 'Others',
      icon: 'MoreHorizontal',
      color: 'text-neutral-500',
      bgColor: 'bg-neutral-50',
      selectedBg: 'bg-neutral-100',
      subcategories: [],
      type,
      updatedAt: stamp,
    };
    cats = [...remaining, others];
  }
  // Keep the deleted category's name as a subcategory of Others for context.
  const originSub = deleted.name.trim();
  if (!(others.subcategories || []).some((s) => s.toLowerCase() === originSub.toLowerCase())) {
    others = { ...others, subcategories: [...(others.subcategories || []), originSub], updatedAt: stamp };
    cats = cats.map((c) => (c.id === others!.id ? others! : c));
  }
  const bucket = others;
  const newTxns = txns.map((t) =>
    t.type === type && t.category.id === deleted.id
      ? { ...t, category: bucket, subcategory: originSub, updatedAt: stamp }
      : t,
  );
  return { cats, txns: newTxns };
}
