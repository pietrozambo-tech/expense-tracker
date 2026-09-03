import type { Transaction } from '../types';
import type { Category } from '../components/categories';
import { tripBodyOf, tripNameOf, withTripName } from './trips';

// The sample dataset, spoken in Italian. One dataset, translated at load:
// keeping a second hand-written mockExpenses in Italian would drift the moment
// anyone touched the English one, and the amounts, dates and shapes - the part
// the charts actually demonstrate - are language-neutral anyway.
//
// Rows are translated by ID for categories (the catalogues share ids across
// languages) and by exact string for descriptions and subcategories. Anything
// unknown passes through in English - the honest fallback, and the safety net
// if a new sample row lands without a translation.

// Every distinct description in mockExpenses.ts. Brands (Netflix, iCloud,
// Apple, Spotify) stay brands.
const DESC_IT: Record<string, string> = {
  Accessories: 'Accessori',
  Aperitivo: 'Aperitivo',
  Apple: 'Apple',
  "Barry's class": 'Lezione in palestra',
  'Breakfast espresso': 'Espresso al bar',
  Cable: 'Cavo',
  'Cappuccino & croissant': 'Cappuccino e cornetto',
  Charity: 'Beneficenza',
  Cinema: 'Cinema',
  'Cinema ticket': 'Biglietto del cinema',
  Class: 'Lezione',
  Clothes: 'Vestiti',
  Coat: 'Cappotto',
  Coffee: 'Caffè',
  'Coffee & croissant': 'Caffè e cornetto',
  'Coffee & pastry': 'Caffè e brioche',
  Concert: 'Concerto',
  'Court booking': 'Prenotazione campo',
  Dinner: 'Cena',
  'Dinner in Soho': 'Cena a Soho',
  'Dinner with friends': 'Cena con amici',
  'Dividend payout': 'Pagamento dividendi',
  Dividends: 'Dividendi',
  Donation: 'Donazione',
  Drinks: 'Drink',
  Emergency: 'Emergenza',
  'Evening aperitivo': 'Aperitivo serale',
  'Evening drink': 'Drink serale',
  Event: 'Evento',
  'Flight booking': 'Prenotazione volo',
  'Flights to visit family': 'Voli per la famiglia',
  'Return flights': 'Voli andata e ritorno',
  'Musical in the West End': 'Musical nel West End',
  'Borough Market lunch': 'Pranzo al Borough Market',
  'Weekend flights': 'Voli per il weekend',
  Fuel: 'Carburante',
  Gadget: 'Gadget',
  Gifts: 'Regali',
  Groceries: 'Spesa',
  Headphones: 'Cuffie',
  'Headphones adapter': 'Adattatore per cuffie',
  'Holiday flights': 'Voli per le vacanze',
  'Hotel, two nights': 'Hotel, due notti',
  'Live show': 'Spettacolo dal vivo',
  Lunch: 'Pranzo',
  'Lunch at work': 'Pranzo al lavoro',
  'Lunch out': 'Pranzo fuori',
  Massage: 'Massaggio',
  'Meal vouchers': 'Buoni pasto',
  Medicine: 'Medicinali',
  'Metro ticket': 'Biglietto metro',
  Misc: 'Varie',
  'Monthly rent': 'Affitto mensile',
  'Monthly salary': 'Stipendio mensile',
  Movie: 'Film',
  'Movie night': 'Serata cinema',
  Netflix: 'Netflix',
  'New phone charger': 'Caricabatterie nuovo',
  'New t-shirt': 'Maglietta nuova',
  'Night taxi': 'Taxi notturno',
  'Oyster card top-up': 'Ricarica Oyster card',
  Pharmacy: 'Farmacia',
  'Pharmacy essentials': 'Acquisti in farmacia',
  'Pharmacy purchase': 'Acquisto in farmacia',
  Phone: 'Telefono',
  'Property tax': 'Tassa sulla casa',
  'Protein snack': 'Snack proteico',
  'Rental income': 'Reddito da affitto',
  Shoes: 'Scarpe',
  'Small repair': 'Piccola riparazione',
  Snack: 'Spuntino',
  Spa: 'Spa',
  'Spotify Premium': 'Spotify Premium',
  'Streaming rental': 'Noleggio in streaming',
  'Summer clothes': 'Vestiti estivi',
  'Summer trip': 'Viaggio estivo',
  'Supermarket groceries': 'Spesa al supermercato',
  'Tax adjustment': 'Conguaglio fiscale',
  Taxi: 'Taxi',
  Tennis: 'Tennis',
  'Tennis court booking': 'Prenotazione campo da tennis',
  'Tennis lesson': 'Lezione di tennis',
  Train: 'Treno',
  Trip: 'Viaggio',
  'Weekend hotel': 'Hotel per il weekend',
  'Weekly groceries': 'Spesa settimanale',
  'Welfare credit': 'Credito welfare',
  iCloud: 'iCloud',
};

// Subcategory names, aligned with the Italian starter catalogue wherever the
// subcategory exists there - the demo must file rows under the SAME
// subcategories the seeded categories carry, or the drilldowns would show
// near-duplicates ("Rent" next to "Affitto"). The few the demo invents on top
// of the defaults (Christmas) translate free-standing, exactly as they do in
// English. Where the Italian list names shops instead of the kind of shop,
// the demo's supermarket rows land on the first of them.
const SUB_IT: Record<string, string> = {
  Snack: 'Spuntino',
  Restaurant: 'Ristorante',
  Drinks: 'Aperitivo',
  Wedding: 'Matrimonio',
  Birthday: 'Compleanno',
  Christmas: 'Natale',
  Supermarket: 'Esselunga',
  Pharmacy: 'Farmacia',
  Cosmetics: 'Cosmetici',
  Wellness: 'Benessere',
  Rent: 'Affitto',
  Utilities: 'Bollette',
  Cleaning: 'Pulizie',
  Cinema: 'Cinema',
  Concerts: 'Concerti',
  Clothing: 'Abbigliamento',
  Electronics: 'Elettronica',
  Tennis: 'Tennis',
  Gym: 'Palestra',
  Streaming: 'Streaming',
  Cloud: 'Cloud',
  'Income Tax': 'Tasse sul Reddito',
  'Housing Tax': 'Tasse sulla Casa',
  'Bank Fees': 'Commissioni Bancarie',
  'Public Transport': 'Mezzi Pubblici',
  'Uber/Taxi': 'Uber/Taxi',
  Fuel: 'Benzina',
  Flights: 'Voli',
  Hotel: 'Hotel',
  Food: 'Cibo',
  Activities: 'Attività',
  Transport: 'Trasporti',
  Donations: 'Donazioni',
  Unexpected: 'Imprevisti',
};

/**
 * Which strings in a set of demo rows have no Italian entry. Empty arrays mean
 * full coverage; scripts/test-demo-i18n.mjs runs this over mockExpenses so a
 * new sample row cannot quietly ship half-English into the Italian demo.
 */
// Trip names on the front of demo descriptions, translated as names. Split
// off with the app's own tripNameOf/tripBodyOf rather than re-parsed here, so
// the demo and the Trips sheet can never disagree about where a name ends. A
// name missing from this map passes through untranslated - a London trip in
// an Italian demo is odd, a broken prefix would be a broken trip.
const TRIP_IT: Record<string, string> = {
  'London 🇬🇧': 'Londra 🇬🇧',
};

/** A description translated in halves when it carries a trip name. */
function localiseDescription(description: string): string {
  const name = tripNameOf(description);
  if (!name) return DESC_IT[description] ?? description;
  const body = tripBodyOf(description);
  return withTripName(TRIP_IT[name] ?? name, DESC_IT[body] ?? body);
}

export function demoTranslationGaps(rows: Pick<Transaction, 'description' | 'subcategory'>[]): {
  descriptions: string[];
  subcategories: string[];
} {
  const d = new Set<string>();
  const s = new Set<string>();
  for (const row of rows) {
    if (row.description) {
      const name = tripNameOf(row.description);
      if (name && !(name in TRIP_IT)) d.add(name);
      const body = name ? tripBodyOf(row.description) : row.description;
      if (body && !(body in DESC_IT)) d.add(body);
    }
    if (row.subcategory && !(row.subcategory in SUB_IT)) s.add(row.subcategory);
  }
  return { descriptions: [...d].sort(), subcategories: [...s].sort() };
}

/**
 * One demo row, translated for an Italian UI - against the categories the USER
 * actually has, not the Italian catalogue blindly. The UI language and the
 * seeded catalogue can genuinely differ: someone who onboarded in English and
 * switched later has English category names by design (names are their data),
 * and demo rows must land inside THAT catalogue or the Dashboard drops them.
 * So: descriptions follow the UI language (pure cosmetics), the category
 * object is the user's own (matched by id, since ids are shared across
 * languages), and a subcategory follows the user's chips: translated when the
 * Italian name is one of them, kept when the English name is (an English-seeded
 * catalogue under an Italian UI), and translated free-standing when neither is
 * - the few the demo invents on top of the defaults (Christmas) are pure text
 * and read in the UI language like the descriptions do.
 */
export function localiseDemoRow(t: Transaction, userCategories: Category[]): Transaction {
  const own = t.category?.id ? userCategories.find((c) => c.id === t.category.id) : undefined;
  const cat = own ?? t.category;
  let sub = t.subcategory;
  if (sub) {
    const translated = SUB_IT[sub];
    const chips = cat.subcategories ?? [];
    if (translated && (chips.includes(translated) || !chips.includes(sub))) sub = translated;
  }
  return {
    ...t,
    description: localiseDescription(t.description),
    category: cat,
    ...(sub ? { subcategory: sub } : {}),
  };
}

/** English UI: no text changes, but demo rows still bind to the user's own
 *  category objects by id, so a renamed or reseeded catalogue keeps them on
 *  screen instead of orphaning them under the default names. */
export function bindDemoRow(t: Transaction, userCategories: Category[]): Transaction {
  const own = t.category?.id ? userCategories.find((c) => c.id === t.category.id) : undefined;
  return own ? { ...t, category: own } : t;
}
