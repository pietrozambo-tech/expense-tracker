import { useState } from 'react';
import { X, BarChart3, ArrowDownToLine, ListChecks, ShieldCheck, Check, ChevronRight } from 'lucide-react';
import { t } from '../i18n';
import { installPlatform, type Nudge } from '../lib/nudges';

// One slim card at the top of the Dashboard, one nudge at a time - see
// lib/nudges.ts for which one and why. The card is advice, so everything
// about it stays dismissible and quiet: no colour shouting, one line of body,
// and the X answers "no" permanently (the backup card alone re-asks after a
// month - its risk compounds instead of expiring).

const ICONS: Record<Nudge, typeof BarChart3> = {
  backup: ShieldCheck,
  recap: BarChart3,
  install: ArrowDownToLine,
  customize: ListChecks,
};

export interface RecapFacts {
  /** Month name, already localised ("July" / "Luglio"). */
  month: string;
  /** Pre-formatted amounts - the card does no money arithmetic. */
  spent: string;
  saved: string | null; // null when the month had no income to save from
  topCategory: string | null;
}

/**
 * What the setup card still has to say, read from the ledger and the settings
 * rather than from a stored flag: `true` means that line is done.
 *
 * Which is the whole reason it can be a checklist and not a leaflet. Nobody
 * has to tell the app they have finished - touching one category ticks its own
 * line, and when all three are ticked the card is not due any more and stops
 * appearing. There is no "mark as done" to forget.
 */
export interface SetupProgress {
  categories: boolean;
  sources: boolean;
  budget: boolean;
}

type SetupKey = 'categories' | 'sources' | 'budget';

export function NudgeCenter({
  nudge,
  recap,
  setup,
  currencySymbol = '',
  onDismiss,
  onAction,
  onSetBudget,
}: {
  nudge: Nudge;
  recap?: RecapFacts;
  setup?: SetupProgress;
  /** For the budget field - the card does no currency lookups of its own. */
  currencySymbol?: string;
  onDismiss: () => void;
  /** recap -> Trend; customize -> the part of Settings the row names. */
  onAction: (target?: 'categories' | 'sources') => void;
  onSetBudget?: (amount: number) => void;
}) {
  // The install card's steps unfold in place: a sheet for three lines of
  // instructions is ceremony, and the unfold keeps Safari's Share button
  // visible below while the user follows them.
  const [showSteps, setShowSteps] = useState(false);
  // The budget is the one line that is answered HERE rather than somewhere
  // else: it is a number, not a screenful, and its own card already worked
  // this way. Sending someone to Settings to type four digits would be a
  // worse card than the one this replaces.
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetValue, setBudgetValue] = useState('');
  const budgetAmount = parseFloat(budgetValue.replace(',', '.'));
  const budgetValid = isFinite(budgetAmount) && budgetAmount > 0;
  const Icon = ICONS[nudge];

  const title =
    nudge === 'backup' ? t('nudge.backupTitle')
    : nudge === 'recap' ? t('nudge.recapTitle', { month: recap?.month ?? '' })
    : nudge === 'install' ? t('nudge.installTitle')
    : t('nudge.customizeTitle');

  const body =
    nudge === 'backup' ? t('nudge.backupBody')
    : nudge === 'recap'
      ? [
          t('nudge.recapSpent', { amount: recap?.spent ?? '' }),
          recap?.topCategory ? t('nudge.recapTop', { name: recap.topCategory }) : null,
          recap?.saved ? t('nudge.recapSaved', { amount: recap.saved }) : null,
        ].filter(Boolean).join(' · ')
      : nudge === 'install' ? t('nudge.installBody')
      : t('nudge.customizeBody');

  const cta =
    nudge === 'backup' ? t('nudge.backupCta')
    : nudge === 'recap' ? t('nudge.recapCta')
    : nudge === 'install' ? (showSteps ? null : t('nudge.installHow'))
    : null; // customize speaks through its checklist below

  const tasks: { key: SetupKey; label: string; done: boolean }[] =
    nudge === 'customize'
      ? [
          { key: 'categories', label: t('nudge.setupCategories'), done: !!setup?.categories },
          { key: 'sources', label: t('nudge.setupSources'), done: !!setup?.sources },
          { key: 'budget', label: t('nudge.setupBudget'), done: !!setup?.budget },
        ]
      : [];
  const doneCount = tasks.filter((x) => x.done).length;

  const tapTask = (key: SetupKey) => {
    if (key === 'budget') setBudgetOpen(true);
    else onAction(key);
  };
  const saveBudget = () => {
    if (!budgetValid) return;
    onSetBudget?.(budgetAmount);
    setBudgetOpen(false);
  };

  const steps =
    installPlatform() === 'android'
      ? [t('nudge.installAnd1'), t('nudge.installAnd2'), t('nudge.installAnd3')]
      : [t('nudge.installIos1'), t('nudge.installIos2'), t('nudge.installIos3')];

  return (
    <div
      data-nudge={nudge}
      // Spaced like the Dashboard, not like itself. This card was written with
      // its own numbers - mx-4 and no bottom margin - which left it 8px wider
      // per side than every other card on the screen AND flush against the
      // hero below it, the two touching with no seam. mx-6 is the gutter the
      // header, the hero and the category list all use; mb-4 is the hero's own
      // bottom margin, so the rhythm down the page stays even.
      className="mx-6 mt-3 mb-4 px-4 py-3.5 bg-white rounded-2xl"
      style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)' }}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex items-center justify-center flex-shrink-0 rounded-xl"
          style={{ width: 34, height: 34, backgroundColor: 'var(--wash-accent2)' }}
        >
          <Icon className="w-[18px] h-[18px]" style={{ color: 'var(--accent-ink)' }} strokeWidth={2} />
        </span>
        <div className="flex-1 min-w-0">
          <p style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 600, lineHeight: '18px' }}>{title}</p>
          <p className="mt-0.5" style={{ color: 'var(--ink-2)', fontSize: 12.5, lineHeight: '17px' }}>{body}</p>
          {tasks.length > 0 && (
            <>
              <div className="mt-2">
                {tasks.map((task, i) => (
                  <div key={task.key} style={{ borderTop: i ? '1px solid var(--line-2)' : undefined }}>
                  <button
                    data-setup-task={task.key}
                    data-setup-done={task.done ? 'yes' : 'no'}
                    onClick={() => (task.done ? undefined : tapTask(task.key))}
                    disabled={task.done}
                    aria-label={`${task.label} - ${t('nudge.setupGo')}`}
                    className="w-full flex items-center gap-2.5 py-1.5 text-left"
                  >
                    <span
                      className="flex-shrink-0 grid place-items-center rounded-full"
                      style={{
                        width: 19,
                        height: 19,
                        backgroundColor: task.done ? 'var(--tone-income)' : 'transparent',
                        border: task.done ? '1.5px solid transparent' : '1.5px solid var(--ghost)',
                      }}
                    >
                      {task.done && <Check className="w-[11px] h-[11px] text-white" strokeWidth={3.4} />}
                    </span>
                    <span
                      className="flex-1 truncate"
                      style={{
                        fontSize: 13,
                        color: task.done ? 'var(--ink-2)' : 'var(--ink)',
                        textDecoration: task.done ? 'line-through' : undefined,
                        textDecorationColor: 'var(--ghost)',
                      }}
                    >
                      {task.label}
                    </span>
                    {/* A chevron, not the words "Set up": at 390px those words
                        cost enough room to truncate "Categories and
                        subcategories" into "Categories and subcat...", and the
                        label is the half that has to be readable. The circle
                        on the left already says this is a task; the chevron
                        says it goes somewhere. */}
                    {/* Gone once the budget field is open: it says "this goes
                        somewhere", and by then the answer is on screen. */}
                    {!task.done && !(task.key === 'budget' && budgetOpen) && (
                      <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-ink)' }} strokeWidth={2.5} />
                    )}
                  </button>
                  {/* The budget's answer, typed on the spot.
                      Sized like a field, not like a block. The input must be
                      16px or iOS zooms the page in on focus - which made it the
                      largest type in a card of 13px rows, and a full-width box
                      with a sentence for a placeholder ("How much per month?")
                      read as a form that had landed on the checklist. The type
                      size is fixed, so the room it takes is what gives: a box
                      wide enough for the digits, and "0" for a placeholder, the
                      same as every other amount field in the app. */}
                  {task.key === 'budget' && !task.done && budgetOpen && (
                    <div className="flex items-center gap-2 pb-1.5 pl-[29px]">
                      <div
                        className="flex items-center gap-1 px-2.5 rounded-lg flex-shrink-0"
                        style={{ backgroundColor: 'var(--bg-field)', width: 104 }}
                      >
                        <span style={{ color: 'var(--ink-2)', fontSize: 13 }}>{currencySymbol}</span>
                        <input
                          autoFocus
                          data-setup-budget
                          type="text"
                          inputMode="decimal"
                          value={budgetValue}
                          onChange={(e) => {
                            const v = e.target.value.replace(',', '.');
                            if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setBudgetValue(v);
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveBudget(); }}
                          placeholder="0"
                          aria-label={t('nudge.setupBudget')}
                          className="w-full min-w-0 py-1 bg-transparent outline-none tabular-nums"
                          // 16, not smaller: below that iOS zooms the page in
                          // on focus. See the form-control floor in theme.css.
                          style={{ fontSize: 16, color: 'var(--ink)' }}
                        />
                      </div>
                      <button
                        data-setup-budget-save
                        onClick={saveBudget}
                        disabled={!budgetValid}
                        className="px-2.5 py-1 rounded-lg font-medium flex-shrink-0"
                        style={{
                          backgroundColor: budgetValid ? '#4F74F3' : 'var(--line)',
                          color: budgetValid ? '#FFFFFF' : 'var(--disabled)',
                          fontSize: 12.5,
                        }}
                      >
                        {t('budget.nudge.save')}
                      </button>
                    </div>
                  )}
                  </div>
                ))}
              </div>
              <div
                className="mt-2 rounded-full overflow-hidden"
                data-setup-progress={`${doneCount}/${tasks.length}`}
                style={{ height: 4, backgroundColor: 'var(--bg-track)' }}
              >
                <span
                  className="block rounded-full"
                  style={{ height: '100%', width: `${(doneCount / tasks.length) * 100}%`, backgroundColor: '#4F74F3' }}
                />
              </div>
            </>
          )}
          {nudge === 'install' && showSteps && (
            <ol className="mt-2 flex flex-col gap-1">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-2" style={{ color: 'var(--ink-2)', fontSize: 12.5, lineHeight: '17px' }}>
                  <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{i + 1}.</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          )}
          {cta && (
            <button
              data-nudge-cta
              onClick={() => (nudge === 'install' ? setShowSteps(true) : onAction())}
              className="mt-1.5 flex items-center gap-0.5"
              style={{ color: 'var(--accent-ink)', fontSize: 13, fontWeight: 600 }}
            >
              {cta}
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
            </button>
          )}
        </div>
        <button
          data-nudge-dismiss
          onClick={onDismiss}
          aria-label={t('nudge.dismiss')}
          className="p-1.5 -m-1 rounded-lg flex-shrink-0"
        >
          <X className="w-4 h-4" style={{ color: 'var(--ink-3, var(--ink-2))' }} />
        </button>
      </div>
    </div>
  );
}
