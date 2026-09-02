import { X, Search } from 'lucide-react';
import { t } from '../i18n';
import { useState } from 'react';
import { useBackClose } from '../lib/useBackClose';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (query: string) => void;
}

export function SearchModal({ isOpen, onClose, onSearch }: SearchModalProps) {
  useBackClose(isOpen, onClose);
  const [query, setQuery] = useState('');

  if (!isOpen) return null;

  const handleSearch = () => {
    onSearch(query);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-[430px] bg-white rounded-t-3xl shadow-2xl animate-slide-up relative z-10"
        onClick={(e) => e.stopPropagation()}
        style={{ transform: 'translateZ(0)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 relative z-10">
          <h3 className="text-neutral-900 font-semibold">{t('search.title')}</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>
        
        {/* Search Input */}
        <div className="px-6 py-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={t('search.placeholder')}
              className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-neutral-50 text-neutral-900 placeholder:text-neutral-400 outline-none focus:bg-neutral-100 transition-colors"
              autoFocus
            />
          </div>
          
          <button
            onClick={handleSearch}
            className="w-full mt-4 py-3.5 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl transition-colors"
          >{t('search.cta')}</button>
        </div>
      </div>
    </div>
  );
}