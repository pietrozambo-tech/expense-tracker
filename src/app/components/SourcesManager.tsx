import { useState } from 'react';
import { ChevronLeft, Plus, Pencil, Trash2, ChevronRight } from 'lucide-react';
import type { Source } from '../types';
import { SourceLogo } from './SourceLogo';
import { SourceSelectorModal } from './SourceSelectorModal';
import { SOURCE_COLORS, BANK_LIBRARY, monogramFromName } from './sources';
import { ConfirmDialog } from './ConfirmDialog';

interface SourcesManagerProps {
  sources: Source[];
  defaultSourceExpense?: string;
  defaultSourceIncome?: string;
  onBack: () => void;
  onSetDefault: (direction: 'expense' | 'income', sourceId: string) => void;
  onAddSource: (source: Omit<Source, 'id'>) => void;
  onEditSource: (id: string, updates: Omit<Source, 'id'>) => void;
  onDeleteSource: (id: string) => void;
}

export function SourcesManager({
  sources,
  defaultSourceExpense,
  defaultSourceIncome,
  onBack,
  onSetDefault,
  onAddSource,
  onEditSource,
  onDeleteSource,
}: SourcesManagerProps) {
  const [pickerFor, setPickerFor] = useState<'expense' | 'income' | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Source | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Source | null>(null);

  const byId = (id?: string) => sources.find((s) => s.id === id) || null;

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (source: Source) => {
    setEditing(source);
    setFormOpen(true);
  };

  return (
    // Same bound as the other Settings sub-screens: the tab wrapper already
    // contributes the top inset and the nav-clearing bottom padding, so a
    // full-viewport child overflows by exactly that (see SUBPAGE_HEIGHT).
    <div className="flex flex-col overflow-hidden" style={{ height: 'calc(100dvh - 136px)', backgroundColor: '#F5F5F7' }}>
      {/* Header */}
      <div className="flex-shrink-0" style={{ backgroundColor: '#F5F5F7' }}>
        <div className="px-6 pb-4 pt-0">
          <div className="flex items-center justify-center relative">
            <button
              onClick={onBack}
              className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
            >
              <ChevronLeft size={24} style={{ color: '#007AFF' }} />
            </button>
            <h1 style={{ color: '#1C1C1E', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>Sources</h1>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        <div className="px-6 pb-5">
          <p style={{ color: '#8E8E93', fontSize: '13px' }}>
            Where money flows in and out - cash or your banks. New transactions start on your default.
          </p>
        </div>

        {/* Defaults */}
        <p className="px-7 mb-2" style={{ color: '#8E8E93', fontSize: '13px' }}>Defaults</p>
        <div className="px-6">
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <button
              onClick={() => setPickerFor('expense')}
              className="w-full flex items-center gap-3 px-5 py-3.5 active:bg-neutral-50 transition-colors"
              style={{ borderBottom: '1px solid #F2F2F7' }}
            >
              <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '15px' }}>Expenses paid with</span>
              <SourceLogo source={byId(defaultSourceExpense)} size={22} />
              <span style={{ color: '#8E8E93', fontSize: '14px' }}>{byId(defaultSourceExpense)?.name || 'None'}</span>
              <ChevronRight className="w-4.5 h-4.5" style={{ color: '#C7C7CC' }} />
            </button>
            <button
              onClick={() => setPickerFor('income')}
              className="w-full flex items-center gap-3 px-5 py-3.5 active:bg-neutral-50 transition-colors"
            >
              <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '15px' }}>Income received into</span>
              <SourceLogo source={byId(defaultSourceIncome)} size={22} />
              <span style={{ color: '#8E8E93', fontSize: '14px' }}>{byId(defaultSourceIncome)?.name || 'None'}</span>
              <ChevronRight className="w-4.5 h-4.5" style={{ color: '#C7C7CC' }} />
            </button>
          </div>
        </div>

        {/* Source list */}
        <p className="px-7 mt-6 mb-2" style={{ color: '#8E8E93', fontSize: '13px' }}>Your sources</p>
        <div className="px-6">
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {sources.map((source, index) => (
              <div
                key={source.id}
                className="flex items-center gap-3 px-5 py-3"
                style={{ borderBottom: index < sources.length - 1 ? '1px solid #F2F2F7' : 'none' }}
              >
                <SourceLogo source={source} size={30} />
                <span className="flex-1" style={{ color: '#1C1C1E', fontSize: '15px' }}>{source.name}</span>
                <button
                  onClick={() => openEdit(source)}
                  className="w-8 h-8 rounded-full flex items-center justify-center active:bg-neutral-100"
                >
                  <Pencil className="w-4 h-4" style={{ color: '#8E8E93' }} />
                </button>
                <button
                  onClick={() => setDeleteTarget(source)}
                  disabled={sources.length <= 1}
                  className="w-8 h-8 rounded-full flex items-center justify-center active:bg-neutral-100 disabled:opacity-30"
                >
                  <Trash2 className="w-4 h-4" style={{ color: '#FF3B30' }} />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={openAdd}
            className="w-full mt-4 py-3 rounded-xl font-medium flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
            style={{ backgroundColor: '#007AFF', color: '#FFFFFF' }}
          >
            <Plus className="w-5 h-5" />
            Add source
          </button>
        </div>
      </div>

      {/* Default picker */}
      <SourceSelectorModal
        isOpen={pickerFor !== null}
        sources={sources}
        selectedSourceId={pickerFor === 'expense' ? defaultSourceExpense : defaultSourceIncome}
        title={pickerFor === 'income' ? 'Default for income' : 'Default for expenses'}
        onSelect={(id) => {
          if (pickerFor) onSetDefault(pickerFor, id);
        }}
        onClose={() => setPickerFor(null)}
      />

      {/* Add / edit form */}
      {formOpen && (
        <SourceFormModal
          initial={editing}
          onClose={() => setFormOpen(false)}
          onSave={(data) => {
            if (editing) onEditSource(editing.id, data);
            else onAddSource(data);
            setFormOpen(false);
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={`Delete ${deleteTarget.name}?`}
          message="Transactions already saved with this source will keep it, but it won't be selectable for new ones."
          confirmLabel="Delete"
          onConfirm={() => {
            onDeleteSource(deleteTarget.id);
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// Bottom-sheet form for creating or renaming a source: a name, a colour, and a
// live preview of the logo tile it produces.
function SourceFormModal({
  initial,
  onSave,
  onClose,
}: {
  initial: Source | null;
  onSave: (data: Omit<Source, 'id'>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [brand, setBrand] = useState(initial?.brand || SOURCE_COLORS[0]);
  // Monogram tracks the name, but a library pick can set an exact one (e.g. "R").
  const [monogram, setMonogram] = useState(initial?.monogram || monogramFromName(initial?.name || 'New'));
  const isCash = initial?.mark === 'banknote';

  const onNameChange = (v: string) => {
    setName(v);
    setMonogram(monogramFromName(v || 'New'));
  };

  const pickBank = (bank: { name: string; brand: string; monogram: string }) => {
    setName(bank.name);
    setBrand(bank.brand);
    setMonogram(bank.monogram);
  };

  const trimmed = name.trim();
  const preview: Source = {
    id: 'preview',
    name: trimmed || 'New source',
    kind: initial?.kind || 'bank',
    brand,
    monogram: isCash ? undefined : monogram,
    mark: isCash ? 'banknote' : 'monogram',
  };

  const save = () => {
    if (!trimmed) return;
    onSave({
      name: trimmed,
      kind: initial?.kind || 'bank',
      brand,
      monogram: isCash ? undefined : monogram,
      mark: isCash ? 'banknote' : 'monogram',
      fg: initial?.fg,
    });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full bg-white rounded-t-3xl shadow-xl max-w-[430px] mx-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4 border-b border-neutral-100">
          <h2 className="font-semibold text-neutral-900">{initial ? 'Edit source' : 'Add source'}</h2>
        </div>

        <div className="px-6 py-5">
          {/* Preview + name */}
          <div className="flex items-center gap-3 mb-5">
            <SourceLogo source={preview} size={44} />
            <input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g. N26, Monzo, Wallet"
              autoFocus
              className="flex-1 px-4 py-3 rounded-xl text-base outline-none"
              style={{ backgroundColor: '#F2F2F5', color: '#1C1C1E' }}
            />
          </div>

          {/* Bank quick-picks — only when adding (not editing / not cash) */}
          {!initial && !isCash && (
            <>
              <p className="mb-2" style={{ color: '#8E8E93', fontSize: '13px' }}>Pick a bank</p>
              <div className="grid grid-cols-7 gap-2 mb-6">
                {BANK_LIBRARY.map((bank) => {
                  const selected = name.trim().toLowerCase() === bank.name.toLowerCase();
                  return (
                    <button
                      key={bank.name}
                      onClick={() => pickBank(bank)}
                      className="flex items-center justify-center rounded-full transition-transform active:scale-95"
                      style={{ boxShadow: selected ? `0 0 0 2px #fff, 0 0 0 4px ${bank.brand}` : 'none' }}
                      aria-label={bank.name}
                      title={bank.name}
                    >
                      <SourceLogo
                        source={{ id: 'lib', name: bank.name, kind: 'bank', brand: bank.brand, monogram: bank.monogram, mark: 'monogram' }}
                        size={34}
                      />
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <p className="mb-2" style={{ color: '#8E8E93', fontSize: '13px' }}>Colour</p>
          <div className="flex flex-wrap gap-2.5 mb-6">
            {SOURCE_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setBrand(c)}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: c, boxShadow: brand === c ? '0 0 0 3px #fff, 0 0 0 5px ' + c : 'none' }}
                aria-label={`Colour ${c}`}
              >
                {brand === c && (
                  <svg width="14" height="11" viewBox="0 0 12 10" fill="none">
                    <path d="M1 5L4.5 8.5L11 1" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            ))}
          </div>

          <button
            onClick={save}
            disabled={!trimmed}
            className="w-full py-3.5 rounded-xl font-medium transition-all active:scale-[0.99]"
            style={{
              backgroundColor: !trimmed ? '#E5E5EA' : '#007AFF',
              color: '#FFFFFF',
              cursor: !trimmed ? 'not-allowed' : 'pointer',
            }}
          >
            {initial ? 'Save changes' : 'Add source'}
          </button>
        </div>
      </div>
    </div>
  );
}
