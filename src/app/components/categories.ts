import type { Category } from '../types';
import type { Language } from '../i18n/store';

export type { Category };

// Default expense categories (icon is a lucide icon name, see categoryIcons.ts)
export const categories: Category[] = [
  {
    id: 'office-food',
    name: 'Office Food',
    icon: 'Coffee',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    selectedBg: 'bg-amber-100',
    subcategories: ['Breakfast', 'Lunch', 'Snack'],
    type: 'expense' as const
  },
  {
    id: 'food-drinks',
    name: 'Food & Drinks',
    icon: 'UtensilsCrossed',
    color: 'text-orange-500',
    bgColor: 'bg-orange-50',
    selectedBg: 'bg-orange-100',
    subcategories: ['Restaurant', 'Drinks', 'Snack'],
    type: 'expense' as const
  },
  {
    id: 'gifts',
    name: 'Gifts',
    icon: 'Gift',
    color: 'text-rose-500',
    bgColor: 'bg-rose-50',
    selectedBg: 'bg-rose-100',
    subcategories: ['Wedding', 'Birthday'],
    type: 'expense' as const
  },
  {
    id: 'groceries',
    name: 'Groceries',
    icon: 'ShoppingCart',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-50',
    selectedBg: 'bg-emerald-100',
    subcategories: ['Supermarket'],
    type: 'expense' as const
  },
  {
    id: 'health-personal-care',
    name: 'Health & Care',
    icon: 'Heart',
    color: 'text-red-500',
    bgColor: 'bg-red-50',
    selectedBg: 'bg-red-100',
    subcategories: ['Pharmacy', 'Cosmetics', 'Wellness'],
    type: 'expense' as const
  },
  {
    id: 'housing',
    name: 'Housing',
    icon: 'Home',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    selectedBg: 'bg-blue-100',
    subcategories: ['Rent', 'Utilities', 'Cleaning'],
    type: 'expense' as const
  },
  {
    id: 'leisure',
    name: 'Leisure',
    icon: 'Film',
    color: 'text-purple-500',
    bgColor: 'bg-purple-50',
    selectedBg: 'bg-purple-100',
    subcategories: ['Movies', 'Concerts', 'Clubbing'],
    type: 'expense' as const
  },
  {
    id: 'shopping',
    name: 'Shopping',
    icon: 'ShoppingBag',
    color: 'text-pink-500',
    bgColor: 'bg-pink-50',
    selectedBg: 'bg-pink-100',
    subcategories: ['Clothing', 'Electronics'],
    type: 'expense' as const
  },
  {
    id: 'sport',
    name: 'Sport',
    icon: 'Dumbbell',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    selectedBg: 'bg-green-100',
    subcategories: ['Tennis', 'Barry\'s'],
    type: 'expense' as const
  },
  {
    id: 'subscriptions',
    name: 'Subscriptions',
    icon: 'FileText',
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-50',
    selectedBg: 'bg-indigo-100',
    subcategories: ['Streaming', 'Cloud'],
    type: 'expense' as const
  },
  {
    id: 'tax-fees',
    name: 'Tax & Fees',
    icon: 'CreditCard',
    color: 'text-slate-600',
    bgColor: 'bg-slate-50',
    selectedBg: 'bg-slate-100',
    subcategories: ['Income Tax', 'Housing Tax', 'Bank Fees'],
    type: 'expense' as const
  },
  {
    id: 'transports',
    name: 'Transports',
    icon: 'Car',
    color: 'text-sky-600',
    bgColor: 'bg-sky-50',
    selectedBg: 'bg-sky-100',
    subcategories: ['Public Transport', 'Uber/Taxi', 'Gasoline'],
    type: 'expense' as const
  },
  {
    id: 'travel',
    name: 'Travel',
    icon: 'Plane',
    color: 'text-teal-500',
    bgColor: 'bg-teal-50',
    selectedBg: 'bg-teal-100',
    subcategories: ['Flights', 'Hotel', 'Food', 'Activities', 'Transportation'],
    type: 'expense' as const
  },
  {
    id: 'others',
    name: 'Others',
    icon: 'MoreHorizontal',
    color: 'text-neutral-500',
    bgColor: 'bg-neutral-50',
    selectedBg: 'bg-neutral-100',
    subcategories: ['Donations', 'Unexpected'],
    type: 'expense' as const
  }
];

// Default income categories
export const incomeCategories: Category[] = [
  {
    id: 'salary',
    name: 'Salary',
    icon: 'Briefcase',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    selectedBg: 'bg-emerald-100',
    type: 'income' as const
  },
  {
    id: 'real-estate',
    name: 'Real Estate',
    icon: 'Home',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    selectedBg: 'bg-blue-100',
    type: 'income' as const
  },
  {
    id: 'dividends',
    name: 'Dividends',
    icon: 'TrendingUp',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    selectedBg: 'bg-indigo-100',
    type: 'income' as const
  },
  {
    id: 'royalties',
    name: 'Royalties',
    icon: 'Sparkles',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    selectedBg: 'bg-purple-100',
    type: 'income' as const
  }
];

// ── Language-specific starter catalogues ────────────────────────────────────
//
// Only NAMES differ by language; ids, icons and colours are shared, which is
// what lets the demo dataset and any future tooling address a category by id
// regardless of the language it was seeded in.
//
// These apply exactly once, when onboarding seeds a fresh account. After that,
// category and subcategory names are the user's data: switching the app
// language never renames them (an Italian user may deliberately keep
// "Travel"), the same way it doesn't rewrite their transaction descriptions.

interface CategoryTranslation {
  name: string;
  // Replaces the English subcategory list wholesale. Usually one-for-one, but
  // it may be shorter: a subcategory that does not earn its place in a
  // language is simply left out.
  subcategories?: string[];
}

// `null` means the category is not part of this language's starter set at all.
// Not every category survives translation: Office Food has no natural Italian
// name ("Pausa Pranzo" says lunch BREAK, which is a moment in the day rather
// than a kind of spending), and a starter category nobody recognises is worse
// than one less category. The Italian demo data drops the rows filed under a
// removed category too, so the samples never point at something absent from
// the catalogue.
const IT_EXPENSE: Record<string, CategoryTranslation | null> = {
  'office-food': null,
  'food-drinks': { name: 'Cibo & Bevande', subcategories: ['Ristorante', 'Aperitivo', 'Spuntino'] },
  gifts: { name: 'Regali', subcategories: ['Matrimonio', 'Compleanno'] },
  groceries: { name: 'Spesa', subcategories: ['Supermercato'] },
  'health-personal-care': { name: 'Salute & Cura', subcategories: ['Farmacia', 'Cosmetici', 'Benessere'] },
  housing: { name: 'Casa', subcategories: ['Affitto', 'Bollette', 'Pulizie'] },
  leisure: { name: 'Tempo Libero', subcategories: ['Cinema', 'Concerti'] },
  shopping: { name: 'Shopping', subcategories: ['Abbigliamento', 'Elettronica'] },
  // Barry's is a boutique-gym brand; the Italian starter list wants the
  // generic word, not the brand.
  sport: { name: 'Sport', subcategories: ['Tennis', 'Palestra'] },
  subscriptions: { name: 'Abbonamenti', subcategories: ['Streaming', 'Cloud'] },
  'tax-fees': { name: 'Tasse & Commissioni', subcategories: ['Tasse sul Reddito', 'Tasse sulla Casa', 'Commissioni Bancarie'] },
  transports: { name: 'Trasporti', subcategories: ['Mezzi Pubblici', 'Uber/Taxi', 'Benzina'] },
  travel: { name: 'Viaggi', subcategories: ['Voli', 'Hotel', 'Cibo', 'Attività', 'Trasporti'] },
  others: { name: 'Altro', subcategories: ['Donazioni', 'Imprevisti'] },
};

const IT_INCOME: Record<string, CategoryTranslation | null> = {
  salary: { name: 'Stipendio' },
  'real-estate': { name: 'Immobili' },
  dividends: { name: 'Dividendi' },
  royalties: { name: 'Royalties' },
};

function localise(list: Category[], table: Record<string, CategoryTranslation | null>): Category[] {
  return list.flatMap((cat) => {
    // Explicit null drops the category; merely absent means "no translation
    // needed", which is a different thing and keeps the English name.
    if (cat.id in table && table[cat.id] === null) return [];
    const tr = table[cat.id];
    if (!tr) return [cat];
    return [{
      ...cat,
      name: tr.name,
      ...(cat.subcategories ? { subcategories: tr.subcategories ?? cat.subcategories } : {}),
    }];
  });
}

/**
 * Category ids a language deliberately leaves out of its starter set. The demo
 * dataset filters its rows through this, so an Italian sample never files
 * spending under a category the Italian catalogue does not contain - which
 * would orphan the row and drop it off the Dashboard.
 */
export function droppedCategoryIdsFor(lang: Language): Set<string> {
  if (lang !== 'it') return new Set();
  const dropped = new Set<string>();
  for (const [id, tr] of [...Object.entries(IT_EXPENSE), ...Object.entries(IT_INCOME)]) {
    if (tr === null) dropped.add(id);
  }
  return dropped;
}

export function defaultCategoriesFor(lang: Language): Category[] {
  return lang === 'it' ? localise(categories, IT_EXPENSE) : categories;
}

export function defaultIncomeCategoriesFor(lang: Language): Category[] {
  return lang === 'it' ? localise(incomeCategories, IT_INCOME) : incomeCategories;
}