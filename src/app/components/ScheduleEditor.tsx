import { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { t } from '../i18n';
import { translateRecurrence } from '../i18n/store';
import { getCategoryIcon } from './categoryIcons';
import { SourceLogo } from './SourceLogo';
import { switchGlow } from './categoryColors';
import { toDateStr } from '../lib/recurrence';
import type { Category, RecurringRule, Source, TransactionType } from '../types';
import type { ScheduleDraft } from './ScheduledManager';

// The same cadences the Add screen offers, minus "Never repeat" - a schedule
// that never repeats is not a schedule, and offering it here would be a second
// way to say "delete this", which the bin already says.
const CADENCES = [
  'Every day',
  'Every work day',
  'Every week',
  'Every second week',
  'First day of the month',
  'Every month',
  'Every year',
];

const LABEL: React.CSSProperties = { color: '#8E8E93', fontSize: 12, fontWeight: 600, letterSpacing: 0.2 };
const FIELD = 'w-full px-4 py-3 rounded-xl text-[15px]';
const FIELD_STYLE: React.CSSProperties = { backgroundColor: '#F4F4F5', color: '#1C1C1E', border: 'none', outline: 'none' };

/**
 * Create or edit a schedule.
 *
 * Editing carries the SAME meaning as "this and all future ones" on the Add
 * screen: the old rule is ended and a new one starts, so occurrences already
 * recorded keep the amount they were recorded at. A schedule is a plan for
 * money that has not moved yet; it can never rewrite money that has.
 */
export function ScheduleEditor({
  rule,
  categories,
  incomeCategories,
  sources,
  currency,
  defaultSourceExpense,
  defaultSourceIncome,
  onSave,
  onCancel,
}: {
  rule: RecurringRule | null;
  categories: Category[];
  incomeCategories: Category[];
  sources: Source[];
  currency: string;
  defaultSourceExpense?: string;
  defaultSourceIncome?: string;
  onSave: (draft: ScheduleDraft) => void;
  onCancel: () => void;
}) {
  const today = toDateStr(new Date());
  const tomorrow = toDateStr(new Date(Date.now() + 86400000));

  const [type, setType] = useState<TransactionType>(rule?.template.type ?? 'expense');
  const [description, setDescription] = useState(rule?.template.description ?? '');
  const [amount, setAmount] = useState(rule ? String(rule.template.amount) : '');
  const [cadence, setCadence] = useState(rule?.rule ?? 'Every month');
  // Editing starts from the next occurrence, not the original anchor: the
  // anchor may be years back, and no field on this form can change the past.
  const [start, setStart] = useState(tomorrow);
  const [categoryId, setCategoryId] = useState(rule?.template.category?.id ?? '');
  const [sourceId, setSourceId] = useState(
    rule?.template.sourceId ?? (type === 'income' ? defaultSourceIncome : defaultSourceExpense) ?? '',
  );

  const list = type === 'income' ? incomeCategories : categories;
  const category = list.find((c) => c.id === categoryId) ?? list[0];
  const amountValue = parseFloat(amount.replace(',', '.'));
  const valid = description.trim().length > 0 && amountValue > 0 && !!category && start >= today;

  const switchType = (next: TransactionType) => {
    setType(next);
    // Category ids do not cross the expense/income divide, so a stale one
    // would silently pick the wrong list's first entry.
    setCategoryId('');
    setSourceId((next === 'income' ? defaultSourceIncome : defaultSourceExpense) ?? '');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onCancel}>
      <div
        className="w-full max-w-[430px] bg-white rounded-t-3xl shadow-2xl animate-slide-up relative z-10 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h3 style={{ color: '#1C1C1E', fontSize: 17, fontWeight: 600 }}>
            {rule ? t('sched.editTitle') : t('sched.addTitle')}
          </h3>
          <button
            onClick={onCancel}
            aria-label={t('common.close')}
            className="w-8 h-8 rounded-full flex items-center justify-center active:bg-neutral-100 transition-colors"
          >
            <X className="w-4.5 h-4.5" style={{ color: '#8E8E93' }} />
          </button>
        </div>

        <div className="px-6 space-y-4">
          {/* Same sliding-thumb switch as the Add screen and the Dashboard. */}
          <div className="relative flex p-1 rounded-full" style={{ backgroundColor: '#ECEAE4' }}>
            <div
              className="absolute rounded-full"
              style={{
                top: 4, bottom: 4, left: 4, width: 'calc(50% - 4px)',
                backgroundColor: '#FFFFFF',
                boxShadow: switchGlow(type === 'income' ? 'income' : 'expense'),
                transform: type === 'income' ? 'translateX(100%)' : 'translateX(0)',
                transition: 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)',
              }}
              aria-hidden="true"
            />
            <button
              onClick={() => switchType('expense')}
              className="relative flex-1 py-1.5 text-sm font-medium transition-colors"
              style={{ color: type === 'expense' ? '#C2352B' : '#8E8E93' }}
            >
              {t('seg.expenses')}
            </button>
            <button
              onClick={() => switchType('income')}
              className="relative flex-1 py-1.5 text-sm font-medium transition-colors"
              style={{ color: type === 'income' ? '#1F7A43' : '#8E8E93' }}
            >
              {t('seg.income')}
            </button>
          </div>

          <div>
            <div style={LABEL} className="mb-1.5">{t('add.description')}</div>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('sched.descPlaceholder')}
              className={FIELD}
              style={FIELD_STYLE}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <div style={LABEL} className="mb-1.5">{t('sched.amount')}</div>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
                inputMode="decimal"
                placeholder="0"
                className={FIELD}
                style={FIELD_STYLE}
              />
            </div>
            <div className="flex-1">
              <div style={LABEL} className="mb-1.5">{t('sched.start')}</div>
              <input
                type="date"
                value={start}
                min={today}
                onChange={(e) => setStart(e.target.value)}
                className={FIELD}
                style={FIELD_STYLE}
              />
            </div>
          </div>

          <div>
            <div style={LABEL} className="mb-1.5">{t('add.recurrence')}</div>
            <div className={`${FIELD} relative flex items-center`} style={FIELD_STYLE}>
              <span className="flex-1">{translateRecurrence(cadence)}</span>
              <ChevronDown className="w-4 h-4" style={{ color: '#8E8E93' }} />
              <select
                aria-label={t('add.recurrence')}
                value={cadence}
                onChange={(e) => setCadence(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0"
              >
                {CADENCES.map((c) => (
                  <option key={c} value={c}>{translateRecurrence(c)}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div style={LABEL} className="mb-1.5">{t('add.category')}</div>
            <div className="grid grid-cols-2 gap-2">
              {list.map((c) => {
                const Icon = getCategoryIcon(c.icon);
                const on = category?.id === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setCategoryId(c.id)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl transition-colors"
                    style={{ backgroundColor: on ? '#EEF1FE' : '#F4F4F5' }}
                  >
                    <span className={`w-7 h-7 rounded-lg ${c.bgColor} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-3.5 h-3.5 ${c.color}`} />
                    </span>
                    <span
                      className="truncate text-[13px]"
                      style={{ color: on ? '#4F74F3' : '#1C1C1E', fontWeight: on ? 600 : 500 }}
                    >
                      {c.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {sources.length > 0 && (
            <div>
              <div style={LABEL} className="mb-1.5">{t('act.source')}</div>
              <div className="flex gap-2 flex-wrap">
                {sources.map((s) => {
                  const on = sourceId === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSourceId(on ? '' : s.id)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition-colors"
                      style={{ backgroundColor: on ? '#EEF1FE' : '#F4F4F5' }}
                    >
                      <SourceLogo source={s} size={16} />
                      <span className="text-[13px]" style={{ color: on ? '#4F74F3' : '#1C1C1E', fontWeight: on ? 600 : 500 }}>
                        {s.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Says plainly what saving does, because "edit" on a schedule is
              ambiguous until you know it cannot touch what already happened. */}
          <p style={{ color: '#8E8E93', fontSize: 12, lineHeight: 1.45 }}>
            {rule ? t('sched.editNote') : t('sched.addNote')}
          </p>

          <button
            disabled={!valid}
            onClick={() =>
              onSave({
                description: description.trim(),
                amount: amountValue,
                currency: rule?.template.currency || currency,
                category: category!,
                subcategory: rule?.template.subcategory,
                sourceId: sourceId || undefined,
                type,
                rule: cadence,
                start,
              })
            }
            className="w-full py-3.5 rounded-xl font-medium transition-all active:scale-[0.98]"
            style={{
              backgroundColor: valid ? '#4F74F3' : '#E5E5EA',
              color: valid ? '#FFFFFF' : '#A5A5AD',
              fontSize: 15,
            }}
          >
            {rule ? t('sched.saveEdit') : t('sched.saveNew')}
          </button>
        </div>
      </div>
    </div>
  );
}
