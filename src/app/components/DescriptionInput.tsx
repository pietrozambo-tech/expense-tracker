import { useState } from 'react';
import { Plane, X } from 'lucide-react';
import { t } from '../i18n';
import type { DescriptionSuggestion } from '../lib/suggestions';

/**
 * The trip half of the description, handed over already decided.
 *
 * A trip has no field of its own - it IS the name on the front of the
 * description - so this field is where it lives whether anybody meant it to or
 * not. Until now it lived there as raw text: a row of the Azores trip opened
 * with "Azores 🇵🇹 - Cena porto" in the box, and rewriting the description to
 * "Cena al porto" took the row out of the trip. The total dropped, the expense
 * was still there, and nothing said anything.
 *
 * So the name comes out of the text and becomes an object with an edge round
 * it: still visible, still removable, but removable ON PURPOSE. Fixing a
 * description and leaving a trip stop being the same gesture.
 *
 * Everything here is decided by the caller - whether there is a trip, which
 * ones are worth offering - because those answers need the ledger and the
 * chosen category, and this component should not need either.
 */
export interface DescriptionTrip {
  /** The trip this row is in, or null. */
  name: string | null;
  /** Trips worth offering while it is in none. Empty means say nothing. */
  options: string[];
  onAttach: (name: string) => void;
  onDetach: () => void;
}

interface DescriptionInputProps {
  /** The description WITHOUT the trip name - the caller splits and rejoins. */
  value: string;
  onChange: (value: string) => void;
  transactionType: 'expense' | 'income';
  // Autocomplete from history. Absent (the edit flow) the field behaves
  // exactly as before.
  suggestions?: DescriptionSuggestion[];
  onPickSuggestion?: (s: DescriptionSuggestion) => void;
  /** Absent on every screen that has nothing to do with trips. */
  trip?: DescriptionTrip;
}

export function DescriptionInput({
  value,
  onChange,
  transactionType,
  suggestions = [],
  onPickSuggestion,
  trip,
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

  // Both lists sit under the field, so they must not both be there at once.
  // The one you are typing into wins.
  const showOptions = !!trip && !trip.name && trip.options.length > 0 && !open;

  return (
    <div className="px-6 pb-6">
      {/* The same quiet label the Schedule editor uses for these fields -
          a bare h3 inherited 18px here, which put form labels on a heading
          scale and made the sheet shout its own structure. */}
      <h3 className="mb-1.5" style={{ color: 'var(--ink-2)', fontSize: 12, fontWeight: 600, letterSpacing: 0.2 }}>{t('add.description')}</h3>
      {/* The box, not the input, carries the padding and the fill now: the
          chip has to sit inside the same shape as the text, or it reads as a
          separate control that happens to be nearby. */}
      <div className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-50 focus-within:bg-neutral-100 transition-colors">
        {trip?.name && (
          <span
            data-trip-chip={trip.name}
            className="flex items-center gap-1 pl-2 pr-1 py-1 rounded-lg flex-shrink-0 max-w-[48%]"
            style={{ backgroundColor: 'var(--wash-accent2)' }}
          >
            <span
              className="truncate"
              style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)' }}
            >
              {trip.name}
            </span>
            <button
              type="button"
              data-trip-chip-remove
              onClick={trip.onDetach}
              aria-label={t('add.tripRemove', { name: trip.name })}
              className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform"
            >
              <X className="w-3.5 h-3.5" style={{ color: 'var(--accent-ink)', opacity: 0.65 }} strokeWidth={2.4} />
            </button>
          </span>
        )}
        <input
          type="text"
          data-desc-input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          // text-base is 16px, and it has to stay that: below 16 iOS zooms the
          // page in the moment the field takes focus.
          className="flex-1 min-w-0 bg-transparent text-neutral-900 text-base placeholder:text-neutral-400 outline-none"
        />
      </div>
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
      {showOptions && (
        <div data-trip-options className="mt-2 flex items-center gap-1.5 flex-wrap">
          <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{t('add.tripAsk')}</span>
          {trip!.options.map((name) => (
            <button
              key={name}
              type="button"
              data-trip-option={name}
              onClick={() => trip!.onAttach(name)}
              aria-label={t('add.tripAdd', { name })}
              className="flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-lg max-w-full active:scale-95 transition-transform"
              style={{ backgroundColor: 'var(--bg-inset)' }}
            >
              <Plane className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--ink-2)' }} strokeWidth={2.2} />
              <span className="truncate" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)' }}>{name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
