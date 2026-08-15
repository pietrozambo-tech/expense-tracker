import { Settings2 } from 'lucide-react';
import type { Source } from '../types';
import { SourceLogo } from './SourceLogo';

interface SourceSelectorModalProps {
  isOpen: boolean;
  sources: Source[];
  selectedSourceId?: string | null;
  title?: string;
  onSelect: (sourceId: string) => void;
  onClose: () => void;
  onManage?: () => void; // jump to Settings › Sources
}

// Bottom-sheet picker for the transaction source, matching the app's other
// sheets. Shows the brand logo + full name (there's room here, unlike the pill).
export function SourceSelectorModal({
  isOpen,
  sources,
  selectedSourceId,
  title = 'Select source',
  onSelect,
  onClose,
  onManage,
}: SourceSelectorModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full bg-white rounded-t-3xl shadow-xl max-w-[430px] mx-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '85vh' }}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-neutral-100">
          <h2 className="font-semibold text-neutral-900">{title}</h2>
          {onManage && (
            <button
              onClick={() => {
                onClose();
                onManage();
              }}
              className="flex items-center gap-1.5 text-sm font-medium rounded-lg px-2.5 py-1.5 active:bg-neutral-100"
              style={{ color: 'var(--accent-ink)' }}
            >
              <Settings2 className="w-4 h-4" />
              Manage
            </button>
          )}
        </div>

        <div className="overflow-y-auto px-3 py-2" style={{ maxHeight: 'calc(85vh - 76px)' }}>
          {sources.map((source) => {
            const selected = selectedSourceId === source.id;
            return (
              <button
                key={source.id}
                onClick={() => {
                  onSelect(source.id);
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl active:bg-neutral-50"
              >
                <SourceLogo source={source} size={30} />
                <span className={`flex-1 text-left text-[15px] ${selected ? 'font-semibold text-neutral-900' : 'text-neutral-800'}`}>
                  {source.name}
                </span>
                {selected && (
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
