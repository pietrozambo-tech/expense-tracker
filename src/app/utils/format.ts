// Legacy currency formatting - kept for backward compatibility
// New code should use the currency utilities from currency.ts

// Currency formatting utility - formats as number€ (e.g., 1,254.25€ or 3.46€)
export const formatCurrency = (amount: number, decimals: number = 2): string => {
  // Handle null/undefined amounts
  if (amount === null || amount === undefined) {
    return '0.00€';
  }
  // Always show 2 decimals
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + '€';
};

// Compact currency formatting for large numbers (5+ digits)
export const formatCompactCurrency = (amount: number): string => {
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  
  // 1 million or more: use MM
  if (absAmount >= 1000000) {
    const millions = absAmount / 1000000;
    return `${sign}${millions.toFixed(1)}MM€`;
  }
  
  // 100,000 or more (6+ digits): use K
  if (absAmount >= 100000) {
    const thousands = absAmount / 1000;
    return `${sign}${Math.round(thousands)}K€`;
  }
  
  // Less than 100,000: use normal formatting
  return formatCurrency(amount);
};

// Summary card formatting - always shows whole numbers without decimals
export const formatSummaryCurrency = (amount: number): string => {
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  
  // 1 million or more: use MM
  if (absAmount >= 1000000) {
    const millions = absAmount / 1000000;
    return `${sign}${millions.toFixed(1)}MM€`;
  }
  
  // 100,000 or more (6+ digits): use K
  if (absAmount >= 100000) {
    const thousands = absAmount / 1000;
    return `${sign}${Math.round(thousands)}K€`;
  }
  
  // Less than 100,000: use whole number formatting
  return `${sign}${Math.round(absAmount).toLocaleString('en-US')}€`;
};
