import type { Category } from '../types';

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
    name: 'Health & Personal Care',
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