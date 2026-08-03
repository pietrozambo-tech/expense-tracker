import { categories, incomeCategories } from './categories';
import type { Transaction } from '../types';

// Helper function to get category by name
const getCategoryByName = (name: string, type: 'expense' | 'income') => {
  const categoryList = type === 'expense' ? categories : incomeCategories;
  return categoryList.find(cat => cat.name === name) || categoryList[0];
};

const mockExpensesWithoutCurrency = [
  // July 2025 - Income
  {
    id: 'income-2025-07-01',
    description: 'Monthly salary',
    amount: 3200,
    category: getCategoryByName('Salary', 'income'),
    date: '2025-07-01',
    type: 'income' as const,
    recurrence: 'Every month'
  },
  {
    id: 'income-2025-07-15',
    description: 'Dividend payout',
    amount: 250,
    category: getCategoryByName('Dividends', 'income'),
    date: '2025-07-15',
    type: 'income' as const
  },

  // July 2025 - Expenses
  {
    id: 'expense-2025-07-02',
    description: 'Coffee',
    amount: 6.00,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Breakfast',
    date: '2025-07-02',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-07-03',
    description: 'Weekly groceries',
    amount: 148.00,
    category: getCategoryByName('Groceries', 'expense'),
    subcategory: 'Supermarket',
    date: '2025-07-03',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-07-04',
    description: 'Lunch out',
    amount: 22.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Restaurant',
    date: '2025-07-04',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-07-05',
    description: 'Snack',
    amount: 8.00,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Snack',
    date: '2025-07-05',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-07-06',
    description: 'Headphones',
    amount: 1140.00,
    category: getCategoryByName('Shopping', 'expense'),
    subcategory: 'Electronics',
    date: '2025-07-06',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-07-07',
    description: 'Court booking',
    amount: 20.00,
    category: getCategoryByName('Sport', 'expense'),
    subcategory: 'Tennis',
    date: '2025-07-07',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-07-08',
    description: 'Coffee',
    amount: 6.00,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Breakfast',
    date: '2025-07-08',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-07-09',
    description: 'Aperitivo',
    amount: 35.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Drinks',
    date: '2025-07-09',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-07-10',
    description: 'Cinema',
    amount: 18.00,
    category: getCategoryByName('Leisure', 'expense'),
    subcategory: 'Movies',
    date: '2025-07-10',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-07-11',
    description: 'Summer trip',
    amount: 1420.00,
    category: getCategoryByName('Travel', 'expense'),
    subcategory: 'Flights',
    date: '2025-07-11',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-07-12',
    description: 'Fuel',
    amount: 70.00,
    category: getCategoryByName('Transports', 'expense'),
    subcategory: 'Gasoline',
    date: '2025-07-12',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-07-13',
    description: 'Monthly rent',
    amount: 900.00,
    category: getCategoryByName('Housing', 'expense'),
    subcategory: 'Rent',
    date: '2025-07-01',
    type: 'expense' as const,
    recurrence: 'First day of the month' as const
  },
  {
    id: 'expense-2025-07-14',
    description: 'Coffee',
    amount: 6.00,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Breakfast',
    date: '2025-07-14',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-07-15',
    description: 'Summer clothes',
    amount: 95.00,
    category: getCategoryByName('Shopping', 'expense'),
    subcategory: 'Clothing',
    date: '2025-07-15',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-07-16',
    description: 'Massage',
    amount: 60.00,
    category: getCategoryByName('Health & Personal Care', 'expense'),
    subcategory: 'Wellness',
    date: '2025-07-16',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-07-17',
    description: 'Snack',
    amount: 15.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Snack',
    date: '2025-07-17',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-07-18',
    description: 'Live show',
    amount: 276.00,
    category: getCategoryByName('Leisure', 'expense'),
    subcategory: 'Concerts',
    date: '2025-07-18',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-07-19',
    description: 'Coffee & croissant',
    amount: 12.00,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Snack',
    date: '2025-07-19',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-07-20',
    description: 'Night taxi',
    amount: 45.00,
    category: getCategoryByName('Transports', 'expense'),
    subcategory: 'Uber/Taxi',
    date: '2025-07-20',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-07-21',
    description: 'Dinner',
    amount: 30.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Restaurant',
    date: '2025-07-21',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-07-22',
    description: 'Groceries',
    amount: 55.00,
    category: getCategoryByName('Groceries', 'expense'),
    subcategory: 'Supermarket',
    date: '2025-07-22',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-07-23',
    description: 'Tax adjustment',
    amount: 150.00,
    category: getCategoryByName('Tax & Fees', 'expense'),
    subcategory: 'Income Tax',
    date: '2025-07-23',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-07-24',
    description: 'Netflix',
    amount: 100.00,
    category: getCategoryByName('Subscriptions', 'expense'),
    subcategory: 'Streaming',
    date: '2025-07-24',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-07-25',
    description: 'Small repair',
    amount: 180.00,
    category: getCategoryByName('Others', 'expense'),
    subcategory: 'Unexpected',
    date: '2025-07-25',
    type: 'expense' as const
  },

  // August 2025 - Income
  {
    id: 'income-2025-08-01',
    description: 'Monthly salary',
    amount: 3200,
    category: getCategoryByName('Salary', 'income'),
    date: '2025-08-01',
    type: 'income' as const,
    recurrence: 'Every month'
  },
  {
    id: 'income-2025-08-20',
    description: 'Rental income',
    amount: 300,
    category: getCategoryByName('Real Estate', 'income'),
    date: '2025-08-20',
    type: 'income' as const
  },

  // August 2025 - Expenses
  {
    id: 'expense-2025-08-02',
    description: 'Coffee',
    amount: 5.50,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Breakfast',
    date: '2025-08-02',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-08-03',
    description: 'Groceries',
    amount: 45.00,
    category: getCategoryByName('Groceries', 'expense'),
    subcategory: 'Supermarket',
    date: '2025-08-03',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-08-04',
    description: 'Lunch',
    amount: 20.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Restaurant',
    date: '2025-08-04',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-08-05',
    description: 'Snack',
    amount: 7.00,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Snack',
    date: '2025-08-05',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-08-06',
    description: 'Accessories',
    amount: 60.00,
    category: getCategoryByName('Shopping', 'expense'),
    subcategory: 'Electronics',
    date: '2025-08-06',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-08-07',
    description: 'Class',
    amount: 15.00,
    category: getCategoryByName('Sport', 'expense'),
    subcategory: "Barry's",
    date: '2025-08-07',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-08-08',
    description: 'Coffee',
    amount: 6.00,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Breakfast',
    date: '2025-08-08',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-08-09',
    description: 'Drinks',
    amount: 28.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Drinks',
    date: '2025-08-09',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-08-10',
    description: 'Cinema',
    amount: 12.00,
    category: getCategoryByName('Leisure', 'expense'),
    subcategory: 'Movies',
    date: '2025-08-10',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-08-11',
    description: 'Weekend hotel',
    amount: 180.00,
    category: getCategoryByName('Travel', 'expense'),
    subcategory: 'Hotel',
    date: '2025-08-11',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-08-12',
    description: 'Fuel',
    amount: 40.00,
    category: getCategoryByName('Transports', 'expense'),
    subcategory: 'Gasoline',
    date: '2025-08-12',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-08-13',
    description: 'Monthly rent',
    amount: 900.00,
    category: getCategoryByName('Housing', 'expense'),
    subcategory: 'Rent',
    date: '2025-08-01',
    type: 'expense' as const,
    recurrence: 'First day of the month' as const
  },
  {
    id: 'expense-2025-08-14',
    description: 'Coffee',
    amount: 5.50,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Breakfast',
    date: '2025-08-14',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-08-15',
    description: 'Clothes',
    amount: 40.00,
    category: getCategoryByName('Shopping', 'expense'),
    subcategory: 'Clothing',
    date: '2025-08-15',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-08-16',
    description: 'Pharmacy',
    amount: 35.00,
    category: getCategoryByName('Health & Personal Care', 'expense'),
    subcategory: 'Pharmacy',
    date: '2025-08-16',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-08-17',
    description: 'Snack',
    amount: 10.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Snack',
    date: '2025-08-17',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-08-18',
    description: 'Movie',
    amount: 20.00,
    category: getCategoryByName('Leisure', 'expense'),
    subcategory: 'Movies',
    date: '2025-08-18',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-08-19',
    description: 'Coffee',
    amount: 6.50,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Snack',
    date: '2025-08-19',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-08-20',
    description: 'Taxi',
    amount: 25.00,
    category: getCategoryByName('Transports', 'expense'),
    subcategory: 'Uber/Taxi',
    date: '2025-08-20',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-08-21',
    description: 'Dinner',
    amount: 22.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Restaurant',
    date: '2025-08-21',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-08-22',
    description: 'Groceries',
    amount: 48.00,
    category: getCategoryByName('Groceries', 'expense'),
    subcategory: 'Supermarket',
    date: '2025-08-22',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-08-23',
    description: 'Donation',
    amount: 12.00,
    category: getCategoryByName('Others', 'expense'),
    subcategory: 'Donations',
    date: '2025-08-23',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-08-24',
    description: 'Netflix',
    amount: 10.00,
    category: getCategoryByName('Subscriptions', 'expense'),
    subcategory: 'Streaming',
    date: '2025-08-24',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-08-25',
    description: 'Medicine',
    amount: 8.00,
    category: getCategoryByName('Health & Personal Care', 'expense'),
    subcategory: 'Pharmacy',
    date: '2025-08-25',
    type: 'expense' as const
  },

  // September 2025 - Income
  {
    id: 'income-2025-09-01',
    description: 'Monthly salary',
    amount: 3200,
    category: getCategoryByName('Salary', 'income'),
    date: '2025-09-01',
    type: 'income' as const,
    recurrence: 'Every month'
  },
  {
    id: 'income-2025-09-10',
    description: 'Royalties',
    amount: 220,
    category: getCategoryByName('Royalties', 'income'),
    date: '2025-09-10',
    type: 'income' as const
  },

  // September 2025 - Expenses
  {
    id: 'expense-2025-09-02',
    description: 'Coffee',
    amount: 5.00,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Breakfast',
    date: '2025-09-02',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-09-03',
    description: 'Groceries',
    amount: 46.00,
    category: getCategoryByName('Groceries', 'expense'),
    subcategory: 'Supermarket',
    date: '2025-09-03',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-09-04',
    description: 'Lunch',
    amount: 18.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Restaurant',
    date: '2025-09-04',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-09-05',
    description: 'Snack',
    amount: 7.00,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Snack',
    date: '2025-09-05',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-09-06',
    description: 'Cable',
    amount: 50.00,
    category: getCategoryByName('Shopping', 'expense'),
    subcategory: 'Electronics',
    date: '2025-09-06',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-09-07',
    description: 'Tennis',
    amount: 15.00,
    category: getCategoryByName('Sport', 'expense'),
    subcategory: 'Tennis',
    date: '2025-09-07',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-09-08',
    description: 'Coffee',
    amount: 5.00,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Breakfast',
    date: '2025-09-08',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-09-09',
    description: 'Drinks',
    amount: 25.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Drinks',
    date: '2025-09-09',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-09-10',
    description: 'Cinema',
    amount: 15.00,
    category: getCategoryByName('Leisure', 'expense'),
    subcategory: 'Movies',
    date: '2025-09-10',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-09-11',
    description: 'Train',
    amount: 120.00,
    category: getCategoryByName('Travel', 'expense'),
    subcategory: 'Transportation',
    date: '2025-09-11',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-09-12',
    description: 'Fuel',
    amount: 35.00,
    category: getCategoryByName('Transports', 'expense'),
    subcategory: 'Gasoline',
    date: '2025-09-12',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-09-13',
    description: 'Monthly rent',
    amount: 900.00,
    category: getCategoryByName('Housing', 'expense'),
    subcategory: 'Rent',
    date: '2025-09-01',
    type: 'expense' as const,
    recurrence: 'First day of the month' as const
  },
  {
    id: 'expense-2025-09-14',
    description: 'Coffee',
    amount: 5.00,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Breakfast',
    date: '2025-09-14',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-09-15',
    description: 'Clothes',
    amount: 35.00,
    category: getCategoryByName('Shopping', 'expense'),
    subcategory: 'Clothing',
    date: '2025-09-15',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-09-16',
    description: 'Massage',
    amount: 30.00,
    category: getCategoryByName('Health & Personal Care', 'expense'),
    subcategory: 'Wellness',
    date: '2025-09-16',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-09-17',
    description: 'Snack',
    amount: 10.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Snack',
    date: '2025-09-17',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-09-18',
    description: 'Movie',
    amount: 20.00,
    category: getCategoryByName('Leisure', 'expense'),
    subcategory: 'Movies',
    date: '2025-09-18',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-09-19',
    description: 'Coffee',
    amount: 6.00,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Snack',
    date: '2025-09-19',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-09-20',
    description: 'Taxi',
    amount: 18.00,
    category: getCategoryByName('Transports', 'expense'),
    subcategory: 'Uber/Taxi',
    date: '2025-09-20',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-09-21',
    description: 'Dinner',
    amount: 22.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Restaurant',
    date: '2025-09-21',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-09-22',
    description: 'Groceries',
    amount: 45.00,
    category: getCategoryByName('Groceries', 'expense'),
    subcategory: 'Supermarket',
    date: '2025-09-22',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-09-23',
    description: 'iCloud',
    amount: 10.00,
    category: getCategoryByName('Subscriptions', 'expense'),
    subcategory: 'Cloud',
    date: '2025-09-23',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-09-24',
    description: 'Misc',
    amount: 12.00,
    category: getCategoryByName('Others', 'expense'),
    subcategory: 'Unexpected',
    date: '2025-09-24',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-09-25',
    description: 'Medicine',
    amount: 8.00,
    category: getCategoryByName('Health & Personal Care', 'expense'),
    subcategory: 'Pharmacy',
    date: '2025-09-25',
    type: 'expense' as const
  },

  // October 2025 - Income
  {
    id: 'income-2025-10-01',
    description: 'Monthly salary',
    amount: 3200,
    category: getCategoryByName('Salary', 'income'),
    date: '2025-10-01',
    type: 'income' as const,
    recurrence: 'Every month'
  },

  // October 2025 - Expenses
  {
    id: 'expense-2025-10-02',
    description: 'Coffee',
    amount: 4.50,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Breakfast',
    date: '2025-10-02',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-10-03',
    description: 'Groceries',
    amount: 45.80,
    category: getCategoryByName('Groceries', 'expense'),
    subcategory: 'Supermarket',
    date: '2025-10-03',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-10-04',
    description: 'Lunch',
    amount: 18.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Restaurant',
    date: '2025-10-04',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-10-05',
    description: 'Snack',
    amount: 7.50,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Snack',
    date: '2025-10-05',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-10-06',
    description: 'Headphones',
    amount: 60.00,
    category: getCategoryByName('Shopping', 'expense'),
    subcategory: 'Electronics',
    date: '2025-10-06',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-10-07',
    description: 'Tennis',
    amount: 15.00,
    category: getCategoryByName('Sport', 'expense'),
    subcategory: 'Tennis',
    date: '2025-10-07',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-10-08',
    description: 'Coffee',
    amount: 5.00,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Breakfast',
    date: '2025-10-08',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-10-09',
    description: 'Drinks',
    amount: 22.50,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Drinks',
    date: '2025-10-09',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-10-10',
    description: 'Cinema',
    amount: 12.00,
    category: getCategoryByName('Leisure', 'expense'),
    subcategory: 'Movies',
    date: '2025-10-10',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-10-11',
    description: 'Trip',
    amount: 150.00,
    category: getCategoryByName('Travel', 'expense'),
    subcategory: 'Flights',
    date: '2025-10-11',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-10-12',
    description: 'Fuel',
    amount: 30.00,
    category: getCategoryByName('Transports', 'expense'),
    subcategory: 'Gasoline',
    date: '2025-10-12',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-10-13',
    description: 'Monthly rent',
    amount: 900.00,
    category: getCategoryByName('Housing', 'expense'),
    subcategory: 'Rent',
    date: '2025-10-01',
    type: 'expense' as const,
    recurrence: 'First day of the month' as const
  },
  {
    id: 'expense-2025-10-14',
    description: 'Coffee',
    amount: 3.50,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Breakfast',
    date: '2025-10-14',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-10-15',
    description: 'Shoes',
    amount: 50.00,
    category: getCategoryByName('Shopping', 'expense'),
    subcategory: 'Clothing',
    date: '2025-10-15',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-10-16',
    description: 'Spa',
    amount: 25.00,
    category: getCategoryByName('Health & Personal Care', 'expense'),
    subcategory: 'Wellness',
    date: '2025-10-16',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-10-17',
    description: 'Snack',
    amount: 10.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Snack',
    date: '2025-10-17',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-10-18',
    description: 'Concert',
    amount: 18.00,
    category: getCategoryByName('Leisure', 'expense'),
    subcategory: 'Concerts',
    date: '2025-10-18',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-10-19',
    description: 'Coffee',
    amount: 6.00,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Snack',
    date: '2025-10-19',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-10-20',
    description: 'Taxi',
    amount: 8.50,
    category: getCategoryByName('Transports', 'expense'),
    subcategory: 'Uber/Taxi',
    date: '2025-10-20',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-10-21',
    description: 'Dinner',
    amount: 12.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Restaurant',
    date: '2025-10-21',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-10-22',
    description: 'Groceries',
    amount: 40.00,
    category: getCategoryByName('Groceries', 'expense'),
    subcategory: 'Supermarket',
    date: '2025-10-22',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-10-23',
    description: 'Netflix',
    amount: 9.00,
    category: getCategoryByName('Subscriptions', 'expense'),
    subcategory: 'Streaming',
    date: '2025-10-23',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-10-24',
    description: 'Medicine',
    amount: 7.00,
    category: getCategoryByName('Health & Personal Care', 'expense'),
    subcategory: 'Pharmacy',
    date: '2025-10-24',
    type: 'expense' as const
  },

  // November 2025 - Income
  {
    id: 'income-2025-11-01',
    description: 'Monthly salary',
    amount: 3200,
    category: getCategoryByName('Salary', 'income'),
    date: '2025-11-01',
    type: 'income' as const,
    recurrence: 'Every month'
  },

  // November 2025 - Expenses
  {
    id: 'expense-2025-11-02',
    description: 'Coffee',
    amount: 4.50,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Breakfast',
    date: '2025-11-02',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-11-03',
    description: 'Groceries',
    amount: 48.20,
    category: getCategoryByName('Groceries', 'expense'),
    subcategory: 'Supermarket',
    date: '2025-11-03',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-11-04',
    description: 'Lunch',
    amount: 20.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Restaurant',
    date: '2025-11-04',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-11-05',
    description: 'Snack',
    amount: 6.00,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Snack',
    date: '2025-11-05',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-11-06',
    description: 'Gadget',
    amount: 55.00,
    category: getCategoryByName('Shopping', 'expense'),
    subcategory: 'Electronics',
    date: '2025-11-06',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-11-07',
    description: 'Class',
    amount: 15.00,
    category: getCategoryByName('Sport', 'expense'),
    subcategory: "Barry's",
    date: '2025-11-07',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-11-08',
    description: 'Coffee',
    amount: 5.00,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Breakfast',
    date: '2025-11-08',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-11-09',
    description: 'Drinks',
    amount: 18.50,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Drinks',
    date: '2025-11-09',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-11-10',
    description: 'Cinema',
    amount: 15.00,
    category: getCategoryByName('Leisure', 'expense'),
    subcategory: 'Movies',
    date: '2025-11-10',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-11-11',
    description: 'Trip',
    amount: 160.00,
    category: getCategoryByName('Travel', 'expense'),
    subcategory: 'Flights',
    date: '2025-11-11',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-11-12',
    description: 'Fuel',
    amount: 32.00,
    category: getCategoryByName('Transports', 'expense'),
    subcategory: 'Gasoline',
    date: '2025-11-12',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-11-13',
    description: 'Monthly rent',
    amount: 900.00,
    category: getCategoryByName('Housing', 'expense'),
    subcategory: 'Rent',
    date: '2025-11-01',
    type: 'expense' as const,
    recurrence: 'First day of the month' as const
  },
  {
    id: 'expense-2025-11-14',
    description: 'Coffee',
    amount: 4.00,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Breakfast',
    date: '2025-11-14',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-11-15',
    description: 'Coat',
    amount: 45.00,
    category: getCategoryByName('Shopping', 'expense'),
    subcategory: 'Clothing',
    date: '2025-11-15',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-11-16',
    description: 'Massage',
    amount: 30.00,
    category: getCategoryByName('Health & Personal Care', 'expense'),
    subcategory: 'Wellness',
    date: '2025-11-16',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-11-17',
    description: 'Snack',
    amount: 12.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Snack',
    date: '2025-11-17',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-11-18',
    description: 'Concert',
    amount: 20.00,
    category: getCategoryByName('Leisure', 'expense'),
    subcategory: 'Concerts',
    date: '2025-11-18',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-11-19',
    description: 'Coffee',
    amount: 6.50,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Snack',
    date: '2025-11-19',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-11-20',
    description: 'Taxi',
    amount: 10.00,
    category: getCategoryByName('Transports', 'expense'),
    subcategory: 'Uber/Taxi',
    date: '2025-11-20',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-11-21',
    description: 'Dinner',
    amount: 13.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Restaurant',
    date: '2025-11-21',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-11-22',
    description: 'Groceries',
    amount: 42.00,
    category: getCategoryByName('Groceries', 'expense'),
    subcategory: 'Supermarket',
    date: '2025-11-22',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-11-23',
    description: 'Netflix',
    amount: 9.00,
    category: getCategoryByName('Subscriptions', 'expense'),
    subcategory: 'Streaming',
    date: '2025-11-23',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-11-24',
    description: 'Medicine',
    amount: 7.50,
    category: getCategoryByName('Health & Personal Care', 'expense'),
    subcategory: 'Pharmacy',
    date: '2025-11-24',
    type: 'expense' as const
  },

  // December 2025 - Income
  {
    id: 'income-2025-12-01',
    description: 'Monthly salary',
    amount: 3200,
    category: getCategoryByName('Salary', 'income'),
    date: '2025-12-01',
    type: 'income' as const,
    recurrence: 'Every month'
  },
  {
    id: 'income-2025-12-15',
    description: 'Dividends',
    amount: 200,
    category: getCategoryByName('Dividends', 'income'),
    date: '2025-12-15',
    type: 'income' as const
  },

  // December 2025 - Expenses
  {
    id: 'expense-2025-12-02',
    description: 'Coffee',
    amount: 6.00,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Breakfast',
    date: '2025-12-02',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-12-03',
    description: 'Groceries',
    amount: 265.00,
    category: getCategoryByName('Groceries', 'expense'),
    subcategory: 'Supermarket',
    date: '2025-12-03',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-12-04',
    description: 'Lunch',
    amount: 35.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Restaurant',
    date: '2025-12-04',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-12-05',
    description: 'Snack',
    amount: 15.00,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Snack',
    date: '2025-12-05',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-12-06',
    description: 'Phone',
    amount: 820.00,
    category: getCategoryByName('Shopping', 'expense'),
    subcategory: 'Electronics',
    date: '2025-12-06',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-12-07',
    description: 'Tennis',
    amount: 125.00,
    category: getCategoryByName('Sport', 'expense'),
    subcategory: 'Tennis',
    date: '2025-12-07',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-12-08',
    description: 'Coffee',
    amount: 8.00,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Breakfast',
    date: '2025-12-08',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-12-09',
    description: 'Drinks',
    amount: 95.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Drinks',
    date: '2025-12-09',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-12-10',
    description: 'Cinema',
    amount: 40.00,
    category: getCategoryByName('Leisure', 'expense'),
    subcategory: 'Movies',
    date: '2025-12-10',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-12-11',
    description: 'Holiday flights',
    amount: 2520.00,
    category: getCategoryByName('Travel', 'expense'),
    subcategory: 'Flights',
    date: '2025-12-11',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-12-12',
    description: 'Fuel',
    amount: 80.00,
    category: getCategoryByName('Transports', 'expense'),
    subcategory: 'Gasoline',
    date: '2025-12-12',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-12-13',
    description: 'Monthly rent',
    amount: 900.00,
    category: getCategoryByName('Housing', 'expense'),
    subcategory: 'Rent',
    date: '2025-12-01',
    type: 'expense' as const,
    recurrence: 'First day of the month' as const
  },
  {
    id: 'expense-2025-12-14',
    description: 'Coffee',
    amount: 12.00,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Breakfast',
    date: '2025-12-14',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-12-15',
    description: 'Gifts',
    amount: 180.00,
    category: getCategoryByName('Gifts', 'expense'),
    subcategory: 'Christmas',
    date: '2025-12-15',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-12-16',
    description: 'Massage',
    amount: 225.00,
    category: getCategoryByName('Health & Personal Care', 'expense'),
    subcategory: 'Wellness',
    date: '2025-12-16',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-12-17',
    description: 'Snack',
    amount: 20.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Snack',
    date: '2025-12-17',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-12-18',
    description: 'Event',
    amount: 110.00,
    category: getCategoryByName('Leisure', 'expense'),
    subcategory: 'Concerts',
    date: '2025-12-18',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-12-19',
    description: 'Coffee',
    amount: 15.00,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Snack',
    date: '2025-12-19',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-12-20',
    description: 'Taxi',
    amount: 35.00,
    category: getCategoryByName('Transports', 'expense'),
    subcategory: 'Uber/Taxi',
    date: '2025-12-20',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-12-21',
    description: 'Dinner',
    amount: 40.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Restaurant',
    date: '2025-12-21',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-12-22',
    description: 'Groceries',
    amount: 90.00,
    category: getCategoryByName('Groceries', 'expense'),
    subcategory: 'Supermarket',
    date: '2025-12-22',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-12-23',
    description: 'Property tax',
    amount: 120.00,
    category: getCategoryByName('Tax & Fees', 'expense'),
    subcategory: 'Housing Tax',
    date: '2025-12-23',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-12-24',
    description: 'Netflix',
    amount: 10.00,
    category: getCategoryByName('Subscriptions', 'expense'),
    subcategory: 'Streaming',
    date: '2025-12-24',
    type: 'expense' as const
  },
  {
    id: 'expense-2025-12-25',
    description: 'Emergency',
    amount: 225.00,
    category: getCategoryByName('Others', 'expense'),
    subcategory: 'Unexpected',
    date: '2025-12-25',
    type: 'expense' as const
  },

  // January 2026 - Income
  {
    id: 'income-2026-01-01-1',
    description: 'Monthly salary',
    amount: 3200,
    category: getCategoryByName('Salary', 'income'),
    date: '2026-01-01',
    type: 'income' as const,
    recurrence: 'Every month'
  },
  {
    id: 'income-2026-01-01-2',
    description: 'Content royalties',
    amount: 480,
    category: getCategoryByName('Royalties', 'income'),
    date: '2026-01-01',
    type: 'income' as const
  },

  // January 2026 - Expenses
  {
    id: 'expense-2026-01-01-1',
    description: 'Aperitivo',
    amount: 22.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Drinks',
    date: '2026-01-01',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-01-2',
    description: 'Monthly rent',
    amount: 900.00,
    category: getCategoryByName('Housing', 'expense'),
    subcategory: 'Rent',
    date: '2026-01-01',
    type: 'expense' as const,
    recurrence: 'First day of the month' as const
  },
  {
    id: 'expense-2026-01-01-3',
    description: 'Spotify Premium',
    amount: 10.00,
    category: getCategoryByName('Subscriptions', 'expense'),
    subcategory: 'Streaming',
    date: '2026-01-01',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-02-1',
    description: 'Medicine',
    amount: 18.00,
    category: getCategoryByName('Health & Personal Care', 'expense'),
    subcategory: 'Pharmacy',
    date: '2026-01-02',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-02-2',
    description: 'Court booking',
    amount: 22.00,
    category: getCategoryByName('Sport', 'expense'),
    subcategory: 'Tennis',
    date: '2026-01-02',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-02-3',
    description: 'iCloud',
    amount: 9.00,
    category: getCategoryByName('Subscriptions', 'expense'),
    subcategory: 'Cloud',
    date: '2026-01-02',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-01-4',
    description: 'Clothes',
    amount: 85.00,
    category: getCategoryByName('Shopping', 'expense'),
    subcategory: 'Clothing',
    date: '2026-01-01',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-04-1',
    description: 'Flight booking',
    amount: 420.00,
    category: getCategoryByName('Travel', 'expense'),
    subcategory: 'Flights',
    date: '2026-01-04',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-04-2',
    description: 'Charity',
    amount: 50.00,
    category: getCategoryByName('Others', 'expense'),
    subcategory: 'Donations',
    date: '2026-01-04',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-10',
    description: 'Apple',
    amount: 9.99,
    currency: 'EUR' as const,
    category: getCategoryByName('Subscriptions', 'expense'),
    subcategory: 'Cloud',
    date: '2026-01-10',
    type: 'expense' as const,
    recurrence: 'Every month' as const
  },
  {
    id: 'expense-2026-01-14',
    description: 'Cappuccino & croissant',
    amount: 3.80,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Breakfast',
    date: '2026-01-14',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-14-2',
    description: 'Lunch at work',
    amount: 12.40,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Lunch',
    date: '2026-01-14',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-15',
    description: 'Supermarket groceries',
    amount: 46.70,
    category: getCategoryByName('Groceries', 'expense'),
    subcategory: 'Supermarket',
    date: '2026-01-15',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-15-2',
    description: 'Evening drink',
    amount: 9.50,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Drinks',
    date: '2026-01-15',
    type: 'expense' as const
  },
  // A short trip abroad, priced in the local currency. These rows keep their
  // own currency instead of being converted like the rest of the sample - the
  // demo should show what the app actually does with a foreign purchase, not
  // just claim it in the tour.
  {
    id: 'expense-2026-01-15-gbp1',
    description: 'Flights to London',
    amount: 128.40,
    currency: 'GBP',
    category: getCategoryByName('Travel', 'expense'),
    subcategory: 'Flights',
    date: '2026-01-15',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-15-gbp2',
    description: 'Hotel, two nights',
    amount: 214.00,
    currency: 'GBP',
    category: getCategoryByName('Travel', 'expense'),
    subcategory: 'Hotel',
    date: '2026-01-15',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-16-gbp1',
    description: 'Dinner in Soho',
    amount: 46.50,
    currency: 'GBP',
    category: getCategoryByName('Travel', 'expense'),
    subcategory: 'Food',
    date: '2026-01-16',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-16-gbp2',
    description: 'Oyster card top-up',
    amount: 20.00,
    currency: 'GBP',
    category: getCategoryByName('Travel', 'expense'),
    subcategory: 'Transportation',
    date: '2026-01-16',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-16',
    description: 'Tennis court booking',
    amount: 18.00,
    category: getCategoryByName('Sport', 'expense'),
    subcategory: 'Tennis',
    date: '2026-01-16',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-16-2',
    description: 'Protein snack',
    amount: 2.90,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Snack',
    date: '2026-01-16',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-17',
    description: 'Dinner with friends',
    amount: 32.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Restaurant',
    date: '2026-01-17',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-17-2',
    description: 'New t-shirt',
    amount: 27.90,
    category: getCategoryByName('Shopping', 'expense'),
    subcategory: 'Clothing',
    date: '2026-01-17',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-18',
    description: 'Cinema ticket',
    amount: 11.00,
    category: getCategoryByName('Leisure', 'expense'),
    subcategory: 'Movies',
    date: '2026-01-18',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-18-2',
    description: 'Pharmacy purchase',
    amount: 14.60,
    category: getCategoryByName('Health & Personal Care', 'expense'),
    subcategory: 'Pharmacy',
    date: '2026-01-18',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-19',
    description: 'Barry\'s class',
    amount: 25.00,
    category: getCategoryByName('Sport', 'expense'),
    subcategory: 'Barry\'s',
    date: '2026-01-19',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-19-2',
    description: 'Streaming rental',
    amount: 4.99,
    category: getCategoryByName('Subscriptions', 'expense'),
    subcategory: 'Streaming',
    date: '2026-01-19',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-20',
    description: 'Coffee & pastry',
    amount: 5.20,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Snack',
    date: '2026-01-20',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-01-20-2',
    description: 'Headphones adapter',
    amount: 13.80,
    category: getCategoryByName('Shopping', 'expense'),
    subcategory: 'Electronics',
    date: '2026-01-20',
    type: 'expense' as const
  },
  // February 2026 - Recurrent
  {
    id: 'income-2026-02-01',
    description: 'Monthly salary',
    amount: 3200,
    category: getCategoryByName('Salary', 'income'),
    date: '2026-02-01',
    type: 'income' as const,
    recurrence: 'Every month' as const
  },
  {
    id: 'expense-2026-02-01',
    description: 'Monthly rent',
    amount: 900.00,
    category: getCategoryByName('Housing', 'expense'),
    subcategory: 'Rent',
    date: '2026-02-01',
    type: 'expense' as const,
    recurrence: 'First day of the month' as const
  },
  {
    id: 'expense-2026-02-10',
    description: 'Apple',
    amount: 9.99,
    category: getCategoryByName('Subscriptions', 'expense'),
    subcategory: 'Cloud',
    date: '2026-02-10',
    type: 'expense' as const,
    recurrence: 'Every month' as const
  },
  // February 2026 - One-off
  {
    id: 'expense-2026-02-01-2',
    description: 'Breakfast espresso',
    amount: 2.20,
    category: getCategoryByName('Office Food', 'expense'),
    subcategory: 'Breakfast',
    date: '2026-02-01',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-02-01-3',
    description: 'Weekly groceries',
    amount: 38.90,
    category: getCategoryByName('Groceries', 'expense'),
    subcategory: 'Supermarket',
    date: '2026-02-01',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-02-01-4',
    description: 'Evening aperitivo',
    amount: 14.00,
    category: getCategoryByName('Food & Drinks', 'expense'),
    subcategory: 'Drinks',
    date: '2026-02-01',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-02-02-1',
    description: 'Metro ticket',
    amount: 1.50,
    category: getCategoryByName('Transports', 'expense'),
    subcategory: 'Public Transport',
    date: '2026-02-02',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-02-02-2',
    description: 'Pharmacy essentials',
    amount: 11.80,
    category: getCategoryByName('Health & Personal Care', 'expense'),
    subcategory: 'Pharmacy',
    date: '2026-02-02',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-02-02-3',
    description: 'Movie night',
    amount: 10.50,
    category: getCategoryByName('Leisure', 'expense'),
    subcategory: 'Movies',
    date: '2026-02-02',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-02-03-1',
    description: 'Tennis lesson',
    amount: 30.00,
    category: getCategoryByName('Sport', 'expense'),
    subcategory: 'Tennis',
    date: '2026-02-03',
    type: 'expense' as const
  },
  {
    id: 'expense-2026-02-03-2',
    description: 'New phone charger',
    amount: 19.90,
    category: getCategoryByName('Shopping', 'expense'),
    subcategory: 'Electronics',
    date: '2026-02-03',
    type: 'expense' as const
  },
  {
    id: 'income-2026-02-03-3',
    description: 'Content royalties',
    amount: 180.00,
    category: getCategoryByName('Royalties', 'income'),
    date: '2026-02-03',
    type: 'income' as const
  }
];

// Add currency and recurrence fields to all mock expenses if not present (default EUR and 'Never repeat')
export const mockExpenses: Transaction[] = mockExpensesWithoutCurrency.map(expense => ({
  ...expense,
  currency: 'currency' in expense ? expense.currency : 'EUR',
  recurrence: 'recurrence' in expense ? expense.recurrence : 'Never repeat'
}));