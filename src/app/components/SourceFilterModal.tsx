import { X, Wallet } from 'lucide-react';
import type { Source } from '../types';
import { SourceLogo } from './SourceLogo';

interface SourceFilterModalProps {
  isOpen: boolean;
  sources: Source[];
  selected: string; // 'All' or a source id
  onClose: () => void;
  onSelect: (value: string) => void;
}

// Bottom-sheet source filter for the Activity tab: "All sources" plus each
// source, with the brand logo and full name.
export function SourceFilterModal({ isOpen, sources, selected, onClose, onSelect }: SourceFilterModalProps) {
  if (!isOpen) return null;

  const rows: Array<{ id: string; label: string; source?: Source }> = [
    { id: 'All', label: 'All sources' },
    ...sources.map((s) => ({ id: s.id, label: s.name, source: s })),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-[430px] bg-white rounded-t-3xl shadow-2xl animate-slide-up relative z-10"
        onClick={(e) => e.stopPropagation()}
        style={{ transform: 'translateZ(0)' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <h3 className="text-neutral-900 font-semibold">Filter by Source</h3>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        <div className="px-3 py-2 max-h-[60vh] overflow-y-auto">
          {rows.map((row) => {
            const isSelected = selected === row.id;
            return (
              <button
                key={row.id}
                onClick={() => {
                  onSelect(row.id);
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl active:bg-neutral-50"
              >
                {row.source ? (
                  <SourceLogo source={row.source} size={30} />
                ) : (
                  <span
                    className="flex items-center justify-center flex-shrink-0"
                    style={{ width: 30, height: 30, borderRadius: 9, background: '#F2F2F7' }}
                  >
                    <Wallet className="w-4 h-4" style={{ color: '#8E8E93' }} />
                  </span>
                )}
                <span className={`flex-1 text-left text-[15px] ${isSelected ? 'font-semibold text-neutral-900' : 'text-neutral-800'}`}>
                  {row.label}
                </span>
                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                    <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                      <path d="M1 5L4.5 8.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
