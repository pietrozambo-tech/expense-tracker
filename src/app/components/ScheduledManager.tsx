import { useState } from 'react';
import { Plus, Pencil, Trash2, CalendarClock } from 'lucide-react';
import { t } from '../i18n';
import { translateRecurrence } from '../i18n/store';
import { parseLocalDate } from '../lib/dates';
import { dateLocale } from '../i18n/store';
import { getCategoryIcon } from './categoryIcons';
import { AmountText } from './AmountText';
import { SourceLogo } from './SourceLogo';
import { ConfirmDialog } from './ConfirmDialog';
import { type CategoryDraft } from './CreateCategorySheet';
import { ScheduleEditor } from './ScheduleEditor';
import { upcomingSchedules, strandedRules } from '../lib/recurrence';
import { needsAbbreviation } from '../utils/currency';
import type { Category, RecurringRule, Source, Transaction, TransactionType } from '../types';
import type { CategoryOrder } from '../lib/categoryOrder';

// "What is coming" - the only screen in the app that looks forward.
//
// Every row is a PROJECTION of a RecurringRule, computed on render by
// upcomingSchedules(). Nothing here is stored and nothing is materialized: a
// future transaction would be counted by Activity, the Dashboard and Trend for
// a month that has not happened, which is exactly the disagreement between tabs
// this screen must not introduce. The engine still creates each occurrence on
// the day it falls due, as it always has.
//
// Ordered by what fires next rather than by name, because the question the
// screen answers is "what is about to leave my account".
export interface ScheduledManagerProps {
  rules: RecurringRule[];
  /** The ledger, read-only: the editor reads a bill's charge history. */
  transactions: Transaction[];
  categories: Category[];
  /** Passed straight through to the editor's category grid. */
  categoryOrder?: CategoryOrder;
  incomeCategories: Category[];
  sources: Source[];
  currency: string;
  defaultSourceExpense?: string;
  defaultSourceIncome?: string;
  /** Passed straight to the editor, so a schedule can be split like any other
   *  expense. Absent when sharing is off. */
  household?: import('../types').Household | null;
  partner?: import('../types').Person | null;
  userName?: string;
  /** Passed straight through to the editor's category grid. Absent, the grid
   *  is exactly what it was. */
  onCreateCategory?: (draft: CategoryDraft, type: 'expense' | 'income') => string;
  onCreateSubcategory?: (categoryId: string, name: string) => void;
  onCreate: (draft: ScheduleDraft) => void;
  onUpdate: (ruleId: string, draft: ScheduleDraft) => void;
  onStop: (ruleId: string) => void;
  onModalOpenChange: (open: boolean) => void;
}

export interface ScheduleDraft {
  description: string;
  amount: number;
  currency: string;
  category: Category;
  subcategory?: string;
  sourceId?: string;
  type: TransactionType;
  /** Present when the series is shared; every occurrence inherits it. */
  split?: { mine: number; withIds?: string[]; paidByThem?: boolean };
  rule: string;
  /** First date the schedule should fire. */
  start: string;
  /**
   * Set only when the user answers that the OLD amount was wrong rather than
   * that the price changed: the recorded charges still carrying this amount
   * are rewritten to the new one. Absent means "from the next charge on",
   * which is the default and leaves the ledger untouched.
   */
  correctRecordedAmount?: number;
}

// "Tue 2 Sep" - enough to plan against, short enough for a chip. Deliberately
// not the relative "in 12 days": the question is which day money moves.
function dueLabel(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
}

export function ScheduledManager({
  rules,
  transactions,
  categories,
  categoryOrder,
  incomeCategories,
  sources,
  currency,
  defaultSourceExpense,
  defaultSourceIncome,
  household,
  partner,
  userName,
  onCreateCategory,
  onCreateSubcategory,
  onCreate,
  onUpdate,
  onStop,
  onModalOpenChange,
}: ScheduledManagerProps) {
  const [editing, setEditing] = useState<RecurringRule | null>(null);
  const [adding, setAdding] = useState(false);
  const [stopping, setStopping] = useState<RecurringRule | null>(null);

  const open = (fn: () => void) => { fn(); onModalOpenChange(true); };
  const close = (fn: () => void) => { fn(); onModalOpenChange(false); };

  const upcoming = upcomingSchedules(rules);
  const stranded = strandedRules(rules);
  // Decided once for the whole list, like the Dashboard's breakdown rows: a
  // column that mixed "1.2MM" with "3,400" would read as two different scales.
  // Tighter than the Dashboard's default budget, because here the amount is
  // taking width away from the description sitting next to it.
  const abbrev = needsAbbreviation(upcoming.map((u) => u.rule.template.amount), currency, 9)
    ? ('fit' as const)
    : undefined;

  return (
    <div style={{ backgroundColor: 'var(--bg-page)' }}>
      {upcoming.length === 0 && stranded.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'var(--bg-inset)' }}>
            <CalendarClock className="w-8 h-8" style={{ color: 'var(--ink-2)' }} />
          </div>
          <h2 style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 18, marginBottom: 8 }}>{t('sched.emptyTitle')}</h2>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 1.45 }}>
            {t('sched.emptyBody')}
          </p>
        </div>
      ) : (
        <div className="px-6 space-y-2">
          {upcoming.map(({ rule, next, last }) => {
            const Icon = getCategoryIcon(rule.template.category?.icon ?? 'MoreHorizontal');
            const source = sources.find((s) => s.id === rule.template.sourceId);
            const income = rule.template.type === 'income';
            return (
              <div
                key={rule.id}
                className="rounded-xl overflow-hidden px-4 py-3"
                style={{ backgroundColor: 'var(--bg-card)', boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)' }}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-full ${rule.template.category?.bgColor ?? 'bg-neutral-100'} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-4 h-4 ${rule.template.category?.color ?? 'text-neutral-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate" style={{ color: 'var(--ink)', fontWeight: 500, fontSize: 15 }}>
                      {rule.template.description}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5" style={{ color: 'var(--ink-2)', fontSize: 11 }}>
                      <span>{translateRecurrence(rule.rule)}</span>
                      {source && <span aria-hidden="true">·</span>}
                      {source && <SourceLogo source={source} size={12} />}
                    </div>
                  </div>
                  <AmountText
                    amount={rule.template.amount}
                    currency={rule.template.currency || currency}
                    // Cents when the bill has them: 9.99 and 44.90 both read
                    // as "10" and "45" rounded, which is not what leaves the
                    // account. Whole amounts stay whole - "800.00" is noise.
                    decimals={rule.template.amount % 1 ? 2 : 0}
                    abbreviate={abbrev}
                    sign={income ? '+' : '-'}
                    style={{ color: income ? 'var(--tone-income)' : 'var(--ink)', fontSize: 15, fontWeight: 600 }}
                  />
                </div>
                <div className="flex items-center gap-1 mt-2.5 pt-2.5" style={{ borderTop: '1px solid var(--bg-page)' }}>
                  {/* The reason the screen exists, so it gets the emphasis.
                      A finishing chain says so instead: after an edit, the old
                      amount is still owed once, and two rows with the same name
                      would otherwise read as a duplicate rather than a handover. */}
                  <span
                    className="flex-1"
                    style={{ color: last ? 'var(--ink-2)' : '#4F74F3', fontSize: 12, fontWeight: 600 }}
                  >
                    {t(last ? 'sched.lastOne' : 'sched.next', { date: dueLabel(next) })}
                  </span>
                  <button
                    onClick={() => open(() => setEditing(rule))}
                    aria-label={t('sched.editAria', { name: rule.template.description })}
                    className="w-7 h-7 rounded-full flex items-center justify-center active:bg-neutral-100 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--ink-2)' }} />
                  </button>
                  <button
                    onClick={() => open(() => setStopping(rule))}
                    aria-label={t('sched.stopAria', { name: rule.template.description })}
                    className="w-7 h-7 rounded-full flex items-center justify-center active:bg-neutral-100 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--ink-2)' }} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rules that exist but will never fire - see the note on strandedRules.
          No date to show and nothing to edit toward, so the row states the
          problem and offers only removal. */}
      {stranded.length > 0 && (
        <div className="px-6 pt-5 space-y-2">
          <div style={{ color: 'var(--ink-2)', fontSize: 12, fontWeight: 600, letterSpacing: 0.2 }}>
            {t('sched.strandedTitle')}
          </div>
          {stranded.map((rule) => (
            <div
              key={rule.id}
              className="rounded-xl px-4 py-3 flex items-center gap-2.5"
              style={{ backgroundColor: 'var(--bg-card)', boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)' }}
            >
              <div className="flex-1 min-w-0">
                <div className="truncate" style={{ color: 'var(--ink)', fontWeight: 500, fontSize: 15 }}>
                  {rule.template.description}
                </div>
                <div style={{ color: 'var(--ink-2)', fontSize: 11, marginTop: 2 }}>
                  {t('sched.strandedNote', { rule: rule.rule })}
                </div>
              </div>
              <button
                onClick={() => open(() => setStopping(rule))}
                aria-label={t('sched.stopAria', { name: rule.template.description })}
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 active:bg-neutral-100 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--ink-2)' }} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="px-6 pt-4">
        <button
          onClick={() => open(() => setAdding(true))}
          className="w-full py-3.5 rounded-xl font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          style={{ backgroundColor: '#4F74F3', color: '#FFFFFF', fontSize: 15 }}
        >
          <Plus className="w-4 h-4" /> {t('sched.add')}
        </button>
      </div>

      {(adding || editing) && (
        <ScheduleEditor
          rule={editing}
          transactions={transactions}
          categoryOrder={categoryOrder}
          categories={categories}
          incomeCategories={incomeCategories}
          sources={sources}
          currency={currency}
          defaultSourceExpense={defaultSourceExpense}
          defaultSourceIncome={defaultSourceIncome}
          household={household}
          partner={partner}
          userName={userName}
          onCreateCategory={onCreateCategory}
          onCreateSubcategory={onCreateSubcategory}
          onCancel={() => close(() => { setAdding(false); setEditing(null); })}
          onSave={(draft) => {
            if (editing) onUpdate(editing.id, draft);
            else onCreate(draft);
            close(() => { setAdding(false); setEditing(null); });
          }}
        />
      )}

      {stopping && (
        <ConfirmDialog
          title={t('sched.stopTitle')}
          message={t('sched.stopBody', { name: stopping.template.description })}
          confirmLabel={t('sched.stopConfirm')}
          onCancel={() => close(() => setStopping(null))}
          onConfirm={() => {
            onStop(stopping.id);
            close(() => setStopping(null));
          }}
        />
      )}
    </div>
  );
}
