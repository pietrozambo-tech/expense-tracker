import { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { t } from '../i18n';
import { useBackClose } from '../lib/useBackClose';
import { getCategoryIcon, iconsList, type IconName } from './categoryIcons';
import { colorOptions, type CategoryColor } from './categoryColors';

// Making a category from the form you are already filling in.
//
// Settings has the full editor and keeps it. This is the same act performed
// from the other end: you are halfway through a transaction, the category you
// want is not in the grid, and the alternative is closing the form, going to
// Settings, creating it, coming back and typing everything again. So the
// sheet opens OVER the form - which is never unmounted - and gives it back
// with the new category already chosen.
//
// What it deliberately does not ask:
//
//   the type   The Expense/Income switch is two fingers above it and has
//              already been answered. It is DECLARED here rather than asked,
//              because a category on the wrong list is wrong on every row
//              filed under it afterwards, and that is worth a tag on screen.
//   anything   Name, icon and colour, and only the name is required: the
//   else       other two open on a value, so the fast path is type and
//              confirm. Everything else about a category is editable in
//              Settings, where there is room for it.

export interface CategoryDraft {
  name: string;
  icon: string;
  color: string;
  bgColor: string;
  selectedBg: string;
}

interface Existing {
  id: string;
  name: string;
}

interface CreateCategorySheetProps {
  /** Which list it will land on. Decided by the caller's own switch. */
  type: 'expense' | 'income';
  /** That list as it stands, for the duplicate check - names only. */
  existing: Existing[];
  onCreate: (draft: CategoryDraft) => void;
  /** The name is already taken: use the one that is there instead. */
  onUseExisting: (categoryId: string) => void;
  onClose: () => void;
}

/** Case, spacing and surrounding blanks are not a difference between names. */
const same = (a: string, b: string) =>
  a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

export function CreateCategorySheet({ type, existing, onCreate, onUseExisting, onClose }: CreateCategorySheetProps) {
  useBackClose(true, onClose);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<IconName>(iconsList[0]);
  const [swatch, setSwatch] = useState<CategoryColor>(colorOptions[0]);
  const nameRef = useRef<HTMLInputElement>(null);

  // The one already there under this name, if any. Said out loud rather than
  // resolved in silence: creating a second "Barbiere" leaves two identical
  // tiles in the grid forever, and picking the first one without a word reads
  // as a button that did not work.
  const clash = useMemo(
    () => (name.trim() ? existing.find((c) => same(c.name, name)) ?? null : null),
    [existing, name],
  );

  const blocked = !name.trim();
  const submit = () => {
    if (blocked) {
      nameRef.current?.focus();
      return;
    }
    if (clash) onUseExisting(clash.id);
    else onCreate({ name: name.trim(), icon, color: swatch.color, bgColor: swatch.bgColor, selectedBg: swatch.selectedBg });
    onClose();
  };

  const Icon = getCategoryIcon(icon);
  const label = 'text-[11px] font-semibold tracking-[0.08em]';

  return (
    <div
      // Outside tap closes and discards, like every other sheet in the app.
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 bg-black/50 z-[60] flex items-end justify-center max-w-[430px] mx-auto"
      data-create-cat
    >
      <div
        className="w-full rounded-t-3xl max-h-[92vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--bg-card)', paddingBottom: 'max(22px, env(safe-area-inset-bottom))' }}
      >
        <div className="px-6 pt-4">
          <div className="mx-auto mb-4" style={{ width: 38, height: 4, borderRadius: 99, backgroundColor: 'var(--bg-track)' }} />

          <div className="flex items-center justify-between mb-4">
            <h2 style={{ color: 'var(--ink)', fontSize: 17, fontWeight: 700 }}>{t('cat.create.title')}</h2>
            <div className="flex items-center gap-2">
              <span
                data-create-cat-type={type}
                className="inline-flex items-center rounded-full px-2.5 py-0.5"
                style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                  color: type === 'income' ? 'var(--tone-income)' : 'var(--tone-expense)',
                  backgroundColor: type === 'income' ? 'var(--wash-green)' : 'var(--wash-over)',
                }}
              >
                {t(type === 'income' ? 'add.income' : 'add.expense').toUpperCase()}
              </span>
              <button
                onClick={onClose}
                aria-label={t('common.close')}
                className="w-8 h-8 flex items-center justify-center rounded-full active:bg-neutral-100"
              >
                <X size={19} style={{ color: 'var(--ink-2)' }} />
              </button>
            </div>
          </div>

          {/* What it is: the icon and the name on one line, because a preview
              card above a field holding the same word says it twice. */}
          <div className="flex items-center gap-3">
            <span
              className={`flex-shrink-0 grid place-items-center rounded-xl ${swatch.bgColor}`}
              style={{ width: 46, height: 46 }}
              aria-hidden="true"
            >
              {/* Sized by the `size` prop, not by a width utility: a class the
                  build does not generate leaves the icon at lucide's own 24px,
                  which on a phone reads as a glyph escaping its tile. A number
                  cannot be purged. */}
              <Icon size={19} className={swatch.color} />
            </span>
            <input
              ref={nameRef}
              data-create-cat-name
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder={t('cat.create.placeholder')}
              autoFocus
              className="flex-1 min-w-0 rounded-xl px-4 py-3 outline-none"
              style={{ backgroundColor: 'var(--bg-field)', color: 'var(--ink)', fontSize: 16.5, fontWeight: 500 }}
            />
          </div>

          {clash && (
            <p data-create-cat-dupe className="mt-2 px-1" style={{ color: 'var(--ink-2)', fontSize: 12.5, lineHeight: 1.45 }}>
              {t('cat.create.dupe', { name: clash.name })}
            </p>
          )}

          <p className={`${label} mt-5 mb-2`} style={{ color: 'var(--ink-2)' }}>{t('mgmt.icon').toUpperCase()}</p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-6 px-6">
            {iconsList.map((n) => {
              const On = getCategoryIcon(n);
              const on = n === icon;
              return (
                <button
                  key={n}
                  data-create-cat-icon={n}
                  onClick={() => setIcon(n)}
                  aria-pressed={on}
                  className={`flex-shrink-0 grid place-items-center rounded-xl ${on ? swatch.bgColor : ''}`}
                  style={{
                    width: 44, height: 44,
                    backgroundColor: on ? undefined : 'var(--bg-inset)',
                    boxShadow: on ? '0 0 0 2px var(--accent-ink)' : undefined,
                  }}
                >
                  <On size={18} className={on ? swatch.color : undefined} style={on ? undefined : { color: 'var(--ink-2)' }} />
                </button>
              );
            })}
          </div>

          <p className={`${label} mt-5 mb-2`} style={{ color: 'var(--ink-2)' }}>{t('mgmt.color').toUpperCase()}</p>
          <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-6 px-6">
            {colorOptions.map((c) => {
              const on = c.name === swatch.name;
              return (
                <button
                  key={c.name}
                  data-create-cat-color={c.name}
                  onClick={() => setSwatch(c)}
                  aria-pressed={on}
                  className={`flex-shrink-0 rounded-full ${c.preview}`}
                  style={{
                    width: 30, height: 30,
                    boxShadow: on ? '0 0 0 2px var(--bg-card), 0 0 0 4px var(--accent-ink)' : undefined,
                  }}
                />
              );
            })}
          </div>

          <button
            data-create-cat-cta
            onClick={submit}
            aria-disabled={blocked}
            className="w-full mt-6 rounded-2xl py-4 font-medium transition-colors"
            style={{
              backgroundColor: blocked ? 'var(--line)' : 'var(--accent-ink)',
              color: blocked ? 'var(--disabled)' : '#FFFFFF',
              fontSize: 16,
            }}
          >
            {clash ? t('cat.create.useExisting') : t('cat.create.cta')}
          </button>
        </div>
      </div>
    </div>
  );
}
