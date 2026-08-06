import type { Transaction } from '../types';
import { defaultCategoriesFor, defaultIncomeCategoriesFor, type Category } from '../components/categories';

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
  'Content royalties': 'Royalties sui contenuti',
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
  'Flights to London': 'Voli per Londra',
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
  Royalties: 'Royalties',
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
  iCloud: 'iCloud',
};

// Subcategory names, aligned with the Italian starter catalogue wherever the
// subcategory exists there - the demo must file rows under the SAME
// subcategories the seeded categories carry, or the drilldowns would show
// near-duplicates ("Rent" next to "Affitto"). The few the demo invents on top
// of the defaults (Christmas) translate free-standing, exactly as they do in
// English.
const SUB_IT: Record<string, string> = {
  Breakfast: 'Colazione',
  Lunch: 'Pranzo',
  Snack: 'Spuntino',
  Restaurant: 'Ristorante',
  Drinks: 'Aperitivo',
  Wedding: 'Matrimonio',
  Birthday: 'Compleanno',
  Christmas: 'Natale',
  Supermarket: 'Supermercato',
  Pharmacy: 'Farmacia',
  Cosmetics: 'Cosmetici',
  Wellness: 'Benessere',
  Rent: 'Affitto',
  Utilities: 'Bollette',
  Cleaning: 'Pulizie',
  Movies: 'Cinema',
  Concerts: 'Concerti',
  Clubbing: 'Discoteca',
  Clothing: 'Abbigliamento',
  Electronics: 'Elettronica',
  Tennis: 'Tennis',
  "Barry's": 'Palestra',
  Streaming: 'Streaming',
  Cloud: 'Cloud',
  'Income Tax': 'Tasse sul Reddito',
  'Housing Tax': 'Tasse sulla Casa',
  'Bank Fees': 'Commissioni Bancarie',
  'Public Transport': 'Mezzi Pubblici',
  'Uber/Taxi': 'Uber/Taxi',
  Gasoline: 'Benzina',
  Flights: 'Voli',
  Hotel: 'Hotel',
  Food: 'Cibo',
  Activities: 'Attività',
  Transportation: 'Trasporti',
  Donations: 'Donazioni',
  Unexpected: 'Imprevisti',
};

let itById: Map<string, Category> | null = null;
function italianCategoryById(id: string | undefined): Category | undefined {
  if (!id) return undefined;
  if (!itById) {
    itById = new Map(
      [...defaultCategoriesFor('it'), ...defaultIncomeCategoriesFor('it')].map((c) => [c.id, c]),
    );
  }
  return itById.get(id);
}

/**
 * Which strings in a set of demo rows have no Italian entry. Empty arrays mean
 * full coverage; scripts/test-demo-i18n.mjs runs this over mockExpenses so a
 * new sample row cannot quietly ship half-English into the Italian demo.
 */
export function demoTranslationGaps(rows: Pick<Transaction, 'description' | 'subcategory'>[]): {
  descriptions: string[];
  subcategories: string[];
} {
  const d = new Set<string>();
  const s = new Set<string>();
  for (const row of rows) {
    if (row.description && !(row.description in DESC_IT)) d.add(row.description);
    if (row.subcategory && !(row.subcategory in SUB_IT)) s.add(row.subcategory);
  }
  return { descriptions: [...d].sort(), subcategories: [...s].sort() };
}

/** One demo row, translated. Unknown strings pass through untouched. */
export function localiseDemoRow(t: Transaction): Transaction {
  return {
    ...t,
    description: DESC_IT[t.description] ?? t.description,
    category: italianCategoryById(t.category?.id) ?? t.category,
    ...(t.subcategory ? { subcategory: SUB_IT[t.subcategory] ?? t.subcategory } : {}),
  };
}
