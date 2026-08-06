import React from 'react';
import { monthsShort, monthsFull } from '../i18n/store';
import { parseLocalDate } from '../lib/dates';

interface DatePickerModalProps {
  expenses: any[];
  tempStartDate: { month: number; year: number } | null;
  tempEndDate: { month: number; year: number } | null;
  onStartDateChange: (date: { month: number; year: number } | null) => void;
  onEndDateChange: (date: { month: number; year: number } | null) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function DatePickerModal({
  expenses,
  tempStartDate,
  tempEndDate,
  onStartDateChange,
  onEndDateChange,
  onConfirm,
  onClose
}: DatePickerModalProps) {
  // Get all months with transactions
  const monthsWithTransactions = new Set<string>();
  expenses.forEach(expense => {
    const date = parseLocalDate(expense.date);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    monthsWithTransactions.add(key);
  });
  
  // Convert to array and sort (newest first)
  const sortedMonths = Array.from(monthsWithTransactions)
    .map(key => {
      const [year, month] = key.split('-').map(Number);
      return { month, year, key };
    })
    .sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
  
  const handleMonthClick = (month: number, year: number) => {
    if (!tempStartDate) {
      // First click - set start date
      onStartDateChange({ month, year });
      onEndDateChange(null);
    } else if (!tempEndDate) {
      // Second click - set end date
      const startTime = new Date(tempStartDate.year, tempStartDate.month).getTime();
      const clickTime = new Date(year, month).getTime();
      
      if (clickTime < startTime) {
        // Clicked before start, swap
        onEndDateChange(tempStartDate);
        onStartDateChange({ month, year });
      } else if (clickTime === startTime) {
        // Same month - clear
        onStartDateChange(null);
        onEndDateChange(null);
      } else {
        // After start - set as end
        onEndDateChange({ month, year });
      }
    } else {
      // Already have range - reset and start new
      onStartDateChange({ month, year });
      onEndDateChange(null);
    }
  };
  
  const isInRange = (month: number, year: number) => {
    if (!tempStartDate || !tempEndDate) return false;
    
    const checkTime = new Date(year, month).getTime();
    const startTime = new Date(tempStartDate.year, tempStartDate.month).getTime();
    const endTime = new Date(tempEndDate.year, tempEndDate.month).getTime();
    
    return checkTime >= startTime && checkTime <= endTime;
  };
  
  const isSelected = (month: number, year: number) => {
    if (tempStartDate && tempStartDate.month === month && tempStartDate.year === year) return true;
    if (tempEndDate && tempEndDate.month === month && tempEndDate.year === year) return true;
    return false;
  };
  
  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Semi-transparent backdrop */}
      <div 
        className="flex-1 bg-black bg-opacity-40"
        onClick={onClose}
      />
      
      {/* Bottom sheet - does NOT cover bottom nav */}
      <div 
        className="bg-white rounded-t-3xl flex flex-col shadow-2xl"
        style={{ 
          maxHeight: 'calc(100vh - 80px)', // Leave space for bottom nav (56px) + safe spacing
          paddingBottom: 'env(safe-area-inset-bottom)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - fixed */}
        <div className="flex-shrink-0 px-6 pt-5 pb-3 border-b border-neutral-100">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-neutral-900 font-semibold text-lg">Select Period</h3>
            <button
              onClick={onClose}
              className="text-neutral-400 active:text-neutral-600 w-8 h-8 flex items-center justify-center -mr-2"
            >
              ✕
            </button>
          </div>
          <p className="text-neutral-500 text-xs">
            Select one month or multiple months to filter a range
          </p>
        </div>
        
        {/* Selection indicator */}
        {(tempStartDate || tempEndDate) && (
          <div className="flex-shrink-0 px-6 py-3 bg-blue-50">
            <p className="text-blue-900 text-xs font-medium">
              {tempStartDate && !tempEndDate && (
                <>Selected: {`${monthsFull()[tempStartDate.month]} ${tempStartDate.year}`}</>
              )}
              {tempStartDate && tempEndDate && (
                <>Range: {`${monthsShort()[tempStartDate.month]} ${tempStartDate.year}`} - {`${monthsShort()[tempEndDate.month]} ${tempEndDate.year}`}</>
              )}
            </p>
          </div>
        )}
        
        {/* Scrollable month grid */}
        <div 
          className="flex-1 overflow-y-auto px-6 py-4"
          style={{ minHeight: 0 }}
        >
          <div className="grid grid-cols-3 gap-2">
            {sortedMonths.map(({ month, year, key }) => {
              const date = new Date(year, month, 1);
              const label = monthsShort()[date.getMonth()];
              const yearLabel = date.getFullYear().toString().slice(-2);
              
              return (
                <button
                  key={key}
                  onClick={() => handleMonthClick(month, year)}
                  className={`py-3 px-3 rounded-lg text-xs font-medium transition-all ${
                    isSelected(month, year)
                      ? 'bg-blue-600 text-white shadow-md'
                      : isInRange(month, year)
                      ? 'bg-blue-100 text-blue-900'
                      : 'bg-neutral-100 text-neutral-700 active:bg-neutral-200'
                  }`}
                >
                  <div className="font-semibold">{label} '{yearLabel}</div>
                </button>
              );
            })}
          </div>
        </div>
        
        {/* Fixed action area with visual separation */}
        <div className="flex-shrink-0 border-t border-neutral-200 bg-white">
          <div className="px-6 py-4 space-y-2">
            {(tempStartDate || tempEndDate) && (
              <button
                onClick={() => {
                  onStartDateChange(null);
                  onEndDateChange(null);
                }}
                className="w-full py-3 bg-neutral-100 text-neutral-700 rounded-lg font-medium text-sm active:bg-neutral-200"
              >
                Clear Selection
              </button>
            )}
            <button
              onClick={onConfirm}
              disabled={!tempStartDate}
              className={`w-full py-3.5 rounded-lg font-medium text-sm ${
                tempStartDate
                  ? 'bg-blue-600 text-white active:bg-blue-700'
                  : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
              }`}
            >
              Apply Filter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}