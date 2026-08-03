import { ChevronRight, ChevronLeft, UserCircle, Wallet, HelpCircle, ShieldCheck, ScrollText, Layers, FlaskConical, Trash2, Landmark, Cloud, LogOut, Upload, Copy, Download, FileSpreadsheet, Palmtree, UserX, Mail, LifeBuoy, CheckCircle2 } from 'lucide-react';
import { sendSupportMessage, supportLimitReached } from '../lib/support';

// Where messages from Settings > Contacts go. Easy to swap when the domain changes.
const SUPPORT_EMAIL = 'support@tracklylab.com';
const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

// Settings sub-screens fill the tab area and scroll inside themselves. They
// cannot be 100dvh: the tab wrapper in App.tsx already contributes the 8px top
// inset and the 128px of bottom padding that clears the nav bar, so a
// full-viewport child overflowed by exactly that and every sub-screen could be
// dragged down onto 136px of empty background.
const SUBPAGE_HEIGHT = 'calc(100dvh - 136px)';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Categories } from './Categories';
import { SourcesManager } from './SourcesManager';
import { TracklyLogo } from './TracklyLogo';
import { ConfirmDialog } from './ConfirmDialog';
import { CURRENCIES, MAIN_CURRENCY_CODES } from '../utils/currency';
import { CurrencySearchList } from './CurrencySearchList';
import { LegalScreen } from './LegalScreen';
import { PRIVACY_POLICY, TERMS_OF_SERVICE, type LegalDoc } from '../lib/legalContent';
import type { Source } from '../types';
import type { ImportPayload } from '../lib/importData';
import { isBackupFile } from '../lib/backup';

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
  monthlyBudget?: number;
  onMonthlyBudgetChange?: (budget: number | undefined) => void;
  userName: string;
  onUserNameChange: (name: string) => void;
  onLoadDemoData: () => void;
  onEraseAllData: () => void;
  onEraseDemoData?: () => void;
  hasDemoData?: boolean;
  onImportData?: (payload: ImportPayload) => void;
  onExportData?: () => void;
  onExportCsv?: () => void;
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
  userAvatar?: string | null;
  syncStatus?: 'synced' | 'pending' | 'offline' | 'error';
  lastSyncedAt?: number | null;
  isGuest?: boolean;
  onSignOut?: () => void;
  onDeleteAccount?: () => Promise<{ error: string | null }>;
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
  monthlyBudget,
  onMonthlyBudgetChange,
  userName,
  onUserNameChange,
  onLoadDemoData,
  onEraseAllData,
  onEraseDemoData,
  hasDemoData,
  onImportData,
  onExportData,
  onExportCsv,
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
  userAvatar,
  syncStatus = 'synced',
  lastSyncedAt = null,
  isGuest,
  onSignOut,
  onDeleteAccount,
  onSignInToSync
}: SettingsProps) {
  // Falls back to the name initial if the avatar image can't be loaded.
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [categoryType, setCategoryType] = useState<'expense' | 'income'>('expense');
  const [showCurrencySelector, setShowCurrencySelector] = useState(false);
  const [showAllCurrencies, setShowAllCurrencies] = useState(false);
  const [showNameEditor, setShowNameEditor] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [supportMessage, setSupportMessage] = useState('');
  const [supportEmail, setSupportEmail] = useState(userEmail || '');
  const [sendingSupport, setSendingSupport] = useState(false);
  const [supportSent, setSupportSent] = useState(false);
  const [editedName, setEditedName] = useState(userName);
  const [editedBudget, setEditedBudget] = useState(monthlyBudget ? String(monthlyBudget) : '');
  const [confirmAction, setConfirmAction] = useState<'demo' | 'erase' | 'erase-demo' | 'restore' | 'delete-account' | null>(null);
  const [pendingBackup, setPendingBackup] = useState<ImportPayload | null>(null);

  // Opening a Settings sub-screen (Categories, Sources, Currency, About,
  // Import, Profile) should start it at the top rather than inheriting the
  // scroll position of the main Settings list.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [showCategories, showSources, showAbout, showImport, showCurrencySelector, showNameEditor, showSupport, legalDoc]);

  const openSupport = () => {
    setSupportSent(false);
    setSupportEmail((cur) => cur || userEmail || '');
    setShowSupport(true);
  };
  const closeSupport = () => {
    setShowSupport(false);
    setSupportSent(false);
  };

  // Send the message straight from the app (posts to the send-support Edge
  // Function). No redirect to the user's mail app.
  const canSendSupport = supportMessage.trim().length > 0 && isValidEmail(supportEmail);
  const submitSupport = async () => {
    if (!canSendSupport || sendingSupport) return;
    if (supportLimitReached()) {
      toast.error('Daily limit reached', {
        description: `You can send up to 10 messages a day - or email us directly at ${SUPPORT_EMAIL}.`,
        duration: 3500,
      });
      return;
    }
    setSendingSupport(true);
    const res = await sendSupportMessage({
      message: supportMessage.trim(),
      email: supportEmail.trim(),
      name: userName,
      isGuest,
    });
    setSendingSupport(false);
    if (res.error) {
      toast.error("Couldn't send your message", { description: res.error, duration: 3500 });
      return;
    }
    setSupportMessage('');
    setSupportSent(true);
  };

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

  // The four main currencies, plus the user's current one when it isn't a
  // main - so a CHF user always sees their selection at the top.
  const currencies = [
    ...MAIN_CURRENCY_CODES,
    ...(MAIN_CURRENCY_CODES.includes(userCurrency) ? [] : [userCurrency]),
  ]
    .map((code) => CURRENCIES[code])
    .filter(Boolean);

  const handleCurrencyChange = (newCurrency: string) => {
    onCurrencyChange(newCurrency);
    setShowCurrencySelector(false);
    setShowAllCurrencies(false);
  };

  const handleNameSave = () => {
    if (!editedName.trim()) return;
    onUserNameChange(editedName.trim());
    // An empty budget field means "no budget" and hides the Dashboard bar.
    const raw = editedBudget.trim().replace(',', '.');
    const parsed = raw === '' ? undefined : Math.max(0, parseFloat(raw));
    onMonthlyBudgetChange?.(parsed && isFinite(parsed) && parsed > 0 ? parsed : undefined);
    setShowNameEditor(false);
  };

  const openConfirm = (action: 'demo' | 'erase' | 'erase-demo' | 'restore' | 'delete-account') => {
    setConfirmAction(action);
    onModalOpenChange(true);
  };

  // Account deletion is async (server round-trip), so it gets its own handler
  // rather than the synchronous handleConfirm. On success the app returns to the
  // sign-in screen on its own; on failure the user stays signed in.
  const handleDeleteAccountConfirm = async () => {
    setConfirmAction(null);
    setDeletingAccount(true);
    const toastId = toast.loading('Deleting your account…');
    const res = await onDeleteAccount?.();
    toast.dismiss(toastId);
    setDeletingAccount(false);
    onModalOpenChange(false);
    if (res?.error) {
      toast.error('Could not delete account', { description: res.error, duration: 3500 });
    }
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
    } else if (confirmAction === 'erase-demo') {
      onEraseDemoData?.();
    } else if (confirmAction === 'restore' && pendingBackup) {
      onImportData?.(pendingBackup);
      setPendingBackup(null);
    }
    closeConfirm();
  };

  // Import a JSON file (see lib/importData for the format). A full backup file
  // (from Export) triggers a restore confirmation; a lightweight import file is
  // appended directly.
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
      const isBackup = isBackupFile(payload);
      if (isBackup) {
        // Leave the Import subpage so the confirm dialog (rendered in the main
        // Settings view) can mount.
        setShowImport(false);
        setPendingBackup(payload as ImportPayload);
        setConfirmAction('restore');
        onModalOpenChange(true);
      } else {
        onImportData?.(payload as ImportPayload);
      }
    } catch {
      toast.error("Couldn't read that file", {
        description: 'Expected a TracklyLab import file (.json)',
        duration: 2400,
      });
    }
  };

  // Coarse relative time for the sync row ("just now", "5m ago", ...)
  const relTime = (ts: number) => {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return new Date(ts).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  };
  const syncMeta =
    syncStatus === 'pending'
      ? { label: 'Syncing…', color: '#8E8E93' }
      : syncStatus === 'offline'
        ? { label: 'Offline - will sync when back online', color: '#FF9F0A' }
        : syncStatus === 'error'
          ? { label: "Sync issue - retrying automatically", color: '#FF3B30' }
          : { label: lastSyncedAt ? `Synced · ${relTime(lastSyncedAt)}` : 'Synced', color: '#30D158' };

  // Show Currency Selector
  if (showCurrencySelector) {
    return (
      <div className="flex flex-col" style={{ height: SUBPAGE_HEIGHT, backgroundColor: '#F5F5F7' }}>
        {/* Fixed Header Section */}
        <div style={{ backgroundColor: '#F5F5F7' }}>
          {/* Header with back button and title */}
          <div className="px-6 pb-4 pt-0">
            <div className="flex items-center justify-center relative">
              <button
                onClick={() => {
                  if (showAllCurrencies) setShowAllCurrencies(false);
                  else setShowCurrencySelector(false);
                }}
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
            {showAllCurrencies ? (
              <CurrencySearchList selected={userCurrency} onSelect={handleCurrencyChange} />
            ) : (
            <>
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

            {/* Every other currency, searchable */}
            <button
              onClick={() => setShowAllCurrencies(true)}
              className="w-full flex items-center justify-between px-5 py-4 mt-3 rounded-2xl bg-white shadow-sm active:bg-neutral-100 transition-colors"
            >
              <span className="font-medium text-neutral-700" style={{ fontSize: '16px' }}>Others</span>
              <ChevronRight className="w-5 h-5 text-neutral-400" />
            </button>
            </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Show Name Editor
  if (showNameEditor) {
    return (
      <div className="flex flex-col" style={{ height: SUBPAGE_HEIGHT, backgroundColor: '#F5F5F7' }}>
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
              Your name and your monthly spending limit
            </p>
          </div>

          <div className="px-6">
            <p style={{ color: '#8E8E93', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>NAME</p>
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

            <p style={{ color: '#8E8E93', fontSize: 13, fontWeight: 500, margin: '24px 0 8px' }}>
              MONTHLY BUDGET
            </p>
            <div
              className="flex items-center gap-2 px-4 rounded-xl"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E5EA', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
            >
              <span style={{ color: '#8E8E93', fontSize: 16 }}>{CURRENCIES[userCurrency]?.symbol ?? ''}</span>
              <input
                type="text"
                inputMode="decimal"
                value={editedBudget}
                onChange={(e) => {
                  const v = e.target.value.replace(',', '.');
                  if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setEditedBudget(v);
                }}
                placeholder="No limit"
                className="flex-1 py-4 bg-transparent outline-none tabular-nums"
                style={{ fontSize: 16, color: '#1C1C1E' }}
              />
            </div>
            <p style={{ color: '#B0B0B5', fontSize: 12, marginTop: 6, lineHeight: 1.45 }}>
              Shows a progress bar on your Dashboard for the current month. Leave empty for no limit.
            </p>

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
      <div className="flex flex-col overflow-hidden" style={{ height: SUBPAGE_HEIGHT, backgroundColor: '#F5F5F7' }}>
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

  // Show a legal document. Checked before About so that closing it lands back
  // on the About screen the link was tapped from.
  if (legalDoc) {
    return <LegalScreen doc={legalDoc} onBack={() => setLegalDoc(null)} />;
  }

  // Show About subpage
  if (showAbout) {
    return (
      <div className="flex flex-col" style={{ height: SUBPAGE_HEIGHT, backgroundColor: '#F5F5F7' }}>
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
            <h2 style={{ color: '#1C1C1E', fontSize: '28px', fontWeight: 700, letterSpacing: '-0.03em' }}>TracklyLab</h2>
            <p style={{ color: '#007AFF', fontSize: '14px', fontWeight: 600, marginTop: '4px', letterSpacing: '0.02em' }}>Your Expense Lens</p>
            <p style={{ color: '#8E8E93', fontSize: '13px', marginTop: '6px' }}>Version 1.0</p>
            {/* Which BUILD this device is actually running. When two devices
                disagree, comparing this line answers "is one of them stale?"
                in five seconds. */}
            <p style={{ color: '#C7C7CC', fontSize: '11px', marginTop: '2px' }}>Build {__BUILD_STAMP__}</p>
            <p style={{ color: '#6B6B75', fontSize: '15px', marginTop: '12px', maxWidth: 300, lineHeight: 1.5 }}>
              Track every expense in seconds - with clear insights into where your money goes.
            </p>
          </div>

          {/* Links */}
          <div className="px-6">
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <button
                onClick={() => setLegalDoc(PRIVACY_POLICY)}
                className="w-full flex items-center gap-3 px-5 py-4 active:bg-neutral-100 transition-colors"
                style={{ borderBottom: '1px solid #F2F2F7' }}
              >
                <ShieldCheck className="w-5 h-5" style={{ color: '#8E8E93' }} strokeWidth={2} />
                <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '16px' }}>Privacy Policy</span>
                <ChevronRight className="w-5 h-5" style={{ color: '#C7C7CC' }} />
              </button>
              <button
                onClick={() => setLegalDoc(TERMS_OF_SERVICE)}
                className="w-full flex items-center gap-3 px-5 py-4 active:bg-neutral-100 transition-colors"
              >
                <ScrollText className="w-5 h-5" style={{ color: '#8E8E93' }} strokeWidth={2} />
                <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '16px' }}>Terms of Service</span>
                <ChevronRight className="w-5 h-5" style={{ color: '#C7C7CC' }} />
              </button>
            </div>
          </div>

          {/* Privacy note */}
          <div className="px-6 mt-4">
            <p style={{ color: '#8E8E93', fontSize: '12px', lineHeight: 1.5, textAlign: 'center', maxWidth: 320, margin: '0 auto' }}>
              TracklyLab uses privacy-friendly analytics to understand how the app is
              used and improve it. This never includes your transactions, amounts, or
              category details.
            </p>
          </div>

          {/* Signature */}
          <div className="mt-10 text-center px-6">
            <p style={{ color: '#B0B0B5', fontSize: '13px', fontStyle: 'italic' }}>Brought to you by Zambop</p>
            <p style={{ color: '#C7C7CC', fontSize: '12px', marginTop: '4px' }}>© {new Date().getFullYear()} TracklyLab</p>
          </div>
        </div>
      </div>
    );
  }

  // Show Import subpage — guides the user to turn their own spreadsheet into
  // TracklyLab's import format using an AI assistant, then pick the file.
  if (showImport) {
    // One formatter for both directions: income categories carry subcategories
    // too (imports create them), and the assistant can only match what it is
    // shown - otherwise it invents a near-duplicate of one you already have.
    const catLine = (c: any) =>
      `- ${c.name}${c.subcategories?.length ? ` (subcategories: ${c.subcategories.join(', ')})` : ''}`;
    const expList = categories.map(catLine).join('\n');
    const incList = incomeCategories.map(catLine).join('\n');
    const hasSources = sources.length > 0;
    const srcList = hasSources ? sources.map((s) => `${s.id} = ${s.name}`).join(', ') : '(none - omit the "source" field)';
    // Build the example row from the user's OWN setup, so nothing hardcoded
    // (currency, category, subcategory, source) can mislead the assistant.
    const exampleCat: any = categories[0];
    const exampleCatName = exampleCat?.name || 'Groceries';
    const exampleSub = exampleCat?.subcategories?.[0] as string | undefined;
    const defaultSrc = sources.find((s) => s.id === defaultSourceExpense) || sources[0];
    const defaultSrcId = defaultSrc?.id;
    const exampleRow =
      `    { "date": "2026-01-15", "amount": 42.50, "type": "expense", "category": "${exampleCatName}"` +
      `${exampleSub ? `, "subcategory": "${exampleSub}"` : ''}, "description": "Example"` +
      `${defaultSrcId ? `, "source": "${defaultSrcId}"` : ''} }`;
    const sourceRule = hasSources
      ? `- "source": optional; one of my source ids listed below${defaultSrcId ? ` (use "${defaultSrcId}" if unsure)` : ''}.`
      : `- "source": leave this field out - I have no sources set up.`;
    // A second example showing a foreign-currency row, so mixed-currency
    // statements are handled. Pick any code that isn't the home one.
    const foreignEx = userCurrency === 'USD' ? 'EUR' : 'USD';
    const exampleRow2 =
      `    { "date": "2026-01-18", "amount": 30.00, "currency": "${foreignEx}", "type": "expense", "category": "${exampleCatName}", "description": "A purchase made abroad" }`;
    // If the user has a catch-all category ("Others"), name it as the fallback
    // so unmatched rows land there instead of a vague "closest" category.
    const catchAll: any = categories.find((c: any) =>
      /^(other|others|miscellaneous|misc|uncategori[sz]ed)$/i.test(String(c.name).trim()),
    );
    const fallbackLine = catchAll
      ? `- If nothing fits at all, use "${catchAll.name}" and put the ORIGINAL category name in "subcategory" (e.g. "Dining out") so I can re-sort later - never drop the row or leave the category blank.`
      : `- If nothing fits at all, pick my closest general category and put the original category name in "subcategory" - never drop the row or leave it blank.`;
    // The AI needs to know WHO the account owner is the moment a file has one
    // column per person (Splitwise trips): every rule below about "my column"
    // hangs on this line.
    const ownerLine = userName.trim()
      ? `My name is ${userName.trim()} - if a file has one column per person, mine is the one matching that name (it may include a surname).`
      : `If a file has one column per person, ask me which column is mine before converting.`;
    const importPrompt = `I want to import my expense & income history into an app called "TracklyLab". ${ownerLine}

I'll give you my data in whatever form I have it - an Excel/CSV spreadsheet, a bank or credit-card statement (PDF, CSV, or screenshots), photos or screenshots of a transaction list, or just a pasted table. Read ALL of it and turn EVERY transaction into ONE JSON file in EXACTLY this format:

{
  "version": 1,
  "currency": "${userCurrency}",
  "transactions": [
${exampleRow},
${exampleRow2}
  ]
}

FORMAT
- "date": YYYY-MM-DD. Convert any date format to this. If a date is ambiguous (e.g. 03/04/25), infer the order from the other rows and stay consistent.
- "amount": a plain positive number - no currency symbol, no thousands separators (e.g. 1234.56).
- "type": "expense" for money going out, "income" for money coming in.
- A refund, cashback or money returned on a card: keep "type":"expense" but make "amount" NEGATIVE.
- File "currency": "${userCurrency}" (my home currency) - the default for every row. Most statements are entirely in ${userCurrency}, so you leave it as is.
- Per-row "currency": add this to a row ONLY when it's in a DIFFERENT currency (e.g. a foreign purchase). Put the amount exactly as shown in that currency plus its ISO code - do NOT convert it; TracklyLab does the conversion.
- "description": a short, readable label. Clean up cryptic statement text (e.g. "SQ *BLUE BOTTLE 1234" → "Blue Bottle").
${sourceRule}

CATEGORISING - the important part
Every transaction MUST use exactly ONE of MY categories listed below (matched by name). Never invent, rename, translate, or leave the category blank.
- If my data already has categories, map each one to the CLOSEST of my categories.
- If it uses broad or bank-style categories (e.g. "Groceries", "Bills", "Shopping"), map those to the closest of my categories too.
- If it has NO category, work it out from the merchant / description (e.g. "Uber" → Transport, "Netflix" → Subscriptions, "Tesco" → Groceries).
${fallbackLine}
- "subcategory": optional - use one of that category's EXISTING subcategories (listed below) whenever one fits, even loosely. Only suggest a brand-new subcategory when truly nothing of mine fits: the app asks me to approve every new one before it is added, so inventing many creates work for me.

READING A STATEMENT
- Include real transactions only. Skip opening/closing balances, running balances, "balance brought forward" and pure summary lines.
- Bank fees, interest charged and card charges ARE expenses - include them.
- If debits and credits are in separate columns: debit = expense, credit = income.
- Remove obvious duplicates.

SPLIT EXPENSES (Splitwise and similar trip exports)
Some files have one column per person. Those columns hold each person's BALANCE for the row - what they paid MINUS their share - not what anything cost them. Convert each row to MY personal cost:
- My column negative: my cost is its absolute value (that was my share).
- My column zero: skip the row - I wasn't part of that expense. Also skip any row where my cost works out to 0 (I was fully paid back): a zero-amount transaction is clutter, not spending.
- My column positive: I paid for others too. My cost = (Cost − the sum of everyone's negative values taken as positive) ÷ (the number of people with positive values). The rest comes back to me, so it is NOT my spending.
- Skip settlement rows entirely: Category "Payment", descriptions like "X paid Y", and any "Total balance" summary line. That is money moving between people, not spending.
- Map their categories to mine as above (e.g. "Dining out" → my closest food category); use the trip context in descriptions where it helps ("Ferry a/r" stays "Ferry a/r").

MY EXPENSE categories (with their subcategories):
${expList}

MY INCOME categories (with their subcategories):
${incList}

My sources (id = name): ${srcList}

Output ONLY the JSON - no commentary, no code fences - and save it as a .json file.`;

    const copyPrompt = async () => {
      try {
        await navigator.clipboard.writeText(importPrompt);
        toast.success('Prompt copied', { duration: 1400 });
      } catch {
        toast.error('Copy failed - select the text and copy it manually');
      }
    };

    const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
      <div className="flex gap-3 items-start">
        <div
          className="flex-shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 22, height: 22, backgroundColor: '#007AFF', color: '#fff', fontSize: 12, fontWeight: 700 }}
        >
          {n}
        </div>
        <p style={{ color: '#3A3A3C', fontSize: 14, lineHeight: 1.5 }}>{children}</p>
      </div>
    );

    return (
      <div className="flex flex-col" style={{ height: SUBPAGE_HEIGHT, backgroundColor: '#F5F5F7' }}>
        <div style={{ backgroundColor: '#F5F5F7' }}>
          <div className="px-6 pb-4 pt-0">
            <div className="flex items-center justify-center relative">
              <button
                onClick={() => setShowImport(false)}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: '#007AFF' }} />
              </button>
              <h1 style={{ color: '#1C1C1E', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>Import data</h1>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-28">
          {/* Intro */}
          <div className="pt-2 pb-4">
            <h2 style={{ color: '#1C1C1E', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
              Bring in your existing data
            </h2>
            <p style={{ color: '#6B6B75', fontSize: 15, lineHeight: 1.5, marginTop: 8 }}>
              An AI assistant turns almost anything into TracklyLab transactions - no manual re-entry.
            </p>
          </div>

          {/* The two jobs this screen does. Not buttons - the flow below is
              the same for both - but the value has to be visible before the
              user reads a single step. */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2.5" style={{ backgroundColor: '#E7F6EC' }}>
                <FileSpreadsheet className="w-5 h-5" style={{ color: '#2E9E5B' }} strokeWidth={2} />
              </div>
              <div style={{ color: '#1C1C1E', fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>Banks &amp; spreadsheets</div>
              <p style={{ color: '#6B6B75', fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>
                Statements (PDF or CSV), Excel files - even screenshots of a transaction list.
              </p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2.5" style={{ backgroundColor: '#E1F0FF' }}>
                <Palmtree className="w-5 h-5" style={{ color: '#0A84FF' }} strokeWidth={2} />
              </div>
              <div style={{ color: '#1C1C1E', fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>Trips &amp; split expenses</div>
              <p style={{ color: '#6B6B75', fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>
                A Splitwise trip export lands as your share only - settlements are skipped.
              </p>
            </div>
          </div>

          {/* Steps */}
          <div className="bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-4">
            <Step n={1}>
              Open any AI assistant (ChatGPT, Claude, Gemini…). Paste the prompt below and attach your file -
              a spreadsheet, a bank/card statement (PDF or CSV), a Splitwise trip export, screenshots, or a
              pasted table. Split expenses come in as your share only - settlements between people are skipped.
            </Step>
            <Step n={2}>
              It returns a <span style={{ fontWeight: 600 }}>.json</span> file already matched to your categories
              and sources. Save it to your phone.
            </Step>
            <Step n={3}>
              Come back here, tap <span style={{ fontWeight: 600 }}>Choose file</span>, and pick it. That's it.
            </Step>
          </div>

          {/* Prompt */}
          <div className="flex items-center justify-between mt-7 mb-2">
            <p style={{ color: '#8E8E93', fontSize: 13, fontWeight: 500 }}>PROMPT FOR YOUR AI ASSISTANT</p>
            <button
              onClick={copyPrompt}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full active:scale-95 transition-transform"
              style={{ backgroundColor: '#007AFF' }}
            >
              <Copy className="w-3.5 h-3.5" style={{ color: '#fff' }} strokeWidth={2.5} />
              <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>Copy</span>
            </button>
          </div>
          <div style={{ backgroundColor: '#1C1C1E', borderRadius: 14, padding: 14, maxHeight: 240, overflowY: 'auto' }}>
            <pre
              style={{
                color: '#E5E5EA',
                fontSize: 11.5,
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                margin: 0,
              }}
            >
              {importPrompt}
            </pre>
          </div>
          <p style={{ color: '#A5A5AD', fontSize: 12, lineHeight: 1.5, marginTop: 10 }}>
            The prompt already lists <span style={{ fontWeight: 600 }}>your</span> current categories, subcategories
            and sources, so the file lands ready to import.
          </p>

          {/* Upload */}
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportFile}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => importInputRef.current?.click()}
            className="w-full mt-7 py-4 rounded-2xl font-medium text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            style={{ backgroundColor: '#1C1C1E', color: '#fff', boxShadow: '0 6px 18px rgba(28,28,30,0.20)' }}
          >
            <Upload className="w-5 h-5" strokeWidth={2} />
            Choose file
          </button>
          <p style={{ color: '#A5A5AD', fontSize: 12, lineHeight: 1.5, marginTop: 10, textAlign: 'center' }}>
            Imported transactions are added to your current data. Choosing a TracklyLab
            backup file (from Export) restores it instead.
          </p>
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

  // Show Contacts subpage — a form that sends a message straight from the app.
  if (showSupport) {
    return (
      <div className="flex flex-col" style={{ height: SUBPAGE_HEIGHT, backgroundColor: '#F5F5F7' }}>
        <div style={{ backgroundColor: '#F5F5F7' }}>
          <div className="px-6 pb-4 pt-0">
            <div className="flex items-center justify-center relative">
              <button
                onClick={closeSupport}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: '#007AFF' }} />
              </button>
              <h1 style={{ color: '#1C1C1E', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>Contacts</h1>
            </div>
          </div>
        </div>

        {supportSent ? (
          // Success confirmation
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center" style={{ marginTop: -40 }}>
            <CheckCircle2 className="w-16 h-16 mb-4" style={{ color: '#30D158' }} strokeWidth={1.75} />
            <h2 style={{ color: '#1C1C1E', fontSize: 22, fontWeight: 700 }}>Message sent</h2>
            <p style={{ color: '#6B6B75', fontSize: 15, lineHeight: 1.5, marginTop: 8, maxWidth: 300 }}>
              Thanks! We've got your message and will reply to{' '}
              <span style={{ color: '#1C1C1E', fontWeight: 500 }}>{supportEmail}</span> by email.
            </p>
            <button
              onClick={closeSupport}
              className="mt-8 px-8 py-3 rounded-xl font-medium text-base active:scale-[0.98] transition-transform"
              style={{ backgroundColor: '#007AFF', color: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,122,255,0.25)' }}
            >
              Done
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 pb-28">
            <div className="pt-2 pb-5">
              <h2 style={{ color: '#1C1C1E', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
                What's on your mind?
              </h2>
              <p style={{ color: '#6B6B75', fontSize: 15, lineHeight: 1.5, marginTop: 8 }}>
                An idea, a question, something broken - write to us and we'll reply by email.
              </p>
            </div>

            <p style={{ color: '#8E8E93', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>YOUR EMAIL</p>
            <input
              type="email"
              inputMode="email"
              autoCapitalize="off"
              autoCorrect="off"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3.5 rounded-2xl bg-white shadow-sm outline-none focus:ring-2 focus:ring-blue-500"
              style={{ fontSize: 16, color: '#1C1C1E' }}
            />
            <p style={{ color: '#B0B0B5', fontSize: 12, marginTop: 6, marginBottom: 16 }}>So we can reply to you.</p>

            <p style={{ color: '#8E8E93', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>YOUR MESSAGE</p>
            <textarea
              value={supportMessage}
              onChange={(e) => setSupportMessage(e.target.value)}
              placeholder="Tell us anything…"
              rows={6}
              // 16px keeps iOS from auto-zooming on focus
              className="w-full p-4 rounded-2xl bg-white shadow-sm outline-none resize-none focus:ring-2 focus:ring-blue-500"
              style={{ fontSize: 16, color: '#1C1C1E', lineHeight: 1.5 }}
            />

            <button
              onClick={submitSupport}
              disabled={!canSendSupport || sendingSupport}
              className="w-full mt-4 py-4 rounded-xl font-medium text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40"
              style={{ backgroundColor: '#007AFF', color: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,122,255,0.25)' }}
            >
              <Mail className="w-4 h-4" /> {sendingSupport ? 'Sending…' : 'Send message'}
            </button>

            <p className="text-center mt-4" style={{ color: '#8E8E93', fontSize: 13, lineHeight: 1.5 }}>
              Or email us directly at{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#007AFF', fontWeight: 500 }}>{SUPPORT_EMAIL}</a>
            </p>
          </div>
        )}
      </div>
    );
  }

  // Show Settings list
  return (
    // No min-h-screen here: the page ends just below the signature. The small
    // negative margin trims the parent scroll area's nav padding for this tab
    // only (other tabs keep it), so the signature sits snug above the nav bar.
    <div style={{ backgroundColor: '#F5F5F7', marginBottom: -16 }}>
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
                <Cloud className="w-5 h-5" style={{ color: syncMeta.color }} strokeWidth={2} />
                <div className="flex-1 min-w-0">
                  <div style={{ color: '#1C1C1E', fontSize: '16px' }}>{syncMeta.label}</div>
                  {userEmail && <div className="truncate" style={{ color: '#8E8E93', fontSize: '13px' }}>{userEmail}</div>}
                </div>
              </div>
              {/* Deleting the account lives with "Erase all data" at the bottom,
                  so the two destructive options can be compared side by side. */}
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
            onClick={() => {
              setEditedName(userName);
              setEditedBudget(monthlyBudget ? String(monthlyBudget) : '');
              setShowNameEditor(true);
            }}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid #F2F2F7' }}
          >
            {userAvatar && !avatarBroken ? (
              <img
                src={userAvatar}
                alt="Profile"
                referrerPolicy="no-referrer"
                onError={() => setAvatarBroken(true)}
                className="w-7 h-7 -ml-1 rounded-full flex-shrink-0 object-cover"
              />
            ) : userName ? (
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
              {CURRENCIES[userCurrency]?.flag} {userCurrency}
            </span>
            <ChevronRight className="w-5 h-5" style={{ color: '#C7C7CC' }} />
          </button>

          <button
            onClick={openSupport}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid #F2F2F7' }}
          >
            <LifeBuoy className="w-5 h-5" style={{ color: '#8E8E93' }} strokeWidth={2} />
            <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '16px' }}>Contacts</span>
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
            <button
              onClick={() => setShowImport(true)}
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
              style={{ borderBottom: '1px solid #F2F2F7' }}
            >
              <Upload className="w-5 h-5" style={{ color: '#8E8E93' }} strokeWidth={2} />
              <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '16px' }}>Import data</span>
              <ChevronRight className="w-5 h-5" style={{ color: '#C7C7CC' }} />
            </button>
          )}
          {onExportData && (
            <button
              onClick={onExportData}
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
              style={{ borderBottom: '1px solid #F2F2F7' }}
            >
              <Download className="w-5 h-5" style={{ color: '#8E8E93' }} strokeWidth={2} />
              <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '16px' }}>Export backup</span>
              <span style={{ color: '#8E8E93', fontSize: '13px' }}>Full app data · JSON</span>
            </button>
          )}
          {onExportCsv && (
            <button
              onClick={onExportCsv}
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
              style={{ borderBottom: '1px solid #F2F2F7' }}
            >
              <FileSpreadsheet className="w-5 h-5" style={{ color: '#8E8E93' }} strokeWidth={2} />
              <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '16px' }}>Export CSV</span>
              <span style={{ color: '#8E8E93', fontSize: '13px' }}>Transactions only</span>
            </button>
          )}
          <button
            onClick={() => openConfirm('demo')}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={hasDemoData && onEraseDemoData ? { borderBottom: '1px solid #F2F2F7' } : undefined}
          >
            <FlaskConical className="w-5 h-5" style={{ color: '#8E8E93' }} strokeWidth={2} />
            <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '16px' }}>Load demo data</span>
            <span style={{ color: '#8E8E93', fontSize: '13px' }}>For testing</span>
          </button>

          {hasDemoData && onEraseDemoData && (
            <button
              onClick={() => openConfirm('erase-demo')}
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            >
              <Trash2 className="w-5 h-5" style={{ color: '#8E8E93' }} strokeWidth={2} />
              <span className="flex-1 text-left" style={{ color: '#1C1C1E', fontSize: '16px' }}>Erase demo data</span>
              <span style={{ color: '#8E8E93', fontSize: '13px' }}>Removes samples</span>
            </button>
          )}
        </div>

        {/* Destructive actions, grouped so the difference between wiping your
            data and removing your whole account is obvious at a glance. */}
        <p className="mt-8 mb-2 px-1" style={{ color: '#8E8E93', fontSize: '13px' }}>
          Danger zone
        </p>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button
            onClick={() => openConfirm('erase')}
            className="w-full flex items-start gap-3 px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={onDeleteAccount && !isGuest ? { borderBottom: '1px solid #F2F2F7' } : undefined}
          >
            <Trash2 className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#EF4444' }} strokeWidth={2} />
            <div className="flex-1 text-left">
              <div style={{ color: '#EF4444', fontSize: '16px' }}>Erase all data</div>
              <div style={{ color: '#8E8E93', fontSize: '13px', marginTop: 2 }}>
                {isGuest
                  ? 'Deletes your transactions and settings'
                  : 'Starts fresh. You keep your account'}
              </div>
            </div>
          </button>

          {onDeleteAccount && !isGuest && (
            <button
              onClick={() => openConfirm('delete-account')}
              disabled={deletingAccount}
              className="w-full flex items-start gap-3 px-5 py-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors disabled:opacity-50"
            >
              <UserX className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#EF4444' }} strokeWidth={2} />
              <div className="flex-1 text-left">
                <div style={{ color: '#EF4444', fontSize: '16px' }}>Delete account</div>
                <div style={{ color: '#8E8E93', fontSize: '13px', marginTop: 2 }}>
                  Deletes your data and your account
                </div>
              </div>
            </button>
          )}
        </div>

        {/* Signature */}
        <div className="mt-8 mb-1 text-center">
          <p style={{ color: '#B0B0B5', fontSize: '12px', fontWeight: 500 }}>TracklyLab · v0.1</p>
          <p style={{ color: '#B0B0B5', fontSize: '12px', fontStyle: 'italic', marginTop: '2px' }}>
            Brought to you by Zambop
          </p>
        </div>

      </div>

      {confirmAction === 'demo' && (
        <ConfirmDialog
          title="Load demo data?"
          message="This adds sample transactions on top of your data so you can explore the app. Your own data stays - remove the samples anytime with 'Erase demo data'."
          confirmLabel="Load"
          variant="neutral"
          onConfirm={handleConfirm}
          onCancel={closeConfirm}
        />
      )}
      {confirmAction === 'erase-demo' && (
        <ConfirmDialog
          title="Erase demo data?"
          message="This removes the sample transactions that were loaded for testing. Your own transactions, categories and settings are kept."
          confirmLabel="Erase demo"
          variant="neutral"
          onConfirm={handleConfirm}
          onCancel={closeConfirm}
        />
      )}
      {confirmAction === 'erase' && (
        <ConfirmDialog
          title="Erase all data?"
          message={
            isGuest
              ? "This permanently deletes all your transactions, categories, sources and settings, and restarts the app from scratch."
              : "This deletes all your transactions, categories, sources and settings and starts the app fresh. Your account stays - sign back in anytime. To remove your account entirely, use Delete account instead."
          }
          confirmLabel="Erase"
          onConfirm={handleConfirm}
          onCancel={closeConfirm}
        />
      )}
      {confirmAction === 'restore' && (
        <ConfirmDialog
          title="Restore this backup?"
          message="This replaces all your current transactions, categories, sources and settings with the contents of the backup file."
          confirmLabel="Restore"
          onConfirm={handleConfirm}
          onCancel={() => { setPendingBackup(null); closeConfirm(); }}
        />
      )}
      {confirmAction === 'delete-account' && (
        <ConfirmDialog
          title="Delete your account?"
          message="This permanently deletes your TracklyLab account and all your data - transactions, categories, sources and settings - from our servers and this device. This can't be undone."
          confirmLabel="Delete account"
          onConfirm={handleDeleteAccountConfirm}
          onCancel={closeConfirm}
        />
      )}
    </div>
  );
}