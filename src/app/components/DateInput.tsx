import { Calendar, ChevronLeft, ChevronRight, Repeat } from 'lucide-react';
import { useRef, useEffect, useState } from 'react';

interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  showDatePicker: boolean;
  setShowDatePicker: (show: boolean) => void;
  recurrence?: string;
  onRecurrenceChange?: (recurrence: string) => void;
}

export function DateInput({ value, onChange, showDatePicker, setShowDatePicker, recurrence, onRecurrenceChange }: DateInputProps) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [showRecurrenceSelector, setShowRecurrenceSelector] = useState(false);
  const [recurrenceState, setRecurrenceState] = useState(recurrence || 'Never repeat');

  const recurrenceOptions = [
    'Never repeat',
    'Every day',
    'Every work day',
    'Every week',
    'Every second week',
    'First day of the month',
    'Every month',
    'Every year'
  ];

  // Auto-focus the input when it becomes visible (helps on desktop)
  useEffect(() => {
    if (showDatePicker && dateInputRef.current) {
      dateInputRef.current.focus();
    }
  }, [showDatePicker]);

  const formatDate = (dateString: string) => {
    // Parse the date string as local time, not UTC
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);
    
    if (selectedDate.getTime() === today.getTime()) {
      return 'Today';
    }
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (selectedDate.getTime() === yesterday.getTime()) {
      return 'Yesterday';
    }
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const resetToToday = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    onChange(`${year}-${month}-${day}`);
  };

  const navigateDay = (direction: 'prev' | 'next') => {
    const [year, month, day] = value.split('-').map(Number);
    const currentDate = new Date(year, month - 1, day);
    
    if (direction === 'prev') {
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    const newYear = currentDate.getFullYear();
    const newMonth = String(currentDate.getMonth() + 1).padStart(2, '0');
    const newDay = String(currentDate.getDate()).padStart(2, '0');
    onChange(`${newYear}-${newMonth}-${newDay}`);
  };

  return (
    <>
      <div className="px-6 pb-6">
        {/* Date label/button */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigateDay('prev')}
              className="text-neutral-400 hover:text-neutral-600 transition-colors p-0.5 active:bg-neutral-50 rounded"
              type="button"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={1.5} />
            </button>
            
            <label
              htmlFor="date-input"
              onClick={() => setShowDatePicker(true)}
              className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 transition-colors cursor-pointer w-[135px]"
            >
              <Calendar className="w-4 h-4" />
              <span>{formatDate(value)}</span>
            </label>
            
            <button
              onClick={() => navigateDay('next')}
              className="text-neutral-400 hover:text-neutral-600 transition-colors p-0.5 active:bg-neutral-50 rounded"
              type="button"
            >
              <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
          
          {/* Recurrence control */}
          <button
            onClick={() => setShowRecurrenceSelector(true)}
            className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-600 transition-colors active:scale-95"
            type="button"
          >
            <Repeat className="w-4 h-4" strokeWidth={1.5} />
            <span>{recurrenceState}</span>
          </button>
        </div>
        
        {/* Date picker - hidden on mobile (opens native picker), visible on desktop */}
        {showDatePicker && (
          <input
            id="date-input"
            ref={dateInputRef}
            type="date"
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
            }}
            onBlur={() => setShowDatePicker(false)}
            className="fixed opacity-0 pointer-events-none md:relative md:opacity-100 md:pointer-events-auto md:w-full md:px-4 md:py-3.5 md:rounded-xl md:bg-neutral-50 md:text-neutral-900 md:outline-none md:focus:bg-neutral-100 md:transition-colors"
          />
        )}
      </div>

      {/* Recurrence Selector Bottom Sheet */}
      {showRecurrenceSelector && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" 
          onClick={() => setShowRecurrenceSelector(false)}
          style={{ transform: 'translateZ(0)' }}
        >
          <div 
            className="bg-white rounded-t-3xl w-full max-w-[430px] p-6 pb-8 shadow-xl overflow-y-auto" 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              transform: 'translateZ(0)',
              maxHeight: '50vh'
            }}
          >
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Recurrence</h3>
            <div className="bg-white rounded-2xl overflow-hidden">
              {recurrenceOptions.map((option, index) => (
                <button
                  key={option}
                  onClick={() => {
                    setRecurrenceState(option);
                    if (onRecurrenceChange) {
                      onRecurrenceChange(option);
                    }
                    setShowRecurrenceSelector(false);
                  }}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                  style={{
                    borderBottom: index < recurrenceOptions.length - 1 ? '1px solid #F2F2F7' : 'none'
                  }}
                >
                  <span
                    className="font-medium"
                    style={{
                      color: recurrenceState === option ? '#007AFF' : '#1C1C1E',
                      fontSize: '16px'
                    }}
                  >
                    {option}
                  </span>
                  {recurrenceState === option && (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: '#007AFF' }}
                    >
                      <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                        <path
                          d="M1 5L4.5 8.5L11 1.5"
                          stroke="white"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}