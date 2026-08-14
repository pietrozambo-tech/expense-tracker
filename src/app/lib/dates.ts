import { dateLocale } from '../i18n/store';

// Timezone-safe parsing for the app's date strings.
//
// Transactions store dates as 'YYYY-MM-DD'. `new Date('YYYY-MM-DD')` parses
// that as **UTC midnight**, so for any user west of UTC the Date object lands
// on the previous local day — day headers shift, "Today" never matches, and a
// transaction dated the 1st of a month gets aggregated into the previous
// month. Always parse calendar dates into *local* time with this helper.
export function parseLocalDate(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(dateStr); // fallback for anything not in the canonical form
}

/**
 * "Wednesday, August 1" - the full day, for rows that carry their own date.
 *
 * Only the ungrouped Activity list needs this: sorted by date the rows sit
 * under a day header that already names the day, so they print nothing.
 * Sorted by amount that header is gone, and each row was falling back to
 * "Aug 1" - the most abbreviated form in the app, on the one line that had a
 * whole row to itself and nothing competing for it.
 *
 * Locale-native: en-GB gives "Wednesday, 1 August", it-IT "mercoledì 1
 * agosto". The order of the parts is the locale's business, not ours.
 */
export function formatFullDate(dateString: string): string {
  const parsed = parseLocalDate(dateString);
  if (isNaN(parsed.getTime())) return dateString;
  return parsed.toLocaleDateString(dateLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}
