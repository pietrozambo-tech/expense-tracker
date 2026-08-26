import type { LucideIcon } from 'lucide-react';
import { Bell, Lightbulb, ChevronRight, ChevronLeft, Wrench, ArrowLeftRight, UserCircle, Wallet, HelpCircle, ShieldCheck, ScrollText, Layers, FlaskConical, Trash2, Landmark, Cloud, LogOut, Upload, Copy, Download, FileSpreadsheet, Palmtree, UserX, Mail, LifeBuoy, CheckCircle2, Globe, CalendarClock, Sparkles, Palette, Sun, Moon, SunMoon, Split, Plus, Eraser } from 'lucide-react';
import { getCategoryIcon } from './categoryIcons';
import { composeSupportMessage, sendSupportMessage, supportLimitReached, type SupportTopic } from '../lib/support';
import { fetchAdminStats, type AdminStats } from '../lib/adminStats';
import { lastPing, pingCurrentUser, type PingInfo } from '../lib/activityPing';
import { UserStats } from './UserStats';
import { switchGlow } from './categoryColors';

// Where messages from Settings > Contacts go. Easy to swap when the domain changes.
const SUPPORT_EMAIL = 'support@tracklylab.com';
const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

import { useCallback, useEffect, useRef, useState } from 'react';
import { SUBPAGE_STYLE, DOCK_CLEARANCE } from './subpageLayout';
import { useEdgeSwipeBack } from '../lib/useEdgeSwipeBack';
import { navTransition } from '../lib/navTransition';
import { loadThemeMode, setThemeMode, type ThemeMode } from '../lib/themeMode';
import { loadDevUnlocked, saveDevUnlocked } from '../lib/storage';
import { isNative } from '../lib/platform';
import { toast } from 'sonner';
import { Categories } from './Categories';
import { ScheduledManager, type ScheduleDraft } from './ScheduledManager';
import { upcomingSchedules } from '../lib/recurrence';
import type { RecurringRule } from '../types';
import { SourcesManager } from './SourcesManager';
import { TracklyLogo } from './TracklyLogo';
import { ConfirmDialog } from './ConfirmDialog';
import { BalanceHistory } from './BalanceHistory';
import { CURRENCIES, MAIN_CURRENCY_CODES } from '../utils/currency';
import { KNOWN_COUNTRIES, currencyOfCountry, currentCountry, flagOfCountry } from '../lib/travel';
import { hapticTest, iosVersion, isIOSWeb, switchSupported, hapticTick } from '../lib/haptics';
import { HapticOverlay } from './HapticOverlay';
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
function SwitchRow({ label, sub, icon, on, divider, onToggle }: {
  label: string; sub?: string; icon?: React.ReactNode; on: boolean; divider?: boolean; onToggle: () => void;
}) {
  return (
    <button
      onClick={() => {
        hapticTick();
        onToggle();
      }}
      role="switch"
      aria-checked={on}
      className="w-full flex items-center gap-3 px-4"
      style={{ minHeight: 52, paddingTop: sub ? 8 : 0, paddingBottom: sub ? 8 : 0, borderBottom: divider ? '1px solid var(--bg-inset)' : 'none' }}
    >
      {icon}
      <span className="flex-1 text-left">
        <span style={{ color: 'var(--ink)', fontSize: 15, display: 'block' }}>{label}</span>
        {sub && <span style={{ color: 'var(--ink-2)', fontSize: 12.5, display: 'block', marginTop: 1 }}>{sub}</span>}
      </span>
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
  notify:   { bg: '#FFF1E8', fg: '#EA580C' },
  shared:   { bg: '#EEF1FE', fg: '#4F74F3' },
  neutral:  { bg: '#EFEFF4', fg: '#6B7280' },
} as const;

// The tick square the always-shared picker uses. 'some' is the half-state of
// a category with only certain subcategories ticked.
function CheckMark({ state }: { state: 'on' | 'some' | 'off' }) {
  const active = state !== 'off';
  return (
    <span
      aria-hidden="true"
      className="flex items-center justify-center flex-shrink-0 rounded-md"
      style={{
        width: 22,
        height: 22,
        backgroundColor: active ? '#4F74F3' : 'transparent',
        border: active ? '1.5px solid #4F74F3' : '1.5px solid var(--bg-off)',
        transition: 'background-color 120ms, border-color 120ms',
      }}
    >
      {state === 'on' && (
        <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
          <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {state === 'some' && <span style={{ width: 10, height: 2, borderRadius: 1, background: '#FFFFFF' }} />}
    </span>
  );
}

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

/** Everything the developer screen reads and can change. */
export interface DevDiag {
  zone: string;
  detected: string | null;
  override: string;
  country: string | null;
  currency: string | null;
  history: { cc: string; days: string[]; dismissed?: number }[];
  /** Which country the app currently reckons you live in - recomputed from the
   *  history, not a stored flag. The usual reason the nudge is silent. */
  home: string | null;
  currencyCode: string;
  household: string;
  partnerName: string | null;
  signedIn: boolean;
  txCount: number;
  ruleCount: number;
  sharedLastSeen: string;
  unseenCount: number;
  onOverride: (cc: string) => void;
  onForget: () => void;
  onClearDismissals: () => void;
  onRewindSharedSeen: () => void;
}

interface SettingsProps {
  /** Absent in any build that does not want the developer screen at all. */
  devDiag?: DevDiag;
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
  /** For the balance history reached from the Shared screen (spec 7.6). */
  settlements?: import('../types').Settlement[];
  /** Their categories that have nowhere of ours to go (spec 4.2 step 2). */
  unmappedCategories?: { key: string; name: string; icon?: string; count: number }[];
  /** File one of theirs under one of mine, for everything past and future. */
  onMapCategory?: (key: string, categoryId: string) => void;
  partner?: import('../types').Person | null;
  onEnableShared?: (name: string) => void;
  onUpdateHousehold?: (patch: Partial<import('../types').Household>) => void;
  onRenamePartner?: (name: string) => void;
  onDisableShared?: () => void;
  /** Create the household on the server (if needed) and mint a join code. */
  onCreateInvite?: () => Promise<string>;
  onJoinWithCode?: (code: string) => Promise<void>;
  /** Re-check the server for the pairing, while a code is waiting to be used. */
  onRefreshPairing?: () => Promise<void>;
  /** Why the last shared sync failed, if it did - shown under the Connect row
   *  so a silent failure is not mistaken for a silent partner. */
  sharedError?: string | null;
  /** True when the server is pushing changes rather than us polling for them. */
  sharedLive?: boolean;
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
  /** `stay` keeps the current screen - see the handler in App. */
  onEraseDemoData?: (opts?: { stay?: boolean }) => void;
  /** Mildest of the three resets: history out, setup kept. */
  onClearTransactions?: () => void;
  /** True while any of the sample set is still in the ledger. Pairing is held
   *  until it is gone: invented expenses must not land on a real phone. */
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
  // Nudge toggles (lib/nudges.ts). Device-local prefs, like notification
  // permissions everywhere else.
  nudgePrefs?: { tips: boolean; recap: boolean };
  onSetNudgePref?: (patch: Partial<{ tips: boolean; recap: boolean }>) => void;
  onSignInToSync?: () => void;
}

export function Settings({
  devDiag,
  settlements = [],
  unmappedCategories = [],
  onMapCategory,
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
  onRenamePartner,
  onDisableShared,
  onCreateInvite,
  onJoinWithCode,
  onRefreshPairing,
  sharedError,
  sharedLive,
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
  onClearTransactions,
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
  nudgePrefs = { tips: true, recap: true },
  onSetNudgePref,
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
  const [showNotifications, setShowNotifications] = useState(false);
  const [showShared, setShowShared] = useState(false);
  // The developer screen, and the way in. A code rather than a hidden gesture:
  // a tap count is found by accident, impossible to describe over a message,
  // and gives no way to say "no". The screen has to be openable on a real
  // phone with no cable and no console, which is the whole situation it exists
  // for.
  const [showDev, setShowDev] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  // Loaded on demand from the dev screen - a network call nobody wants firing
  // every time the panel opens.
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  // Off by default: the owner opens this app more than anyone, and counting
  // that would make the chart a mirror rather than a measurement.
  const [countSelf, setCountSelf] = useState(false);
  const [ping, setPing] = useState<PingInfo | null>(null);
  const [showBalance, setShowBalance] = useState(false);
  /** The country this device is in, named and flagged, or null if unplaceable. */
  const here = (() => {
    const cc = devDiag?.country ?? currentCountry();
    if (!cc) return null;
    try {
      const name = new Intl.DisplayNames([language === 'it' ? 'it' : 'en'], { type: 'region' }).of(cc);
      return name ? { name, flag: flagOfCountry(cc) } : null;
    } catch {
      return null;
    }
  })();
  const [showTheirCats, setShowTheirCats] = useState(false);
  const [filing, setFiling] = useState<string | null>(null);
  const [devAsking, setDevAsking] = useState(false);
  const [devCode, setDevCode] = useState('');
  const [devUnlocked, setDevUnlocked] = useState(() => loadDevUnlocked());
  const [sharedName, setSharedName] = useState('');
  // Which half of the setup you are on: the fork, or naming somebody who is
  // not in the app. Reset whenever the Shared page is left, so it never opens
  // half-way through a decision made days ago.
  const [setupStep, setSetupStep] = useState<'choose' | 'solo'>('choose');
  const [confirmDisableShared, setConfirmDisableShared] = useState(false);
  // Early-access gate: shared expenses will be a paid feature, so enabling it
  // needs a code for now. Device-local and remembered; an existing household
  // is never gated - its presence proves the code was entered once.
  // Sheets on the Shared subpage. renameDraft doubles as the open flag.
  const [renameDraft, setRenameDraft] = useState<string | null>(null);
  const [showSplitEditor, setShowSplitEditor] = useState(false);
  const [splitPercentDraft, setSplitPercentDraft] = useState('50');
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [pickerExpanded, setPickerExpanded] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [connectCode, setConnectCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const paired = !!household?.remoteId && !!partner?.userId;

  // While this sheet is open, ask the server again. Without it the device has
  // no reason to look, and the state only surfaced when some unrelated render
  // happened to refresh it - connected on her phone, stubbornly not on his.
  //
  // Two speeds, because the two cases are not equally urgent. Waiting on a code
  // is a person standing there watching for it, so three seconds. Already
  // paired, this is only guarding against the rarer lie in the other direction
  // - the screen still saying "Connected with Giulia" after she turned sharing
  // off - and 3s for that was indefensible: each pass is four queries, so an
  // open sheet was making eighty requests a minute against a two-person
  // household. Every one of those carries the access token, and the more of
  // them there are the more chances a token refresh lands in the middle of one
  // and loses.
  const pollMs = connectCode && !paired ? 3000 : 15000;
  useEffect(() => {
    if (!showConnect || !onRefreshPairing) return;
    if (!paired && !connectCode) return;
    const id = setInterval(() => { void onRefreshPairing(); }, pollMs);
    return () => clearInterval(id);
  }, [showConnect, paired, connectCode, onRefreshPairing, pollMs]);

  // Once it lands, the code has done its job.
  useEffect(() => {
    if (paired && connectCode) setConnectCode(null);
  }, [paired, connectCode]);
  // A failure here is nearly always one of three things, and guessing wrong
  // wastes the user's time - so each says exactly what to do next.
  const connectMessage = (e: unknown): string => {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'shared-schema-missing') return t('shared.connect.errSchema');
    if (/not signed in/i.test(msg)) return t('shared.connect.errSignIn');
    if (/invalid code|already used|expired|full|own invite/i.test(msg)) return t('shared.connect.errCode');
    return t('shared.connect.errGeneric');
  };
  const [showAllCurrencies, setShowAllCurrencies] = useState(false);
  const [showNameEditor, setShowNameEditor] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [supportMessage, setSupportMessage] = useState('');
  const [supportEmail, setSupportEmail] = useState(userEmail || '');
  const [supportTopic, setSupportTopic] = useState<SupportTopic>('feedback');
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
  const [confirmAction, setConfirmAction] = useState<'demo' | 'erase' | 'erase-demo' | 'clear-txns' | 'restore' | 'delete-account' | null>(null);
  const [pendingBackup, setPendingBackup] = useState<ImportPayload | null>(null);

  // Opening a Settings sub-screen (Categories, Sources, Currency, About,
  // Import, Profile) should start it at the top rather than inheriting the
  // scroll position of the main Settings list.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [showCategories, showSources, showScheduled, showAbout, showImport, showCurrencySelector, showLanguage, showNameEditor, showSupport, legalDoc]);

  // Drag in from the left edge to leave a sub-page, the way iOS does it. The
  // chevron is in the far corner; the thumb holding the phone is not.
  //
  // One handler for all of them rather than one per screen: this closes
  // whichever is open, in the order they can stack. The gate code is cleared
  // alongside Shared for the same reason its chevron clears it - leaving and
  // coming back should not find a half-typed code waiting.
  const anySubpageOpen =
    showCategories || showSources || showScheduled || showAbout || showImport ||
    showCurrencySelector || showLanguage || showAppearance || showNotifications || showShared ||
    showNameEditor || showSupport || showUsers || !!legalDoc;
  const closeSubpage = useCallback(() => {
    if (showUsers) return setShowUsers(false);
    if (legalDoc) return setLegalDoc(null);
    if (showCurrencySelector) return setShowCurrencySelector(false);
    if (showSupport) return closeSupport();
    if (showNameEditor) return setShowNameEditor(false);
    if (showShared) {
      // Inside the setup fork, back means back one step - the same as the
      // chevron would do on any other two-step screen.
      if (!household && setupStep === 'solo') return setSetupStep('choose');
      setShowShared(false);
      setSetupStep('choose');
      return;
    }
    if (showAppearance) return setShowAppearance(false);
    if (showNotifications) return setShowNotifications(false);
    if (showLanguage) return setShowLanguage(false);
    if (showImport) return setShowImport(false);
    if (showAbout) return setShowAbout(false);
    if (showScheduled) return setShowScheduled(false);
    if (showSources) return setShowSources(false);
    if (showCategories) return setShowCategories(false);
  }, [showUsers, legalDoc, showCurrencySelector, showSupport, showNameEditor, showShared,
      showAppearance, showNotifications, showLanguage, showImport, showAbout, showScheduled,
      showSources, showCategories, household, setupStep]);
  useEdgeSwipeBack(anySubpageOpen, useCallback(() => navTransition('back', closeSubpage), [closeSubpage]));

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
      toast.error(t('toast.supportLimit'), {
        description: getLanguage() === 'it'
          ? `Puoi inviare fino a 10 messaggi al giorno - oppure scrivici direttamente a ${SUPPORT_EMAIL}.`
          : `You can send up to 10 messages a day - or email us directly at ${SUPPORT_EMAIL}.`,
        duration: 3500,
      });
      return;
    }
    setSendingSupport(true);
    const res = await sendSupportMessage({
      message: composeSupportMessage(supportTopic, supportMessage, { txCount: transactions.length }),
      email: supportEmail.trim(),
      name: userName,
      isGuest,
    });
    setSendingSupport(false);
    if (res.error) {
      toast.error(t('toast.supportFailed'), { description: res.error, duration: 3500 });
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

  const openConfirm = (action: 'demo' | 'erase' | 'erase-demo' | 'clear-txns' | 'restore' | 'delete-account') => {
    setConfirmAction(action);
    onModalOpenChange(true);
  };

  // Account deletion is async (server round-trip), so it gets its own handler
  // rather than the synchronous handleConfirm. On success the app returns to the
  // sign-in screen on its own; on failure the user stays signed in.
  const handleDeleteAccountConfirm = async () => {
    setConfirmAction(null);
    setDeletingAccount(true);
    const toastId = toast.loading(t('toast.deletingAccount'));
    const res = await onDeleteAccount?.();
    toast.dismiss(toastId);
    setDeletingAccount(false);
    onModalOpenChange(false);
    if (res?.error) {
      toast.error(t('toast.deleteAccountFailed'), { description: res.error, duration: 3500 });
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
    } else if (confirmAction === 'clear-txns') {
      onClearTransactions?.();
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
      toast.error(t('toast.badFile'), {
        description: t('toast.badFileDesc'),
        duration: 2400,
      });
    }
  };

  // Coarse relative time for the sync row ("just now", "5m ago", ...). Past a
  // day it hands off to the locale's own date formatting, which was already
  // right - only the words in front of it were stuck in English.
  const relTime = (ts: number) => {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return t('sync.justNow');
    if (s < 3600) return t('sync.minsAgo', { n: Math.floor(s / 60) });
    if (s < 86400) return t('sync.hoursAgo', { n: Math.floor(s / 3600) });
    return new Date(ts).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });
  };
  const syncMeta =
    syncStatus === 'pending'
      ? { label: t('sync.syncing'), color: 'var(--ink-2)' }
      : syncStatus === 'offline'
        ? { label: t('sync.offline'), color: '#FF9F0A' }
        : syncStatus === 'error'
          ? { label: t('sync.error'), color: '#FF3B30' }
          : {
              label: lastSyncedAt ? t('sync.syncedAt', { when: relTime(lastSyncedAt) }) : t('sync.synced'),
              color: '#30D158',
            };

  // Shared expenses setup. Setup ONLY - the balance and the household view
  // The balance's account, as a Settings sub-page. Spec 7.6 puts settlement
  // history here; the same screen also opens from the shared view's balance
  // card, which is where the question usually occurs to somebody.
  if (showBalance && household && partner) {
    return (
      <div style={SUBPAGE_STYLE}>
        <BalanceHistory
          transactions={transactions ?? []}
          settlements={settlements}
          memberIds={household.memberIds}
          currency={userCurrency}
          partner={partner}
          onClose={() => setShowBalance(false)}
        />
      </div>
    );
  }

  // Where THEIR invented categories should land in mine (spec 4.2 step 2).
  //
  // Until this, a category she made up landed in my catch-all and said
  // nothing about it: the money was never lost, but "Others" quietly became
  // the biggest thing I spend on and no screen could explain why.
  if (showTheirCats && partner) {
    const expenseCats = categories.filter((c) => c.type !== 'income');
    return (
      <div className="flex flex-col" style={SUBPAGE_STYLE}>
        <div style={{ backgroundColor: 'var(--bg-page)' }}>
          <div className="px-6 pb-4 pt-0">
            <div className="flex items-center justify-center relative">
              <button
                onClick={() => navTransition('back', () => { setShowTheirCats(false); setFiling(null); })}
                aria-label={t('common.close')}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: 'var(--accent-ink)' }} />
              </button>
              <h1 style={{ color: 'var(--ink)', fontSize: 20, fontWeight: 600, letterSpacing: '-0.3px' }}>
                {t('shared.cat.title', { name: partner.name })}
              </h1>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6" style={{ paddingBottom: DOCK_CLEARANCE }}>
          {unmappedCategories.length === 0 ? (
            <div className="py-10 text-center" style={{ color: 'var(--ink-2)', fontSize: 13.5 }}>
              {t('shared.cat.empty', { name: partner.name })}
            </div>
          ) : (
            <>
              <p style={{ color: 'var(--ink-2)', fontSize: 12.5, lineHeight: 1.45, marginBottom: 12 }}>
                {t('shared.cat.intro')}
              </p>
              {unmappedCategories.map((u) => {
                const Icon = getCategoryIcon(u.icon ?? 'MoreHorizontal');
                const open = filing === u.key;
                return (
                  <div
                    key={u.key}
                    data-unmapped={u.key}
                    className="rounded-2xl mb-3 overflow-hidden"
                    style={{ backgroundColor: 'var(--bg-card)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
                  >
                    <button
                      onClick={() => setFiling(open ? null : u.key)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-60 transition-opacity"
                    >
                      <span
                        className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: 'var(--bg-inset)' }}
                      >
                        <Icon className="w-4 h-4" style={{ color: 'var(--ink-2)' }} strokeWidth={2} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate" style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 500 }}>
                          {u.name}
                        </span>
                        <span className="block" style={{ color: 'var(--ink-2)', fontSize: 12 }}>
                          {t(u.count === 1 ? 'shared.cat.count.one' : 'shared.cat.count.other', { n: String(u.count) })}
                        </span>
                      </span>
                      <ChevronRight
                        className="w-4 h-4 flex-shrink-0 transition-transform"
                        style={{ color: 'var(--ghost)', transform: open ? 'rotate(90deg)' : undefined }}
                      />
                    </button>
                    {/* The choice, inline. A sheet would be one more layer for
                        a decision that is a single tap once you can see the
                        options. */}
                    {open && (
                      <div className="px-4 pb-3" style={{ borderTop: '1px solid var(--line-2)' }}>
                        <p className="pt-2.5 pb-1.5" style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>
                          {t('shared.cat.choose')}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {expenseCats.map((c) => (
                            <button
                              key={c.id}
                              data-file-as={c.id}
                              onClick={() => {
                                onMapCategory?.(u.key, c.id);
                                setFiling(null);
                              }}
                              className="rounded-full active:scale-95 transition-transform"
                              style={{
                                padding: '5px 11px', fontSize: 12.5, fontWeight: 500,
                                backgroundColor: 'var(--bg-inset)', color: 'var(--ink-2)',
                                WebkitTapHighlightColor: 'transparent',
                              }}
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    );
  }

  // Everything a developer needs on a device with no console attached.
  //
  // It exists because of a specific failure mode: the travel nudge renders
  // NOTHING when it has nothing to say, so "I changed my timezone and saw no
  // chip" is indistinguishable from "the feature is broken" - and from "this
  // phone is still serving last week's cached bundle". Each card below turns
  // one of those guesses into a fact.
  // The user dashboard - its own screen, opened from the developer panel.
  if (showUsers) {
    const darkNow = typeof document !== 'undefined'
      && document.documentElement.getAttribute('data-theme') === 'dark';
    const ACTION = {
      padding: '7px 13px', fontSize: 12.5, fontWeight: 600,
      backgroundColor: 'var(--bg-inset)', color: 'var(--ink-2)',
      WebkitTapHighlightColor: 'transparent',
    } as React.CSSProperties;
    const shown = ping ?? lastPing();
    const pingLine = !shown
      ? { text: 'No visit recorded from this device yet - it is written once a day, on launch, while signed in.', tone: 'var(--ink-3)' }
      : shown.ok
        ? { text: `Recorded at ${new Date(shown.at).toLocaleTimeString()}${shown.skipped ? ' (already counted today)' : ''}.`, tone: 'var(--ink-2)' }
        : { text: `Last attempt failed: ${shown.error}`, tone: '#E5484D' };
    const load = async (self: boolean) => {
      setLoadingAdmin(true);
      setAdminError(null);
      const { stats, error } = await fetchAdminStats(self);
      setAdminStats(stats);
      setAdminError(error);
      setLoadingAdmin(false);
    };
    return (
      <div className="flex flex-col" style={SUBPAGE_STYLE}>
        <div style={{ backgroundColor: 'var(--bg-page)' }}>
          <div className="px-6 pb-4 pt-0">
            <div className="flex items-center justify-center relative">
              <button
                onClick={() => navTransition('back', () => setShowUsers(false))}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: 'var(--accent-ink)' }} />
              </button>
              <h1 style={{ color: 'var(--ink)', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>Users</h1>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6" style={{ paddingBottom: DOCK_CLEARANCE }}>
          {adminStats && <UserStats stats={adminStats} dark={darkNow} />}
          {adminError && (
            <p data-dev-users-error style={{ color: '#E5484D', fontSize: 11.5, lineHeight: 1.5 }}>{adminError}</p>
          )}
          <p className="mt-3 mb-2" style={{ color: 'var(--ink-3)', fontSize: 11.5, lineHeight: 1.5 }}>
            Accounts only - guests never sign up, so PostHog still holds the
            visitor story. Opens are recorded from the day the activity table
            was created and cannot be backfilled.
            {adminStats && ` Your own account is ${adminStats.includeSelf ? 'included' : 'excluded'}.`}
          </p>
          {/* Did THIS device record its own visit? The ping swallows its
              errors by design, so without this line an empty chart could mean
              a missing table, a rejected insert, a bundle too old to contain
              the ping at all, or simply nobody having opened the app - four
              very different problems wearing the same blank face. */}
          <div data-users-ping className="mt-3 rounded-xl px-3 py-2.5" style={{ backgroundColor: 'var(--bg-inset)' }}>
            <div style={{ color: 'var(--ink-2)', fontSize: 11, fontWeight: 600, letterSpacing: 0.2 }}>THIS DEVICE</div>
            <p className="mt-0.5" style={{ fontSize: 12, lineHeight: 1.45, color: pingLine.tone }}>
              {pingLine.text}
            </p>
            <button
              data-dev-ping-now
              onClick={async () => {
                const info = await pingCurrentUser(new Date(), { force: true });
                setPing(info);
              }}
              className="mt-2 rounded-xl active:scale-95 transition-transform"
              style={ACTION}
            >
              Record a visit now
            </button>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <button
              data-dev-users-load
              onClick={() => load(countSelf)}
              className="rounded-xl active:scale-95 transition-transform"
              style={ACTION}
            >
              {loadingAdmin ? 'Loading…' : adminStats ? 'Refresh' : 'Load user stats'}
            </button>
            <button
              data-dev-users-self
              onClick={() => { setCountSelf((v) => !v); }}
              className="rounded-xl active:scale-95 transition-transform"
              style={ACTION}
            >
              {countSelf ? 'Counting you' : 'Not counting you'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showDev) {
    // The chart picks its series steps per surface; themeMode.ts stamps the
    // attribute, so reading it here is reading the truth rather than guessing
    // from the preference (which can say "system").
    const darkNow = typeof document !== 'undefined'
      && document.documentElement.getAttribute('data-theme') === 'dark';
    const sw = typeof navigator === 'undefined' || !('serviceWorker' in navigator)
      ? 'unsupported'
      : navigator.serviceWorker.controller ? 'active' : 'none';
    const standalone = typeof window !== 'undefined'
      && (window.matchMedia?.('(display-mode: standalone)').matches
        || (window.navigator as unknown as { standalone?: boolean }).standalone === true);
    const vw = typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x` : '-';
    const regionName = (cc: string) => {
      try {
        return new Intl.DisplayNames([language === 'it' ? 'it' : 'en'], { type: 'region' }).of(cc) ?? cc;
      } catch {
        return cc;
      }
    };
    // Bytes this app is holding in localStorage, per key and in total. The
    // cheap version of a quota investigation, and it needs no permission.
    const keySizes = (() => {
      const rows: { k: string; bytes: number }[] = [];
      let total = 0;
      try {
        for (let i = 0; i < localStorage.length; i += 1) {
          const k = localStorage.key(i);
          if (!k || !k.startsWith('expense-tracker.')) continue;
          const bytes = (localStorage.getItem(k) ?? '').length;
          total += bytes;
          rows.push({ k: k.replace('expense-tracker.v1.', ''), bytes });
        }
      } catch { /* storage unavailable */ }
      return { rows: rows.sort((a, b) => b.bytes - a.bytes), total };
    })();
    const kb = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);

    const row = (label: string, value: string) => (
      <div key={label} className="flex items-baseline justify-between gap-3 py-1.5">
        <span style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>{label}</span>
        <span className="text-right" style={{ color: 'var(--ink)', fontSize: 12.5, fontWeight: 600, wordBreak: 'break-word' }}>
          {value}
        </span>
      </div>
    );
    const CARD = { backgroundColor: 'var(--bg-card)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' };
    const EYEBROW = { color: 'var(--ink-2)', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' };
    const NOTE = { color: 'var(--ink-3)', fontSize: 11.5, lineHeight: 1.5 };
    const ACTION = {
      padding: '7px 13px', fontSize: 12.5, fontWeight: 600,
      backgroundColor: 'var(--bg-inset)', color: 'var(--ink-2)',
      WebkitTapHighlightColor: 'transparent',
    } as React.CSSProperties;

    // Everything on screen, as text - so a tester can paste the whole state
    // into a message instead of describing it or photographing it.
    const diagnostics = () => [
      `TracklyLab ${__APP_VERSION__} (${__BUILD_STAMP__})`,
      `shell=${isNative() ? 'native' : standalone ? 'pwa' : 'browser'} sw=${sw} online=${typeof navigator !== 'undefined' && navigator.onLine}`,
      `viewport=${vw} lang=${language} currency=${devDiag?.currencyCode ?? '?'}`,
      `zone=${devDiag?.zone} detected=${devDiag?.detected} inUse=${devDiag?.country}->${devDiag?.currency}`,
      `override=${devDiag?.override || 'none'} home=${devDiag?.home ?? 'none'}`,
      `countries=${(devDiag?.history ?? []).map((v) => `${v.cc}:${v.days.length}d/${new Set(v.days.map((d) => d.slice(0, 7))).size}mo${v.dismissed ? `/${v.dismissed}x` : ''}`).join(' ') || 'none'}`,
      `household=${devDiag?.household} partner=${devDiag?.partnerName ?? '-'} signedIn=${devDiag?.signedIn}`,
      `tx=${devDiag?.txCount} rules=${devDiag?.ruleCount} unseen=${devDiag?.unseenCount}`,
      `storage=${kb(keySizes.total)}`,
    ].join('\n');

    return (
      <div className="flex flex-col" style={SUBPAGE_STYLE}>
        <div style={{ backgroundColor: 'var(--bg-page)' }}>
          <div className="px-6 pb-4 pt-0">
            <div className="flex items-center justify-center relative">
              <button
                onClick={() => navTransition('back', () => setShowDev(false))}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
                aria-label="Back"
              >
                <ChevronLeft size={24} style={{ color: 'var(--accent-ink)' }} />
              </button>
              <h1 style={{ color: 'var(--ink)', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>Developer</h1>
            </div>
          </div>
        </div>

        {/* A real scrolling sub-page with the dock's clearance. The first
            version of this was a panel at the foot of Settings, and its own
            buttons sat 65px BELOW the floating dock's top edge - under the
            dock, where a tap never reaches them. */}
        <div className="flex-1 overflow-y-auto px-6" style={{ paddingBottom: DOCK_CLEARANCE }}>
          {/* First, because it answers the question that disguises itself as
              every other bug: is this device running the build you think? */}
          <div className="rounded-2xl px-5 py-4 mb-4" style={CARD}>
            <div className="mb-2" style={EYEBROW}>BUILD</div>
            {row('Version', __APP_VERSION__)}
            {row('Built', __BUILD_STAMP__)}
            {row('Shell', isNative() ? 'native (Capacitor)' : standalone ? 'installed PWA' : 'browser tab')}
            {row('Service worker', sw)}
            {row('Online', typeof navigator !== 'undefined' && navigator.onLine ? 'yes' : 'no')}
            <p className="mt-2" style={NOTE}>
              If "Built" is older than the last deploy, this device is still
              serving a cached bundle and no amount of testing will show new
              work. Forcing an update drops the service worker and reloads.
            </p>
            <button
              data-dev-update
              onClick={async () => {
                try {
                  const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
                  await Promise.all(regs.map((r) => r.unregister()));
                  if (typeof caches !== 'undefined') {
                    const names = await caches.keys();
                    await Promise.all(names.map((n) => caches.delete(n)));
                  }
                } catch { /* nothing to drop */ }
                window.location.reload();
              }}
              className="mt-2.5 rounded-xl active:scale-95 transition-transform"
              style={ACTION}
            >
              Force update &amp; reload
            </button>
          </div>

          {/* The user dashboard is a screen of its own: thirty days of
              addresses would otherwise bury everything below it. */}
          <button
            data-dev-users-entry
            onClick={() => navTransition('forward', () => setShowUsers(true))}
            className="w-full rounded-2xl px-5 py-4 mb-4 flex items-center justify-between"
            style={CARD}
          >
            <span className="text-left">
              <span className="block" style={EYEBROW}>USERS</span>
              <span className="block mt-0.5" style={{ color: 'var(--ink)', fontSize: 13.5, fontWeight: 600 }}>
                Daily actives, new sign-ups, addresses
              </span>
            </span>
            <ChevronRight size={18} style={{ color: 'var(--ink-3)' }} />
          </button>

          <div className="rounded-2xl px-5 py-4 mb-4" style={CARD}>
            <div className="mb-2" style={EYEBROW}>DEVICE &amp; LOCALE</div>
            {row('Viewport', vw)}
            {row('Language', language)}
            {row('Main currency', devDiag?.currencyCode ?? '-')}
            {row('Signed in', devDiag?.signedIn ? 'yes' : 'guest')}
            {row('Storage used', kb(keySizes.total))}
          </div>

          {devDiag && (
            <div className="rounded-2xl px-5 py-4 mb-4" style={CARD}>
              <div className="mb-2" style={EYEBROW}>LOCATION</div>
              {row('Timezone', devDiag.zone || '-')}
              {row('Detected country', devDiag.detected ? `${devDiag.detected} - ${regionName(devDiag.detected)}` : 'unknown')}
              {row('In use', `${devDiag.country ?? 'unknown'} -> ${devDiag.currency ?? 'no currency'}`)}
              {row('Source', devDiag.override ? 'forced below' : 'device timezone')}
              <p className="mt-2 mb-2" style={NOTE}>
                Forcing a country replaces the timezone lookup and nothing else,
                so what you see afterwards is exactly what a traveller sees.
                Then open Add - the chip sits under the amount.
              </p>
              {/* A native select rather than a row of chips: this is every
                  country the app can offer a currency for, which is far more
                  than fits on screen, and iOS gives a real picker wheel for
                  free. */}
              <select
                data-dev-country
                value={devDiag.override}
                onChange={(e) => devDiag.onOverride(e.target.value)}
                className="w-full rounded-xl outline-none"
                style={{
                  backgroundColor: 'var(--bg-inset)', color: 'var(--ink)',
                  // 16px, or iOS zooms the page in on focus.
                  fontSize: 16, padding: '10px 12px', border: 'none',
                }}
              >
                <option value="">Real location ({devDiag.detected ?? 'unknown'})</option>
                {KNOWN_COUNTRIES.map((cc) => (
                  <option key={cc} value={cc}>
                    {`${regionName(cc)} - ${currencyOfCountry(cc)}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* The reason the nudge is silent is nearly always written here: the
              country is home, or three refusals are already spent. */}
          {devDiag && (
            <div className="rounded-2xl px-5 py-4 mb-4" style={CARD}>
              <div className="mb-2" style={EYEBROW}>COUNTRIES LEARNT</div>
              {devDiag.history.length === 0 ? (
                <div style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>Nothing yet</div>
              ) : (
                devDiag.history.map((v) =>
                  row(`${v.cc} - ${regionName(v.cc)}`, [
                    `${v.days.length}d`,
                    `${new Set(v.days.map((d) => d.slice(0, 7))).size}mo`,
                    v.cc === devDiag.home ? 'HOME' : null,
                    v.dismissed ? `${v.dismissed} dismissed` : null,
                  ].filter(Boolean).join(' - ')),
                )
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  data-dev-forget
                  onClick={() => {
                    devDiag.onForget();
                    toast.success('Travel history forgotten', { duration: 1600 });
                  }}
                  className="rounded-xl active:scale-95 transition-transform"
                  style={ACTION}
                >
                  Forget history
                </button>
                <button
                  data-dev-undismiss
                  onClick={() => {
                    devDiag.onClearDismissals();
                    toast.success('Dismissals cleared', { duration: 1600 });
                  }}
                  className="rounded-xl active:scale-95 transition-transform"
                  style={ACTION}
                >
                  Clear dismissals
                </button>
              </div>
              <p className="mt-2" style={NOTE}>
                Home is whichever country has been seen in the most separate
                months, first-seen breaking a tie, and home is never nudged.
                Three refusals in one country also silence it there.
              </p>
            </div>
          )}

          {devDiag && (
            <div className="rounded-2xl px-5 py-4 mb-4" style={CARD}>
              <div className="mb-2" style={EYEBROW}>SHARED</div>
              {row('Household', devDiag.household)}
              {row('Partner', devDiag.partnerName ?? '-')}
              {row('Unseen changes', String(devDiag.unseenCount))}
              {row('Last looked', devDiag.sharedLastSeen ? devDiag.sharedLastSeen.slice(0, 16).replace('T', ' ') : 'never')}
              <button
                data-dev-rewind
                onClick={() => {
                  devDiag.onRewindSharedSeen();
                  toast.success('Marked as not looked at', { duration: 1600 });
                }}
                className="mt-3 rounded-xl active:scale-95 transition-transform"
                style={ACTION}
              >
                Rewind &quot;last looked&quot;
              </button>
              <p className="mt-2" style={NOTE}>
                Rewinding makes anything the other member already changed count
                as unread again, so the dot, the news group and the UPDATED
                badges can be made to fire without a second phone.
              </p>
            </div>
          )}

          <div className="rounded-2xl px-5 py-4 mb-4" style={CARD}>
            <div className="mb-2" style={EYEBROW}>DATA</div>
            {row('Transactions', String(devDiag?.txCount ?? 0))}
            {row('Categories', `${categories.length} + ${incomeCategories.length} income`)}
            {row('Schedules', String(devDiag?.ruleCount ?? 0))}
            {keySizes.rows.slice(0, 8).map((r) => row(r.k, kb(r.bytes)))}
          </div>

          {/* Haptics diagnosis. Three experiments, weakest claim to
              strongest: the programmatic buttons (Apple killed this path in
              iOS 26.5), the overlay tap (a finger toggling an invisible real
              switch - works on every iOS >= 17.4), and a visible native
              switch (if even THAT is silent, System Haptics is off or the
              device cannot do this at all). */}
          <div className="rounded-xl mb-3 px-3 py-2.5" style={{ backgroundColor: 'var(--bg-card)' }}>
            <div className="text-[11px] font-semibold mb-2" style={{ color: 'var(--ink-2)', letterSpacing: '0.05em' }}>HAPTICS</div>
            {isIOSWeb() && (
              <p className="mb-2" style={{ color: 'var(--ink-2)', fontSize: 12 }}>
                {`iOS ${iosVersion() ?? '?'} · switch control ${switchSupported() ? 'supported' : 'NOT supported'}`}
              </p>
            )}
            <div className="grid grid-cols-4 gap-2">
              {(['select', 'tick', 'success', 'heavy'] as const).map((kind) => (
                <button
                  key={kind}
                  data-dev-haptic={kind}
                  onClick={() => hapticTest(kind)}
                  className="rounded-lg active:scale-[0.96] transition-transform capitalize"
                  style={{ backgroundColor: 'var(--bg-inset)', color: 'var(--ink)', padding: '9px 0', fontSize: 12.5, fontWeight: 600 }}
                >
                  {kind}
                </button>
              ))}
            </div>
            <p className="mt-1.5 mb-2.5" style={{ color: 'var(--faint)', fontSize: 11, lineHeight: 1.4 }}>
              Script-triggered. Apple removed this path in iOS 26.5 - silence there is expected. Android varies the length.
            </p>
            <button
              data-dev-tapme
              className="relative w-full rounded-lg active:scale-[0.98] transition-transform"
              style={{ backgroundColor: 'var(--wash-accent)', color: 'var(--accent-ink)', padding: '10px 0', fontSize: 13, fontWeight: 600 }}
            >
              <HapticOverlay />
              Tap me - overlay haptic
            </button>
            <p className="mt-1.5 mb-2.5" style={{ color: 'var(--faint)', fontSize: 11, lineHeight: 1.4 }}>
              Your finger toggles an invisible real switch. This is what the dock uses - works on every iOS since 17.4. Never placed on scrolling surfaces: a switch also toggles when slid over.
            </p>
            <div className="flex items-center justify-between rounded-lg px-3" style={{ backgroundColor: 'var(--bg-inset)', height: 44 }}>
              <span style={{ color: 'var(--ink)', fontSize: 13 }}>Native switch (visible)</span>
              {/* @ts-expect-error Safari's switch flavour */}
              <input type="checkbox" switch="" data-dev-switch style={{ transform: 'scale(0.9)' }} />
            </div>
            <p className="mt-1.5" style={{ color: 'var(--faint)', fontSize: 11, lineHeight: 1.4 }}>
              If even this one is silent, check Settings &gt; Sounds &amp; Haptics &gt; System Haptics.
            </p>
          </div>

          <button
            data-dev-copy
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(diagnostics());
                toast.success('Diagnostics copied', { duration: 1600 });
              } catch {
                toast.error('Could not copy');
              }
            }}
            className="w-full rounded-xl mb-6 active:scale-[0.98] transition-transform"
            style={{ ...ACTION, padding: '11px 13px', fontSize: 13.5 }}
          >
            Copy diagnostics
          </button>
        </div>
      </div>
    );
  }

  // live on the Dashboard behind the avatar switcher; this screen holds what
  // you configure once: who, the default split, which categories always
  // share, whether a balance is kept, and the way out.
  if (showShared) {
    const sharedCats: string[] = household?.sharedCategoryIds ?? [];
    const subMap: Record<string, string[]> = household?.sharedSubcategories ?? {};
    // Tri-state per category: wholly shared, partially (some subcategories), off.
    const catState = (id: string): 'on' | 'some' | 'off' =>
      sharedCats.includes(id) ? 'on' : (subMap[id]?.length ?? 0) > 0 ? 'some' : 'off';
    const toggleCat = (id: string) => {
      if (!household || !onUpdateHousehold) return;
      const next = { ...subMap };
      delete next[id];
      onUpdateHousehold({
        sharedCategoryIds: sharedCats.includes(id)
          ? sharedCats.filter((c) => c !== id)
          : [...sharedCats, id],
        sharedSubcategories: next,
      });
    };
    const toggleSub = (cat: any, name: string) => {
      if (!household || !onUpdateHousehold) return;
      const all: string[] = cat.subcategories ?? [];
      const next = { ...subMap };
      let ids = sharedCats;
      if (sharedCats.includes(cat.id)) {
        // Unticking one subcategory of a wholly shared category demotes it to
        // "all the others" - the tick the user just removed must stick.
        ids = sharedCats.filter((c) => c !== cat.id);
        next[cat.id] = all.filter((s) => s !== name);
      } else {
        const cur = next[cat.id] ?? [];
        const updated = cur.includes(name) ? cur.filter((s) => s !== name) : [...cur, name];
        if (all.length > 0 && updated.length === all.length) {
          // Every subcategory ticked = the whole category; promote and clean.
          ids = [...sharedCats, cat.id];
          delete next[cat.id];
        } else if (updated.length === 0) {
          delete next[cat.id];
        } else {
          next[cat.id] = updated;
        }
      }
      onUpdateHousehold({ sharedCategoryIds: ids, sharedSubcategories: next });
    };
    return (
      <div className="flex flex-col" style={SUBPAGE_STYLE}>
        <div style={{ backgroundColor: 'var(--bg-page)' }}>
          <div className="px-6 pb-4 pt-0">
            <div className="flex items-center justify-center relative">
              <button
                onClick={() => navTransition('back', () => {
                  // Inside the fork, back means back one step.
                  if (!household && setupStep === 'solo') return setSetupStep('choose');
                  setShowShared(false);
                  setSetupStep('choose');
                })}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: 'var(--accent-ink)' }} />
              </button>
              <h1 style={{ color: 'var(--ink)', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>{t('set.shared')}</h1>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: DOCK_CLEARANCE }}>
          {!household ? (
            /* Setup asks the question that actually BRANCHES, which is not the
               name. If the two of you both use the app, the name comes off
               their account and typing one here would only be overwritten the
               moment you paired - the old first screen demanded exactly that,
               and hid the connect flow behind it. So: who is this with, then a
               name only on the path that genuinely needs one. */
            <div className="px-6">
              <div className="rounded-2xl shadow-sm px-5 py-7 text-center" style={{ backgroundColor: 'var(--bg-card)' }}>
                {/* You, and somebody yet to be named. Deliberately the same
                    paired mark the Dashboard switcher wears once this is on,
                    so what is being offered here is recognisable later as the
                    thing that arrived. */}
                <div className="flex items-center justify-center mb-4" aria-hidden="true">
                  <span
                    style={{
                      // Ink on card, not a fixed near-black: at 44px on a dark
                      // card #0B0B0D is a hole with a letter floating in it.
                      // These two tokens swap with the theme, so the mark is
                      // solid in both.
                      width: 44, height: 44, borderRadius: 999,
                      background: 'var(--ink)', color: 'var(--bg-card)',
                      fontSize: 17, fontWeight: 700, display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {(userName?.[0] ?? 'P').toUpperCase()}
                  </span>
                  <span
                    style={{
                      width: 44, height: 44, borderRadius: 999, background: '#7C5CFF', color: '#FFFFFF',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      marginLeft: -13, border: '2.5px solid var(--bg-card)',
                    }}
                  >
                    <Plus className="w-5 h-5" strokeWidth={2.6} />
                  </span>
                </div>
                <h2 style={{ color: 'var(--ink)', fontSize: 19, fontWeight: 700, marginBottom: 7, letterSpacing: '-0.2px' }}>
                  {t('shared.set.introTitle')}
                </h2>
                <p className="mx-auto" style={{ color: 'var(--ink-2)', fontSize: 13.5, lineHeight: 1.5, maxWidth: 290 }}>
                  {t('shared.set.introBody')}
                </p>
              </div>

              {setupStep === 'choose' ? (
                <div className="rounded-2xl shadow-sm overflow-hidden mt-4" style={{ backgroundColor: 'var(--bg-card)' }}>
                  {/* The account path first: it is the half of this feature a
                      bank feed can never do, and it used to be invisible until
                      after you had already committed. */}
                  <button
                    onClick={() => {
                      // A household has to exist before a code can be minted,
                      // so it is created under a placeholder that pairing
                      // replaces with whatever they call themselves.
                      onEnableShared?.(t('shared.set.defaultName'));
                      setShowConnect(true);
                    }}
                    className="w-full flex items-start gap-3 px-4 py-4 text-left hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                    style={{ borderBottom: '1px solid var(--bg-inset)' }}
                  >
                    <RowIcon icon={Cloud} tone={TILE.shared} />
                    <span className="flex-1 min-w-0">
                      <span className="block" style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 500 }}>
                        {t('shared.set.optConnect')}
                      </span>
                      <span className="block mt-1" style={{ color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.45 }}>
                        {t('shared.set.optConnectBody')}
                      </span>
                    </span>
                    <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0" style={{ color: 'var(--ghost)' }} />
                  </button>
                  <button
                    onClick={() => setSetupStep('solo')}
                    className="w-full flex items-start gap-3 px-4 py-4 text-left hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                  >
                    <RowIcon icon={Split} tone={TILE.shared} />
                    <span className="flex-1 min-w-0">
                      <span className="block" style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 500 }}>
                        {t('shared.set.optSolo')}
                      </span>
                      <span className="block mt-1" style={{ color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.45 }}>
                        {t('shared.set.optSoloBody')}
                      </span>
                    </span>
                    <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0" style={{ color: 'var(--ghost)' }} />
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl shadow-sm px-5 py-5 mt-4" style={{ backgroundColor: 'var(--bg-card)' }}>
                  <h2 style={{ color: 'var(--ink)', fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
                    {t('shared.set.soloTitle')}
                  </h2>
                  <p style={{ color: 'var(--ink-2)', fontSize: 13.5, lineHeight: 1.5, marginBottom: 16 }}>
                    {t('shared.set.soloBody')}
                  </p>
                  <input
                    type="text"
                    value={sharedName}
                    onChange={(e) => setSharedName(e.target.value)}
                    placeholder={t('shared.set.namePlaceholder')}
                    className="w-full rounded-xl px-4 py-3 outline-none"
                    style={{ backgroundColor: 'var(--bg-field)', color: 'var(--ink)', fontSize: 16 }}
                  />
                  {/* Always live: an empty field means "Partner", which the
                      Sharing with row renames in two taps. A disabled button
                      guarding a label is not worth anybody's time. */}
                  <button
                    onClick={() => {
                      onEnableShared?.(sharedName.trim() || t('shared.set.defaultName'));
                      setSharedName('');
                    }}
                    className="w-full mt-4 py-3.5 rounded-xl font-medium active:scale-[0.98] transition-transform"
                    style={{ backgroundColor: '#4F74F3', color: '#FFFFFF', fontSize: 15 }}
                  >
                    {t('shared.set.enable')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="px-6">
                <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--bg-card)' }}>
                  <button
                    onClick={() => setRenameDraft(partner?.name ?? '')}
                    className="w-full flex items-center gap-3 px-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                    style={{ height: 52, borderBottom: '1px solid var(--bg-inset)' }}
                  >
                    <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: 15 }}>{t('shared.set.partner')}</span>
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
                    <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
                  </button>
                  <button
                    onClick={() => {
                      setSplitPercentDraft(String(household.defaultSplit.mode === 'percent' ? household.defaultSplit.percent ?? 50 : 50));
                      setShowSplitEditor(true);
                    }}
                    className="w-full flex items-center gap-3 px-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                    style={{ height: 52, borderBottom: '1px solid var(--bg-inset)' }}
                  >
                    <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: 15 }}>{t('shared.set.split')}</span>
                    <span style={{ color: 'var(--ink-2)', fontSize: 14 }}>
                      {household.defaultSplit.mode === 'percent'
                        ? `${household.defaultSplit.percent ?? 50}% / ${100 - (household.defaultSplit.percent ?? 50)}%`
                        : '50 / 50'}
                    </span>
                    <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
                  </button>
                  <button
                    onClick={() => setShowCatPicker(true)}
                    className="w-full flex items-center gap-3 px-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                    style={{ height: 52, borderBottom: '1px solid var(--bg-inset)' }}
                  >
                    <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: 15 }}>{t('shared.set.always')}</span>
                    <span style={{ color: 'var(--ink-2)', fontSize: 14 }}>
                      {t('shared.set.catCount', {
                        n: sharedCats.length + Object.keys(household.sharedSubcategories ?? {}).filter(
                          (id) => !sharedCats.includes(id) && (household.sharedSubcategories?.[id]?.length ?? 0) > 0,
                        ).length,
                      })}
                    </span>
                    <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
                  </button>
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

              {/* Her categories that have nowhere of mine to go. Only shown
                  once there is something to decide - an empty list is a row
                  that promises work and then reports none. */}
              {unmappedCategories.length > 0 && (
                <div className="px-6 mt-5">
                  <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--bg-card)' }}>
                    <button
                      data-their-cats
                      onClick={() => navTransition('forward', () => setShowTheirCats(true))}
                      className="w-full flex items-center gap-3 px-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                      style={{ height: 52 }}
                    >
                      <RowIcon icon={Layers} tone={TILE.shared} />
                      <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: 15 }}>
                        {t('shared.cat.row', { name: partner?.name ?? '' })}
                      </span>
                      <span style={{ color: 'var(--accent-ink)', fontSize: 14, fontWeight: 600 }}>
                        {t(unmappedCategories.length === 1 ? 'shared.cat.need.one' : 'shared.cat.need.other', {
                          n: String(unmappedCategories.length),
                        })}
                      </span>
                      <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
                    </button>
                  </div>
                  <p style={{ color: 'var(--ink-2)', fontSize: 12.5, marginTop: 8, lineHeight: 1.45 }}>
                    {t('shared.cat.hint', { name: partner?.name ?? '' })}
                  </p>
                </div>
              )}

              {/* The account of the balance, which is where spec 7.6 asks for
                  settlement history. Only offered while a balance is being
                  kept: with tracking off there is no story to tell. */}
              {household.trackBalance && (
                <div className="px-6 mt-5">
                  <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--bg-card)' }}>
                    <button
                      data-balance-history
                      onClick={() => navTransition('forward', () => setShowBalance(true))}
                      className="w-full flex items-center gap-3 px-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                      style={{ height: 52 }}
                    >
                      <RowIcon icon={ArrowLeftRight} tone={TILE.shared} />
                      <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: 15 }}>
                        {t('shared.set.history')}
                      </span>
                      <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
                    </button>
                  </div>
                  <p style={{ color: 'var(--ink-2)', fontSize: 12.5, marginTop: 8, lineHeight: 1.45 }}>
                    {t('shared.set.historyHint')}
                  </p>
                </div>
              )}

              <div className="px-6 mt-5">
                <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--bg-card)' }}>
                  <button
                    onClick={() => setShowConnect(true)}
                    className="w-full flex items-center gap-3 px-4 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                    style={{ height: 52 }}
                  >
                    <RowIcon icon={Cloud} tone={TILE.shared} />
                    <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: 15 }}>{t('shared.set.connect')}</span>
                    <span style={{ color: paired ? '#16A34A' : 'var(--ink-2)', fontSize: 14 }}>
                      {paired ? t('shared.set.connected') : t('shared.set.notConnected')}
                    </span>
                    <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
                  </button>
                </div>
                {/* Whether the two phones are actually talking. A sync that
                    keeps failing used to be visible only in a console nobody
                    opens, so "she added it and it never arrived" looked
                    exactly like "she never added it". */}
                {paired && (
                  <p className="px-1 mt-2" style={{ fontSize: 12, lineHeight: 1.45, color: sharedError ? 'var(--tone-danger)' : 'var(--faint)' }}>
                    {sharedError
                      ? t(
                          sharedError === 'shared-schema-missing' ? 'shared.err.schemaMissing'
                          : sharedError === 'shared-schema-outdated' ? 'shared.err.schemaOutdated'
                          : 'shared.err.generic',
                        )
                      : t(sharedLive ? 'shared.status.live' : 'shared.status.polling')}
                  </p>
                )}
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

        {/* Rename the partner */}
        {renameDraft !== null && (
          <div data-overlay className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6" onClick={() => setRenameDraft(null)}>
            <div className="rounded-2xl p-6 max-w-sm w-full shadow-xl" style={{ backgroundColor: 'var(--bg-card)' }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ color: 'var(--ink)', fontSize: 17, fontWeight: 600, marginBottom: 14 }}>{t('shared.set.renameTitle')}</h3>
              <input
                type="text"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                autoFocus
                className="w-full rounded-xl px-4 py-3 outline-none"
                style={{ backgroundColor: 'var(--bg-field)', color: 'var(--ink)', fontSize: 16 }}
              />
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setRenameDraft(null)}
                  className="flex-1 px-4 py-3 rounded-xl font-medium active:bg-neutral-200"
                  style={{ backgroundColor: 'var(--bg-inset)', color: 'var(--ink)' }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => {
                    if (renameDraft.trim()) onRenamePartner?.(renameDraft);
                    setRenameDraft(null);
                  }}
                  disabled={!renameDraft.trim()}
                  className="flex-1 px-4 py-3 rounded-xl font-medium text-white active:opacity-90"
                  style={{ backgroundColor: renameDraft.trim() ? '#4F74F3' : 'var(--bg-inset)', color: renameDraft.trim() ? '#FFFFFF' : 'var(--ink-2)' }}
                >
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Default split editor */}
        {showSplitEditor && household && (
          <div data-overlay className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6" onClick={() => setShowSplitEditor(false)}>
            <div className="rounded-2xl p-6 max-w-sm w-full shadow-xl" style={{ backgroundColor: 'var(--bg-card)' }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ color: 'var(--ink)', fontSize: 17, fontWeight: 600, marginBottom: 14 }}>{t('shared.set.splitTitle')}</h3>
              <button
                onClick={() => {
                  onUpdateHousehold?.({ defaultSplit: { mode: 'equal', ways: 2 } });
                  setShowSplitEditor(false);
                }}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl mb-2 active:bg-neutral-100"
                style={{
                  backgroundColor: household.defaultSplit.mode === 'equal' ? 'var(--wash-accent3)' : 'var(--bg-inset)',
                  border: household.defaultSplit.mode === 'equal' ? '1.5px solid #4F74F3' : '1.5px solid transparent',
                }}
              >
                <span style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 500 }}>{t('shared.set.equally')}</span>
                <span style={{ color: 'var(--ink-2)', fontSize: 13 }}>50 / 50</span>
              </button>
              <div
                className="w-full rounded-xl px-4 py-3"
                style={{
                  backgroundColor: household.defaultSplit.mode === 'percent' ? 'var(--wash-accent3)' : 'var(--bg-inset)',
                  border: household.defaultSplit.mode === 'percent' ? '1.5px solid #4F74F3' : '1.5px solid transparent',
                }}
              >
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 500 }}>{t('shared.set.percent')}</span>
                  <span className="flex items-center gap-1.5">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={splitPercentDraft}
                      onChange={(e) => setSplitPercentDraft(e.target.value.replace(/\D/g, '').slice(0, 2))}
                      className="rounded-lg px-2 py-1 outline-none text-center tabular-nums"
                      style={{ width: 56, backgroundColor: 'var(--bg-card)', color: 'var(--ink)', fontSize: 16, border: '1px solid var(--bg-off)' }}
                    />
                    <span style={{ color: 'var(--ink-2)', fontSize: 14 }}>%</span>
                  </span>
                </div>
                <p style={{ color: 'var(--ink-2)', fontSize: 12, marginTop: 6 }}>
                  {t('shared.set.percentHint', { name: partner?.name ?? '', p: String(100 - (parseInt(splitPercentDraft, 10) || 0)) })}
                </p>
              </div>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setShowSplitEditor(false)}
                  className="flex-1 px-4 py-3 rounded-xl font-medium active:bg-neutral-200"
                  style={{ backgroundColor: 'var(--bg-inset)', color: 'var(--ink)' }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => {
                    const p = parseInt(splitPercentDraft, 10);
                    if (!isFinite(p) || p < 1 || p > 99) return;
                    onUpdateHousehold?.({ defaultSplit: { mode: 'percent', percent: p } });
                    setShowSplitEditor(false);
                  }}
                  className="flex-1 px-4 py-3 rounded-xl font-medium active:opacity-90"
                  style={{ backgroundColor: '#4F74F3', color: '#FFFFFF' }}
                >
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Always-shared picker: tick categories, or open one and tick single
            subcategories. A bottom sheet, not a settings page - choosing is a
            moment, not a place. */}
        {showCatPicker && household && (
          <div data-overlay className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={() => { setShowCatPicker(false); setPickerExpanded(null); }}>
            <div
              className="w-full max-w-[430px] rounded-t-3xl flex flex-col"
              style={{ backgroundColor: 'var(--bg-card)', maxHeight: '80dvh' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 pt-5 pb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 700 }}>{t('shared.set.pickTitle')}</h3>
                  <p style={{ color: 'var(--ink-2)', fontSize: 12.5, marginTop: 3, lineHeight: 1.4 }}>{t('shared.set.pickHint')}</p>
                </div>
                <button
                  onClick={() => { setShowCatPicker(false); setPickerExpanded(null); }}
                  className="flex-shrink-0 font-semibold"
                  style={{ color: 'var(--accent-ink)', fontSize: 15, paddingTop: 2 }}
                >
                  {t('common.done')}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-8">
                {categories.map((cat: any) => {
                  const state = catState(cat.id);
                  const subs: string[] = cat.subcategories ?? [];
                  const expanded = pickerExpanded === cat.id;
                  const Icon = getCategoryIcon(cat.icon ?? 'MoreHorizontal');
                  return (
                    <div key={cat.id}>
                      <div className="flex items-center">
                        <button
                          onClick={() => toggleCat(cat.id)}
                          className="flex-1 flex items-center gap-3 px-3 py-2.5 rounded-xl active:bg-neutral-100 transition-colors"
                        >
                          <CheckMark state={state} />
                          <span className={`w-8 h-8 rounded-lg ${cat.bgColor ?? 'bg-neutral-100'} flex items-center justify-center flex-shrink-0`}>
                            <Icon className={`w-4 h-4 ${cat.color ?? 'text-neutral-500'}`} strokeWidth={2} />
                          </span>
                          <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: 15 }}>{cat.name}</span>
                        </button>
                        {subs.length > 0 && (
                          <button
                            onClick={() => setPickerExpanded(expanded ? null : cat.id)}
                            aria-label={cat.name}
                            className="px-3 py-2.5 active:opacity-60"
                          >
                            <ChevronRight
                              className="w-4 h-4 transition-transform"
                              style={{ color: 'var(--ghost)', transform: expanded ? 'rotate(90deg)' : 'none' }}
                            />
                          </button>
                        )}
                      </div>
                      {expanded &&
                        subs.map((sub) => {
                          const on = state === 'on' || (subMap[cat.id]?.includes(sub) ?? false);
                          return (
                            <button
                              key={sub}
                              onClick={() => toggleSub(cat, sub)}
                              className="w-full flex items-center gap-3 py-2 rounded-xl active:bg-neutral-100 transition-colors"
                              style={{ paddingLeft: 56, paddingRight: 12 }}
                            >
                              <CheckMark state={on ? 'on' : 'off'} />
                              <span className="flex-1 text-left" style={{ color: 'var(--ink-2)', fontSize: 14 }}>{sub}</span>
                            </button>
                          );
                        })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Account pairing - the honest version: what it will do and what will
            cross, stated now; the pairing itself is a later slice. */}
        {showConnect && (
          <div data-overlay className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6" onClick={() => setShowConnect(false)}>
            <div className="rounded-2xl p-6 max-w-sm w-full shadow-xl" style={{ backgroundColor: 'var(--bg-card)' }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-center gap-2.5 mb-4">
                <span style={{ width: 40, height: 40, borderRadius: 999, background: '#0B0B0D', color: '#FFF', fontSize: 16, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {(userName?.[0] ?? 'P').toUpperCase()}
                </span>
                <Cloud className="w-5 h-5" style={{ color: 'var(--accent-ink)' }} strokeWidth={2.2} />
                <span style={{ width: 40, height: 40, borderRadius: 999, background: partner?.color ?? '#7C5CFF', color: '#FFF', fontSize: 16, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {(partner?.name?.[0] ?? '?').toUpperCase()}
                </span>
              </div>
              <h3 className="text-center" style={{ color: 'var(--ink)', fontSize: 17, fontWeight: 700, marginBottom: 8 }}>
                {t('shared.connect.title')}
              </h3>
              {paired ? (
                <>
                  <p className="text-center" style={{ color: '#16A34A', fontSize: 13.5, marginBottom: 14 }}>
                    {t('shared.connect.paired', { name: partner?.name ?? '' })}
                  </p>
                  <p style={{ color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.5, marginBottom: 18 }}>
                    {t('shared.connect.pairedBody')}
                  </p>
                </>
              ) : hasDemoData ? (
                /* Pairing publishes what is in the ledger, and the ledger is
                   currently full of invented expenses. They would arrive on a
                   real person's phone as real money and move a real balance, so
                   the way forward is to take them out - not to warn and let it
                   happen anyway. */
                <>
                  <p className="text-center" style={{ color: 'var(--tone-danger)', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                    {t('shared.connect.sampleTitle')}
                  </p>
                  <p style={{ color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.5, marginBottom: 18 }}>
                    {t('shared.connect.sampleBody', { name: partner?.name ?? '' })}
                  </p>
                  <button
                    onClick={() => onEraseDemoData?.({ stay: true })}
                    className="w-full py-3.5 rounded-xl font-medium active:scale-[0.98] transition-transform"
                    style={{ backgroundColor: '#4F74F3', color: '#FFFFFF', fontSize: 15 }}
                  >
                    {t('shared.connect.removeSample')}
                  </button>
                </>
              ) : (
                <>
                  <p style={{ color: 'var(--ink-2)', fontSize: 13.5, lineHeight: 1.5, marginBottom: 10 }}>
                    {t('shared.connect.body', { name: partner?.name ?? '' })}
                  </p>
                  <p style={{ color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
                    {t('shared.connect.sees')}
                  </p>

                  {connectCode ? (
                    <div className="rounded-xl px-4 py-4 mb-4 text-center" style={{ backgroundColor: 'var(--bg-inset)' }}>
                      <div style={{ color: 'var(--ink-2)', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.13em', marginBottom: 8 }}>
                        {t('shared.connect.codeLabel')}
                      </div>
                      <div className="tabular-nums" style={{ color: 'var(--ink)', fontSize: 30, fontWeight: 800, letterSpacing: '0.16em' }}>
                        {connectCode}
                      </div>
                      <div style={{ color: 'var(--ink-2)', fontSize: 11.5, marginTop: 8, lineHeight: 1.4 }}>
                        {t('shared.connect.codeHint', { name: partner?.name ?? '' })}
                      </div>
                      {/* The inviter's device has nothing else to show while
                          it waits, and silence reads as "it didn't work". */}
                      <div
                        className="flex items-center justify-center gap-2 mt-3 pt-3"
                        style={{ borderTop: '1px solid var(--line-2)', color: 'var(--ink-2)', fontSize: 12 }}
                      >
                        <span
                          aria-hidden="true"
                          className="rounded-full"
                          style={{
                            width: 7, height: 7, background: '#4F74F3',
                            animation: 'mk-pulse 1.4s ease-in-out infinite',
                          }}
                        />
                        {t('shared.connect.waiting')}
                      </div>
                      <style>{'@keyframes mk-pulse{0%,100%{opacity:.25}50%{opacity:1}}'}</style>
                    </div>
                  ) : (
                    <button
                      onClick={async () => {
                        setConnectBusy(true);
                        setConnectError(null);
                        try {
                          setConnectCode(await onCreateInvite!());
                        } catch (e) {
                          setConnectError(connectMessage(e));
                        } finally {
                          setConnectBusy(false);
                        }
                      }}
                      disabled={connectBusy || !onCreateInvite}
                      className="w-full px-4 py-3 rounded-xl font-medium mb-3 active:opacity-90"
                      style={{ backgroundColor: '#4F74F3', color: '#FFFFFF', opacity: connectBusy ? 0.6 : 1 }}
                    >
                      {t('shared.connect.invite')}
                    </button>
                  )}

                  <div className="flex items-center gap-3 my-3">
                    <span className="flex-1" style={{ height: 1, background: 'var(--line-2)' }} />
                    <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>{t('shared.connect.or')}</span>
                    <span className="flex-1" style={{ height: 1, background: 'var(--line-2)' }} />
                  </div>

                  <input
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    value={joinCode}
                    onChange={(e) => { setJoinCode(e.target.value.toUpperCase().slice(0, 6)); setConnectError(null); }}
                    placeholder={t('shared.connect.enterPlaceholder')}
                    className="w-full rounded-xl px-4 py-3 outline-none text-center tabular-nums"
                    style={{
                      backgroundColor: 'var(--bg-field)',
                      color: 'var(--ink)',
                      fontSize: 16,
                      letterSpacing: joinCode ? '0.2em' : 'normal',
                    }}
                  />
                  <button
                    onClick={async () => {
                      setConnectBusy(true);
                      setConnectError(null);
                      try {
                        await onJoinWithCode!(joinCode.trim());
                        setJoinCode('');
                        setShowConnect(false);
                      } catch (e) {
                        setConnectError(connectMessage(e));
                      } finally {
                        setConnectBusy(false);
                      }
                    }}
                    disabled={connectBusy || joinCode.trim().length < 6 || !onJoinWithCode}
                    className="w-full mt-3 px-4 py-3 rounded-xl font-medium active:opacity-90"
                    style={{
                      backgroundColor: joinCode.trim().length === 6 && !connectBusy ? '#4F74F3' : 'var(--bg-inset)',
                      color: joinCode.trim().length === 6 && !connectBusy ? '#FFFFFF' : 'var(--ink-2)',
                    }}
                  >
                    {t('shared.connect.join')}
                  </button>
                </>
              )}

              {connectError && (
                <p className="mt-3" style={{ color: 'var(--tone-danger)', fontSize: 12.5, lineHeight: 1.45 }}>
                  {connectError}
                </p>
              )}

              <button
                onClick={() => { setShowConnect(false); setConnectError(null); setConnectCode(null); }}
                className="w-full mt-3 px-4 py-3 rounded-xl font-medium active:bg-neutral-200"
                style={{ backgroundColor: 'var(--bg-inset)', color: 'var(--ink)' }}
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        )}

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
  // Notifications live behind their own row, like Appearance: the root menu
  // stays a table of contents, and controls sit one level in.
  if (showNotifications) {
    return (
      <div className="flex flex-col" style={SUBPAGE_STYLE}>
        <div style={{ backgroundColor: 'var(--bg-page)' }}>
          <div className="px-6 pb-4 pt-0">
            <div className="flex items-center justify-center relative">
              <button
                onClick={() => navTransition('back', () => setShowNotifications(false))}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: 'var(--accent-ink)' }} />
              </button>
              <h1 style={{ color: 'var(--ink)', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>{t('set.notifications')}</h1>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: DOCK_CLEARANCE }}>
          <div className="px-6">
            <div className="rounded-2xl shadow-sm overflow-hidden" data-notifications style={{ backgroundColor: 'var(--bg-card)' }}>
              <SwitchRow
                icon={<RowIcon icon={Lightbulb} tone={TILE.notify} />}
                label={t('set.tips')}
                sub={t('set.tipsSub')}
                on={nudgePrefs.tips}
                divider
                onToggle={() => onSetNudgePref?.({ tips: !nudgePrefs.tips })}
              />
              <SwitchRow
                icon={<RowIcon icon={Bell} tone={TILE.notify} />}
                label={t('set.recapToggle')}
                sub={t('set.recapToggleSub')}
                on={nudgePrefs.recap}
                onToggle={() => onSetNudgePref?.({ recap: !nudgePrefs.recap })}
              />
            </div>
            {/* The honest version of a promise: these toggles govern in-app
                cards today and will govern push when the App Store build
                brings it. */}
            <p className="px-1 mt-4" style={{ color: 'var(--faint)', fontSize: 12, lineHeight: 1.45 }}>
              {t('set.notifPush')}
            </p>
          </div>
        </div>
      </div>
    );
  }

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
                onClick={() => navTransition('back', () => setShowAppearance(false))}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: 'var(--accent-ink)' }} />
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
                onClick={() => navTransition('back', () => setShowLanguage(false))}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: 'var(--accent-ink)' }} />
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
                onClick={() => navTransition('back', () => {
                  if (showAllCurrencies) setShowAllCurrencies(false);
                  else setShowCurrencySelector(false);
                })}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: 'var(--accent-ink)' }} />
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
                onClick={() => navTransition('back', () => {
                  setShowNameEditor(false);
                  setEditedName(userName);
                })}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: 'var(--accent-ink)' }} />
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
                onClick={() => navTransition('back', () => {
                  setShowCategories(false);
                  setCategoryType('expense'); // Reset to default
                })}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: 'var(--accent-ink)' }} />
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
    return <LegalScreen doc={legalDoc} onBack={() => navTransition('back', () => setLegalDoc(null))} />;
  }

  // Show About subpage
  if (showAbout) {
    return (
      <div className="flex flex-col" style={SUBPAGE_STYLE}>
        <div style={{ backgroundColor: 'var(--bg-page)' }}>
          <div className="px-6 pb-4 pt-0">
            <div className="flex items-center justify-center relative">
              <button
                onClick={() => navTransition('back', () => setShowAbout(false))}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: 'var(--accent-ink)' }} />
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
            <p style={{ color: 'var(--accent-ink)', fontSize: '14px', fontWeight: 600, marginTop: '4px', letterSpacing: '0.02em' }}>Your Expense Lens</p>
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
                onClick={() => navTransition('forward', () => setLegalDoc(PRIVACY_POLICY))}
                className="w-full flex items-center gap-3 px-4 py-2.5 active:bg-neutral-100 transition-colors"
                style={{ borderBottom: '1px solid var(--bg-inset)' }}
              >
                <RowIcon icon={ShieldCheck} tone={TILE.backup} />
                <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.privacy')}</span>
                <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
              </button>
              <button
                onClick={() => navTransition('forward', () => setLegalDoc(TERMS_OF_SERVICE))}
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
    // The trip rule below needs to name MY travel category, and "Travel" is
    // only its seeded English name - the Italian seed calls it "Viaggi", and a
    // user can rename it to anything. Resolved here the same way
    // scripts/tricount-import.mjs does: seeded id first, then folded name.
    // When nothing matches, the prompt tells the AI to ask instead of filing a
    // trip under a category that does not exist.
    const foldName = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const travelCat =
      categories.find((c) => c.id === 'travel') ??
      categories.find((c) => ['travel', 'viaggi', 'viaggio', 'trips', 'trip'].includes(foldName(c.name)));
    const travelRefEn = travelCat
      ? `my "${travelCat.name}" category`
      : 'whichever of MY categories below represents trips - and if none clearly does, ASK me which to use before converting';
    const travelRefIt = travelCat
      ? `la mia categoria "${travelCat.name}"`
      : 'quella delle MIE categorie qui sotto che rappresenta i viaggi - e se nessuna lo fa chiaramente, CHIEDIMI quale usare prima di convertire';
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
    // TWO prompt bodies, one per language, maintained BY HAND as twins.
    // Nothing enforces that they agree: the split-file arithmetic below was
    // rewritten in English and the Italian copy silently kept the old, wrong
    // rule until an audit caught it. When you change a rule in one body,
    // change the other in the same commit.
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
COME chiedere: metti tutto ciò che ti serve in UN solo messaggio, come breve elenco numerato sotto l'intestazione "Mi serve da te:", ogni domanda rispondibile in una o due parole - es. "1. Chi sei tra Pit, Merlo, Max? 2. È un viaggio? 3. Se sì, un nome breve?". Ciò che hai dedotto da solo (quote o saldi, e con che prova) va in una riga ciascuno SOPRA l'elenco, mai intrecciato alle domande: una domanda sepolta tra le osservazioni riceve mezza risposta, e qui mezza risposta diventa dati sbagliati. Non iniziare a convertire finché non ho risposto.
- QUALE COLONNA SONO IO. Se il file ha un valore per persona (una divisione di viaggio) e nessuna colonna è inequivocabilmente mia, CHIEDIMELO prima di convertire qualsiasi cosa. La mia colonna può essere un soprannome invece del mio nome ("Pit" per Pietro), solo il nome di battesimo, o il cognome. Non scegliere la più somigliante per poi proseguire: questa singola decisione è giusta per ogni riga o sbagliata per ogni riga, e un file costruito sulla persona sbagliata si importa perfettamente ed è interamente la spesa di qualcun altro. Dimmi i nomi che hai trovato e lascia scegliere me.
- SE È UN VIAGGIO. I file divisi sono di solito vacanze, ma gli stessi strumenti si usano per case condivise e gruppi fissi. Se le righe sembrano affitto, bollette e spesa settimanale più che un viaggio, CHIEDIMELO prima di archiviare tutto sotto la categoria di viaggio.
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

SPESE DIVISE (Tricount, Splitwise ed export simili)
Alcuni file portano un valore per persona su ogni riga - come una colonna per persona, o come un oggetto "shares"/"owed" dentro la riga. Quei valori arrivano in due tipi che sembrano identici e significano l'OPPOSTO, quindi stabilisci quale hai davanti prima di convertire qualsiasi cosa - non darlo per scontato.

Le intestazioni di solito rivelano lo strumento - un indizio da cogliere, mai la parola finale:
- "date,description,category,paid_by,total,<nomi…>" - un export Tricount.
- "Date,Description,Category,Cost,Currency,<nomi…>", con una riga finale "Total balance" - un export Splitwise.

Conferma comunque con l'aritmetica, perché il file può arrivare da ovunque. Prendi qualche riga con tre o più persone e somma i valori per persona:
- Sommano al totale/costo della riga → le colonne sono QUOTE: quanto è costata la porzione di ciascuno. IL MIO COSTO È SEMPLICEMENTE IL MIO VALORE, preso così com'è. Non dividere nulla. (Gli export Tricount sono così. Come qualunque file con valori tutti positivi.)
- Si annullano circa a zero, con positivi e negativi misti → le colonne sono SALDI: quanto ciascuno ha PAGATO meno la sua quota. (Gli export Splitwise sono così.) Solo allora:
  - Il mio valore negativo: il mio costo è il suo valore assoluto.
  - Il mio valore positivo: il mio costo = (Costo − la somma dei valori negativi degli altri presi in positivo) ÷ (il numero di persone con valori positivi). Il resto mi torna indietro, quindi NON è mia spesa.

Prima del JSON, dimmi in tre righe brevi: quale tipo hai trovato e con che prova, quale colonna hai preso come mia, e IL TOTALE DELLA MIA QUOTA su tutte le righe convertite. Quell'ultimo numero è l'unica cosa che posso verificare in cinque secondi contro ciò che Tricount o Splitwise mi mostrano - se non coincide, qualcosa è storto e non devo importare il file.

Se righe diverse si contraddicono, o i valori di una riga né sommano al totale né si annullano a zero, FERMATI e chiedimi - le due regole danno risposte plausibili sui file l'una dell'altra, quindi una scelta sbagliata qui è invisibile dopo. Sbagliare sulle righe divise in parti uguali dà per caso il numero giusto e su quelle diseguali no: esattamente l'errore che nessuno coglie a occhio.

- Un valore vuoto o a zero per me significa che non facevo parte di quella spesa: salta la riga. Salta anche ogni riga dove il mio costo risulta 0 (mi hanno rimborsato del tutto): una transazione a zero è rumore, non spesa.
- Salta del tutto le righe di pareggio: categoria "Payment" o "Rimborso", descrizioni tipo "X paid Y" / "Rimborso", e ogni riga di riepilogo "Total balance". Sono soldi che girano tra persone, non spese.
- Ma una riga dove UNA SOLA persona ha una quota NON è automaticamente un pareggio - di solito significa che qualcuno ha pagato solo per quella persona ("Escursione Balene", 66.78, tutta mia, pagata da un amico). Quella è mia spesa per intero. Decidi da DESCRIZIONE e categoria, mai dal fatto che la riga porti un solo nome: trattarle da pareggi cancella spese vere in silenzio, spesso le più grandi.
- La colonna "paid by" dice chi ha anticipato i soldi. Non è mai il mio costo, nemmeno sulle righe che ho pagato io: usa la mia colonna di quota, e nient'altro.
- Mappa le loro categorie sulle mie come sopra (es. "Dining out" → la mia categoria di cibo più vicina). Una categoria che significa solo "nessuna" - UNCATEGORIZED, OTHER, vuota - NON è una categoria da mappare: deduci quella riga dalla descrizione come ogni riga senza categoria, invece di archiviarla nel contenitore generico.
- Le righe di un viaggio spesso portano la data della PRENOTAZIONE, mesi prima del viaggio (voli, hotel, auto). Mantieni quelle date: è quando i soldi sono usciti. Non spostarle alla settimana del viaggio.
- Usa il contesto del viaggio nelle descrizioni dove aiuta ("Ferry a/r" resta "Ferry a/r").

UN VIAGGIO È UNA COSA SOLA - archivialo come tale
Quando i dati sono un viaggio (un export Tricount o Splitwise che sembra una vacanza, un foglio di viaggio, o perché te lo dico io - chiedi se potrebbe invece essere una casa condivisa), metti OGNI riga sotto ${travelRefIt} - tutto, compresi i pasti, i taxi, le birre e i biglietti del museo. Erano spese di viaggio. Non spargerle tra cibo, trasporti e tempo libero: voglio che il viaggio si legga come un blocco unico, e la sua forma nelle sottocategorie.
- "subcategory": usa una delle MIE sottocategorie ESISTENTI di quella categoria (elencate sotto). È lì che va la categoria o la dicitura del file.
- Decidila dalla CATEGORIA DI ORIGINE quando dice qualcosa di specifico (il loro "FOOD_AND_DRINK" → la mia sottocategoria di cibo, "TRANSPORT" → quella di trasporti, "ACCOMMODATION" → quella di alloggio, "ENTERTAINMENT" → quella di attività).
- Decidila dalla DESCRIZIONE quando la categoria di origine non dice nulla di utile - "UNCATEGORIZED", "OTHER", "TRAVEL" o vuota. Su un export di viaggio "TRAVEL" non porta informazione, visto che è tutto viaggio: leggi "Hotel PD Sud" come hotel, "Volo" come volo, "Cena" come cibo, "Benzina" come trasporto.
- Se nessuna delle due è decisiva, LASCIA FUORI la sottocategoria invece di indovinare. Una vuota è un buco che vedo e riempio; una sbagliata è un buco che sembra pieno.
- Non inventare nuove sottocategorie per questo: usa quelle che ho.
- CHIEDIMI un NOME BREVE per il viaggio (una o due parole - "Azzorre", "Formentera") e premettilo alla descrizione di OGNI riga importata: "Cena porto" diventa "Formentera - Cena porto". Senza, due viaggi collassano in un unico mucchio indistinguibile di righe di viaggio; il nome è ciò che mi permette di ritrovare un viaggio dopo, cercandolo. Mantieni il resto della descrizione com'era, e non premetterlo a una che inizia già col nome. Se ti dico che non voglio un nome, lascia le descrizioni intatte.

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
HOW to ask: put everything you need in ONE message, as a short numbered list under the heading "I need from you:", each question answerable in a word or two - e.g. "1. Which of these is you: Pit, Merlo, Max? 2. Is this a trip? 3. If yes, a short name for it?". Anything you worked out yourself (shares vs balances, and on what evidence) goes in one line each ABOVE the list, never woven between the questions: a question buried in findings gets half-answered, and a half-answered question here becomes wrong data. Do not start converting until I have answered.
- WHICH COLUMN IS ME. If the file has one value per person (a trip split), and no column is unmistakably mine, ASK me before converting anything. My column may be a nickname rather than my name ("Pit" for Pietro), a first name only, or a surname. Do not pick the closest-looking one and carry on: this single decision is either right for every row or wrong for every row, and a file built on the wrong person imports perfectly and is entirely someone else's spending. Tell me the names you found and let me choose.
- WHETHER IT IS A TRIP. Split files are usually holidays, but the same tools get used for flatshares and standing groups. If the rows look like rent, bills and weekly shopping rather than a trip, ASK me before filing everything under my travel category.
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

SPLIT EXPENSES (Tricount, Splitwise and similar trip exports)
Some files carry one value per person on every row - as one column per person, or as a "shares"/"owed" object inside each row. Those values come in two kinds that look identical and mean OPPOSITE things, so work out which one you have before converting anything - do not assume.

The headers usually name the tool, which is a hint worth taking but never the final word:
- "date,description,category,paid_by,total,<names…>" - a Tricount export.
- "Date,Description,Category,Cost,Currency,<names…>", ending in a "Total balance" row - a Splitwise export.

Confirm it with arithmetic either way, because the file can come from anywhere. Take a few rows with three or more people and add up the per-person values:
- They add up to that row's total/cost → the columns are SHARES: what each person's portion cost. MY COST IS SIMPLY MY OWN VALUE, taken as written. Do not divide anything. (Tricount exports are this kind. So is anything whose values are all positive.)
- They cancel out to roughly zero, with a mix of positives and negatives → the columns are BALANCES: what each person PAID minus their share. (Splitwise exports are this kind.) Only then:
  - My value negative: my cost is its absolute value.
  - My value positive: my cost = (Cost − the sum of everyone's negative values taken as positive) ÷ (the number of people with positive values). The rest comes back to me, so it is NOT my spending.

Before the JSON, tell me in three short lines: which kind you found and on what evidence, which column you took as mine, and THE TOTAL OF MY SHARE across every row you converted. That last number is the one thing I can check in five seconds against what Tricount or Splitwise shows for me - if it does not match, something is wrong and I should not import the file.

If different rows disagree, or a row's values neither sum to its total nor cancel to zero, STOP and ask me - the two rules give plausible-looking answers on each other's files, so a wrong choice here is invisible afterwards. Getting it wrong on evenly-split rows happens to give the right number and on unevenly-split ones does not, which is exactly the kind of error nobody catches by eye.
- An empty, blank or zero value for me means I was not part of that expense: skip the row. Also skip any row where my cost works out to 0 (I was fully paid back): a zero-amount transaction is clutter, not spending.
- Skip settlement rows entirely: Category "Payment" or "Reimbursement", descriptions like "X paid Y" / "Rimborso", and any "Total balance" summary line. That is money moving between people, not spending.
- But a row where only ONE person has a share is NOT automatically a settlement - it usually means somebody paid for that person alone ("Escursione Balene", 66.78, all mine, paid by a friend). That is my spending in full. Decide by the DESCRIPTION and category, never by the row having one name on it: treating those as settlements silently deletes real expenses, often the big ones.
- The "paid by" column says who fronted the money. It is never my cost, not even on rows I paid: use my own share column, and nothing else.
- Map their categories to mine as above (e.g. "Dining out" → my closest food category). A category that just means "none" - UNCATEGORIZED, OTHER, blank - is NOT a category to map: work that row out from its description like any uncategorised row, rather than filing it under Others.
- Trip rows are often dated when they were BOOKED, months before the trip (flights, hotels, cars). Keep those dates: that is when the money left. Do not move them to the trip week.
- Use the trip context in descriptions where it helps ("Ferry a/r" stays "Ferry a/r").

A TRIP IS ONE THING - file it as one
When the data is a trip (a Tricount or Splitwise export that looks like a holiday, a trip spreadsheet, or because I tell you it is - ask if it might be a flatshare instead), put EVERY row of it under ${travelRefEn} - all of it, including the meals, the taxis, the beers and the museum tickets. Those were travel spending. Do not scatter them across Food & Drinks, Transports and Leisure: I want the trip to read as one block, and the shape of it in the subcategories.
- "subcategory": use one of MY EXISTING subcategories of that category (they are listed below with it). That is where the source's own category or wording goes.
- Decide it from the SOURCE CATEGORY when that says something specific (their "FOOD_AND_DRINK" → my food subcategory, "TRANSPORT" → my transport one, "ACCOMMODATION" → my lodging one, "ENTERTAINMENT" → my activities one).
- Decide it from the DESCRIPTION when the source category says nothing useful - "UNCATEGORIZED", "OTHER", "TRAVEL", or blank. On a trip export "TRAVEL" carries no information, since everything is travel: read "Hotel PD Sud" as a hotel, "Volo" as a flight, "Cena" as food, "Benzina" as transportation.
- If neither is decisive, LEAVE the subcategory out rather than guessing. An empty one is a gap I can see and fill; a wrong one is a gap that looks filled.
- Do not invent new subcategories for this: use the ones I have.
- ASK me for a SHORT NAME for the trip (a word or two - "Azores", "Formentera") and prefix EVERY imported row's description with it: "Cena porto" becomes "Formentera - Cena porto". Without it, two trips collapse into one indistinguishable pile of travel rows; the name is what lets me pull one trip back up later by searching it. Keep the rest of the description as it was, and do not prefix one that already starts with the name. If I say I do not want a name, leave descriptions untouched.

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
        toast.error(t('toast.copyFailed'));
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
        {/* --ink, not a literal. This was #3A3A3C: near-black, chosen against
            the light card and never revisited, so in dark mode the three
            steps that explain the whole feature were grey on grey. */}
        <p style={{ color: 'var(--ink)', fontSize: 14, lineHeight: 1.5 }}>{children}</p>
      </div>
    );

    return (
      <div className="flex flex-col" style={SUBPAGE_STYLE}>
        <div style={{ backgroundColor: 'var(--bg-page)' }}>
          <div className="px-6 pb-4 pt-0">
            <div className="flex items-center justify-center relative">
              <button
                onClick={() => navTransition('back', () => setShowImport(false))}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: 'var(--accent-ink)' }} />
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
                {getLanguage() === 'it' ? 'Un export di viaggio da Splitwise o Tricount arriva come sola tua quota - i pareggi vengono saltati.' : 'A Splitwise or Tricount trip export lands as your share only - settlements are skipped.'}
              </p>
            </div>
          </div>

          {/* Steps */}
          <div className="bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-4">
            <Step n={1}>
              {/* The app's first external link. Tricount has no export button
                  of its own, so the name links to the tool that makes one
                  from a share link (client-side - the trip stays in the
                  user's browser). target=_blank because from the installed
                  PWA this must open the system browser, which is where that
                  tool has to run anyway. */}
              {getLanguage() === 'it'
                ? <>Apri un assistente AI qualsiasi (ChatGPT, Claude, Gemini…). Incolla il prompt qui sotto e allega il tuo file - un foglio di calcolo, un estratto conto (PDF o CSV), un export di viaggio Splitwise o{' '}
              <a href="https://tricount-exporter.pages.dev" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-ink)', fontWeight: 600, textDecoration: 'underline' }}>Tricount</a>,
              screenshot o una tabella incollata. Le spese condivise arrivano come sola tua quota - i pareggi tra persone vengono saltati.</>
                : <>Open any AI assistant (ChatGPT, Claude, Gemini…). Paste the prompt below and attach your file -
              a spreadsheet, a bank/card statement (PDF or CSV), a Splitwise or{' '}
              <a href="https://tricount-exporter.pages.dev" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-ink)', fontWeight: 600, textDecoration: 'underline' }}>Tricount</a>{' '}
              trip export, screenshots, or a pasted table. Split expenses come in as your share only - settlements between people are skipped.</>}
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
                // A fixed light ink, because the pane under it is dark in BOTH
                // themes (--chip-ink). This read var(--line) - the hairline
                // token - which happens to be light in light mode and so
                // looked fine, and is #3E3E47 in dark mode against a #41414B
                // pane: the prompt was three greys away from invisible.
                color: 'rgba(255, 255, 255, 0.78)',
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
          {/* --ink-3, the same token the two cards above use, and measured:
              --disabled (what this was) reads 2.3:1 in light mode and --ink-2
              only 3.0, both under the 4.5 floor for 12px prose. --ink-3 clears
              it at 4.9 light / 8.0 dark. --disabled means a control you cannot
              use; borrowing it for a caption made this the dimmest text on the
              screen in BOTH themes, which is why the dark-mode report was the
              first anyone noticed. */}
          <p style={{ color: 'var(--ink-3)', fontSize: 12, lineHeight: 1.5, marginTop: 10 }}>
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
        onBack={() => navTransition('back', () => setShowSources(false))}
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
                onClick={() => navTransition('back', () => setShowScheduled(false))}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: 'var(--accent-ink)' }} />
              </button>
              <h1 style={{ color: 'var(--ink)', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>
                {t('sched.title')}
              </h1>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: DOCK_CLEARANCE }}>
          <ScheduledManager
            household={household}
            partner={partner}
            userName={userName}
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
                onClick={() => navTransition('back', closeSupport)}
                className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              >
                <ChevronLeft size={24} style={{ color: 'var(--accent-ink)' }} />
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

            {/* What kind of message this is. One form either way - a problem
                report just travels with a small technical block appended, so
                a bug from a stranger's phone arrives debuggable. */}
            <div className="flex gap-2 mb-4">
              {(['feedback', 'problem'] as const).map((topicOpt) => (
                <button
                  key={topicOpt}
                  data-support-topic={topicOpt}
                  onClick={() => setSupportTopic(topicOpt)}
                  className="px-4 py-2 rounded-full text-sm font-medium transition-colors"
                  style={
                    supportTopic === topicOpt
                      ? { backgroundColor: 'var(--wash-accent2)', color: 'var(--accent-ink)', border: '1px solid transparent' }
                      : { backgroundColor: 'var(--bg-card)', color: 'var(--ink-2)', border: '1px solid var(--line-2)' }
                  }
                >
                  {t(topicOpt === 'feedback' ? 'set.supportTopicFeedback' : 'set.supportTopicProblem')}
                </button>
              ))}
            </div>
            {supportTopic === 'problem' && (
              <p data-diag-note style={{ color: 'var(--faint)', fontSize: 12, lineHeight: 1.45, marginTop: -8, marginBottom: 16 }}>
                {t('set.supportDiagNote')}
              </p>
            )}

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
              // The Edge Function rejects messages over 5000 chars, and the
              // topic line plus a problem report's diagnostics block ride
              // inside the same string - so the textarea leaves them room.
              maxLength={supportTopic === 'problem' ? 4600 : 4900}
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
              <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: 'var(--accent-ink)', fontWeight: 500 }}>{SUPPORT_EMAIL}</a>
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
          {/* Where the app reckons you are, from the timezone it already reads
              for the travel nudge. Costs nothing, and it is the honest thing
              to show: the app is quietly using this, so it should say so
              somewhere a person can find it rather than only in a screen
              behind a code.

              Silent when the zone maps to nothing - a header that says
              "currently in unknown" is worse than one that says nothing. */}
          {here && (
            <>
              {' · '}
              <span data-here style={{ whiteSpace: 'nowrap' }}>
                {t('set.here', { flag: here.flag, country: here.name })}
              </span>
            </>
          )}
        </p>
      </div>

      {/* Account section — sign-in / sign-out + sync status */}
      <div className="px-6 mb-5">
        <p className="mb-1.5 px-1" style={{ color: 'var(--ink-2)', fontSize: '13px' }}>
          {t('set.sec.account')}
        </p>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {isGuest ? (
            <button
              onClick={onSignInToSync}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            >
              <Cloud className="w-5 h-5" style={{ color: 'var(--accent-ink)' }} strokeWidth={2} />
              <div className="flex-1 text-left">
                <div style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.signIn')}</div>
                <div style={{ color: 'var(--ink-2)', fontSize: '13px' }}>{t('set.signInSub')}</div>
              </div>
              <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
            </button>
          ) : (
            <>
              <div className="w-full flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: '1px solid var(--bg-inset)' }} data-sync-row>
                <Cloud className="w-5 h-5" style={{ color: syncMeta.color }} strokeWidth={2} />
                <div className="flex-1 min-w-0">
                  <div style={{ color: 'var(--ink)', fontSize: '15px' }}>{syncMeta.label}</div>
                  {/* Offline, which account you are is not the thing you came
                      here to find out - whether your data is alright is. The
                      email is one tap away in Profile and comes straight back
                      when the connection does. */}
                  {syncStatus === 'offline' ? (
                    <div style={{ color: 'var(--ink-2)', fontSize: '13px', lineHeight: 1.4 }} data-sync-offline-why>
                      {t('sync.offlineWhy')}
                    </div>
                  ) : (
                    userEmail && <div className="truncate" style={{ color: 'var(--ink-2)', fontSize: '13px' }}>{userEmail}</div>
                  )}
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
        <p className="mb-1.5 px-1" style={{ color: 'var(--ink-2)', fontSize: '13px' }}>
          {t('set.sec.preferences')}
        </p>
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
            onClick={() => navTransition('forward', () => setShowLanguage(true))}
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
            onClick={() => navTransition('forward', () => setShowCurrencySelector(true))}
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
            onClick={() => navTransition('forward', () => setShowAppearance(true))}
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
            onClick={() => navTransition('forward', () => setShowNotifications(true))}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
          >
            <RowIcon icon={Bell} tone={TILE.notify} />
            <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.notifRow')}</span>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
          </button>
        </div>

        {/* What your transactions are built from. Its own card because these
            are the rows you come BACK to - categories shift as your spending
            does - while the four above are set during the first week and then
            never again. Ten rows in one run buried the returning ones under
            the finished ones. */}
        <p className="mt-5 mb-1.5 px-1" style={{ color: 'var(--ink-2)', fontSize: '13px' }}>
          {t('set.sec.money')}
        </p>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button
            onClick={() => navTransition('forward', () => setShowCategories(true))}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid var(--bg-inset)' }}
          >
            <RowIcon icon={Layers} tone={TILE.category} />
            <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.categories')}</span>
            <span style={{ color: 'var(--ink-2)', fontSize: '14px' }}>{categories.length + incomeCategories.length}</span>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
          </button>

          <button
            onClick={() => navTransition('forward', () => setShowSources(true))}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid var(--bg-inset)' }}
          >
            <RowIcon icon={Landmark} tone={TILE.source} />
            <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.sources')}</span>
            <span style={{ color: 'var(--ink-2)', fontSize: '14px' }}>{sources.length}</span>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
          </button>

          <button
            onClick={() => navTransition('forward', () => setShowScheduled(true))}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid var(--bg-inset)' }}
          >
            <RowIcon icon={CalendarClock} tone={TILE.recurring} />
            <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.scheduled')}</span>
            <span style={{ color: 'var(--ink-2)', fontSize: '14px' }}>{upcomingSchedules(recurringRules).length}</span>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
          </button>

          <button
            onClick={() => navTransition('forward', () => setShowShared(true))}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
          >
            <RowIcon icon={Split} tone={TILE.shared} />
            {/* Wore a BETA mark while real pairs settled it in; retired once
                the owner called it stable (Aug 2026). */}
            <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.shared')}</span>
            <span style={{ color: 'var(--ink-2)', fontSize: '14px' }}>
              {household && partner ? partner.name : t('set.shared.off')}
            </span>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
          </button>
        </div>

        {/* Help. Last of the unlabelled cards, because the labelled ones below
            are a different kind of thing: everything above navigates somewhere,
            everything below Data DOES something to your ledger. */}
        <p className="mt-5 mb-1.5 px-1" style={{ color: 'var(--ink-2)', fontSize: '13px' }}>
          {t('set.sec.help')}
        </p>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button
            onClick={() => navTransition('forward', openSupport)}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid var(--bg-inset)' }}
          >
            <RowIcon icon={LifeBuoy} tone={TILE.contact} />
            <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.support')}</span>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
          </button>

          <button
            onClick={() => navTransition('forward', () => setShowAbout(true))}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
          >
            <RowIcon icon={HelpCircle} tone={TILE.about} />
            <span className="flex-1 text-left" style={{ color: 'var(--ink)', fontSize: '15px' }}>{t('set.about')}</span>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--ghost)' }} />
          </button>
        </div>

        {/* Data section — demo data is for testing the app, erase resets everything */}
        <p className="mt-5 mb-1.5 px-1" style={{ color: 'var(--ink-2)', fontSize: '13px' }}>
          {t('set.data')}
        </p>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {onImportData && (
            <button
              onClick={() => navTransition('forward', () => setShowImport(true))}
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

        {/* Three tiers of the SAME question - how much of this goes? - so they
            are written to be read against each other: each subtitle names what
            is destroyed and then what survives, in that order, so the scale is
            legible without opening anything. Severity is the reading order.

            Comparison is the whole point. Nobody can judge "Erase all data" in
            isolation; they judge it against what else was on offer. These used
            to be phrased independently - one led with the outcome ("Starts
            fresh"), the next with the deletion - so the reader had to open two
            dialogs and remember the first to tell them apart. */}
        <p className="mt-5 mb-1.5 px-1" style={{ color: 'var(--ink-2)', fontSize: '13px' }}>
          {t('set.danger')}
        </p>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button
            onClick={() => openConfirm('clear-txns')}
            className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={{ borderBottom: '1px solid var(--bg-inset)' }}
          >
            <Eraser className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--tone-danger)' }} strokeWidth={2} />
            <div className="flex-1 text-left">
              <div style={{ color: 'var(--tone-danger)', fontSize: '15px' }}>{t('set.clearTxns')}</div>
              <div style={{ color: 'var(--ink-2)', fontSize: '13px', marginTop: 2 }}>
                {t('set.clearTxnsSub')}
              </div>
            </div>
          </button>

          <button
            onClick={() => openConfirm('erase')}
            className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
            style={onDeleteAccount && !isGuest ? { borderBottom: '1px solid var(--bg-inset)' } : undefined}
          >
            <Trash2 className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--tone-danger)' }} strokeWidth={2} />
            <div className="flex-1 text-left">
              <div style={{ color: 'var(--tone-danger)', fontSize: '15px' }}>{t('set.eraseAll')}</div>
              <div style={{ color: 'var(--ink-2)', fontSize: '13px', marginTop: 2 }}>
                {t(isGuest ? 'set.eraseAllSubGuest' : 'set.eraseAllSub')}
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

        {/* Signature, and the way into the developer screen.

            The button is the quietest thing on the page - a hairline wrench at
            the faint token, in the dead space beside the signature. It has to
            be reachable without a cable but must not read as a feature: a
            tester needs it, and nobody else should ever wonder what it does.
            The code is what actually keeps it shut; the placement only keeps
            it from being noticed. */}
        <div className="mt-8 mb-1 text-center relative">
          <p style={{ color: 'var(--faint)', fontSize: '12px', fontWeight: 500 }}>TracklyLab · v{__APP_VERSION__}</p>
          <p style={{ color: 'var(--faint)', fontSize: '12px', fontStyle: 'italic', marginTop: '2px' }}>
            {t('set.signature')}
          </p>
          <button
            data-dev-entry
            aria-label="Developer"
            onClick={() => {
              // Unlocked once, open from then on: retyping a code every visit
              // is a toll on the only person who ever pays it.
              if (devUnlocked) navTransition('forward', () => setShowDev(true));
              else setDevAsking((v) => !v);
            }}
            className="absolute right-2 bottom-0 w-9 h-9 flex items-center justify-center rounded-full active:scale-90 transition-transform"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Wrench className="w-3.5 h-3.5" style={{ color: 'var(--faint)', opacity: 0.5 }} strokeWidth={2} />
          </button>
        </div>



      </div>

      {/* The code, as a dialog rather than a field at the foot of the page.
          Inline, it rendered where the page had already run out: the keyboard
          opened over it and the floating dock covered the rest, so the one
          input you had to see was the one thing you could not. A centred
          overlay is above both, and carries data-overlay so the dock's
          mis-tap guard lets its taps through. */}
      {devAsking && !devUnlocked && (
        <div
          data-overlay
          className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-6"
          style={{ paddingTop: '18vh' }}
          onClick={() => { setDevAsking(false); setDevCode(''); }}
        >
          <div
            className="rounded-2xl p-6 max-w-sm w-full shadow-xl"
            style={{ backgroundColor: 'var(--bg-card)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ color: 'var(--ink)', fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Developer</h3>
            <p style={{ color: 'var(--ink-2)', fontSize: 12.5, marginBottom: 14 }}>
              Enter the access code.
            </p>
            <input
              autoFocus
              data-dev-code
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={devCode}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '');
                setDevCode(v);
                // Opens on the fourth digit rather than behind a button: there
                // is one correct answer and nothing to confirm about it.
                if (v === '4700') {
                  setDevUnlocked(true);
                  saveDevUnlocked(true);
                  setDevAsking(false);
                  setDevCode('');
                  navTransition('forward', () => setShowDev(true));
                } else if (v.length === 4) {
                  setDevCode('');
                }
              }}
              placeholder="••••"
              className="w-full text-center rounded-xl outline-none tabular-nums"
              style={{
                backgroundColor: 'var(--bg-field)', color: 'var(--ink)',
                // 16px, or iOS zooms the page in on focus - the form-control
                // floor the rest of the app already keeps to.
                fontSize: 22, padding: '12px 0', letterSpacing: '0.4em',
              }}
            />
            <button
              onClick={() => { setDevAsking(false); setDevCode(''); }}
              className="w-full mt-4 px-4 py-3 rounded-xl font-medium active:bg-neutral-200"
              style={{ backgroundColor: 'var(--bg-inset)', color: 'var(--ink)' }}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

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
      {confirmAction === 'clear-txns' && (
        <ConfirmDialog
          title={t('conf.clearTitle')}
          message={
            t('conf.clearMsg') + (household && partner ? ' ' + t('conf.clearMsgShared', { name: partner.name }) : '')
          }
          confirmLabel={t('conf.clearCta')}
          onConfirm={handleConfirm}
          onCancel={closeConfirm}
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