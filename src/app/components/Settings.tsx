import type { LucideIcon } from 'lucide-react';
import { ChevronRight, ChevronLeft, UserCircle, Wallet, HelpCircle, ShieldCheck, ScrollText, Layers, FlaskConical, Trash2, Landmark, Cloud, LogOut, Upload, Copy, Download, FileSpreadsheet, Palmtree, UserX, Mail, LifeBuoy, CheckCircle2, Globe, CalendarClock, Sparkles, Palette, Sun, Moon, SunMoon, Split } from 'lucide-react';
import { sendSupportMessage, supportLimitReached } from '../lib/support';
import { switchGlow } from './categoryColors';

// Where messages from Settings > Contacts go. Easy to swap when the domain changes.
const SUPPORT_EMAIL = 'support@tracklylab.com';
const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

import { useEffect, useRef, useState } from 'react';
import { SUBPAGE_STYLE, DOCK_CLEARANCE } from './subpageLayout';
import { loadThemeMode, setThemeMode, type ThemeMode } from '../lib/themeMode';
import { toast } from 'sonner';
import { Categories } from './Categories';
import { ScheduledManager, type ScheduleDraft } from './ScheduledManager';
import { upcomingSchedules } from '../lib/recurrence';
import type { RecurringRule } from '../types';
import { SourcesManager } from './SourcesManager';
import { TracklyLogo } from './TracklyLogo';
import { ConfirmDialog } from './ConfirmDialog';
import { CURRENCIES, MAIN_CURRENCY_CODES } from '../utils/currency';
import { CurrencySearchList } from './CurrencySearchList';
import { LegalScreen } from './LegalScreen';
import { PRIVACY_POLICY, TERMS_OF_SERVICE, type LegalDoc } from '../lib/legalContent';
import type { Source } from '../types';
import type { ImportPayload } from '../lib/importData';
import { t, type Language as AppLanguage } from '../i18n';
import { CATCHALL_RE } from '../lib/categoryOps';
import { dateLocale, daysShort, getLanguage } from '../i18n/store';
import { isBackupFile } from '../lib/backup';

// One row of the Profile card with an iOS-style switch. Budget and insights
// share it, so the two toggles cannot drift apart visually.
function SwitchRow({ label, on, divider, onToggle }: {
  label: string; on: boolean; divider?: boolean; onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      className="w-full flex items-center gap-3 px-4"
      style={{ height: 52, borderBottom: divider ? '1px solid var(--bg-inset)' : 'none' }}
    >
      <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: 15 }}>{label}</span>
      <span
        className="relative flex-shrink-0 rounded-full transition-colors"
        style={{ width: 46, height: 28, backgroundColor: on ? '#4F74F3' : 'var(--bg-off)' }}
      >
        <span
          className="absolute rounded-full"
          style={{
            top: 3, left: 3, width: 22, height: 22, backgroundColor: 'var(--bg-card)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            transform: on ? 'translateX(18px)' : 'translateX(0)',
            transition: 'transform 200ms cubic-bezier(0.32, 0.72, 0, 1)',
          }}
        />
      </span>
    </button>
  );
}


// The languages the app ships in. The row leads with the ENDONYM - someone
// looking for their language scans for its own name, not its English one - and
// carries the name in the current UI language underneath, which is only worth
// a line when the two actually differ ("Italiano / Italian", but not
// "English / English").
const LANGUAGE_OPTIONS: { code: AppLanguage; flag: string; native: string }[] = [
  { code: 'en', flag: '🇬🇧', native: 'English' },
  { code: 'it', flag: '🇮🇹', native: 'Italiano' },
];

// Settings rows used sixteen identical grey glyphs, so the one screen people
// open to change something was the one screen with nothing to aim at - while
// Trend's category list, three taps away, already used tinted tiles and is the
// best-looking list in the app. Same formula here: a soft fill with the glyph
// saturated on top, one hue per destination so the eye can learn a position.
//
// The hue means "which setting", nothing more. The only one carrying real
// meaning is the red on Erase all data, which matches the destructive styling
// that row already had.
const TILE = {
  profile:  { bg: '#EFEFF4', fg: '#3A3A3C' },
  language: { bg: '#E8F1FE', fg: '#2F6FE4' },
  category: { bg: '#F3EAFE', fg: '#8B5CF6' },
  source:   { bg: '#E6F7F1', fg: '#0E9F6E' },
  recurring:{ bg: 'var(--wash-accent)', fg: '#4F74F3' },
  currency: { bg: '#FFF4E5', fg: '#D97706' },
  contact:  { bg: '#FDECF3', fg: '#DB2777' },
  about:    { bg: '#EFEFF4', fg: '#6B7280' },
  import:   { bg: '#E6F6FC', fg: '#0891B2' },
  backup:   { bg: '#E9F7EE', fg: '#16A34A' },
  csv:      { bg: '#ECFDF5', fg: '#059669' },
  demo:     { bg: '#F5F0FE', fg: '#7C3AED' },
  danger:   { bg: '#FEECEC', fg: '#DC2626' },
  appearance:{ bg: '#EDEBFF', fg: '#5B54D6' },
  shared:   { bg: '#EEF1FE', fg: '#4F74F3' },
  neutral:  { bg: '#EFEFF4', fg: '#6B7280' },
} as const;

function RowIcon({ icon: Icon, tone }: { icon: LucideIcon; tone: { bg: string; fg: string } }) {
  return (
    <span
      className="settings-tile w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: tone.bg, color: tone.fg }}
    >
      <Icon className="w-[18px] h-[18px]" style={{ color: tone.fg }} strokeWidth={2.2} />
    </span>
  );
}

interface SettingsProps {
  categories: any[];
  incomeCategories: any[];
  // First day of the week for day-of-week views: 1 Monday, 0 Sunday, 6 Saturday
  weekStartsOn?: number;
  onSetWeekStartsOn?: (day: number) => void;
  language?: AppLanguage;
  onSetLanguage?: (lang: AppLanguage) => void;
  // Upcoming recurring transactions. The rules are the source of truth; this
  // screen only ever projects them forward.
  recurringRules: RecurringRule[];
  /** The ledger, for the price-change chips on the Recurring screen. */
  transactions: any[];
  // Shared expenses. household === null means off, and turning it off must
  // leave every other screen exactly as it was.
  household?: import('../types').Household | null;
  partner?: import('../types').Person | null;
  onEnableShared?: (name: string) => void;
  onUpdateHousehold?: (patch: Partial<import('../types').Household>) => void;
  onDisableShared?: () => void;
  onCreateSchedule: (draft: ScheduleDraft) => void;
  onUpdateSchedule: (ruleId: string, draft: ScheduleDraft) => void;
  onStopSchedule: (ruleId: string) => void;
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
  /** The Dashboard's month-review card. Absent/true = shown. */
  insightsEnabled?: boolean;
  onSetInsightsEnabled?: (on: boolean) => void;
  openScheduledOnMount?: boolean;
  onScheduledOpened?: () => void;
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
  weekStartsOn = 1,
  onSetWeekStartsOn,
  language = 'en',
  onSetLanguage,
  recurringRules,
  transactions,
  household = null,
  partner = null,
  onEnableShared,
  onUpdateHousehold,
  onDisableShared,
  onCreateSchedule,
  onUpdateSchedule,
  onStopSchedule,
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
  insightsEnabled = true,
  onSetInsightsEnabled,
  openScheduledOnMount,
  onScheduledOpened,
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
  const [showScheduled, setShowScheduled] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [categoryType, setCategoryType] = useState<'expense' | 'income'>('expense');
  const [showCurrencySelector, setShowCurrencySelector] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);
  const [showShared, setShowShared] = useState(false);
  const [sharedName, setSharedName] = useState('');
  const [confirmDisableShared, setConfirmDisableShared] = useState(false);
  const [showAllCurrencies, setShowAllCurrencies] = useState(false);
  const [showNameEditor, setShowNameEditor] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [supportMessage, setSupportMessage] = useState('');
  const [supportEmail, setSupportEmail] = useState(userEmail || '');
  const [sendingSupport, setSendingSupport] = useState(false);
  const [supportSent, setSupportSent] = useState(false);
  const [editedName, setEditedName] = useState(userName);
  const [editedBudget, setEditedBudget] = useState(monthlyBudget ? String(monthlyBudget) : '');
  // The budget is opt-in, like insights: the toggle says whether one exists at
  // all, and only then does an amount field appear. "Delete the number to turn
  // it off" was the old contract, and nothing on the screen said so.
  const [budgetOn, setBudgetOn] = useState(!!monthlyBudget);
  // Device-local, applies instantly like every switch on this card.
  const [themeMode, setThemeModeState] = useState<ThemeMode>(loadThemeMode);
  const [confirmAction, setConfirmAction] = useState<'demo' | 'erase' | 'erase-demo' | 'restore' | 'delete-account' | null>(null);
  const [pendingBackup, setPendingBackup] = useState<ImportPayload | null>(null);

  // Opening a Settings sub-screen (Categories, Sources, Currency, About,
  // Import, Profile) should start it at the top rather than inheriting the
  // scroll position of the main Settings list.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [showCategories, showSources, showScheduled, showAbout, showImport, showCurrencySelector, showLanguage, showNameEditor, showSupport, legalDoc]);

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
        description: getLanguage() === 'it'
          ? `Puoi inviare fino a 10 messaggi al giorno - oppure scrivici direttamente a ${SUPPORT_EMAIL}.`
          : `You can send up to 10 messages a day - or email us directly at ${SUPPORT_EMAIL}.`,
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

  // Same pattern for the Dashboard's "Manage" link on the coming-up strip.
  useEffect(() => {
    if (openScheduledOnMount) {
      setShowScheduled(true);
      onScheduledOpened?.();
    }
  }, [openScheduledOnMount, onScheduledOpened]);

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

  // The amount only matters while the toggle is on - and then it must be a
  // real number, or Save stays disabled. Without that, "on with an empty
  // field" would save as no budget while the switch said otherwise.
  const parsedBudget = (() => {
    const raw = editedBudget.trim().replace(',', '.');
    const n = raw === '' ? NaN : parseFloat(raw);
    return isFinite(n) && n > 0 ? n : undefined;
  })();
  const profileSaveable = !!editedName.trim() && (!budgetOn || parsedBudget !== undefined);

  const handleNameSave = () => {
    if (!profileSaveable) return;
    const name = editedName.trim();
    const budget = budgetOn ? parsedBudget : undefined;
    const nameMoved = name !== userName;
    const budgetMoved = budget !== monthlyBudget;
    onUserNameChange(name);
    // Only a real move reaches the app: the handler up there also decides the
    // Dashboard's budget nudge, and a name-only save must not touch a flag
    // that is persisted and synced.
    if (budgetMoved) onMonthlyBudgetChange?.(budget);
    // Say what actually changed. This screen saves two fields and sits beside
    // two more that apply on the spot, so a fixed "Name updated" was wrong
    // more often than right - it fired for a budget edit, and for a Save
    // pressed after only flipping the insights switch.
    if (nameMoved && budgetMoved) toast.success(t('toast.profileUpdated'), { duration: 1400 });
    else if (nameMoved) toast.success(t('toast.nameUpdated'), { duration: 1400 });
    else if (budgetMoved) toast.success(t('toast.budgetUpdated'), { duration: 1400 });
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
    return new Date(ts).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });
  };
  const syncMeta =
    syncStatus === 'pending'
      ? { label: 'Syncing…', color: 'var(--ink-2)' }
      : syncStatus === 'offline'
        ? { label: 'Offline - will sync when back online', color: '#FF9F0A' }
        : syncStatus === 'error'
          ? { label: "Sync issue - retrying automatically", color: '#FF3B30' }
          : { label: lastSyncedAt ? `Synced · ${relTime(lastSyncedAt)}` : 'Synced', color: '#30D158' };

  // Shared expenses setup. Setup ONLY - the balance and the household view
  // live on the Dashboard behind the avatar switcher; this screen holds what
  // you configure once: who, the default split, which categories always
  // share, whether a balance is kept, and the way out.
  if (showShared) {
    const sharedCats: string[] = household?.sharedCategoryIds ?? [];
    const toggleCat = (id: string) => {
      if (!household || !onUpdateHousehold) return;
      onUpdateHousehold({
        sharedCategoryIds: sharedCats.includes(id)
          ? sharedCats.filter((c) => c !== id)
          : [...sharedCats, id],
      });
    };
    return (
      <div className="flex flex-col" style={SUBPAGE_STYLE}>
        <div style={{ backgroundColor: 'var(--bg-page)' }}>
          <div className="px-6 pb-4 pt-0">
            <div className="flex items-center justify-center relative">
              <button
                onClick={() => setShowShared(false)}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: '#4F74F3' }} />
              </button>
              <h1 style={{ color: 'var(--ink)', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>{t('set.shared')}</h1>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: DOCK_CLEARANCE }}>
          {!household ? (
            <div className="px-6">
              <div className="rounded-2xl shadow-sm px-5 py-5" style={{ backgroundColor: 'var(--bg-card)' }}>
                <h2 style={{ color: 'var(--ink)', fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
                  {t('shared.set.introTitle')}
                </h2>
                <p style={{ color: 'var(--ink-2)', fontSize: 13.5, lineHeight: 1.5, marginBottom: 18 }}>
                  {t('shared.set.introBody')}
                </p>
                <label className="block" style={{ color: 'var(--ink-2)', fontSize: 13, marginBottom: 6 }}>
                  {t('shared.set.nameLabel')}
                </label>
                <input
                  type="text"
                  value={sharedName}
                  onChange={(e) => setSharedName(e.target.value)}
                  placeholder={t('shared.set.namePlaceholder')}
                  className="w-full rounded-xl px-4 py-3 outline-none"
                  style={{ backgroundColor: 'var(--bg-field)', color: 'var(--ink)', fontSize: 16 }}
                />
                <button
                  onClick={() => {
                    if (!sharedName.trim()) return;
                    onEnableShared?.(sharedName);
                    setSharedName('');
                  }}
                  disabled={!sharedName.trim()}
                  className="w-full mt-4 py-3.5 rounded-xl font-medium active:scale-[0.98] transition-transform"
                  style={{
                    backgroundColor: sharedName.trim() ? '#4F74F3' : 'var(--bg-inset)',
                    color: sharedName.trim() ? '#FFFFFF' : 'var(--ink-2)',
                    fontSize: 15,
                  }}
                >
                  {t('shared.set.enable')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="px-6">
                <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--bg-card)' }}>
                  <div className="flex items-center gap-3 px-4" style={{ height: 52, borderBottom: '1px solid var(--bg-inset)' }}>
                    <span className="flex-1" style={{ color: 'var(--ink)', fontSize: 15 }}>{t('shared.set.partner')}</span>
                    <span className="flex items-center gap-2" style={{ color: 'var(--ink-2)', fontSize: 14 }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 22, height: 22, borderRadius: 999, background: partner?.color ?? '#7C5CFF',
                          color: '#FFFFFF', fontSize: 10, fontWeight: 700,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {(partner?.name?.[0] ?? '?').toUpperCase()}
                      </span>
                      {partner?.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 px-4" style={{ height: 52, borderBottom: '1px solid var(--bg-inset)' }}>
                    <span className="flex-1" style={{ color: 'var(--ink)', fontSize: 15 }}>{t('shared.set.split')}</span>
                    <span style={{ color: 'var(--ink-2)', fontSize: 14 }}>{t('shared.set.splitValue')}</span>
                  </div>
                  <SwitchRow
                    label={t('shared.set.trackBalance')}
                    on={household.trackBalance}
                    onToggle={() => onUpdateHousehold?.({ trackBalance: !household.trackBalance })}
                  />
                </div>
                <p className="px-1 mt-2" style={{ color: 'var(--faint)', fontSize: 12, lineHeight: 1.45 }}>
                  {t('shared.set.trackBalanceDesc')}
                </p>
              </div>

              <div className="px-6 mt-5">
                <p className="px-1 mb-2" style={{ color: 'var(--ink-2)', fontSize: 13, fontWeight: 600 }}>
                  {t('shared.set.always')}
                </p>
                <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--bg-card)' }}>
                  {categories.map((cat: any, i: number) => (
                    <SwitchRow
                      key={cat.id}
                      label={cat.name}
                      on={sharedCats.includes(cat.id)}
                      divider={i < categories.length - 1}
                      onToggle={() => toggleCat(cat.id)}
                    />
                  ))}
                </div>
                <p className="px-1 mt-2" style={{ color: 'var(--faint)', fontSize: 12, lineHeight: 1.45 }}>
                  {t('shared.set.alwaysDesc')}
                </p>
              </div>

              <div className="px-6 mt-5">
                <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--bg-card)' }}>
                  <button
                    onClick={() => setConfirmDisableShared(true)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-neutral-100 transition-colors"
                  >
                    <span className="flex-1 text-left" style={{ color: 'var(--tone-danger)', fontSize: 15, fontWeight: 500 }}>
                      {t('shared.set.disconnect')}
                    </span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {confirmDisableShared && (
          <ConfirmDialog
            title={t('shared.set.disconnectTitle')}
            message={t('shared.set.disconnectBody')}
            confirmLabel={t('shared.set.disconnectConfirm')}
            onCancel={() => setConfirmDisableShared(false)}
            onConfirm={() => {
              onDisableShared?.();
              setConfirmDisableShared(false);
              setShowShared(false);
            }}
          />
        )}
      </div>
    );
  }

  // Appearance lives beside Language and Currency, not inside Profile: those
  // three are all "how the app presents itself", where Profile is who you are
  // and what your money rules are. Every OS and every app of this shape puts
  // the theme switch on that shelf, which is where people look for it.
  if (showAppearance) {
    const OPTIONS = [
      { mode: 'system' as const, icon: SunMoon, label: t('theme.system'), hint: t('theme.systemHint') },
      { mode: 'light' as const,  icon: Sun,     label: t('theme.light'),  hint: t('theme.lightHint') },
      { mode: 'dark' as const,   icon: Moon,    label: t('theme.dark'),   hint: t('theme.darkHint') },
    ];
    return (
      <div className="flex flex-col" style={SUBPAGE_STYLE}>
        <div style={{ backgroundColor: 'var(--bg-page)' }}>
          <div className="px-6 pb-4 pt-0">
            <div className="flex items-center justify-center relative">
              <button
                onClick={() => setShowAppearance(false)}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: '#4F74F3' }} />
              </button>
              <h1 style={{ color: 'var(--ink)', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>{t('set.theme')}</h1>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: DOCK_CLEARANCE }}>
          <div className="px-6 pb-6">
            <p style={{ color: 'var(--ink-2)', fontSize: '13px' }}>{t('set.themeHint')}</p>
          </div>
          <div className="px-6">
            <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--bg-card)' }}>
              {OPTIONS.map(({ mode, icon: Icon, label, hint }, index) => {
                const on = themeMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => { setThemeMode(mode); setThemeModeState(mode); }}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                    style={{ borderBottom: index < OPTIONS.length - 1 ? '1px solid var(--bg-inset)' : 'none' }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: on ? 'var(--wash-accent3)' : 'var(--bg-inset)' }}
                      >
                        <Icon className="w-4.5 h-4.5" style={{ color: on ? '#4F74F3' : 'var(--ink-2)' }} strokeWidth={2.2} />
                      </div>
                      <div className="flex flex-col items-start text-left">
                        <span className="font-medium" style={{ color: on ? '#4F74F3' : 'var(--ink)', fontSize: '15px' }}>{label}</span>
                        <span style={{ color: 'var(--ink-2)', fontSize: 13 }}>{hint}</span>
                      </div>
                    </div>
                    {on && (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#4F74F3' }}>
                        <svg width="10" height="8" viewBox="0 0 12 10" fill="none">
                          <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="px-1 mt-4" style={{ color: 'var(--faint)', fontSize: 12, lineHeight: 1.45 }}>
              {t('set.themeNote')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show Language subpage — same shape as the currency picker: a list you
  // choose from, not a control sitting open on the root menu.
  if (showLanguage) {
    return (
      <div className="flex flex-col" style={SUBPAGE_STYLE}>
        <div style={{ backgroundColor: 'var(--bg-page)' }}>
          <div className="px-6 pb-4 pt-0">
            <div className="flex items-center justify-center relative">
              <button
                onClick={() => setShowLanguage(false)}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: '#4F74F3' }} />
              </button>
              <h1 style={{ color: 'var(--ink)', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>{t('settings.language')}</h1>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: DOCK_CLEARANCE }}>
          <div className="px-6 pb-6">
            <p style={{ color: 'var(--ink-2)', fontSize: '13px' }}>{t('set.languageHint')}</p>
          </div>

          <div className="px-6">
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {LANGUAGE_OPTIONS.map(({ code, flag, native }, index) => {
                const inThisLanguage = t(code === 'it' ? 'lang.it' : 'lang.en');
                return (
                <button
                  key={code}
                  onClick={() => { if (code !== language) onSetLanguage?.(code); }}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                  style={{ borderBottom: index < LANGUAGE_OPTIONS.length - 1 ? '1px solid var(--bg-inset)' : 'none' }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: language === code ? 'var(--wash-accent3)' : 'var(--bg-inset)', fontSize: '19px' }}
                    >
                      {flag}
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="font-medium" style={{ color: language === code ? '#4F74F3' : 'var(--ink)', fontSize: '15px' }}>
                        {native}
                      </span>
                      {inThisLanguage !== native && (
                        <span className="text-neutral-500 text-[13px]">{inThisLanguage}</span>
                      )}
                    </div>
                  </div>
                  {language === code && (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: '#4F74F3' }}>
                      <svg width="10" height="8" viewBox="0 0 12 10" fill="none">
                        <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}
                </button>
                );
              })}
            </div>

            {/* Names the user already owns stay put on purpose: categories,
                subcategories and sources are their data, not UI copy. */}
            <p className="px-1 mt-4" style={{ color: 'var(--faint)', fontSize: 12, lineHeight: 1.45 }}>
              {t('set.languageNote')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show Currency Selector
  if (showCurrencySelector) {
    return (
      <div className="flex flex-col" style={SUBPAGE_STYLE}>
        {/* Fixed Header Section */}
        <div style={{ backgroundColor: 'var(--bg-page)' }}>
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
                <ChevronLeft size={24} style={{ color: '#4F74F3' }} />
              </button>
              <h1 style={{ color: 'var(--ink)', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>{t('set.currencyTitle')}</h1>
            </div>
          </div>
        </div>

        {/* Scrollable Content Section */}
        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: DOCK_CLEARANCE }}>
          <div className="px-6 pb-6">
            <p style={{ color: 'var(--ink-2)', fontSize: '13px' }}>
              {t('set.currencyHint')}
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
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                  style={{
                    borderBottom: index < currencies.length - 1 ? '1px solid var(--bg-inset)' : 'none'
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center"
                      style={{
                        backgroundColor: userCurrency === currency.code ? 'var(--wash-accent3)' : 'var(--bg-inset)',
                        fontSize: '19px'
                      }}
                    >
                      {currency.flag}
                    </div>
                    <div className="flex flex-col items-start">
                      <div className="flex items-baseline gap-2">
                        <span
                          className="font-medium"
                          style={{
                            color: userCurrency === currency.code ? '#4F74F3' : 'var(--ink)',
                            fontSize: '15px'
                          }}
                        >
                          {currency.code}
                        </span>
                      </div>
                      <span className="text-neutral-500 text-[13px]">{currency.name}</span>
                    </div>
                  </div>
                  {userCurrency === currency.code && (
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: '#4F74F3' }}
                    >
                      <svg width="10" height="8" viewBox="0 0 12 10" fill="none">
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
              <span className="font-medium text-neutral-700" style={{ fontSize: '15px' }}>Others</span>
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
      <div className="flex flex-col" style={SUBPAGE_STYLE}>
        {/* Header */}
        <div style={{ backgroundColor: 'var(--bg-page)' }}>
          <div className="px-6 pb-3 pt-0">
            <div className="flex items-center justify-center relative">
              <button
                onClick={() => {
                  setShowNameEditor(false);
                  setEditedName(userName);
                }}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: '#4F74F3' }} />
              </button>
              <h1 style={{ color: 'var(--ink)', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>{t('set.profileTitle')}</h1>
            </div>
          </div>
        </div>

        <div className="px-6 pb-4">
          <p style={{ color: 'var(--ink-2)', fontSize: '13px', lineHeight: 1.45 }}>
            {t('set.profileSub')}
          </p>
        </div>

        {/* The page is four settings, so it is four rows of one card rather
            than four labelled blocks each with its own heading, input and
            footnote. That version ran 750px against 485px of room on a small
            phone, which put the Save button exactly on the fold - and every
            hint under every field was competing with the field above it.
            Grouping them puts the labels IN the rows, where they cost nothing,
            and leaves one explanatory line for the whole card. */}
        <div className="flex-1 overflow-y-auto px-6" style={{ paddingBottom: DOCK_CLEARANCE }}>
          <div
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: 'var(--bg-card)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
          >
            {/* Name */}
            <div className="flex items-center gap-3 px-4" style={{ height: 52, borderBottom: '1px solid var(--bg-inset)' }}>
              <span className="flex-shrink-0" style={{ color: 'var(--ink)', fontSize: 15 }}>{t('set.name')}</span>
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                className="flex-1 min-w-0 text-right bg-transparent outline-none"
                // 16px, not 15: below that iOS zooms the page on focus.
                style={{ fontSize: 16, color: 'var(--ink)', fontWeight: 500 }}
              />
            </div>

            {/* Monthly insights */}
            <SwitchRow
              label={t('set.insights')}
              on={insightsEnabled}
              divider
              onToggle={() => onSetInsightsEnabled?.(!insightsEnabled)}
            />
            {/* Monthly budget: opt-in, exactly like insights above. The
                toggle answers "do I want one at all"; only a yes opens the
                amount row. The old contract - delete the number to turn the
                bar off - was invisible: nothing said an empty field meant no. */}
            <SwitchRow
              label={t('set.monthlyBudget')}
              on={budgetOn}
              divider
              onToggle={() => {
                // Switches commit on the spot, exactly like insights below -
                // two identical controls in one card must not differ on
                // whether flipping them means anything. OFF needs no further
                // input, so it removes the budget right here; ON only opens
                // the amount row, and the budget exists once Save accepts a
                // number. Leaving without saving keeps it off, which is what
                // the reopened card will honestly show.
                if (budgetOn) {
                  setBudgetOn(false);
                  if (monthlyBudget !== undefined) {
                    onMonthlyBudgetChange?.(undefined);
                    toast.success(t('toast.budgetRemoved'), { duration: 1400 });
                  }
                } else {
                  setBudgetOn(true);
                }
              }}
            />
            {budgetOn && (
              <div className="flex items-center gap-3 px-4" style={{ height: 52, borderBottom: '1px solid var(--bg-inset)' }}>
                <span className="flex-shrink-0" style={{ color: 'var(--ink-2)', fontSize: 15 }}>{t('set.amount')}</span>
                <div className="flex-1 min-w-0 flex items-center justify-end gap-1">
                  <span style={{ color: 'var(--ink-2)', fontSize: 15 }}>{CURRENCIES[userCurrency]?.symbol ?? ''}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editedBudget}
                    onChange={(e) => {
                      const v = e.target.value.replace(',', '.');
                      if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setEditedBudget(v);
                    }}
                    // The field starts focused when the toggle opens it empty:
                    // the switch said yes, the number is the one thing missing.
                    autoFocus={!editedBudget}
                    placeholder="—"
                    className="w-24 text-right bg-transparent outline-none tabular-nums"
                    style={{ fontSize: 16, color: 'var(--ink)', fontWeight: 500 }}
                  />
                </div>
              </div>
            )}

            {/* Week start. Applies immediately, unlike the two fields above:
                it is a preference, not a value being typed. */}
            <div className="px-4 py-2.5">
              <div className="flex items-center gap-3">
                <span className="flex-shrink-0" style={{ color: 'var(--ink)', fontSize: 15 }}>{t('set.weekStartsOn')}</span>
                <div className="flex-1 flex p-0.5 rounded-lg" style={{ backgroundColor: 'var(--bg-inset)' }}>
                  {[1, 6, 0].map((day) => ({ day, label: daysShort()[day] })).map(({ day, label }) => (
                    <button
                      key={day}
                      onClick={() => onSetWeekStartsOn?.(day)}
                      className="flex-1 py-1.5 rounded-md text-[13px] transition-colors"
                      style={{
                        backgroundColor: weekStartsOn === day ? 'var(--bg-card)' : 'transparent',
                        color: weekStartsOn === day ? 'var(--ink)' : 'var(--ink-2)',
                        fontWeight: weekStartsOn === day ? 600 : 500,
                        boxShadow: weekStartsOn === day ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
                        WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

          </div>

          {/* One line for the card, instead of one under every field. */}
          <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 10, lineHeight: 1.45 }}>
            {t('set.profileHint')}
          </p>

          {/* In the flow, right after what it saves. Pinned to the bottom it
              sat alone under 300px of nothing on a tall phone; the card is
              short enough now that it lands on screen unscrolled anyway, and
              the padding below keeps it clear of the fold if it ever does. */}
          <button
            onClick={handleNameSave}
            disabled={!profileSaveable}
            className="w-full mt-5 py-3.5 rounded-xl font-medium text-base transition-all active:scale-[0.98]"
            style={{
              backgroundColor: !profileSaveable ? 'var(--line)' : '#4F74F3',
              color: '#FFFFFF',
              boxShadow: !profileSaveable ? 'none' : '0 2px 8px rgba(0, 122, 255, 0.25)',
              cursor: !profileSaveable ? 'not-allowed' : 'pointer'
            }}
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    );
  }

  // Show Categories subpage
  if (showCategories) {
    return (
      <div className="flex flex-col overflow-hidden" style={SUBPAGE_STYLE}>
        {/* Fixed Header Section */}
        <div className="flex-shrink-0" style={{ backgroundColor: 'var(--bg-page)' }}>
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
                <ChevronLeft size={24} style={{ color: '#4F74F3' }} />
              </button>
              <h1 style={{ color: 'var(--ink)', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>{t('set.categories')}</h1>
            </div>
          </div>

          {/* Toggle Switch */}
          <div className="px-6 pb-4">
            {/* The same sliding thumb as Dashboard, Trend, Activity and Add.
                This one was still the old dark filled bar - and, being
                hardcoded, the only Expense/Income control that never
                translated. */}
            <div className="relative flex p-1 rounded-full" style={{ backgroundColor: 'var(--bg-track)' }}>
              <div
                className="absolute rounded-full"
                style={{
                  top: 4, bottom: 4, left: 4, width: 'calc(50% - 4px)',
                  backgroundColor: 'var(--bg-card)',
                  boxShadow: switchGlow(categoryType),
                  transform: categoryType === 'income' ? 'translateX(100%)' : 'translateX(0)',
                  transition: 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)',
                }}
                aria-hidden="true"
              />
              <button
                onClick={() => setCategoryType('expense')}
                className="relative flex-1 py-1.5 text-sm font-medium transition-colors"
                style={{ color: categoryType === 'expense' ? 'var(--tone-expense)' : 'var(--ink-2)' }}
              >
                {t('seg.expenses')}
              </button>
              <button
                onClick={() => setCategoryType('income')}
                className="relative flex-1 py-1.5 text-sm font-medium transition-colors"
                style={{ color: categoryType === 'income' ? 'var(--tone-income)' : 'var(--ink-2)' }}
              >
                {t('seg.income')}
              </button>
            </div>
          </div>
        </div>
        
        {/* Scrollable Categories Section */}
        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: DOCK_CLEARANCE }}>
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
      <div className="flex flex-col" style={SUBPAGE_STYLE}>
        <div style={{ backgroundColor: 'var(--bg-page)' }}>
          <div className="px-6 pb-4 pt-0">
            <div className="flex items-center justify-center relative">
              <button
                onClick={() => setShowAbout(false)}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: '#4F74F3' }} />
              </button>
              <h1 style={{ color: 'var(--ink)', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>{t('set.about')}</h1>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: DOCK_CLEARANCE }}>
          {/* Brand */}
          <div className="flex flex-col items-center text-center px-6 pt-6 pb-8">
            <TracklyLogo size={80} className="mb-4" />
            <h2 style={{ color: 'var(--ink)', fontSize: '28px', fontWeight: 700, letterSpacing: '-0.03em' }}>TracklyLab</h2>
            <p style={{ color: '#4F74F3', fontSize: '14px', fontWeight: 600, marginTop: '4px', letterSpacing: '0.02em' }}>Your Expense Lens</p>
            <p style={{ color: 'var(--ink-2)', fontSize: '13px', marginTop: '6px' }}>
              {t('set.version', { v: __APP_VERSION__ })}
            </p>
            {/* Which BUILD this device is actually running. When two devices
                disagree, comparing this line answers "is one of them stale?"
                in five seconds. */}
            <p style={{ color: 'var(--ghost)', fontSize: '11px', marginTop: '2px' }}>Build {__BUILD_STAMP__}</p>
            <p style={{ color: 'var(--ink-3)', fontSize: '15px', marginTop: '12px', maxWidth: 300, lineHeight: 1.5 }}>
              {t('set.aboutTagline')}
            </p>
          </div>

          {/* Links */}
          <div className="px-6">
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <button
                onClick={() => setLegalDoc(PRIVACY_POLICY)}
                className="w-full flex items-center gap-3 px-4 py-2.5 active:bg-neutral-100 transition-colors"
                style={{ borderBottom: '1px solid var(--bg-inset)' }}
              >
                <RowIcon icon={ShieldCheck} tone={TILE.backup} />
                <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.privacy')}</span>
                <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
              </button>
              <button
                onClick={() => setLegalDoc(TERMS_OF_SERVICE)}
                className="w-full flex items-center gap-3 px-4 py-2.5 active:bg-neutral-100 transition-colors"
              >
                <RowIcon icon={ScrollText} tone={TILE.neutral} />
                <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.terms')}</span>
                <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
              </button>
            </div>
          </div>

          {/* Privacy note */}
          <div className="px-6 mt-4">
            <p style={{ color: 'var(--ink-2)', fontSize: '12px', lineHeight: 1.5, textAlign: 'center', maxWidth: 320, margin: '0 auto' }}>
              {t('set.analyticsNote')}
            </p>
          </div>

          {/* Signature */}
          <div className="mt-10 text-center px-6">
            <p style={{ color: 'var(--faint)', fontSize: '13px', fontStyle: 'italic' }}>{t('set.signature')}</p>
            <p style={{ color: 'var(--ghost)', fontSize: '12px', marginTop: '4px' }}>© {new Date().getFullYear()} TracklyLab</p>
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
    const IT_PROMPT = getLanguage() === 'it';
    const sourceRule = IT_PROMPT
      ? (hasSources
          ? `- "source": facoltativo. Usa uno dei miei id conto elencati sotto SOLO dove i dati dicono davvero da quale conto viene la transazione (una colonna, il nome di una carta, l'intestazione dell'estratto). Se il file non lo dice, OMETTI IL CAMPO: un conto indovinato è peggio di nessuno, perché sarebbe sbagliato su ogni singola riga.`
          : `- "source": ometti questo campo - non ho conti configurati.`)
      : hasSources
        ? `- "source": optional. Use one of my source ids listed below ONLY where the data actually says which account a transaction came from (a column, a card name, a statement header). If the file does not say, LEAVE THE FIELD OUT: a guessed account is worse than none, because it would be wrong on every single row.`
        : `- "source": leave this field out - I have no sources set up.`;
    // A second example showing a foreign-currency row, so mixed-currency
    // statements are handled. Pick any code that isn't the home one.
    const foreignEx = userCurrency === 'USD' ? 'EUR' : 'USD';
    const exampleRow2 =
      `    { "date": "2026-01-18", "amount": 30.00, "currency": "${foreignEx}", "type": "expense", "category": "${exampleCatName}", "description": "A purchase made abroad" }`;
    // If the user has a catch-all category ("Others"), name it as the fallback
    // so unmatched rows land there instead of a vague "closest" category.
    const catchAll: any = categories.find((c: any) =>
      CATCHALL_RE.test(String(c.name).trim()),
    );
    const fallbackLine = getLanguage() === 'it'
      ? (catchAll
          ? `- Se non c'è proprio corrispondenza, usa "${catchAll.name}" e metti il nome ORIGINALE della categoria in "subcategory" (es. "Dining out"), così posso risistemare dopo - non scartare mai la riga e non lasciare la categoria vuota.`
          : `- Se non c'è proprio corrispondenza, scegli la mia categoria generale più vicina e metti il nome originale della categoria in "subcategory" - non scartare mai la riga e non lasciarla vuota.`)
      : catchAll
        ? `- If nothing fits at all, use "${catchAll.name}" and put the ORIGINAL category name in "subcategory" (e.g. "Dining out") so I can re-sort later - never drop the row or leave the category blank.`
        : `- If nothing fits at all, pick my closest general category and put the original category name in "subcategory" - never drop the row or leave it blank.`;
    // The AI needs to know WHO the account owner is the moment a file has one
    // column per person (Splitwise trips): every rule below about "my column"
    // hangs on this line.
    const ownerLine = getLanguage() === 'it'
      ? (userName.trim()
          ? `Mi chiamo ${userName.trim()} - se un file ha una colonna per persona, la mia è quella che corrisponde a questo nome (può includere il cognome).`
          : `Se un file ha una colonna per persona, chiedimi quale colonna è la mia prima di convertire.`)
      : userName.trim()
        ? `My name is ${userName.trim()} - if a file has one column per person, mine is the one matching that name (it may include a surname).`
        : `If a file has one column per person, ask me which column is mine before converting.`;
    const importPrompt = getLanguage() === 'it' ? `Voglio importare il mio storico di spese ed entrate in un'app che si chiama "TracklyLab". ${ownerLine}

Ti darò i miei dati in qualunque forma li abbia - un foglio Excel/CSV, un estratto conto bancario o della carta (PDF, CSV o screenshot), foto o screenshot di una lista di transazioni, o una tabella incollata. Leggi TUTTO e trasforma OGNI transazione in UN file JSON ESATTAMENTE in questo formato:

{
  "version": 1,
  "currency": "${userCurrency}",
  "transactions": [
${exampleRow},
${exampleRow2}
  ]
}

PRIMA DI CONVERTIRE - chiedimi, non tirare a indovinare
- Se nei dati non c'è l'ANNO da nessuna parte (es. solo colonne "mese" e "giorno"), CHIEDIMI che anno coprono, e se ne coprono più di uno. Un anno sbagliato archivia in silenzio un intero blocco di transazioni nel posto sbagliato, e dopo niente nell'app sembrerà visibilmente rotto.
- Se una riga è un TOTALE mensile o settimanale invece di una singola transazione (es. un foglio stipendi con una riga al mese e nessun giorno), chiedimi in che giorno del mese datarla.
- Apri OGNI foglio, scheda e pagina di quello che ti do. Spesso le entrate stanno in una seconda scheda, e convertire solo la prima perde metà del quadro senza dirlo.

FORMATO
- "date": YYYY-MM-DD. Converti qualsiasi formato di data in questo. Se una data è ambigua (es. 03/04/25), deduci l'ordine dalle altre righe e resta coerente.
- "amount": un numero positivo semplice - niente simbolo di valuta, niente separatori delle migliaia, punto decimale (es. 1234.56).
- "type": "expense" per i soldi in uscita, "income" per i soldi in entrata.
- Un importo NEGATIVO in una lista di spese può essere due cose diverse, quindi leggi la descrizione prima di decidere:
  - soldi tornati indietro su un acquisto (rimborso, reso, cashback): tieni "type":"expense" e rendi "amount" NEGATIVO, così compensa quella categoria.
  - soldi davvero vinti o ricevuti, solo registrati nel foglio spese (una vincita, un rimborso spese, qualcosa di venduto): rendilo "type":"income" con importo POSITIVO e la mia categoria di entrata più vicina.
  Se una riga negativa è davvero ambigua, chiedimi invece di scegliere a caso.
- "currency" del file: "${userCurrency}" (la mia valuta principale) - il default per ogni riga. La maggior parte degli estratti è tutta in ${userCurrency}, quindi la lasci così.
- "currency" per riga: aggiungila a una riga SOLO quando è in una valuta DIVERSA (es. un acquisto all'estero). Metti l'importo esattamente come mostrato in quella valuta più il suo codice ISO - NON convertirlo; la conversione la fa TracklyLab.
- "description": un'etichetta breve e leggibile. Ripulisci il testo criptico degli estratti (es. "SQ *BLUE BOTTLE 1234" → "Blue Bottle").
${sourceRule}

CATEGORIZZARE - la parte importante
Ogni transazione DEVE usare esattamente UNA delle MIE categorie elencate sotto (abbinata per nome). Non inventare, rinominare, tradurre o lasciare la categoria vuota.
- Se i miei dati hanno già categorie, mappa ognuna sulla mia categoria più VICINA.
- Se usano categorie generiche o da banca (es. "Groceries", "Bills", "Shopping"), mappale comunque sulla mia più vicina.
- Se NON hanno categoria, deducila da esercente / descrizione (es. "Uber" → trasporti, "Netflix" → abbonamenti, "Esselunga" → spesa).
${fallbackLine}
- "subcategory": facoltativa - usa una delle sottocategorie ESISTENTI di quella categoria (elencate sotto) ogni volta che una ci sta, anche vagamente. Proponi una sottocategoria nuova solo quando davvero nessuna delle mie va bene: l'app mi chiede di approvare ogni nuova sottocategoria, quindi inventarne tante mi crea lavoro.

LEGGERE UN ESTRATTO CONTO
- Includi solo transazioni reali. Salta saldi iniziali/finali, saldi progressivi, "saldo riportato" e le righe di solo riepilogo.
- Commissioni bancarie, interessi addebitati e costi della carta SONO spese - includili.
- Se dare e avere sono in colonne separate: dare = spesa, avere = entrata.
- Rimuovi i duplicati evidenti.

SPESE CONDIVISE (Splitwise ed export simili)
Alcuni file hanno una colonna per persona. Quelle colonne contengono il SALDO di ciascuno per la riga - quanto ha pagato MENO la sua quota - non quanto gli è costata. Converti ogni riga nel MIO costo personale:
- La mia colonna negativa: il mio costo è il suo valore assoluto (era la mia quota).
- La mia colonna a zero: salta la riga - non facevo parte di quella spesa. Salta anche ogni riga dove il mio costo risulta 0 (mi hanno rimborsato del tutto): una transazione a zero è rumore, non spesa.
- La mia colonna positiva: ho pagato anche per altri. Il mio costo = (Costo − la somma dei valori negativi degli altri presi in positivo) ÷ (il numero di persone con valori positivi). Il resto mi torna indietro, quindi NON è mia spesa.
- Salta del tutto le righe di pareggio: categoria "Payment", descrizioni tipo "X paid Y" e ogni riga di riepilogo "Total balance". Sono soldi che girano tra persone, non spese.
- Mappa le loro categorie sulle mie come sopra (es. "Dining out" → la mia categoria di cibo più vicina); usa il contesto del viaggio nelle descrizioni dove aiuta ("Ferry a/r" resta "Ferry a/r").

Le MIE categorie di SPESA (con le loro sottocategorie):
${expList}

Le MIE categorie di ENTRATA (con le loro sottocategorie):
${incList}

I miei conti (id = nome): ${srcList}

Restituisci SOLO il JSON - senza commenti, senza blocchi di codice - e salvalo come file .json.` : `I want to import my expense & income history into an app called "TracklyLab". ${ownerLine}

I'll give you my data in whatever form I have it - an Excel/CSV spreadsheet, a bank or credit-card statement (PDF, CSV, or screenshots), photos or screenshots of a transaction list, or just a pasted table. Read ALL of it and turn EVERY transaction into ONE JSON file in EXACTLY this format:

{
  "version": 1,
  "currency": "${userCurrency}",
  "transactions": [
${exampleRow},
${exampleRow2}
  ]
}

BEFORE YOU CONVERT - ask me, do not guess
- If the data has no YEAR anywhere (e.g. only "month" and "day" columns), ASK me which year it covers, and whether it spans more than one. A wrong year silently files a whole set of transactions in the wrong place, and nothing in the app will look obviously broken afterwards.
- If a row is a monthly or weekly TOTAL rather than one transaction (e.g. a salary tab with one row per month and no day), ask me which day of the month to date it on.
- Open EVERY sheet, tab and page of what I give you. Files often keep income on a second tab, and converting only the first one loses half the picture without saying so.

FORMAT
- "date": YYYY-MM-DD. Convert any date format to this. If a date is ambiguous (e.g. 03/04/25), infer the order from the other rows and stay consistent.
- "amount": a plain positive number - no currency symbol, no thousands separators (e.g. 1234.56).
- "type": "expense" for money going out, "income" for money coming in.
- A NEGATIVE amount inside an expense list is one of two different things, so read the description before deciding:
  - money back on something I bought (refund, return, cashback): keep "type":"expense" and make "amount" NEGATIVE, so it nets off that category.
  - money I actually won or was given, merely recorded in the expense sheet (a betting win, a reimbursement, something sold): make it "type":"income" with a POSITIVE amount and my closest income category.
  If a negative row is genuinely ambiguous, ask me instead of picking one.
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
        toast.success(t('set.promptCopied'), { duration: 1400 });
      } catch {
        toast.error('Copy failed - select the text and copy it manually');
      }
    };

    const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
      <div className="flex gap-3 items-start">
        <div
          className="flex-shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 22, height: 22, backgroundColor: '#4F74F3', color: '#fff', fontSize: 12, fontWeight: 700 }}
        >
          {n}
        </div>
        <p style={{ color: '#3A3A3C', fontSize: 14, lineHeight: 1.5 }}>{children}</p>
      </div>
    );

    return (
      <div className="flex flex-col" style={SUBPAGE_STYLE}>
        <div style={{ backgroundColor: 'var(--bg-page)' }}>
          <div className="px-6 pb-4 pt-0">
            <div className="flex items-center justify-center relative">
              <button
                onClick={() => setShowImport(false)}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: '#4F74F3' }} />
              </button>
              <h1 style={{ color: 'var(--ink)', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>{t('set.importData')}</h1>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6" style={{ paddingBottom: DOCK_CLEARANCE }}>
          {/* Intro */}
          <div className="pt-2 pb-4">
            <h2 style={{ color: 'var(--ink)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
              {getLanguage() === 'it' ? 'Porta qui i tuoi dati esistenti' : 'Bring in your existing data'}
            </h2>
            <p style={{ color: 'var(--ink-3)', fontSize: 15, lineHeight: 1.5, marginTop: 8 }}>
              {getLanguage() === 'it' ? 'Un assistente AI trasforma quasi tutto in transazioni TracklyLab - senza reinserire nulla a mano.' : 'An AI assistant turns almost anything into TracklyLab transactions - no manual re-entry.'}
            </p>
          </div>

          {/* The two jobs this screen does. Not buttons - the flow below is
              the same for both - but the value has to be visible before the
              user reads a single step. */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2.5" style={{ backgroundColor: 'var(--wash-green)' }}>
                <FileSpreadsheet className="w-5 h-5" style={{ color: '#2E9E5B' }} strokeWidth={2} />
              </div>
              <div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{getLanguage() === 'it' ? 'Banche e fogli di calcolo' : 'Banks & spreadsheets'}</div>
              <p style={{ color: 'var(--ink-3)', fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>
                {getLanguage() === 'it' ? 'Estratti conto (PDF o CSV), file Excel - persino screenshot di una lista di transazioni.' : 'Statements (PDF or CSV), Excel files - even screenshots of a transaction list.'}
              </p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2.5" style={{ backgroundColor: 'var(--wash-accent3)' }}>
                <Palmtree className="w-5 h-5" style={{ color: '#0A84FF' }} strokeWidth={2} />
              </div>
              <div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{getLanguage() === 'it' ? 'Viaggi e spese condivise' : 'Trips & split expenses'}</div>
              <p style={{ color: 'var(--ink-3)', fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>
                {getLanguage() === 'it' ? 'Un export di viaggio da Splitwise arriva come sola tua quota - i pareggi vengono saltati.' : 'A Splitwise trip export lands as your share only - settlements are skipped.'}
              </p>
            </div>
          </div>

          {/* Steps */}
          <div className="bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-4">
            <Step n={1}>
              {getLanguage() === 'it'
                ? <>Apri un assistente AI qualsiasi (ChatGPT, Claude, Gemini…). Incolla il prompt qui sotto e allega il tuo file - un foglio di calcolo, un estratto conto (PDF o CSV), un export di viaggio Splitwise, screenshot o una tabella incollata. Le spese condivise arrivano come sola tua quota - i pareggi tra persone vengono saltati.</>
                : <>Open any AI assistant (ChatGPT, Claude, Gemini…). Paste the prompt below and attach your file -
              a spreadsheet, a bank/card statement (PDF or CSV), a Splitwise trip export, screenshots, or a
              pasted table. Split expenses come in as your share only - settlements between people are skipped.</>}
            </Step>
            <Step n={2}>
              {getLanguage() === 'it'
                ? <>Ti restituisce un file <span style={{ fontWeight: 600 }}>.json</span> già abbinato alle tue categorie e ai tuoi conti. Salvalo sul telefono.</>
                : <>It returns a <span style={{ fontWeight: 600 }}>.json</span> file already matched to your categories
              and sources. Save it to your phone.</>}
            </Step>
            <Step n={3}>
              {getLanguage() === 'it'
                ? <>Torna qui, tocca <span style={{ fontWeight: 600 }}>{t('set.chooseFile')}</span> e scegli il file. Tutto qui.</>
                : <>Come back here, tap <span style={{ fontWeight: 600 }}>{t('set.chooseFile')}</span>, and pick it. That's it.</>}
            </Step>
          </div>

          {/* Prompt */}
          <div className="flex items-center justify-between mt-7 mb-2">
            <p style={{ color: 'var(--ink-2)', fontSize: 13, fontWeight: 500 }}>{getLanguage() === 'it' ? 'PROMPT PER IL TUO ASSISTENTE AI' : 'PROMPT FOR YOUR AI ASSISTANT'}</p>
            <button
              onClick={copyPrompt}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full active:scale-95 transition-transform"
              style={{ backgroundColor: '#4F74F3' }}
            >
              <Copy className="w-3.5 h-3.5" style={{ color: '#fff' }} strokeWidth={2.5} />
              <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>{t('set.copy')}</span>
            </button>
          </div>
          <div style={{ backgroundColor: 'var(--chip-ink)', borderRadius: 14, padding: 14, maxHeight: 240, overflowY: 'auto' }}>
            <pre
              style={{
                color: 'var(--line)',
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
          <p style={{ color: 'var(--disabled)', fontSize: 12, lineHeight: 1.5, marginTop: 10 }}>
            {getLanguage() === 'it'
              ? <>Il prompt elenca già le <span style={{ fontWeight: 600 }}>tue</span> categorie, sottocategorie e conti attuali, così il file arriva pronto da importare.</>
              : <>The prompt already lists <span style={{ fontWeight: 600 }}>your</span> current categories, subcategories
            and sources, so the file lands ready to import.</>}
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
            style={{ backgroundColor: 'var(--chip-ink)', color: '#fff', boxShadow: '0 6px 18px rgba(28,28,30,0.20)' }}
          >
            <Upload className="w-5 h-5" strokeWidth={2} />
            {t('set.chooseFile')}
          </button>
          <p style={{ color: 'var(--disabled)', fontSize: 12, lineHeight: 1.5, marginTop: 10, textAlign: 'center' }}>
            {getLanguage() === 'it'
              ? 'Le transazioni importate si aggiungono ai tuoi dati attuali. Se scegli un file di backup TracklyLab (da Esporta), viene invece ripristinato.'
              : 'Imported transactions are added to your current data. Choosing a TracklyLab backup file (from Export) restores it instead.'}
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

  if (showScheduled) {
    return (
      <div className="flex flex-col overflow-hidden" style={SUBPAGE_STYLE}>
        <div className="flex-shrink-0" style={{ backgroundColor: 'var(--bg-page)' }}>
          <div className="px-6 pb-4 pt-0">
            <div className="flex items-center justify-center relative">
              <button
                onClick={() => setShowScheduled(false)}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: '#4F74F3' }} />
              </button>
              <h1 style={{ color: 'var(--ink)', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>
                {t('sched.title')}
              </h1>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: DOCK_CLEARANCE }}>
          <ScheduledManager
            rules={recurringRules}
            transactions={transactions}
            categories={categories}
            incomeCategories={incomeCategories}
            sources={sources}
            currency={userCurrency}
            defaultSourceExpense={defaultSourceExpense}
            defaultSourceIncome={defaultSourceIncome}
            onCreate={onCreateSchedule}
            onUpdate={onUpdateSchedule}
            onStop={onStopSchedule}
            onModalOpenChange={onModalOpenChange}
          />
        </div>
      </div>
    );
  }

  // Show Contacts subpage — a form that sends a message straight from the app.
  if (showSupport) {
    return (
      <div className="flex flex-col" style={SUBPAGE_STYLE}>
        <div style={{ backgroundColor: 'var(--bg-page)' }}>
          <div className="px-6 pb-4 pt-0">
            <div className="flex items-center justify-center relative">
              <button
                onClick={closeSupport}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: '#4F74F3' }} />
              </button>
              <h1 style={{ color: 'var(--ink)', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>{t('set.support')}</h1>
            </div>
          </div>
        </div>

        {supportSent ? (
          // Success confirmation
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center" style={{ marginTop: -40 }}>
            <CheckCircle2 className="w-16 h-16 mb-4" style={{ color: '#30D158' }} strokeWidth={1.75} />
            <h2 style={{ color: 'var(--ink)', fontSize: 22, fontWeight: 700 }}>{t('set.supportSent')}</h2>
            <p style={{ color: 'var(--ink-3)', fontSize: 15, lineHeight: 1.5, marginTop: 8, maxWidth: 300 }}>
              {getLanguage() === 'it' ? (
                <>Grazie! Abbiamo ricevuto il tuo messaggio e risponderemo a{' '}
                <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{supportEmail}</span> via email.</>
              ) : (
                <>Thanks! We've got your message and will reply to{' '}
                <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{supportEmail}</span> by email.</>
              )}
            </p>
            <button
              onClick={closeSupport}
              className="mt-8 px-8 py-3 rounded-xl font-medium text-base active:scale-[0.98] transition-transform"
              style={{ backgroundColor: '#4F74F3', color: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,122,255,0.25)' }}
            >
              {t('set.done')}
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6" style={{ paddingBottom: DOCK_CLEARANCE }}>
            <div className="pt-2 pb-5">
              <h2 style={{ color: 'var(--ink)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
                {t('set.supportTitle')}
              </h2>
              <p style={{ color: 'var(--ink-3)', fontSize: 15, lineHeight: 1.5, marginTop: 8 }}>
                {t('set.supportBody')}
              </p>
            </div>

            <p style={{ color: 'var(--ink-2)', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>{t('set.supportEmail')}</p>
            <input
              type="email"
              inputMode="email"
              autoCapitalize="off"
              autoCorrect="off"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3.5 rounded-2xl bg-white shadow-sm outline-none focus:ring-2 focus:ring-blue-500"
              style={{ fontSize: 16, color: 'var(--ink)' }}
            />
            <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 6, marginBottom: 16 }}>{t('set.supportEmailHint')}</p>

            <p style={{ color: 'var(--ink-2)', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>{t('set.supportMsg')}</p>
            <textarea
              value={supportMessage}
              onChange={(e) => setSupportMessage(e.target.value)}
              placeholder={t('set.supportPlaceholder')}
              rows={6}
              maxLength={5000}
              // 16px keeps iOS from auto-zooming on focus
              className="w-full p-4 rounded-2xl bg-white shadow-sm outline-none resize-none focus:ring-2 focus:ring-blue-500"
              style={{ fontSize: 16, color: 'var(--ink)', lineHeight: 1.5 }}
            />

            <button
              onClick={submitSupport}
              disabled={!canSendSupport || sendingSupport}
              className="w-full mt-4 py-4 rounded-xl font-medium text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40"
              style={{ backgroundColor: '#4F74F3', color: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,122,255,0.25)' }}
            >
              <Mail className="w-4 h-4" /> {sendingSupport ? t('set.sending') : t('set.sendMessage')}
            </button>

            <p className="text-center mt-4" style={{ color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.5 }}>
              {getLanguage() === 'it' ? 'Oppure scrivici direttamente a' : 'Or email us directly at'}{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#4F74F3', fontWeight: 500 }}>{SUPPORT_EMAIL}</a>
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
    <div style={{ backgroundColor: 'var(--bg-page)', marginBottom: -16 }}>
      {/* Header */}
      <div className="px-6 pb-4 pt-1">
        <h1 style={{ color: 'var(--ink)', fontSize: '30px', fontWeight: '800', letterSpacing: '-1px' }}>{t('set.title')}</h1>
        <p style={{ color: 'var(--ink-2)', fontSize: '13px', marginTop: '4px' }}>
          {userEmail ? t('set.subBacked', { email: userEmail }) : t('set.subGuest')}
        </p>
      </div>

      {/* Account section — sign-in / sign-out + sync status */}
      <div className="px-6 mb-6">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {isGuest ? (
            <button
              onClick={onSignInToSync}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            >
              <Cloud className="w-5 h-5" style={{ color: '#4F74F3' }} strokeWidth={2} />
              <div className="flex-1 text-left">
                <div style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.signIn')}</div>
                <div style={{ color: 'var(--ink-2)', fontSize: '13px' }}>{t('set.signInSub')}</div>
              </div>
              <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
            </button>
          ) : (
            <>
              <div className="w-full flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: '1px solid var(--bg-inset)' }}>
                <Cloud className="w-5 h-5" style={{ color: syncMeta.color }} strokeWidth={2} />
                <div className="flex-1 min-w-0">
                  <div style={{ color: 'var(--ink)', fontSize: '15px' }}>{syncMeta.label}</div>
                  {userEmail && <div className="truncate" style={{ color: 'var(--ink-2)', fontSize: '13px' }}>{userEmail}</div>}
                </div>
              </div>
              {/* Deleting the account lives with "Erase all data" at the bottom,
                  so the two destructive options can be compared side by side. */}
              <button
                onClick={onSignOut}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
              >
                <RowIcon icon={LogOut} tone={TILE.neutral} />
                <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.signOut')}</span>
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
              setBudgetOn(!!monthlyBudget);
              setShowNameEditor(true);
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid var(--bg-inset)' }}
          >
            {userAvatar && !avatarBroken ? (
              <img
                src={userAvatar}
                alt="Profile"
                referrerPolicy="no-referrer"
                onError={() => setAvatarBroken(true)}
                className="w-8 h-8 rounded-[10px] flex-shrink-0 object-cover"
              />
            ) : userName ? (
              // Same 32px rounded square as every RowIcon beside it: the avatar
              // is still the one personal mark on the screen, but it sits on the
              // list's rhythm instead of being the single circle among squares.
              <div
                className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'var(--chip-ink)' }}
              >
                <span style={{ color: '#FFFFFF', fontSize: '13px', fontWeight: 600 }}>
                  {userName.trim().charAt(0).toUpperCase()}
                </span>
              </div>
            ) : (
              <RowIcon icon={UserCircle} tone={TILE.profile} />
            )}
            <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.profile')}</span>
            <span style={{ color: 'var(--ink-2)', fontSize: '14px' }}>{userName}</span>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
          </button>

          {/* Order is three groups, not eight peers: who you are and how the
              app speaks to you (Profile, Language, Main Currency), then what
              your transactions are built from (Categories, Sources, Recurring),
              then help. Currency used to sit below Recurring - three data
              screens away from Language, though the two answer the same kind of
              question. */}
          {/* Language — a row that opens its own page, like Currency. */}
          <button
            onClick={() => setShowLanguage(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid var(--bg-inset)' }}
          >
            <RowIcon icon={Globe} tone={TILE.language} />
            <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('settings.language')}</span>
            <span style={{ color: 'var(--ink-2)', fontSize: '14px' }}>
              {LANGUAGE_OPTIONS.find((l) => l.code === language)?.flag}{' '}
              {LANGUAGE_OPTIONS.find((l) => l.code === language)?.native}
            </span>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
          </button>

          <button 
            onClick={() => setShowCurrencySelector(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid var(--bg-inset)' }}
          >
            <RowIcon icon={Wallet} tone={TILE.currency} />
            <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.currency')}</span>
            <span style={{ color: 'var(--ink-2)', fontSize: '14px' }}>
              {CURRENCIES[userCurrency]?.flag} {userCurrency}
            </span>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
          </button>

          <button
            onClick={() => setShowAppearance(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid var(--bg-inset)' }}
          >
            <RowIcon icon={Palette} tone={TILE.appearance} />
            <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.theme')}</span>
            <span style={{ color: 'var(--ink-2)', fontSize: '14px' }}>
              {t(themeMode === 'system' ? 'theme.system' : themeMode === 'light' ? 'theme.light' : 'theme.dark')}
            </span>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
          </button>

          <button 
            onClick={() => setShowCategories(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid var(--bg-inset)' }}
          >
            <RowIcon icon={Layers} tone={TILE.category} />
            <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.categories')}</span>
            <span style={{ color: 'var(--ink-2)', fontSize: '14px' }}>{categories.length + incomeCategories.length}</span>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
          </button>

          <button
            onClick={() => setShowSources(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid var(--bg-inset)' }}
          >
            <RowIcon icon={Landmark} tone={TILE.source} />
            <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.sources')}</span>
            <span style={{ color: 'var(--ink-2)', fontSize: '14px' }}>{sources.length}</span>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
          </button>

          <button
            onClick={() => setShowScheduled(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid var(--bg-inset)' }}
          >
            <RowIcon icon={CalendarClock} tone={TILE.recurring} />
            <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.scheduled')}</span>
            <span style={{ color: 'var(--ink-2)', fontSize: '14px' }}>{upcomingSchedules(recurringRules).length}</span>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
          </button>

          <button
            onClick={() => setShowShared(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid var(--bg-inset)' }}
          >
            <RowIcon icon={Split} tone={TILE.shared} />
            <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.shared')}</span>
            <span style={{ color: 'var(--ink-2)', fontSize: '14px' }}>
              {household && partner ? partner.name : t('set.shared.off')}
            </span>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
          </button>

          <button
            onClick={openSupport}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid var(--bg-inset)' }}
          >
            <RowIcon icon={LifeBuoy} tone={TILE.contact} />
            <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.support')}</span>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
          </button>

          <button
            onClick={() => setShowAbout(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
          >
            <RowIcon icon={HelpCircle} tone={TILE.about} />
            <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.about')}</span>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
          </button>
        </div>

        {/* Data section — demo data is for testing the app, erase resets everything */}
        <p className="mt-8 mb-2 px-1" style={{ color: 'var(--ink-2)', fontSize: '13px' }}>
          Data
        </p>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {onImportData && (
            <button
              onClick={() => setShowImport(true)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
              style={{ borderBottom: '1px solid var(--bg-inset)' }}
            >
              <RowIcon icon={Upload} tone={TILE.import} />
              <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.importData')}</span>
              <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
            </button>
          )}
          {onExportData && (
            <button
              onClick={onExportData}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
              style={{ borderBottom: '1px solid var(--bg-inset)' }}
            >
              <RowIcon icon={Download} tone={TILE.backup} />
              <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.exportBackup')}</span>
              <span style={{ color: 'var(--ink-2)', fontSize: '13px' }}>{t('set.exportBackupSub')}</span>
            </button>
          )}
          {onExportCsv && (
            <button
              onClick={onExportCsv}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
              style={{ borderBottom: '1px solid var(--bg-inset)' }}
            >
              <RowIcon icon={FileSpreadsheet} tone={TILE.csv} />
              <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.exportCsv')}</span>
              <span style={{ color: 'var(--ink-2)', fontSize: '13px' }}>{t('set.exportCsvSub')}</span>
            </button>
          )}
          <button
            onClick={() => openConfirm('demo')}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={hasDemoData && onEraseDemoData ? { borderBottom: '1px solid var(--bg-inset)' } : undefined}
          >
            <RowIcon icon={FlaskConical} tone={TILE.demo} />
            <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.loadDemo')}</span>
            <span style={{ color: 'var(--ink-2)', fontSize: '13px' }}>{t('set.loadDemoSub')}</span>
          </button>

          {hasDemoData && onEraseDemoData && (
            <button
              onClick={() => openConfirm('erase-demo')}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            >
              <RowIcon icon={Trash2} tone={TILE.danger} />
              <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.eraseDemo')}</span>
              <span style={{ color: 'var(--ink-2)', fontSize: '13px' }}>{t('set.eraseDemoSub')}</span>
            </button>
          )}
        </div>

        {/* Destructive actions, grouped so the difference between wiping your
            data and removing your whole account is obvious at a glance. */}
        <p className="mt-8 mb-2 px-1" style={{ color: 'var(--ink-2)', fontSize: '13px' }}>
          {t('set.danger')}
        </p>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button
            onClick={() => openConfirm('erase')}
            className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={onDeleteAccount && !isGuest ? { borderBottom: '1px solid var(--bg-inset)' } : undefined}
          >
            <Trash2 className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--tone-danger)' }} strokeWidth={2} />
            <div className="flex-1 text-left">
              <div style={{ color: 'var(--tone-danger)', fontSize: '15px' }}>{t('set.eraseAll')}</div>
              <div style={{ color: 'var(--ink-2)', fontSize: '13px', marginTop: 2 }}>
                {getLanguage() === 'it'
                  ? (isGuest ? 'Elimina transazioni e impostazioni' : 'Riparte da zero. Il tuo account resta')
                  : isGuest
                    ? 'Deletes your transactions and settings'
                    : 'Starts fresh. You keep your account'}
              </div>
            </div>
          </button>

          {onDeleteAccount && !isGuest && (
            <button
              onClick={() => openConfirm('delete-account')}
              disabled={deletingAccount}
              className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors disabled:opacity-50"
            >
              <UserX className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--tone-danger)' }} strokeWidth={2} />
              <div className="flex-1 text-left">
                <div style={{ color: 'var(--tone-danger)', fontSize: '15px' }}>{t('set.deleteAccount')}</div>
                <div style={{ color: 'var(--ink-2)', fontSize: '13px', marginTop: 2 }}>
                  {t('set.deleteAccountSub')}
                </div>
              </div>
            </button>
          )}
        </div>

        {/* Signature */}
        <div className="mt-8 mb-1 text-center">
          <p style={{ color: 'var(--faint)', fontSize: '12px', fontWeight: 500 }}>TracklyLab · v{__APP_VERSION__}</p>
          <p style={{ color: 'var(--faint)', fontSize: '12px', fontStyle: 'italic', marginTop: '2px' }}>
            {t('set.signature')}
          </p>
        </div>

      </div>

      {confirmAction === 'demo' && (
        <ConfirmDialog
          title={t('conf.demoTitle')}
          message={t('conf.demoMsg')}
          confirmLabel={t('conf.demoCta')}
          variant="neutral"
          onConfirm={handleConfirm}
          onCancel={closeConfirm}
        />
      )}
      {confirmAction === 'erase-demo' && (
        <ConfirmDialog
          title={t('conf.eraseDemoTitle')}
          message={t('conf.eraseDemoMsg')}
          confirmLabel={t('conf.eraseDemoCta')}
          variant="neutral"
          onConfirm={handleConfirm}
          onCancel={closeConfirm}
        />
      )}
      {confirmAction === 'erase' && (
        <ConfirmDialog
          title={t('conf.eraseTitle')}
          message={isGuest ? t('conf.eraseMsgGuest') : t('conf.eraseMsgUser')}
          confirmLabel={t('conf.eraseCta')}
          onConfirm={handleConfirm}
          onCancel={closeConfirm}
        />
      )}
      {confirmAction === 'restore' && (
        <ConfirmDialog
          title={t('conf.restoreTitle')}
          message={t('conf.restoreMsg')}
          confirmLabel={t('conf.restoreCta')}
          onConfirm={handleConfirm}
          onCancel={() => { setPendingBackup(null); closeConfirm(); }}
        />
      )}
      {confirmAction === 'delete-account' && (
        <ConfirmDialog
          title={t('conf.delAccTitle')}
          message={t('conf.delAccMsg')}
          confirmLabel={t('conf.delAccCta')}
          onConfirm={handleDeleteAccountConfirm}
          onCancel={closeConfirm}
        />
      )}
    </div>
  );
}