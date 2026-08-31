import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronLeft, Hourglass, WifiOff, X } from 'lucide-react';
import { t } from '../i18n';
import { getLanguage, monthsShort } from '../i18n/store';
import {
  AiImportError, convertWithAi, scanFileDates, tripForWindow,
  type AiDone, type AiFile, type AiQuestion,
} from '../lib/aiImport';
import { buildImport, type ImportPayload, type ImportResult } from '../lib/importData';
import type { Trip } from '../lib/trips';
import { CURRENCIES } from '../utils/currency';

// The AI import's own screens - the reading, the trip assertion, the
// questions, the result. The DOOR (choose a file) lives in Settings' import
// page; this takes over once files are in hand and gives back either a
// committed payload (via onCommit, which is the same handleImportData the
// JSON path uses - review sheet, dedupe toasts and all) or nothing.
//
// The design rules this encodes, from the approved mockups:
//   - the app ASSERTS and lets you correct ("In quei giorni hai Azores.
//     Le metto lì?") - it never opens an interview;
//   - the trip screen exists only when there is a reason to say out loud
//     (file dates inside a known trip), and the name is TAPPED, never typed
//     fresh when a known trip fits - that is where the flag used to be lost;
//   - the wait is the premium moment: rows materialise as the model writes
//     them, with the reassurance that nothing has been added yet;
//   - the end is a result, not a report: what is about to be added and what
//     it costs, with the bookkeeping demoted to one grey line.

type Step = 'trip' | 'reading' | 'questions' | 'ready' | 'error';

interface AiImportProps {
  files: AiFile[];
  trips: Trip[];
  categories: unknown[];
  incomeCategories: unknown[];
  userCurrency: string;
  transactions: unknown[];
  /** The same commit the JSON import path uses. */
  onCommit: (payload: ImportPayload) => void;
  onClose: () => void;
}

const symbolOf = (code: string) => (CURRENCIES as Record<string, { symbol: string }>)[code]?.symbol ?? code;

const fmtAmount = (n: number, currency: string) => {
  const sep = getLanguage() === 'it' ? ',' : '.';
  const whole = Math.floor(Math.abs(n)).toLocaleString(getLanguage() === 'it' ? 'it-IT' : 'en-US');
  const cents = Math.round((Math.abs(n) % 1) * 100);
  const sym = symbolOf(currency);
  return `${n < 0 ? '-' : ''}${whole}${cents ? `${sep}${String(cents).padStart(2, '0')}` : ''}${sym.length > 1 ? ' ' : ''}${sym}`;
};

/** "3-14 Aug" - the file's own window, said the way the trips sheet says it. */
function windowLabel(from: string, to: string): string {
  const months = monthsShort();
  const [fm, fd] = [Number(from.slice(5, 7)), Number(from.slice(8, 10))];
  const [tm, td] = [Number(to.slice(5, 7)), Number(to.slice(8, 10))];
  if (from === to) return `${fd} ${months[fm - 1]}`;
  if (fm === tm) return `${fd}-${td} ${months[fm - 1]}`;
  return `${fd} ${months[fm - 1]} - ${td} ${months[tm - 1]}`;
}

export function AiImport({
  files, trips, categories, incomeCategories, userCurrency, transactions, onCommit, onClose,
}: AiImportProps) {
  // The local evidence, gathered once: dates out of whatever text arrived.
  const evidence = useMemo(() => {
    for (const f of files) {
      if (!f.text) continue;
      const scan = scanFileDates(f.text);
      if (scan) return { ...scan, trip: tripForWindow(trips, scan.from, scan.to) };
    }
    return null;
  }, [files, trips]);

  const [step, setStep] = useState<Step>(evidence?.trip ? 'trip' : 'reading');
  const [tripAnswer, setTripAnswer] = useState<{ is_trip: boolean; name?: string } | null>(null);
  // 'trip' pre-answer state: which chip is lit.
  const [chip, setChip] = useState<'yes' | 'other' | 'no'>(evidence?.trip ? 'yes' : 'no');
  const [otherName, setOtherName] = useState('');
  const [rows, setRows] = useState<{ n: number; description: string; category: string; sub?: string; amount: number; currency: string }[]>([]);
  const [runningTotal, setRunningTotal] = useState(0);
  const [questions, setQuestions] = useState<AiQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [done, setDone] = useState<AiDone | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [error, setError] = useState<AiImportError | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);

  const lang = getLanguage() === 'it' ? 'it' : 'en';

  const start = (trip: { is_trip: boolean; name?: string } | null, priorAnswers?: { ask: string; answer: string }[]) => {
    setStep('reading');
    setRows([]);
    setRunningTotal(0);
    setError(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    convertWithAi({
      files, trip, lang,
      answers: priorAnswers,
      signal: ctrl.signal,
      onRow: (r) => {
        const row = r.row as { description?: unknown; category?: unknown; subcategory?: unknown; amount?: unknown; currency?: unknown };
        const amount = typeof row.amount === 'number' ? row.amount : 0;
        setRows((prev) => [...prev.slice(-2), {
          n: r.n,
          description: String(row.description ?? ''),
          category: String(row.category ?? ''),
          sub: typeof row.subcategory === 'string' ? row.subcategory : undefined,
          amount,
          currency: typeof row.currency === 'string' ? row.currency : userCurrency,
        }]);
        setRunningTotal((prevT) => prevT + amount);
      },
    })
      .then((d) => {
        setDone(d);
        if (d.status === 'need_input') {
          setQuestions(d.questions ?? []);
          setAnswers({});
          setStep('questions');
          return;
        }
        const payload = d.payload ?? { version: 1, currency: userCurrency, transactions: [] };
        const res = buildImport(
          payload,
          categories as never, incomeCategories as never, userCurrency, transactions as never,
        );
        setPreview(res);
        setStep('ready');
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return; // the user left; nothing to draw
        setError(e instanceof AiImportError ? e : new AiImportError('failed', String(e)));
        setStep('error');
      });
  };

  // No trip screen to show: the reading starts the moment the flow mounts.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (!evidence?.trip) start(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const goFromTrip = () => {
    const answer =
      chip === 'yes' && evidence?.trip ? { is_trip: true, name: evidence.trip.name }
      : chip === 'other' && otherName.trim() ? { is_trip: true, name: otherName.trim() }
      : { is_trip: false };
    setTripAnswer(answer);
    start(answer);
  };

  const goFromQuestions = () => {
    const prior = questions.map((q, i) => ({ ask: q.ask, answer: answers[i] ?? '' }))
      .filter((a) => a.answer.trim());
    start(tripAnswer, prior);
  };

  const commit = () => {
    if (!done?.payload) return;
    onCommit(done.payload);
    onClose();
  };

  // The reading screen's three ticks, driven by progress rather than theatre:
  // the first lights with the first row, the second once categories have
  // demonstrably arrived (every row carries one), the third at the end.
  const ticks: { label: string; on: boolean }[] = [
    { label: t('ai.tick1'), on: rows.length > 0 },
    { label: t('ai.tick2'), on: rows.length > 1 },
    { label: t('ai.tick3'), on: step === 'ready' },
  ];

  const header = (title: string, sub?: string) => (
    <div className="px-6 pt-4 pb-2">
      <div className="flex items-center justify-between">
        <button onClick={onClose} className="p-2 -ml-2 rounded-lg" aria-label={t('ai.close')}>
          {step === 'ready' || step === 'error'
            ? <X className="w-5 h-5" style={{ color: 'var(--ink-2)' }} />
            : <ChevronLeft className="w-6 h-6" style={{ color: 'var(--accent-ink)' }} />}
        </button>
      </div>
      <h2 className="mt-1" style={{ color: 'var(--ink)', fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>{title}</h2>
      {sub && <p className="mt-1.5" style={{ color: 'var(--ink-2)', fontSize: 13.5, lineHeight: 1.45 }}>{sub}</p>}
    </div>
  );

  const chipBtn = (on: boolean, label: string, onClick: () => void, mark?: string) => (
    <button
      key={label}
      data-ai-chip={mark ?? label}
      onClick={onClick}
      className="px-3.5 py-2 rounded-full transition-colors"
      style={{
        border: `1.5px solid ${on ? '#4F74F3' : 'var(--line)'}`,
        backgroundColor: on ? '#4F74F3' : 'var(--bg-card)',
        color: on ? '#FFFFFF' : 'var(--ink)',
        fontSize: 13.5, fontWeight: on ? 600 : 500,
      }}
    >
      {label}
    </button>
  );

  const cta = (label: string, onClick: () => void, disabled = false, mark = 'go') => (
    <div className="px-6 pb-6 pt-2" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
      <button
        data-ai-cta={mark}
        onClick={onClick}
        disabled={disabled}
        className="w-full py-3.5 rounded-2xl font-semibold text-[15px]"
        style={{
          backgroundColor: disabled ? 'var(--line)' : '#4F74F3',
          color: disabled ? 'var(--disabled)' : '#FFFFFF',
        }}
      >
        {label}
      </button>
    </div>
  );

  return (
    <div data-ai-flow data-ai-step={step} className="fixed inset-0 z-[70] flex flex-col max-w-[430px] mx-auto" style={{ backgroundColor: 'var(--bg-page)' }}>
      {step === 'trip' && evidence?.trip && (
        <>
          {header(
            t('ai.tripTitle', { n: String(evidence.count) }),
            t('ai.tripSub', { window: windowLabel(evidence.from, evidence.to), name: evidence.trip.name }),
          )}
          <div className="flex-1 px-6 pt-2">
            <p className="mb-3" style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 600 }}>{t('ai.tripAsk')}</p>
            <div className="flex flex-wrap gap-2">
              {chipBtn(chip === 'yes', t('ai.tripYes', { name: evidence.trip.name }), () => setChip('yes'), 'yes')}
              {chipBtn(chip === 'other', t('ai.tripOther'), () => setChip('other'), 'other')}
              {chipBtn(chip === 'no', t('ai.tripNo'), () => setChip('no'), 'no')}
            </div>
            {chip === 'other' && (
              <div className="mt-3 flex flex-wrap gap-2">
                {trips.filter((tr) => tr.name !== evidence.trip!.name).slice(0, 4).map((tr) =>
                  chipBtn(otherName === tr.name, tr.name, () => setOtherName(tr.name)),
                )}
                <input
                  data-ai-trip-name
                  value={otherName}
                  onChange={(e) => setOtherName(e.target.value)}
                  placeholder={t('ai.tripNew')}
                  className="px-3.5 py-2 rounded-full bg-transparent outline-none"
                  style={{ border: '1.5px solid var(--line)', color: 'var(--ink)', fontSize: 16, minWidth: 140 }}
                />
              </div>
            )}
          </div>
          {cta(t('ai.go'), goFromTrip, chip === 'other' && !otherName.trim())}
        </>
      )}

      {step === 'reading' && (
        <>
          {header(t('ai.readingTitle'), t('ai.readingSub'))}
          <div className="flex-1 px-6 pt-1 flex flex-col min-h-0">
            <div className="rounded-2xl px-4 py-4" style={{ background: 'linear-gradient(152deg, #22222B, #121217)' }}>
              {rows.length === 0 ? (
                // Before the first row there is nothing to count, and a card
                // reading "0 / 0€" looks broken rather than busy.
                <div className="animate-pulse py-2" data-ai-opening style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: 500 }}>
                  {t('ai.opening')}
                </div>
              ) : (
                <>
                  <div data-ai-count style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
                    {evidence && evidence.count > 0
                      ? t('ai.countOf', { n: String(rows[rows.length - 1].n), total: String(evidence.count) })
                      : String(rows[rows.length - 1].n)}
                  </div>
                  <div data-ai-total style={{ color: '#FFFFFF', fontSize: 32, fontWeight: 700, letterSpacing: '-1px', marginTop: 4 }}>
                    {fmtAmount(runningTotal, done?.payload?.currency ?? rows[rows.length - 1]?.currency ?? userCurrency)}
                  </div>
                </>
              )}
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {ticks.map((tick) => (
                <div key={tick.label} className="flex items-center gap-2.5" style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                  <span
                    className="grid place-items-center rounded-full flex-shrink-0"
                    style={{ width: 16, height: 16, backgroundColor: tick.on ? 'var(--tone-income)' : 'var(--line)' }}
                  >
                    {tick.on && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3.5} />}
                  </span>
                  {tick.label}
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {rows.map((r) => (
                <div key={r.n} data-ai-row={r.n} className="bg-white rounded-xl px-3.5 py-2.5 flex items-baseline gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="truncate" style={{ color: 'var(--ink)', fontSize: 13.5, fontWeight: 500 }}>{r.description || r.category}</div>
                    <div style={{ color: 'var(--ink-3)', fontSize: 11 }}>{r.category}{r.sub ? ` · ${r.sub}` : ''}</div>
                  </div>
                  <span style={{ color: 'var(--ink)', fontSize: 13.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtAmount(r.amount, r.currency)}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-auto pb-5 text-center" style={{ color: 'var(--ink-3)', fontSize: 12 }}>{t('ai.nothingYet')}</p>
          </div>
        </>
      )}

      {step === 'questions' && (
        <>
          {header(t('ai.questionsTitle'), t('ai.questionsSub'))}
          <div className="flex-1 px-6 pt-2 overflow-y-auto flex flex-col gap-5">
            {questions.map((q, i) => (
              <div key={i} data-ai-question={i}>
                <p className="mb-2" style={{ color: 'var(--ink)', fontSize: 14.5, fontWeight: 600 }}>{q.ask}</p>
                <div className="flex flex-wrap gap-2">
                  {q.options.map((opt) =>
                    chipBtn(answers[i] === opt, opt, () => setAnswers((a) => ({ ...a, [i]: opt }))),
                  )}
                  <input
                    value={q.options.includes(answers[i] ?? '') ? '' : answers[i] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                    placeholder={t('ai.freeAnswer')}
                    className="px-3.5 py-2 rounded-full bg-transparent outline-none"
                    style={{ border: '1.5px solid var(--line)', color: 'var(--ink)', fontSize: 16, minWidth: 120 }}
                  />
                </div>
              </div>
            ))}
          </div>
          {cta(t('ai.go'), goFromQuestions, questions.some((_, i) => !(answers[i] ?? '').trim()))}
        </>
      )}

      {step === 'ready' && preview && (
        <>
          {header(t('ai.readyTitle'), preview.alreadyImported > 0 ? t('ai.readySub') : undefined)}
          <div className="flex-1 px-6 pt-1 overflow-y-auto">
            <div className="rounded-2xl px-4 py-4" style={{ background: 'linear-gradient(152deg, #22222B, #121217)' }}>
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>{t('ai.toAdd')}</div>
              <div data-ai-total style={{ color: '#FFFFFF', fontSize: 32, fontWeight: 700, letterSpacing: '-1px', marginTop: 4 }}>
                {fmtAmount(
                  preview.transactions.reduce((s, tx) => s + (tx.type === 'income' ? 0 : tx.amount), 0),
                  done?.payload?.currency ?? userCurrency,
                )}
              </div>
              {(tripAnswer?.is_trip && tripAnswer.name) && (
                <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <span className="rounded-full px-2.5 py-1" style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: '#FFFFFF', fontSize: 11.5, fontWeight: 500 }}>
                    {tripAnswer.name}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>{t('ai.newCount', { n: String(preview.added) })}</span>
                </div>
              )}
            </div>
            <div className="mt-3 bg-white rounded-2xl px-4 py-1">
              {preview.transactions.slice(0, 6).map((tx) => (
                <div key={tx.id} data-ai-ready-row className="flex items-baseline gap-3 py-2.5" style={{ borderBottom: '1px solid var(--line-2)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="truncate" style={{ color: 'var(--ink)', fontSize: 13.5, fontWeight: 500 }}>{tx.description}</div>
                    <div style={{ color: 'var(--ink-3)', fontSize: 11 }}>{tx.category?.name}{tx.subcategory ? ` · ${tx.subcategory}` : ''}</div>
                  </div>
                  <span style={{ color: 'var(--ink)', fontSize: 13.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtAmount(tx.amount, tx.currency ?? userCurrency)}
                  </span>
                </div>
              ))}
              {preview.transactions.length > 6 && (
                <p className="py-2.5" style={{ color: 'var(--ink-3)', fontSize: 12 }}>
                  {t('ai.moreRows', { n: String(preview.transactions.length - 6) })}
                </p>
              )}
            </div>
            {(preview.alreadyImported > 0 || preview.skipped.length > 0) && (
              <p data-ai-bookkeeping className="mt-3 px-1" style={{ color: 'var(--ink-3)', fontSize: 12 }}>
                {[
                  preview.alreadyImported === 1 ? t('ai.already1')
                    : preview.alreadyImported > 1 ? t('ai.already', { n: String(preview.alreadyImported) }) : null,
                  preview.skipped.length === 1 ? t('ai.skipped1')
                    : preview.skipped.length > 1 ? t('ai.skippedN', { n: String(preview.skipped.length) }) : null,
                ].filter(Boolean).join(' · ')}
              </p>
            )}
            {done && done.remaining === 0 && (
              <p className="mt-2 px-1" style={{ color: 'var(--ink-3)', fontSize: 12 }}>{t('ai.lastToday')}</p>
            )}
          </div>
          {preview.added > 0
            ? cta(t('ai.commit', { n: String(preview.added) }), commit, false, 'commit')
            : cta(t('ai.closeNothing'), onClose, false, 'close')}
        </>
      )}

      {step === 'error' && error && (() => {
        // One family per sentence. Everything unknown lands on the generic
        // pair, which still tells the truth: nothing was added, retrying is
        // allowed.
        const fam =
          error.code === 'offline' ? { icon: WifiOff, title: t('ai.errOfflineTitle'), sub: t('ai.errOfflineSub'), retry: true }
          : error.code === 'daily_limit' ? { icon: Hourglass, title: t('ai.errLimitTitle'), sub: t('ai.errLimitSub'), retry: false }
          : error.code === 'too_big' ? { icon: AlertCircle, title: t('ai.errTitle'), sub: t('ai.errBig'), retry: false }
          : error.code === 'not_configured' ? { icon: AlertCircle, title: t('ai.errTitle'), sub: t('ai.errOff'), retry: false }
          : { icon: AlertCircle, title: t('ai.errTitle'), sub: t('ai.errSub'), retry: true };
        const Icon = fam.icon;
        return (
          <>
            <div className="px-6 pt-4">
              <button onClick={onClose} className="p-2 -ml-2 rounded-lg" aria-label={t('ai.close')}>
                <X className="w-5 h-5" style={{ color: 'var(--ink-2)' }} />
              </button>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center px-10 text-center -mt-10">
              <span className="grid place-items-center rounded-full mb-5" style={{ width: 64, height: 64, backgroundColor: 'var(--wash-accent2)' }}>
                <Icon className="w-7 h-7" style={{ color: 'var(--accent-ink)' }} strokeWidth={1.8} />
              </span>
              <h2 style={{ color: 'var(--ink)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{fam.title}</h2>
              <p className="mt-2" style={{ color: 'var(--ink-2)', fontSize: 14, lineHeight: 1.5 }}>{fam.sub}</p>
            </div>
            {fam.retry
              ? cta(t('ai.retry'), () => start(tripAnswer), false, 'retry')
              : cta(t('ai.close'), onClose, false, 'close')}
          </>
        );
      })()}
    </div>
  );
}
