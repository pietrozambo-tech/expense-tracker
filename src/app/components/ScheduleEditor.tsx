import { useMemo, useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { t } from '../i18n';
import { translateRecurrence, numberLocale } from '../i18n/store';
import { getCategoryIcon } from './categoryIcons';
import { SourceLogo } from './SourceLogo';
import { switchGlow } from './categoryColors';
import { CURRENCIES } from '../utils/currency';
import { toDateStr, nextDueDate, repriceCandidate } from '../lib/recurrence';
import type { Category, RecurringRule, Source, Transaction, TransactionType } from '../types';
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

const LABEL: React.CSSProperties = { color: 'var(--ink-2)', fontSize: 12, fontWeight: 600, letterSpacing: 0.2 };
// 16px, not the 15 the rest of this sheet uses: anything smaller makes iOS zoom
// the page in when the field takes focus. See the floor in theme.css.
const FIELD = 'w-full px-4 py-3 rounded-xl text-[16px]';
const FIELD_STYLE: React.CSSProperties = { backgroundColor: 'var(--bg-field)', color: 'var(--ink)', border: 'none', outline: 'none' };

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
  transactions = [],
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
  /** The ledger, read-only: what this bill has actually been charged. */
  transactions?: Transaction[];
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
  // Editing starts from the chain's NEXT occurrence, not tomorrow.
  //
  // The comment here said "next occurrence" while the code said tomorrow, and
  // the gap between the two was a duplicate charge. Open the editor to change
  // an amount, save without touching the date, and the replacement chain fires
  // tomorrow - in a month the old chain had already charged. A real ledger came
  // back with an Amex fee on the 9th and another on the 10th. Defaulting to the
  // next occurrence makes "edit the amount" leave the cadence exactly alone.
  const [start, setStart] = useState(() => (rule ? nextDueDate(rule) ?? tomorrow : tomorrow));
  const [categoryId, setCategoryId] = useState(rule?.template.category?.id ?? '');
  const [sourceId, setSourceId] = useState(
    rule?.template.sourceId ?? (type === 'income' ? defaultSourceIncome : defaultSourceExpense) ?? '',
  );

  // What an amount edit MEANS. Only ever read when the question below is on
  // screen, and it defaults to the common answer so the fast path stays a
  // single tap on Save.
  const [means, setMeans] = useState<'change' | 'correction'>('change');

  const list = type === 'income' ? incomeCategories : categories;
  const category = list.find((c) => c.id === categoryId) ?? list[0];
  const amountValue = parseFloat(amount.replace(',', '.'));
  const valid = description.trim().length > 0 && amountValue > 0 && !!category && start >= today;

  // Ask only when the amount is the thing being changed. Opening the editor to
  // move a date must not raise the question just because the bill's charges
  // have drifted away from the schedule on their own - that is the chip's job,
  // and there is no intent here to interpret.
  const reprice = useMemo(
    () =>
      rule && amountValue > 0 && amountValue !== rule.template.amount
        ? repriceCandidate(rule.template, transactions, amountValue)
        : null,
    [rule, transactions, amountValue],
  );
  const money = (n: number) =>
    `${n.toLocaleString(numberLocale(), {
      minimumFractionDigits: n % 1 ? 2 : 0,
      maximumFractionDigits: n % 1 ? 2 : 0,
    })}${CURRENCIES[rule?.template.currency || currency]?.symbol ?? ''}`;

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
          <h3 style={{ color: 'var(--ink)', fontSize: 17, fontWeight: 600 }}>
            {rule ? t('sched.editTitle') : t('sched.addTitle')}
          </h3>
          <button
            onClick={onCancel}
            aria-label={t('common.close')}
            className="w-8 h-8 rounded-full flex items-center justify-center active:bg-neutral-100 transition-colors"
          >
            <X className="w-4.5 h-4.5" style={{ color: 'var(--ink-2)' }} />
          </button>
        </div>

        <div className="px-6 space-y-4">
          {/* Same sliding-thumb switch as the Add screen and the Dashboard. */}
          <div className="relative flex p-1 rounded-full" style={{ backgroundColor: 'var(--bg-track)' }}>
            <div
              className="absolute rounded-full"
              style={{
                top: 4, bottom: 4, left: 4, width: 'calc(50% - 4px)',
                backgroundColor: 'var(--bg-card)',
                boxShadow: switchGlow(type === 'income' ? 'income' : 'expense'),
                transform: type === 'income' ? 'translateX(100%)' : 'translateX(0)',
                transition: 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)',
              }}
              aria-hidden="true"
            />
            <button
              onClick={() => switchType('expense')}
              className="relative flex-1 py-1.5 text-sm font-medium transition-colors"
              style={{ color: type === 'expense' ? 'var(--tone-expense)' : 'var(--ink-2)' }}
            >
              {t('seg.expenses')}
            </button>
            <button
              onClick={() => switchType('income')}
              className="relative flex-1 py-1.5 text-sm font-medium transition-colors"
              style={{ color: type === 'income' ? 'var(--tone-income)' : 'var(--ink-2)' }}
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

          {/* Changing an amount means one of two things, and they want
              opposite outcomes - forward-only, or a repair of rows already
              recorded. Guessing gets one of them wrong, so this asks, but
              only in the case that is genuinely ambiguous. See
              repriceCandidate for the three cases it stays quiet for. */}
          {reprice && (
            <div>
              <div style={LABEL} className="mb-1.5">{t('sched.repriceTitle')}</div>
              <div className="space-y-2">
                {(['change', 'correction'] as const).map((k) => {
                  const on = means === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setMeans(k)}
                      role="radio"
                      aria-checked={on}
                      className="w-full flex items-start gap-2.5 px-3.5 py-3 rounded-xl text-left transition-colors"
                      style={{ backgroundColor: on ? 'var(--wash-accent)' : 'var(--bg-field)' }}
                    >
                      <span
                        className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                        style={{
                          marginTop: 2,
                          border: `1.5px solid ${on ? '#4F74F3' : 'var(--ghost)'}`,
                          backgroundColor: on ? '#4F74F3' : 'transparent',
                        }}
                      >
                        {on && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--bg-card)' }} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className="block text-[14px]"
                          style={{ color: on ? '#4F74F3' : 'var(--ink)', fontWeight: on ? 600 : 500 }}
                        >
                          {t(k === 'change' ? 'sched.repriceChange' : 'sched.repriceWrong')}
                        </span>
                        <span
                          className="block text-[12px] mt-0.5"
                          style={{ color: 'var(--ink-2)', lineHeight: 1.4 }}
                        >
                          {k === 'change'
                            ? t('sched.repriceChangeNote', { amount: money(reprice.usual) })
                            : t('sched.repriceWrongNote', {
                                n: String(reprice.count),
                                amount: money(reprice.usual),
                              })}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div style={LABEL} className="mb-1.5">{t('add.recurrence')}</div>
            <div className={`${FIELD} relative flex items-center`} style={FIELD_STYLE}>
              <span className="flex-1">{translateRecurrence(cadence)}</span>
              <ChevronDown className="w-4 h-4" style={{ color: 'var(--ink-2)' }} />
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
                    style={{ backgroundColor: on ? 'var(--wash-accent)' : 'var(--bg-field)' }}
                  >
                    <span className={`w-7 h-7 rounded-lg ${c.bgColor} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-3.5 h-3.5 ${c.color}`} />
                    </span>
                    <span
                      className="truncate text-[13px]"
                      style={{ color: on ? '#4F74F3' : 'var(--ink)', fontWeight: on ? 600 : 500 }}
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
                      style={{ backgroundColor: on ? 'var(--wash-accent)' : 'var(--bg-field)' }}
                    >
                      <SourceLogo source={s} size={16} />
                      <span className="text-[13px]" style={{ color: on ? '#4F74F3' : 'var(--ink)', fontWeight: on ? 600 : 500 }}>
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
          <p style={{ color: 'var(--ink-2)', fontSize: 12, lineHeight: 1.45 }}>
            {/* The standing note promises the past is never rewritten, which
                is true of every edit except the one the user has just asked
                for. Saying it anyway would contradict the choice above. */}
            {!rule
              ? t('sched.addNote')
              : reprice && means === 'correction'
                ? t('sched.editNoteFixing')
                : t('sched.editNote')}
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
                ...(reprice && means === 'correction'
                  ? { correctRecordedAmount: reprice.usual }
                  : {}),
              })
            }
            className="w-full py-3.5 rounded-xl font-medium transition-all active:scale-[0.98]"
            style={{
              backgroundColor: valid ? '#4F74F3' : 'var(--line)',
              color: valid ? '#FFFFFF' : 'var(--disabled)',
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
