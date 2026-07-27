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
