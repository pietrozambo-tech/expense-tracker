import { Fragment, useRef, useState } from 'react';
import { t } from '../i18n';
import { useBackClose } from '../lib/useBackClose';
import { ArrowDownAZ, Check, Flame, Plus, X } from 'lucide-react';
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
  /**
   * Open the sheet that makes a new category, from the last tile of the grid.
   *
   * Given only where somebody is filling a form and can find the grid short -
   * the Add screen, the schedule editor. Absent, the grid is exactly what it
   * was. Same rule as the ordering pill above: the control exists where the
   * caller can answer it.
   *
   * It goes IN the grid, last, because that is where the eye is at the moment
   * the gap is felt: you have finished scanning and the thing is not there.
   * A control beside the label would sit at the top, which is where you were
   * before you knew you needed it.
   */
  onCreateCategory?: () => void;
  /**
   * Add a subcategory to the selected category, by name.
   *
   * No sheet for this one. A subcategory IS a word, and opening an overlay to
   * be given a word is the interruption we are removing, not relocating - so
   * the dashed chip becomes a field where it stands, and the panel never
   * leaves the screen.
   */
  onCreateSubcategory?: (name: string) => void;
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
  trip,
  onCreateCategory,
  onCreateSubcategory,
}: CategorySelectorProps) {
  const [orderOpen, setOrderOpen] = useState(false);
  useBackClose(orderOpen, () => setOrderOpen(false));

  // The inline subcategory field: open, and what has been typed into it.
  // Local because it is a state of the panel, not of the transaction - and
  // because it must survive nothing: leaving the category closes it.
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  // A commit can be asked for twice in one gesture - tapping the tick blurs
  // the field first - and the second one would add the word again.
  const done = useRef(false);

  const openAdd = () => {
    done.current = false;
    setDraft('');
    setAdding(true);
  };

  /**
   * What was typed becomes a subcategory, and is chosen.
   *
   * Called by the tick, by the keyboard's return key, AND by leaving the
   * field with something in it. That last one is the decision worth naming:
   * typing "Piega" and tapping Save would otherwise drop the word silently at
   * the exact moment of saving, which is the failure mode this app has spent
   * its life removing. A chip too many is two taps to delete in Settings; a
   * word lost as you save is not recoverable at all.
   */
  const commitAdd = () => {
    if (done.current) return;
    done.current = true;
    setAdding(false);
    const name = draft.trim();
    setDraft('');
    if (!name) return;
    // Already a chip of this category: choose it rather than making a second
    // one that reads identically in every picker from here on.
    const already = subcategories.find(
      (s) => s.trim().toLowerCase().replace(/\s+/g, ' ') === name.toLowerCase().replace(/\s+/g, ' '),
    );
    if (already) { onSelectSubcategory?.(already); return; }
    onCreateSubcategory?.(name);
    onSelectSubcategory?.(name);
  };
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
  // The panel now stands for a category with no chips at all, which is exactly
  // what a category created a second ago looks like: without this it would be
  // made and then offer no way to give it its first subcategory.
  const showSubcategoryPanel =
    selectedIndex !== -1 && (subcategories.length > 0 || !!onCreateSubcategory);
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
                    {/* The way to make one more, in the row with the rest of
                        them: dashed and quiet, because it is not a choice but
                        the means of making one. */}
                    {onCreateSubcategory && !adding && (
                      <button
                        data-sub-add
                        onClick={openAdd}
                        className="px-3 py-1.5 rounded-lg text-sm border border-dashed inline-flex items-center gap-1.5"
                        style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}
                      >
                        <Plus className="w-3.5 h-3.5" strokeWidth={2.6} />
                        {t('add.subAdd')}
                      </button>
                    )}
                    {onCreateSubcategory && adding && (() => {
                      // Room for what has been typed, before the 0.875 scale
                      // shrinks it: the visual width is this times 0.875.
                      const fieldWidth = Math.max(88, draft.length * 9.5 + 26);
                      return (
                      <span
                        className="inline-flex items-center gap-2 rounded-lg pl-3 pr-1 py-1"
                        style={{ border: '1.5px solid var(--accent-ink)', backgroundColor: 'var(--bg-card)' }}
                      >
                        <input
                          data-sub-input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={commitAdd}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); commitAdd(); }
                            // Escape is the one way out that keeps nothing -
                            // there has to be one, and it is the key that
                            // means that everywhere else.
                            if (e.key === 'Escape') { done.current = true; setAdding(false); setDraft(''); }
                          }}
                          placeholder={t('add.subPlaceholder')}
                          // DECLARED at 16px, DRAWN at 14 - and both halves are
                          // load-bearing. Under 16 iOS zooms the whole page in
                          // when the field takes focus and never zooms back
                          // out, which would break the one thing this field
                          // promises: that the panel stays where it is. But 16
                          // beside 14px chips reads as a different, larger
                          // thing dropped into the row. The transform is purely
                          // visual, so iOS still sees 16; the negative margin
                          // gives back the width the scale left empty, since a
                          // transform does not change the space taken.
                          className="bg-transparent outline-none"
                          style={{
                            color: 'var(--ink)',
                            fontSize: 16,
                            transform: 'scale(0.875)',
                            transformOrigin: 'left center',
                            width: fieldWidth,
                            marginRight: -fieldWidth * 0.125,
                          }}
                        />
                        {/* The tick is the visible half of "press return":
                            a soft keyboard's return key cannot be seen, and a
                            step nobody can see is a step that does not exist.
                            preventDefault on mousedown so the tap does not
                            blur-then-commit before this handler runs. */}
                        <button
                          data-sub-confirm
                          aria-label={t('common.save')}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={commitAdd}
                          className="grid place-items-center rounded-md"
                          style={{ width: 24, height: 24, backgroundColor: draft.trim() ? 'var(--accent-ink)' : 'var(--line)' }}
                        >
                          <Check className="w-3.5 h-3.5 text-white" strokeWidth={3.2} />
                        </button>
                      </span>
                      );
                    })()}
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
        {/* Last, always - whatever the grid is sorted by. It is where the scan
            ends, which is the moment somebody knows the category they want is
            not here. Dashed and colourless so a thumb reaching for the last
            real tile can see it is not one. */}
        {onCreateCategory && (
          <button
            data-cat-create
            onClick={onCreateCategory}
            className="flex items-center gap-3 py-2.5 px-3 rounded-xl min-h-[52px] border border-dashed"
            style={{ borderColor: 'var(--line)', transition: 'background-color 0.15s ease' }}
          >
            <span
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--bg-inset)' }}
            >
              <Plus className="w-4.5 h-4.5" strokeWidth={2.4} style={{ color: 'var(--ink-2)' }} />
            </span>
            <span className="text-[13px] text-left leading-tight" style={{ color: 'var(--ink-2)' }}>
              {t('add.newCategory')}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
