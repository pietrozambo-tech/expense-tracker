import { Plane, X } from 'lucide-react';
import { t } from '../i18n';
import { tripDatesLabel, type Trip } from '../lib/trips';
import { monthsShort } from '../i18n/store';

interface TripFilterModalProps {
  isOpen: boolean;
  /** A trip key, or 'All'. */
  selected: string;
  trips: Trip[];
  onSelect: (key: string) => void;
  onClose: () => void;
}

/**
 * Narrow the list to one trip.
 *
 * The way to look at a trip used to be the search box: the trips sheet put
 * the name in it and hoped the descriptions matched. That works because the
 * name IS the prefix, and it is wrong the moment a trip is called something
 * that appears in another description - and it costs typing when you reach
 * for it yourself.
 *
 * This filters by the trip, which is a set of rows the app has already
 * worked out. Two holidays under one name are two entries here, told apart
 * by their dates, and picking one of them means exactly its own rows.
 */
export function TripFilterModal({ isOpen, selected, trips, onSelect, onClose }: TripFilterModalProps) {
  if (!isOpen) return null;

  const months = monthsShort();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        data-trip-filter
        className="w-full max-w-[430px] bg-white rounded-t-3xl shadow-2xl animate-slide-up relative z-10"
        onClick={(e) => e.stopPropagation()}
        style={{ transform: 'translateZ(0)' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 relative z-10">
          <h3 className="text-neutral-900 font-semibold">{t('ftrip.title')}</h3>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          <button
            data-trip-filter-option="All"
            onClick={() => onSelect('All')}
            className={`w-full text-left px-4 py-3 rounded-xl mb-2 ${
              selected === 'All' ? 'bg-blue-50 text-blue-600 font-medium' : 'hover:bg-neutral-50 text-neutral-700'
            }`}
            style={{ transition: 'background-color 0.15s ease' }}
          >
            {t('ftrip.all')}
          </button>

          {trips.map((trip) => {
            const on = selected === trip.key;
            return (
              <button
                key={trip.key}
                data-trip-filter-option={trip.key}
                onClick={() => onSelect(trip.key)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-2 ${
                  on ? 'bg-blue-50 text-blue-600 font-medium' : 'hover:bg-neutral-50 text-neutral-700'
                }`}
                style={{ transition: 'background-color 0.15s ease' }}
              >
                <Plane className="w-4 h-4 flex-shrink-0" style={{ color: on ? undefined : 'var(--ink-2)' }} />
                <span className="truncate flex-1 min-w-0 text-left">{trip.name}</span>
                {/* The dates, because two Formenteras are told apart by when
                    they were and by nothing else on this row. */}
                <span className="flex-shrink-0 text-[12px]" style={{ color: on ? undefined : 'var(--ink-3, var(--ink-2))' }}>
                  {tripDatesLabel(trip, months)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
