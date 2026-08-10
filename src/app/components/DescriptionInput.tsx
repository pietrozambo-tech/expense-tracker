import { useState } from 'react';
import { t } from '../i18n';
import type { DescriptionSuggestion } from '../lib/suggestions';

interface DescriptionInputProps {
  value: string;
  onChange: (value: string) => void;
  transactionType: 'expense' | 'income';
  // Autocomplete from history. Absent (the edit flow) the field behaves
  // exactly as before.
  suggestions?: DescriptionSuggestion[];
  onPickSuggestion?: (s: DescriptionSuggestion) => void;
}

export function DescriptionInput({
  value,
  onChange,
  transactionType,
  suggestions = [],
  onPickSuggestion,
}: DescriptionInputProps) {
  const [focused, setFocused] = useState(false);
  // Hide the list right after a pick - the picked text matches itself, so
  // without this the list would linger under a already-complete field.
  // Typing anything different brings it back.
  const [picked, setPicked] = useState<string | null>(null);

  const placeholder = transactionType === 'income'
    ? t('add.descPlaceholderIncome')
    : t('add.descPlaceholderExpense');

  const open =
    focused && !!onPickSuggestion && suggestions.length > 0 &&
    value.trim().length > 0 && value !== picked;

  // The typed letters, bold inside each suggestion - shows WHY the row is here.
  const highlight = (text: string) => {
    const q = value.trim().toLowerCase();
    const i = q ? text.toLowerCase().indexOf(q) : -1;
    if (i < 0) return text;
    return (
      <>
        {text.slice(0, i)}
        <span className="font-semibold">{text.slice(i, i + q.length)}</span>
        {text.slice(i + q.length)}
      </>
    );
  };

  return (
    <div className="px-6 pb-6">
      {/* The same quiet label the Schedule editor uses for these fields -
          a bare h3 inherited 18px here, which put form labels on a heading
          scale and made the sheet shout its own structure. */}
      <h3 className="mb-1.5" style={{ color: '#8E8E93', fontSize: 12, fontWeight: 600, letterSpacing: 0.2 }}>{t('add.description')}</h3>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl bg-neutral-50 text-neutral-900 text-base placeholder:text-neutral-400 outline-none focus:bg-neutral-100 transition-colors"
      />
      {open && (
        <div className="mt-1.5 rounded-xl border border-neutral-100 bg-white shadow-sm overflow-hidden divide-y divide-neutral-50">
          {suggestions.map((s) => (
            <button
              key={s.description}
              type="button"
              // pointerdown, not click: click fires after blur has already
              // closed the list. preventDefault keeps focus in the input.
              onPointerDown={(e) => {
                e.preventDefault();
                setPicked(s.description);
                onPickSuggestion?.(s);
              }}
              className="w-full flex items-baseline justify-between gap-3 px-3.5 py-2 text-left active:bg-neutral-50 transition-colors"
            >
              <span className="text-[13px] text-neutral-800 truncate">{highlight(s.description)}</span>
              {/* What the tap will also set - no surprise side effects */}
              {s.hint && (
                <span className="text-[10px] text-neutral-400 whitespace-nowrap flex-shrink-0">{s.hint}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
