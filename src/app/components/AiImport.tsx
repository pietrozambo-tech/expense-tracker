import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronLeft, Hourglass, WifiOff, X } from 'lucide-react';
import { t } from '../i18n';
import { getLanguage, monthsShort } from '../i18n/store';
import {
  AiImportError, convertWithAi, scanFileDates, tripForWindow,
  type AiDone, type AiFile, type AiQuestion,
} from '../lib/aiImport';
import { buildImport, type ImportPayload, type ImportResult } from '../lib/importData';
import { splitShareTotal } from '../lib/splitFile';
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
  /** For finding my own column in a split export - see lib/splitFile. */
  userName?: string;
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
  files, trips, categories, incomeCategories, userCurrency, transactions, userName, onCommit, onClose,
}: AiImportProps) {
  // The file's own arithmetic, done here: on a split export the phone can
  // work out my share exactly, and then the model's reading has something to
  // be checked against instead of being taken on trust. Null for every file
  // that is not one of these, or whose columns do not name me.
  const fileShare = useMemo(() => {
    if (!userName?.trim()) return null;
    for (const f of files) {
      if (!f.text) continue;
      const found = splitShareTotal(f.text, userName);
      if (found) return found;
    }
    return null;
  }, [files, userName]);
  // The local evidence, gathered once: dates out of whatever text arrived.
  // askTrip: the file is trip-shaped (a tight run of dates) but no known trip
  // fits - so the question is asked HERE, once, instead of costing one of the
  // day's reads for the model to ask it in its own round.
  const evidence = useMemo(() => {
    for (const f of files) {
      if (!f.text) continue;
      const scan = scanFileDates(f.text);
      if (scan) {
        const trip = tripForWindow(trips, scan.from, scan.to);
        const spanDays = (Date.parse(scan.to) - Date.parse(scan.from)) / 86_400_000;
        return { ...scan, trip, askTrip: !trip && spanDays <= 45 };
      }
    }
    return null;
  }, [files, trips]);

  const [step, setStep] = useState<Step>(evidence?.trip || evidence?.askTrip ? 'trip' : 'reading');
  const [tripAnswer, setTripAnswer] = useState<{ is_trip: boolean; name?: string } | null>(null);
  // 'trip' pre-answer state: which chip is lit.
  const [chip, setChip] = useState<'yes' | 'other' | 'no'>(evidence?.trip ? 'yes' : 'no');
  const [otherName, setOtherName] = useState('');
  // Volunteered context on the ask-variant's "No" ("spese di casa", "sono
  // io la colonna Pit") - it rides on the FIRST call as an answer, so the
  // model has one less reason to spend a whole round asking.
  const [context, setContext] = useState('');
  const [rows, setRows] = useState<{ n: number; description: string; category: string; sub?: string; amount: number; currency: string }[]>([]);
  const [runningTotal, setRunningTotal] = useState(0);
  const [questions, setQuestions] = useState<AiQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [done, setDone] = useState<AiDone | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [error, setError] = useState<AiImportError | null>(null);
  // True once the opening has visibly overstayed its welcome: the line under
  // the pulse changes, so a slow function never reads as a frozen screen.
  const [openingSlow, setOpeningSlow] = useState(false);
  // Which TRUE moment the request is in, for the pre-first-row narration:
  // 'sent' while the upload is in flight, 'reading' once the headers arrive
  // and the model is at work. Never theatre - each line maps to an event.
  const [phase, setPhase] = useState<'sent' | 'reading' | null>(null);
  // Ten seconds into 'reading' with no row yet, the model is demonstrably
  // deep in the matching the prompt sets it (its instructions carry the
  // user's own categories) - say that instead of repeating "reading".
  const [matching, setMatching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);

  const lang = getLanguage() === 'it' ? 'it' : 'en';

  const start = (trip: { is_trip: boolean; name?: string } | null, priorAnswers?: { ask: string; answer: string }[]) => {
    setStep('reading');
    setRows([]);
    setRunningTotal(0);
    setError(null);
    setOpeningSlow(false);
    setPhase(null);
    setMatching(false);
    const slow = window.setTimeout(() => setOpeningSlow(true), 25_000);
    const matchAt = window.setTimeout(() => setMatching(true), 10_000);
    const clearTimers = () => {
      window.clearTimeout(slow);
      window.clearTimeout(matchAt);
    };
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    // My column, when the phone could work it out, travels as an answer on
    // the FIRST call: it is the question these files always trigger, the one
    // whose wrong answer is wrong on every row, and a round spent asking it
    // costs one of the day's reads.
    const priors = [...(priorAnswers ?? [])];
    if (fileShare && !priors.some((a) => /column/i.test(a.ask))) {
      priors.push({ ask: 'Which column is me?', answer: fileShare.column });
    }
    convertWithAi({
      files, trip, lang,
      answers: priors.length ? priors : undefined,
      signal: ctrl.signal,
      onPhase: setPhase,
      onRow: (r) => {
        clearTimers();
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
        clearTimers();
        setDone(d);
        if (d.status === 'need_input') {
          setQuestions(d.questions ?? []);
          setAnswers({});
          setStep('questions');
          return;
        }
        const payload = d.payload ?? { version: 1, currency: userCurrency, transactions: [] };
        // Read, and there was nothing in it. Its own screen: "nothing new"
        // on the result screen means "you already had these", and saying
        // that about a CV or a shopping list sends the user looking for a
        // duplicate that was never there.
        if ((payload.transactions ?? []).length === 0) {
          setError(new AiImportError('no_rows', 'the file held no transactions'));
          setStep('error');
          return;
        }
        const res = buildImport(
          payload,
          categories as never, incomeCategories as never, userCurrency, transactions as never,
        );
        setPreview(res);
        setStep('ready');
      })
      .catch((e) => {
        clearTimers();
        if (ctrl.signal.aborted) return; // the user left; nothing to draw
        setError(e instanceof AiImportError ? e : new AiImportError('failed', String(e)));
        setStep('error');
      });
  };

  // No trip screen to show: the reading starts the moment the flow mounts.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (!evidence?.trip && !evidence?.askTrip) start(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const goFromTrip = () => {
    const answer =
      chip === 'yes' && evidence?.trip ? { is_trip: true, name: evidence.trip.name }
      : chip === 'other' && otherName.trim() ? { is_trip: true, name: otherName.trim() }
      : { is_trip: false };
    setTripAnswer(answer);
    // "No" with words attached: sent in the shape the model already reads
    // answers in, so a "these are my house expenses, I'm the Pit column"
    // can pre-empt the question it would otherwise cost a round to ask.
    const volunteered = !answer.is_trip && context.trim()
      ? [{ ask: 'Anything worth knowing about this file?', answer: context.trim() }]
      : undefined;
    start(answer, volunteered);
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
      {step === 'trip' && evidence && (() => {
        // One screen, two postures. With a known trip in the window the app
        // ASSERTS and lets you correct; without one - but with a file whose
        // dates are plainly one tight run - it asks the yes/no HERE, because
        // the alternative is the model asking it in a round of its own, at
        // the price of a whole read from the daily allowance.
        const nameRow = (exclude?: string, placeholder?: string) => (
          <div className="mt-3 flex flex-wrap gap-2">
            {trips.filter((tr) => tr.name !== exclude).slice(0, 4).map((tr) =>
              chipBtn(otherName === tr.name, tr.name, () => setOtherName(tr.name)),
            )}
            <input
              data-ai-trip-name
              value={otherName}
              onChange={(e) => setOtherName(e.target.value)}
              placeholder={placeholder ?? t('ai.tripNew')}
              className="px-3.5 py-2 rounded-full bg-transparent outline-none"
              style={{ border: '1.5px solid var(--line)', color: 'var(--ink)', fontSize: 16, minWidth: 140 }}
            />
          </div>
        );
        const win = windowLabel(evidence.from, evidence.to);
        return evidence.trip ? (
          <>
            {header(
              t('ai.tripTitle', { n: String(evidence.count) }),
              t(evidence.allIn ? 'ai.tripSub' : 'ai.tripSubMost', { window: win, name: evidence.trip.name }),
            )}
            <div className="flex-1 px-6 pt-2">
              <p className="mb-3" style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 600 }}>{t('ai.tripAsk')}</p>
              <div className="flex flex-wrap gap-2">
                {chipBtn(chip === 'yes', t('ai.tripYes', { name: evidence.trip.name }), () => setChip('yes'), 'yes')}
                {chipBtn(chip === 'other', t('ai.tripOther'), () => setChip('other'), 'other')}
                {chipBtn(chip === 'no', t('ai.tripNo'), () => setChip('no'), 'no')}
              </div>
              {chip === 'other' && nameRow(evidence.trip.name)}
            </div>
            {cta(t('ai.go'), goFromTrip, chip === 'other' && !otherName.trim())}
          </>
        ) : (
          <>
            {header(
              t('ai.tripTitle', { n: String(evidence.count) }),
              t(evidence.allIn ? 'ai.tripSubWindowAll' : 'ai.tripSubWindow', { window: win }),
            )}
            <div className="flex-1 px-6 pt-2">
              <p className="mb-3" style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 600 }}>{t('ai.tripAskNew')}</p>
              <div className="flex flex-wrap gap-2">
                {chipBtn(chip === 'no', t('ai.tripNo'), () => setChip('no'), 'no')}
                {chipBtn(chip === 'other', t('ai.tripYesNew'), () => setChip('other'), 'other')}
              </div>
              {chip === 'other' && nameRow(undefined, t('ai.tripNamePh'))}
              {chip === 'no' && (
                // Not a trip - then what is it? Optional, free, and worth a
                // whole round when it pre-empts the model's next question.
                <input
                  data-ai-context
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder={t('ai.tellMore')}
                  className="mt-3 w-full px-3.5 py-2 rounded-full bg-transparent outline-none"
                  style={{ border: '1.5px solid var(--line)', color: 'var(--ink)', fontSize: 16 }}
                />
              )}
            </div>
            {cta(t('ai.go'), goFromTrip, chip === 'other' && !otherName.trim())}
          </>
        );
      })()}

      {step === 'reading' && (
        <>
          {header(t('ai.readingTitle'), t('ai.readingSub'))}
          <div className="flex-1 px-6 pt-1 flex flex-col min-h-0">
            <div className="rounded-2xl px-4 py-4" style={{ background: 'linear-gradient(152deg, #22222B, #121217)' }}>
              {rows.length === 0 ? (
                // Before the first row there is nothing to count, and a card
                // reading "0 / 0€" looks broken rather than busy. The line
                // walks through the request's real stages instead - upload in
                // flight, headers arrived, then (after a while) the matching
                // the model is demonstrably in the middle of.
                <div className="animate-pulse py-2" data-ai-opening style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: 500 }}>
                  {openingSlow ? t('ai.openingLong')
                    : phase === 'sent' ? t('ai.phaseSend')
                    : phase === 'reading' ? (matching ? t('ai.phaseMatch') : t('ai.phaseRead'))
                    : t('ai.opening')}
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
              {(() => {
                // The bar: a real percent when the file's own date-scan gave
                // a row count, a soft sweep when it could not (PDFs, photos)
                // - never an invented number. Held short of 100 until the
                // authoritative answer actually lands.
                const pct = evidence && evidence.count > 0 && rows.length > 0
                  ? Math.min(95, Math.round((rows[rows.length - 1].n / evidence.count) * 100))
                  : null;
                return (
                  <div className="mt-3 flex items-center gap-2" data-ai-bar={pct === null ? 'indeterminate' : String(pct)}>
                    <div className="flex-1 relative overflow-hidden" style={{ height: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)' }}>
                      {pct === null
                        ? <span className="ai-bar-sweep" />
                        : <span style={{ display: 'block', height: '100%', width: `${pct}%`, borderRadius: 999, backgroundColor: '#FFFFFF', transition: 'width 400ms ease' }} />}
                    </div>
                    {pct !== null && (
                      <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
                    )}
                  </div>
                );
              })()}
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
            {/* Two readings of the same file, side by side. The phone's own
                arithmetic on a split export is exact - it reproduces
                Splitwise's "Your share" to the cent - so when the model's
                reading disagrees, the screen says so BEFORE anything is
                added. This is the check the instructions have always
                promised the user and the app used to leave to them. */}
            {fileShare && (() => {
              const read = (done?.payload?.transactions ?? [])
                .filter((tx) => (tx.type ?? 'expense') !== 'income')
                .reduce((s, tx) => s + (Number(tx.amount) || 0), 0);
              // The rows the export cannot attribute (all-zero rows naming
              // nobody) are legitimately either side of the line, so they
              // widen the tolerance rather than raising a false alarm.
              const slack = Math.max(fileShare.unclearTotal, fileShare.total * 0.02, 1);
              const agrees = Math.abs(read - fileShare.total) <= slack;
              const amount = (n: number) => fmtAmount(n, done?.payload?.currency ?? userCurrency);
              return (
                <p
                  data-ai-crosscheck={agrees ? 'ok' : 'off'}
                  className="mt-3 px-3 py-2 rounded-xl"
                  style={{
                    color: agrees ? 'var(--ink-3)' : 'var(--ink)',
                    backgroundColor: agrees ? 'transparent' : 'var(--wash-accent2)',
                    fontSize: 12, lineHeight: 1.5,
                  }}
                >
                  {agrees
                    ? t('ai.checkOk', { amount: amount(fileShare.total) })
                    : t('ai.checkOff', { file: amount(fileShare.total), read: amount(read) })}
                </p>
              );
            })()}
            {/* What it worked out on its own - which column it took as mine,
                shares vs balances, the total of my share. The instructions
                promise me these as the five-second check against what
                Splitwise shows; the app used to parse them and throw them
                away, so a reading that had silently dropped my biggest rows
                looked exactly like a correct one. */}
            {done?.notes && done.notes.length > 0 && (
              <div data-ai-notes className="mt-3 px-1">
                {done.notes.slice(0, 4).map((n, i) => (
                  <p key={i} style={{ color: 'var(--ink-2)', fontSize: 12, lineHeight: 1.5 }}>{n}</p>
                ))}
              </div>
            )}
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
          : error.code === 'stalled' ? { icon: Hourglass, title: t('ai.errStallTitle'), sub: t('ai.errStallSub'), retry: true }
          : error.code === 'daily_limit' ? {
              icon: Hourglass,
              title: t('ai.errLimitTitle'),
              // With the server's own number when the refusal named one:
              // "all 3 of today's reads" reads as a rule doing its job,
              // where an unexplained wall reads as the app breaking.
              sub: error.limit ? t('ai.errLimitSubN', { n: String(error.limit) }) : t('ai.errLimitSub'),
              retry: false,
            }
          : error.code === 'too_big' ? { icon: AlertCircle, title: t('ai.errTitle'), sub: t('ai.errBig'), retry: false }
          : error.code === 'not_configured' ? { icon: AlertCircle, title: t('ai.errTitle'), sub: t('ai.errOff'), retry: false }
          : error.code === 'busy' ? { icon: Hourglass, title: t('ai.errBusyTitle'), sub: t('ai.errBusySub'), retry: true }
          // Read fine, held nothing. Not a failure of the app and not a
          // duplicate - the file simply was not a list of expenses.
          : error.code === 'no_rows' ? { icon: AlertCircle, title: t('ai.errNoData'), sub: t('ai.errNoRowsSub'), retry: false }
          : {
              icon: AlertCircle, title: t('ai.errTitle'), sub: t('ai.errSub'), retry: true,
              // The server's own words, small and grey: "non sono riuscito a
              // leggerlo" with no reason attached was reported from a device
              // as exactly the kind of wall this flow promised not to build.
              detail: error.message && error.message !== error.code ? error.message.slice(0, 200) : undefined,
            };
        const Icon = fam.icon;
        return (
          <>
            {/* relative+z: the centred body below used to ride up over this
                row on a negative margin, and the X - the only way OFF a
                retry-only error screen - silently stopped taking taps. */}
            <div className="px-6 pt-4 relative z-10">
              <button onClick={onClose} className="p-2 -ml-2 rounded-lg" aria-label={t('ai.close')}>
                <X className="w-5 h-5" style={{ color: 'var(--ink-2)' }} />
              </button>
            </div>
            {/* pb-10, not -mt-10: same optical lift of the centred block,
                but padding cannot overlap the close row the way a negative
                margin did. */}
            <div className="flex-1 flex flex-col items-center justify-center px-10 pb-10 text-center">
              <span className="grid place-items-center rounded-full mb-5" style={{ width: 64, height: 64, backgroundColor: 'var(--wash-accent2)' }}>
                <Icon className="w-7 h-7" style={{ color: 'var(--accent-ink)' }} strokeWidth={1.8} />
              </span>
              <h2 style={{ color: 'var(--ink)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{fam.title}</h2>
              <p className="mt-2" style={{ color: 'var(--ink-2)', fontSize: 14, lineHeight: 1.5 }}>{fam.sub}</p>
              {'detail' in fam && fam.detail && (
                <p data-ai-detail className="mt-3" style={{ color: 'var(--ink-3)', fontSize: 11.5, lineHeight: 1.45, wordBreak: 'break-word' }}>
                  {fam.detail}
                </p>
              )}
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
