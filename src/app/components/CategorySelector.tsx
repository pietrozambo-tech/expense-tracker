import { Fragment, useState } from 'react';
import { t } from '../i18n';
import { useBackClose } from '../lib/useBackClose';
import { ArrowDownAZ, Check, Flame, X } from 'lucide-react';
import { getCategoryIcon } from './categoryIcons';
import { orderCategories, type CategoryOrder } from '../lib/categoryOrder';

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  bgColor: string;
  selectedBg: string;
  subcategories?: string[];
}

interface CategorySelectorProps {
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string) => void;
  categories: Category[];
  // Subcategories for the selected category, shown inline right below its row
  subcategories?: string[];
  selectedSubcategory?: string | null;
  onSelectSubcategory?: (subcategory: string | null) => void;
  /**
   * Own gutters, or the caller's.
   *
   * The Add screen puts this straight into an unpadded column; the schedule
   * editor's form already has px-6 and its own vertical rhythm, and nesting
   * one inside the other doubles the gutter.
   */
  padded?: boolean;
  /**
   * How the grid is ordered, and - when the screen offers it - the pill that
   * changes it.
   *
   * The pill only appears where `onChangeOrder` is given: the Add screen, where
   * you are hunting for a tile several times a day. The schedule editor honours
   * the same stored choice without carrying the control.
   */
  order?: CategoryOrder;
  onChangeOrder?: (order: CategoryOrder) => void;
  /** The whole ledger, for the "most used" count. */
  transactions?: { category?: { id?: string } | null }[];
  /**
   * The trip this entry belongs to, and the ones on offer.
   *
   * Given only when the SELECTED category is the travel one - this component
   * has no idea which that is, and the panel below renders under whichever
   * category is open, so handing it a trip at the wrong moment would file it
   * under Groceries on screen.
   *
   * It lives here rather than under the description, where it started,
   * because a trip needs the travel category to exist at all: choosing that
   * category is already half the decision, and the half that was left over
   * had nowhere better to be. It also stops the offer appearing under every
   * expense written during a fortnight abroad.
   */
  trip?: {
    /** The trip it is in now, or null. */
    name: string | null;
    /** Nearest first. The full list is behind `onMore`. */
    options: string[];
    onPick: (name: string) => void;
    onClear: () => void;
    /** Absent when the options ARE all of them. */
    onMore?: () => void;
  };
}

export function CategorySelector({
  selectedCategory,
  onSelectCategory,
  categories,
  subcategories = [],
  selectedSubcategory = null,
  onSelectSubcategory,
  padded = true,
  order = 'alpha',
  onChangeOrder,
  transactions = [],
  trip
}: CategorySelectorProps) {
  const [orderOpen, setOrderOpen] = useState(false);
  useBackClose(orderOpen, () => setOrderOpen(false));
  // Alphabetical, or by how often each one is actually used - see
  // lib/categoryOrder. Re-sorts live as categories are added or removed.
  const sortedCategories = orderCategories(categories, transactions, order);

  // Insert the subcategory panel right after the row that holds the selected
  // category. With a 2-column grid, that row ends at the odd index of the pair.
  const selectedIndex = sortedCategories.findIndex((c) => c.id === selectedCategory);
  const panelAfterIndex =
    selectedIndex === -1
      ? -1
      : Math.min(Math.floor(selectedIndex / 2) * 2 + 1, sortedCategories.length - 1);
  const showSubcategoryPanel = selectedIndex !== -1 && subcategories.length > 0;
  // A category with no subcategories can still have a trip row, and a trip
  // with nothing to offer and nothing chosen has nothing to draw.
  const showTripPanel = selectedIndex !== -1 && !!trip && (!!trip.name || trip.options.length > 0);

  return (
    <div className={padded ? 'px-6 pb-6' : ''}>
      {/* The same quiet label the Schedule editor uses for these fields -
          a bare h3 inherited 18px here, which put form labels on a heading
          scale and made the sheet shout its own structure. */}
      <div className="mb-1.5 flex items-center gap-2 relative">
        <h3 style={{ color: 'var(--ink-2)', fontSize: 12, fontWeight: 600, letterSpacing: 0.2 }}>{t('add.category')}</h3>
        {onChangeOrder && (
          <>
            {/* Small on purpose. It is a preference, not a step: it sits beside
                the label at label size, and says which order is in force so
                the answer is readable without opening anything. */}
            <button
              type="button"
              data-cat-order
              aria-label={t('add.order.aria')}
              onClick={() => setOrderOpen((v) => !v)}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 active:opacity-60 transition-opacity"
              style={{ backgroundColor: 'var(--bg-field)', color: 'var(--ink-2)', fontSize: 11, fontWeight: 600 }}
            >
              {order === 'used'
                ? <Flame size={11} strokeWidth={2.4} />
                : <ArrowDownAZ size={11} strokeWidth={2.4} />}
              {t(order === 'used' ? 'add.order.used' : 'add.order.alpha')}
            </button>
            {orderOpen && (
              <>
                <div className="fixed inset-0 z-[55]" onClick={() => setOrderOpen(false)} />
                <div
                  data-cat-order-menu
                  className="absolute left-0 top-6 z-[56] rounded-2xl overflow-hidden"
                  style={{
                    minWidth: 176,
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--line-2)',
                    boxShadow: '0 12px 28px rgba(0,0,0,0.16)',
                  }}
                >
                  {(['alpha', 'used'] as const).map((opt, i) => (
                    <button
                      key={opt}
                      type="button"
                      data-cat-order-opt={opt}
                      onClick={() => {
                        onChangeOrder(opt);
                        setOrderOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left active:bg-neutral-100"
                      style={{
                        color: 'var(--ink)',
                        fontSize: 13.5,
                        fontWeight: 500,
                        borderTop: i ? '1px solid var(--line-2)' : undefined,
                      }}
                    >
                      {opt === 'used'
                        ? <Flame size={14} style={{ color: 'var(--ink-2)' }} />
                        : <ArrowDownAZ size={14} style={{ color: 'var(--ink-2)' }} />}
                      <span className="flex-1">{t(opt === 'used' ? 'add.order.used' : 'add.order.alpha')}</span>
                      {order === opt && <Check size={14} style={{ color: 'var(--accent-ink)' }} strokeWidth={2.6} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {sortedCategories.map((category, index) => {
          const Icon = getCategoryIcon(category.icon);
          const isSelected = selectedCategory === category.id;

          return (
            <Fragment key={category.id}>
              <button
                onClick={() => onSelectCategory(category.id)}
                className={`flex items-center gap-3 py-2.5 px-3 rounded-xl min-h-[52px] ${
                  isSelected
                    ? 'bg-neutral-50 ring-2 ring-blue-500'
                    : 'bg-neutral-50/50 hover:bg-neutral-100'
                }`}
                style={{
                  transition: 'background-color 0.15s ease',
                  transform: 'translateZ(0)',
                  WebkitFontSmoothing: 'antialiased',
                  backfaceVisibility: 'hidden'
                }}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isSelected ? category.selectedBg : category.bgColor
                  }`}
                  style={{
                    transform: 'translateZ(0)',
                    backfaceVisibility: 'hidden'
                  }}
                >
                  <Icon className={`w-4.5 h-4.5 ${isSelected ? category.color : 'text-neutral-400'}`} />
                </div>
                <span
                  className={`text-[13px] text-left leading-tight line-clamp-2 ${isSelected ? 'text-neutral-900 font-medium' : 'text-neutral-600'}`}
                  style={{
                    transform: 'translateZ(0)',
                    backfaceVisibility: 'hidden'
                  }}
                >
                  {category.name}
                </span>
              </button>

              {/* Subcategory panel — spans the full width, sits right below the
                  selected category's row */}
              {showSubcategoryPanel && index === panelAfterIndex && (
                <div
                  className="col-span-2 rounded-xl px-3.5 py-3"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--line-2)',
                    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.05)'
                  }}
                >
                  {/* Fixed-height header so the panel doesn't resize when the
                      clear (X) button appears on subcategory selection */}
                  <div className="flex items-center justify-between mb-2 h-6">
                    <span
                      className="text-[11px] font-semibold"
                      style={{ color: 'var(--ink-2)', letterSpacing: '0.06em' }}
                    >
                      {t('add.subcategory')}
                    </span>
                    <button
                      onClick={() => onSelectSubcategory?.(null)}
                      className="w-6 h-6 -mr-1 flex items-center justify-center rounded-full active:bg-neutral-100"
                      aria-label={t('add.clearSub')}
                      style={{
                        visibility: selectedSubcategory ? 'visible' : 'hidden',
                        pointerEvents: selectedSubcategory ? 'auto' : 'none'
                      }}
                    >
                      <X className="w-4 h-4" style={{ color: 'var(--ink-2)' }} />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {subcategories.map((subcategory) => {
                      const subSelected = selectedSubcategory === subcategory;
                      return (
                        <button
                          key={subcategory}
                          data-sub-chip={subcategory}
                          onClick={() =>
                            onSelectSubcategory?.(subSelected ? null : subcategory)
                          }
                          className={`px-3.5 py-1.5 rounded-lg text-sm border ${
                            subSelected
                              ? 'bg-blue-50 text-blue-600 border-blue-200'
                              : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
                          }`}
                          style={{
                            transition: 'background-color 0.15s ease, color 0.15s ease',
                            transform: 'translateZ(0)',
                            WebkitFontSmoothing: 'antialiased',
                            backfaceVisibility: 'hidden'
                          }}
                        >
                          <span style={{ transform: 'translateZ(0)', display: 'inline-block' }}>
                            {subcategory}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* The trip, UNDER the subcategory panel and deliberately much
                  lighter than it: one line, no card, no header.
                  Subcategory is the answer given on nearly every travel
                  expense; a trip is the rarer refinement on top of it, and
                  two matching panels stacked made the second one look like
                  another decision waiting to be made every time.
                  There is no clear button either - the header row it needed
                  cost more height than the chips themselves. Tapping the
                  chosen trip lets go of it, exactly as tapping the chosen
                  subcategory does. */}
              {showTripPanel && index === panelAfterIndex && (
                <div data-trip-panel className="col-span-2 flex items-center flex-wrap gap-x-2 gap-y-1.5 px-1 -mt-0.5">
                  <span
                    className="text-[10.5px] font-semibold flex-shrink-0"
                    style={{ color: 'var(--ink-2)', letterSpacing: '0.06em' }}
                  >
                    {t('add.trip')}
                  </span>
                  {/* The chosen one is always here, even when it is not among
                      the nearest few - a row that hid what you had picked
                      would read as having lost it. */}
                  {[...(trip!.name && !trip!.options.includes(trip!.name) ? [trip!.name] : []), ...trip!.options].map((name) => {
                    const on = trip!.name === name;
                    return (
                      <button
                        key={name}
                        data-trip-chip-option={name}
                        onClick={() => (on ? trip!.onClear() : trip!.onPick(name))}
                        aria-label={on ? t('add.tripRemove', { name }) : t('add.tripAdd', { name })}
                        className={`px-2.5 py-1 rounded-lg text-[12.5px] border max-w-full truncate ${
                          on
                            ? 'bg-blue-50 text-blue-600 border-blue-200 font-medium'
                            : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
                        }`}
                        style={{ transition: 'background-color 0.15s ease, color 0.15s ease' }}
                      >
                        {name}
                      </button>
                    );
                  })}
                  {trip!.onMore && (
                    <button
                      data-trip-more
                      onClick={() => trip!.onMore!()}
                      className="px-2.5 py-1 rounded-lg text-[12.5px] border border-dashed"
                      style={{ borderColor: 'var(--line)', color: 'var(--accent-ink)' }}
                    >
                      {t('add.tripAll')}
                    </button>
                  )}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
