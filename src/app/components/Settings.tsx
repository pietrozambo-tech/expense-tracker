import { ChevronRight, ChevronLeft, UserCircle, Wallet, BellRing, HelpCircle, ShieldCheck, ScrollText, Layers, FlaskConical, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Categories } from './Categories';
import { ConfirmDialog } from './ConfirmDialog';
import { CURRENCIES } from '../utils/currency';

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
  onEraseAllData
}: SettingsProps) {
  const [showCategories, setShowCategories] = useState(false);
  const [categoryType, setCategoryType] = useState<'expense' | 'income'>('expense');
  const [showCurrencySelector, setShowCurrencySelector] = useState(false);
  const [showNameEditor, setShowNameEditor] = useState(false);
  const [editedName, setEditedName] = useState(userName);
  const [confirmAction, setConfirmAction] = useState<'demo' | 'erase' | null>(null);

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

  // Show Settings list
  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#F5F5F7' }}>
      {/* Header */}
      <div className="px-6 pb-6 pt-0">
        <h1 style={{ color: '#1C1C1E', fontSize: '28px', fontWeight: '600', letterSpacing: '-0.5px' }}>Settings</h1>
        <p style={{ color: '#8E8E93', fontSize: '13px', marginTop: '6px' }}>
          Manage your app preferences
        </p>
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

          <button className="w-full flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid #F2F2F7' }}
          >
            <HelpCircle className="w-5 h-5" style={{ color: '#8E8E93' }} strokeWidth={2} />
            <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '16px' }}>About</span>
            <ChevronRight className="w-5 h-5" style={{ color: '#C7C7CC' }} />
          </button>

          <button className="w-full flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid #F2F2F7' }}
          >
            <ShieldCheck className="w-5 h-5" style={{ color: '#8E8E93' }} strokeWidth={2} />
            <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '16px' }}>Privacy Policy</span>
            <ChevronRight className="w-5 h-5" style={{ color: '#C7C7CC' }} />
          </button>

          <button className="w-full flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors">
            <ScrollText className="w-5 h-5" style={{ color: '#8E8E93' }} strokeWidth={2} />
            <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '16px' }}>Terms of Service</span>
            <ChevronRight className="w-5 h-5" style={{ color: '#C7C7CC' }} />
          </button>
        </div>

        {/* Data section — demo data is for testing the app, erase resets everything */}
        <p className="mt-8 mb-2 px-1" style={{ color: '#8E8E93', fontSize: '13px' }}>
          Data
        </p>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
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

        {/* Version info */}
        <div className="mt-8 text-center pb-4">
          <p className="text-neutral-400 text-sm">Version 1.0.0</p>
          <p className="text-neutral-400 text-xs mt-1">Made with ❤️ in Figma</p>
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