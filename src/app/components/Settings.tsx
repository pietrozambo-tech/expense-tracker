import { ChevronRight, ChevronLeft, UserCircle, Wallet, BellRing, HelpCircle, ShieldCheck, ScrollText, Layers, FlaskConical, Trash2, Landmark, Cloud, LogOut, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Categories } from './Categories';
import { SourcesManager } from './SourcesManager';
import { TracklyLogo } from './TracklyLogo';
import { ConfirmDialog } from './ConfirmDialog';
import { CURRENCIES } from '../utils/currency';
import type { Source } from '../types';
import type { ImportPayload } from '../lib/importData';

interface SettingsProps {
  categories: any[];
  incomeCategories: any[];
  onAddCategory: (category: any) => void;
  onEditCategory: (id: string, updatedCategory: any) => void;
  onDeleteCategory: (id: string) => void;
  onAddSubcategory: (categoryId: string, subcategoryName: string) => void;
  onEditSubcategory: (categoryId: string, oldName: string, newName: string) => void;
  onDeleteSubcategory: (categoryId: string, subcategoryName: string) => void;
  onAddIncomeCategory: (category: any) => void;
  onEditIncomeCategory: (id: string, updatedCategory: any) => void;
  onDeleteIncomeCategory: (id: string) => void;
  onModalOpenChange: (isOpen: boolean) => void;
  userCurrency: string;
  onCurrencyChange: (currency: string) => void;
  userName: string;
  onUserNameChange: (name: string) => void;
  onLoadDemoData: () => void;
  onEraseAllData: () => void;
  onImportData?: (payload: ImportPayload) => void;
  sources: Source[];
  defaultSourceExpense?: string;
  defaultSourceIncome?: string;
  onSetDefaultSource: (direction: 'expense' | 'income', sourceId: string) => void;
  onAddSource: (source: Omit<Source, 'id'>) => void;
  onEditSource: (id: string, updates: Omit<Source, 'id'>) => void;
  onDeleteSource: (id: string) => void;
  openSourcesOnMount?: boolean;
  onSourcesOpened?: () => void;
  openCategoriesOnMount?: boolean;
  onCategoriesOpened?: () => void;
  userEmail?: string | null;
  isGuest?: boolean;
  onSignOut?: () => void;
  onSignInToSync?: () => void;
}

export function Settings({ 
  categories,
  incomeCategories,
  onAddCategory,
  onEditCategory,
  onDeleteCategory,
  onAddSubcategory,
  onEditSubcategory,
  onDeleteSubcategory,
  onAddIncomeCategory,
  onEditIncomeCategory,
  onDeleteIncomeCategory,
  onModalOpenChange,
  userCurrency,
  onCurrencyChange,
  userName,
  onUserNameChange,
  onLoadDemoData,
  onEraseAllData,
  onImportData,
  sources,
  defaultSourceExpense,
  defaultSourceIncome,
  onSetDefaultSource,
  onAddSource,
  onEditSource,
  onDeleteSource,
  openSourcesOnMount,
  onSourcesOpened,
  openCategoriesOnMount,
  onCategoriesOpened,
  userEmail,
  isGuest,
  onSignOut,
  onSignInToSync
}: SettingsProps) {
  const [showCategories, setShowCategories] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [categoryType, setCategoryType] = useState<'expense' | 'income'>('expense');
  const [showCurrencySelector, setShowCurrencySelector] = useState(false);
  const [showNameEditor, setShowNameEditor] = useState(false);
  const [editedName, setEditedName] = useState(userName);
  const [confirmAction, setConfirmAction] = useState<'demo' | 'erase' | null>(null);

  // Deep-link from the Add screen's "Manage" link opens Sources directly
  useEffect(() => {
    if (openSourcesOnMount) {
      setShowSources(true);
      onSourcesOpened?.();
    }
  }, [openSourcesOnMount, onSourcesOpened]);

  // Deep-link from the welcome carousel opens Categories directly
  useEffect(() => {
    if (openCategoriesOnMount) {
      setShowCategories(true);
      onCategoriesOpened?.();
    }
  }, [openCategoriesOnMount, onCategoriesOpened]);

  const currencies = [
    { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺' },
    { code: 'USD', symbol: '$', name: 'US Dollar', flag: '🇺🇸' },
    { code: 'GBP', symbol: '£', name: 'British Pound', flag: '🇬🇧' },
    { code: 'AED', symbol: 'AED', name: 'UAE Dirham', flag: '🇦🇪' }
  ];

  const handleCurrencyChange = (newCurrency: string) => {
    onCurrencyChange(newCurrency);
    setShowCurrencySelector(false);
  };

  const handleNameSave = () => {
    if (editedName.trim()) {
      onUserNameChange(editedName.trim());
      setShowNameEditor(false);
    }
  };

  const openConfirm = (action: 'demo' | 'erase') => {
    setConfirmAction(action);
    onModalOpenChange(true);
  };

  const closeConfirm = () => {
    setConfirmAction(null);
    onModalOpenChange(false);
  };

  const handleConfirm = () => {
    if (confirmAction === 'demo') {
      onLoadDemoData();
    } else if (confirmAction === 'erase') {
      onEraseAllData();
    }
    closeConfirm();
  };

  // Import a JSON file (see lib/importData for the format)
  const importInputRef = useRef<HTMLInputElement>(null);
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so the same file can be picked again
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (!payload || !Array.isArray(payload.transactions)) {
        throw new Error('bad format');
      }
      onImportData?.(payload as ImportPayload);
    } catch {
      toast.error("Couldn't read that file", {
        description: 'Expected a Trackly import file (.json)',
        duration: 2400,
      });
    }
  };

  // Show Currency Selector
  if (showCurrencySelector) {
    return (
      <div className="h-screen flex flex-col" style={{ backgroundColor: '#F5F5F7' }}>
        {/* Fixed Header Section */}
        <div style={{ backgroundColor: '#F5F5F7' }}>
          {/* Header with back button and title */}
          <div className="px-6 pb-4 pt-0">
            <div className="flex items-center justify-center relative">
              <button
                onClick={() => setShowCurrencySelector(false)}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: '#007AFF' }} />
              </button>
              <h1 style={{ color: '#1C1C1E', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>Currency</h1>
            </div>
          </div>
        </div>

        {/* Scrollable Content Section */}
        <div className="flex-1 overflow-y-auto pb-24">
          <div className="px-6 pb-6">
            <p style={{ color: '#8E8E93', fontSize: '13px' }}>
              New transactions will use the selected currency
            </p>
          </div>

          <div className="px-6">
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {currencies.map((currency, index) => (
                <button
                  key={currency.code}
                  onClick={() => handleCurrencyChange(currency.code)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                  style={{
                    borderBottom: index < currencies.length - 1 ? '1px solid #F2F2F7' : 'none'
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{
                        backgroundColor: userCurrency === currency.code ? '#E3F2FF' : '#F2F2F7',
                        fontSize: '22px'
                      }}
                    >
                      {currency.flag}
                    </div>
                    <div className="flex flex-col items-start">
                      <div className="flex items-baseline gap-2">
                        <span
                          className="font-medium"
                          style={{
                            color: userCurrency === currency.code ? '#007AFF' : '#1C1C1E',
                            fontSize: '16px'
                          }}
                        >
                          {currency.code}
                        </span>
                      </div>
                      <span className="text-neutral-500 text-sm">{currency.name}</span>
                    </div>
                  </div>
                  {userCurrency === currency.code && (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: '#007AFF' }}
                    >
                      <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                        <path
                          d="M1 5L4.5 8.5L11 1.5"
                          stroke="white"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show Name Editor
  if (showNameEditor) {
    return (
      <div className="h-screen flex flex-col" style={{ backgroundColor: '#F5F5F7' }}>
        {/* Fixed Header Section */}
        <div style={{ backgroundColor: '#F5F5F7' }}>
          {/* Header with back button and title */}
          <div className="px-6 pb-4 pt-0">
            <div className="flex items-center justify-center relative">
              <button
                onClick={() => {
                  setShowNameEditor(false);
                  setEditedName(userName);
                }}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: '#007AFF' }} />
              </button>
              <h1 style={{ color: '#1C1C1E', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>Profile</h1>
            </div>
          </div>
        </div>

        {/* Scrollable Content Section */}
        <div className="flex-1 overflow-y-auto pb-24">
          <div className="px-6 pb-6">
            <p style={{ color: '#8E8E93', fontSize: '13px' }}>
              Update your display name
            </p>
          </div>

          <div className="px-6">
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              placeholder=""
              autoFocus
              className="w-full px-4 py-4 rounded-xl text-base outline-none transition-all"
              style={{
                backgroundColor: '#FFFFFF',
                color: '#1C1C1E',
                border: '1px solid #E5E5EA',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
              }}
              onFocus={(e) => {
                e.target.style.border = '1.5px solid #007AFF';
                e.target.style.boxShadow = '0 0 0 3px rgba(0, 122, 255, 0.08)';
              }}
              onBlur={(e) => {
                e.target.style.border = '1px solid #E5E5EA';
                e.target.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.04)';
              }}
            />

            <button
              onClick={handleNameSave}
              disabled={!editedName.trim()}
              className="w-full mt-6 py-4 rounded-xl font-medium text-base transition-all active:scale-[0.98]"
              style={{
                backgroundColor: !editedName.trim() ? '#E5E5EA' : '#007AFF',
                color: '#FFFFFF',
                boxShadow: !editedName.trim() ? 'none' : '0 2px 8px rgba(0, 122, 255, 0.25)',
                cursor: !editedName.trim() ? 'not-allowed' : 'pointer'
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show Categories subpage
  if (showCategories) {
    return (
      <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: '#F5F5F7' }}>
        {/* Fixed Header Section */}
        <div className="flex-shrink-0" style={{ backgroundColor: '#F5F5F7' }}>
          {/* Header with back button and title */}
          <div className="px-6 pb-4 pt-0">
            <div className="flex items-center justify-center relative">
              <button
                onClick={() => {
                  setShowCategories(false);
                  setCategoryType('expense'); // Reset to default
                }}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: '#007AFF' }} />
              </button>
              <h1 style={{ color: '#1C1C1E', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>Categories</h1>
            </div>
          </div>

          {/* Toggle Switch */}
          <div className="px-6 pb-4">
            <div 
              className="flex gap-0 rounded-lg overflow-hidden"
              style={{ 
                backgroundColor: '#1C1C1E',
                border: '1px solid #2C2C2E'
              }}
            >
              <button
                onClick={() => setCategoryType('expense')}
                className="flex-1 px-4 py-1.5 transition-all text-sm font-medium"
                style={{
                  backgroundColor: categoryType === 'expense' ? '#3A3A3C' : 'transparent',
                  color: '#FFFFFF',
                  boxShadow: categoryType === 'expense' ? '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.1)' : 'none'
                }}
              >
                Expense
              </button>
              <button
                onClick={() => setCategoryType('income')}
                className="flex-1 px-4 py-1.5 transition-all text-sm font-medium"
                style={{
                  backgroundColor: categoryType === 'income' ? '#3A3A3C' : 'transparent',
                  color: '#FFFFFF',
                  boxShadow: categoryType === 'income' ? '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.1)' : 'none'
                }}
              >
                Income
              </button>
            </div>
          </div>
        </div>
        
        {/* Scrollable Categories Section */}
        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: '96px' }}>
          <Categories
            categories={categoryType === 'expense' ? categories : incomeCategories}
            onAddCategory={categoryType === 'expense' ? onAddCategory : onAddIncomeCategory}
            onEditCategory={categoryType === 'expense' ? onEditCategory : onEditIncomeCategory}
            onDeleteCategory={categoryType === 'expense' ? onDeleteCategory : onDeleteIncomeCategory}
            onAddSubcategory={onAddSubcategory}
            onEditSubcategory={onEditSubcategory}
            onDeleteSubcategory={onDeleteSubcategory}
            onModalOpenChange={onModalOpenChange}
            type={categoryType}
          />
        </div>
      </div>
    );
  }

  // Show About subpage
  if (showAbout) {
    return (
      <div className="h-screen flex flex-col" style={{ backgroundColor: '#F5F5F7' }}>
        <div style={{ backgroundColor: '#F5F5F7' }}>
          <div className="px-6 pb-4 pt-0">
            <div className="flex items-center justify-center relative">
              <button
                onClick={() => setShowAbout(false)}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: '#007AFF' }} />
              </button>
              <h1 style={{ color: '#1C1C1E', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>About</h1>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-24">
          {/* Brand */}
          <div className="flex flex-col items-center text-center px-6 pt-6 pb-8">
            <TracklyLogo size={80} className="mb-4" />
            <h2 style={{ color: '#1C1C1E', fontSize: '28px', fontWeight: 700, letterSpacing: '-0.03em' }}>Trackly</h2>
            <p style={{ color: '#8E8E93', fontSize: '14px', marginTop: '4px' }}>Version 0.1</p>
            <p style={{ color: '#6B6B75', fontSize: '15px', marginTop: '12px', maxWidth: 300, lineHeight: 1.5 }}>
              Track every expense in seconds — with clear insights into where your money goes.
            </p>
          </div>

          {/* Links */}
          <div className="px-6">
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <button className="w-full flex items-center gap-3 px-5 py-4 active:bg-neutral-100 transition-colors" style={{ borderBottom: '1px solid #F2F2F7' }}>
                <ShieldCheck className="w-5 h-5" style={{ color: '#8E8E93' }} strokeWidth={2} />
                <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '16px' }}>Privacy Policy</span>
                <ChevronRight className="w-5 h-5" style={{ color: '#C7C7CC' }} />
              </button>
              <button className="w-full flex items-center gap-3 px-5 py-4 active:bg-neutral-100 transition-colors">
                <ScrollText className="w-5 h-5" style={{ color: '#8E8E93' }} strokeWidth={2} />
                <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '16px' }}>Terms of Service</span>
                <ChevronRight className="w-5 h-5" style={{ color: '#C7C7CC' }} />
              </button>
            </div>
          </div>

          {/* Privacy note */}
          <div className="px-6 mt-4">
            <p style={{ color: '#8E8E93', fontSize: '12px', lineHeight: 1.5, textAlign: 'center', maxWidth: 320, margin: '0 auto' }}>
              Trackly uses privacy-friendly analytics to understand how the app is
              used and improve it. This never includes your transactions, amounts, or
              category details.
            </p>
          </div>

          {/* Signature */}
          <div className="mt-10 text-center px-6">
            <p style={{ color: '#B0B0B5', fontSize: '13px', fontStyle: 'italic' }}>Designed in Spain by Zambop</p>
            <p style={{ color: '#C7C7CC', fontSize: '12px', marginTop: '4px' }}>© {new Date().getFullYear()} Trackly</p>
          </div>
        </div>
      </div>
    );
  }

  // Show Sources subpage
  if (showSources) {
    return (
      <SourcesManager
        sources={sources}
        defaultSourceExpense={defaultSourceExpense}
        defaultSourceIncome={defaultSourceIncome}
        onBack={() => setShowSources(false)}
        onSetDefault={onSetDefaultSource}
        onAddSource={onAddSource}
        onEditSource={onEditSource}
        onDeleteSource={onDeleteSource}
      />
    );
  }

  // Show Settings list
  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#F5F5F7' }}>
      {/* Header */}
      <div className="px-6 pb-4 pt-1">
        <h1 style={{ color: '#1C1C1E', fontSize: '28px', fontWeight: '600', letterSpacing: '-0.5px' }}>Settings</h1>
        <p style={{ color: '#8E8E93', fontSize: '13px', marginTop: '4px' }}>
          Manage your app preferences
        </p>
      </div>

      {/* Account section — sign-in / sign-out + sync status */}
      <div className="px-6 mb-6">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {isGuest ? (
            <button
              onClick={onSignInToSync}
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            >
              <Cloud className="w-5 h-5" style={{ color: '#007AFF' }} strokeWidth={2} />
              <div className="flex-1 text-left">
                <div style={{ color: '#1C1C1E', fontSize: '16px' }}>Sign in to back up & sync</div>
                <div style={{ color: '#8E8E93', fontSize: '13px' }}>Keep your data safe across devices</div>
              </div>
              <ChevronRight className="w-5 h-5" style={{ color: '#C7C7CC' }} />
            </button>
          ) : (
            <>
              <div className="w-full flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid #F2F2F7' }}>
                <Cloud className="w-5 h-5" style={{ color: '#30D158' }} strokeWidth={2} />
                <div className="flex-1 min-w-0">
                  <div style={{ color: '#1C1C1E', fontSize: '16px' }}>Synced</div>
                  {userEmail && <div className="truncate" style={{ color: '#8E8E93', fontSize: '13px' }}>{userEmail}</div>}
                </div>
              </div>
              <button
                onClick={onSignOut}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
              >
                <LogOut className="w-5 h-5" style={{ color: '#8E8E93' }} strokeWidth={2} />
                <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '16px' }}>Sign out</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Settings List */}
      <div className="px-6">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button
            onClick={() => setShowNameEditor(true)}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid #F2F2F7' }}
          >
            {userName ? (
              <div
                className="w-7 h-7 -ml-1 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#1C1C1E' }}
              >
                <span style={{ color: '#FFFFFF', fontSize: '13px', fontWeight: 600 }}>
                  {userName.trim().charAt(0).toUpperCase()}
                </span>
              </div>
            ) : (
              <UserCircle className="w-5 h-5" style={{ color: '#8E8E93' }} strokeWidth={2} />
            )}
            <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '16px' }}>Profile</span>
            <span style={{ color: '#8E8E93', fontSize: '15px' }}>{userName}</span>
            <ChevronRight className="w-5 h-5" style={{ color: '#C7C7CC' }} />
          </button>

          <button 
            onClick={() => setShowCategories(true)}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid #F2F2F7' }}
          >
            <Layers className="w-5 h-5" style={{ color: '#8E8E93' }} strokeWidth={2} />
            <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '16px' }}>Categories</span>
            <span style={{ color: '#8E8E93', fontSize: '15px' }}>{categories.length + incomeCategories.length}</span>
            <ChevronRight className="w-5 h-5" style={{ color: '#C7C7CC' }} />
          </button>

          <button
            onClick={() => setShowSources(true)}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid #F2F2F7' }}
          >
            <Landmark className="w-5 h-5" style={{ color: '#8E8E93' }} strokeWidth={2} />
            <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '16px' }}>Sources</span>
            <span style={{ color: '#8E8E93', fontSize: '15px' }}>{sources.length}</span>
            <ChevronRight className="w-5 h-5" style={{ color: '#C7C7CC' }} />
          </button>

          <button 
            onClick={() => setShowCurrencySelector(true)}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid #F2F2F7' }}
          >
            <Wallet className="w-5 h-5" style={{ color: '#8E8E93' }} strokeWidth={2} />
            <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '16px' }}>Main Currency</span>
            <span style={{ color: '#8E8E93', fontSize: '15px' }}>
              {currencies.find(c => c.code === userCurrency)?.flag} {userCurrency}
            </span>
            <ChevronRight className="w-5 h-5" style={{ color: '#C7C7CC' }} />
          </button>

          <button className="w-full flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid #F2F2F7' }}
          >
            <BellRing className="w-5 h-5" style={{ color: '#8E8E93' }} strokeWidth={2} />
            <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '16px' }}>Notifications</span>
            <ChevronRight className="w-5 h-5" style={{ color: '#C7C7CC' }} />
          </button>

          <button
            onClick={() => setShowAbout(true)}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
          >
            <HelpCircle className="w-5 h-5" style={{ color: '#8E8E93' }} strokeWidth={2} />
            <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '16px' }}>About</span>
            <ChevronRight className="w-5 h-5" style={{ color: '#C7C7CC' }} />
          </button>
        </div>

        {/* Data section — demo data is for testing the app, erase resets everything */}
        <p className="mt-8 mb-2 px-1" style={{ color: '#8E8E93', fontSize: '13px' }}>
          Data
        </p>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {onImportData && (
            <>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportFile}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => importInputRef.current?.click()}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                style={{ borderBottom: '1px solid #F2F2F7' }}
              >
                <Upload className="w-5 h-5" style={{ color: '#8E8E93' }} strokeWidth={2} />
                <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '16px' }}>Import data</span>
                <span style={{ color: '#8E8E93', fontSize: '13px' }}>From file</span>
              </button>
            </>
          )}
          <button
            onClick={() => openConfirm('demo')}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid #F2F2F7' }}
          >
            <FlaskConical className="w-5 h-5" style={{ color: '#8E8E93' }} strokeWidth={2} />
            <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '16px' }}>Load demo data</span>
            <span style={{ color: '#8E8E93', fontSize: '13px' }}>For testing</span>
          </button>

          <button
            onClick={() => openConfirm('erase')}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
          >
            <Trash2 className="w-5 h-5" style={{ color: '#EF4444' }} strokeWidth={2} />
            <span className="flex-1 text-left" style={{ color: '#EF4444', fontSize: '16px' }}>Erase all data</span>
          </button>
        </div>

        {/* Signature */}
        <div className="mt-10 mb-2 text-center">
          <p style={{ color: '#B0B0B5', fontSize: '12px', fontWeight: 500 }}>Trackly · v0.1</p>
          <p style={{ color: '#B0B0B5', fontSize: '12px', fontStyle: 'italic', marginTop: '2px' }}>
            Designed in Spain by Zambop
          </p>
        </div>

      </div>

      {confirmAction === 'demo' && (
        <ConfirmDialog
          title="Load demo data?"
          message="This replaces your current transactions with sample data so you can explore the app. Use 'Erase all data' to start clean again."
          confirmLabel="Load"
          variant="neutral"
          onConfirm={handleConfirm}
          onCancel={closeConfirm}
        />
      )}
      {confirmAction === 'erase' && (
        <ConfirmDialog
          title="Erase all data?"
          message="This permanently deletes all transactions, categories and settings, and restarts the app from scratch."
          confirmLabel="Erase"
          onConfirm={handleConfirm}
          onCancel={closeConfirm}
        />
      )}
    </div>
  );
}