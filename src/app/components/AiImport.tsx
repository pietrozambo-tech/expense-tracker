import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronLeft, Hourglass, WifiOff, X } from 'lucide-react';
import { t } from '../i18n';
import { useBackClose } from '../lib/useBackClose';
import { getLanguage, monthsShort } from '../i18n/store';
import {
  AiImportError, convertWithAi, scanFileDates, tripForWindow,
  type AiDone, type AiFile, type AiQuestion, type ResolvedMapping,
} from '../lib/aiImport';
import { buildImport, proposalKey, type ImportPayload, type ImportResult } from '../lib/importData';
import { categoryHex } from './categoryColors';
import { CATCHALL_RE } from '../lib/categoryOps';
import { myShareCsv, splitPeople, splitShareTotal } from '../lib/splitFile';
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

type Step = 'who' | 'trip' | 'categories' | 'reading' | 'questions' | 'ready' | 'error';

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
  /** Create these categories, each on the list of its type, and resolve
   *  once the CLOUD has them. Absent means the category screen can only
   *  offer mapping. */
  onCreateCategories?: (items: { name: string; type: 'expense' | 'income' }[]) => Promise<boolean>;
  /** The payload to commit, and which of the file's new subcategories the
   *  person ticked on the ready screen. Decided here so the commit does
   *  not raise a second sheet to ask the same thing. */
  onCommit: (payload: ImportPayload, approvedSubcategories: Set<string>) => void;
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
  files, trips, categories, incomeCategories, userCurrency, transactions, userName, onCreateCategories, onCommit, onClose,
}: AiImportProps) {
  // The file's own arithmetic, done here: on a split export the phone can
  // work out my share exactly, and then the model's reading has something to
  // be checked against instead of being taken on trust. Null for every file
  // that is not one of these, or whose columns do not name me.
  // Which column the user says is theirs, when the file uses a nickname the
  // app cannot match ("Pit" for Pietro). Asked here, once, for free.
  const [whoName, setWhoName] = useState<string | null>(null);
  const me = whoName ?? userName ?? '';

  const fileShare = useMemo(() => {
    if (!me.trim()) return null;
    for (let i = 0; i < files.length; i += 1) {
      const text = files[i].text;
      if (!text) continue;
      const found = splitShareTotal(text, me);
      if (found) return { ...found, at: i };
    }
    return null;
  }, [files, me]);

  // Who the file splits between - read once from the file itself, and NOT
  // conditional on having found my column, or the screen offering the names
  // would vanish the moment one of them was tapped.
  const people = useMemo(() => {
    for (const f of files) {
      if (!f.text) continue;
      const found = splitPeople(f.text);
      if (found) return found;
    }
    return null;
  }, [files]);

  // A split file whose columns name nobody I know ("Pit" for Pietro). Rather
  // than send it off and let the model spend a round asking - it is the
  // question these files always trigger - the phone asks, and then owns the
  // arithmetic for the answer. A column it recognised never asks.
  const needsWho = useMemo(() => {
    if (!people) return false;
    if (!userName?.trim()) return true;
    return !files.some((f) => f.text && splitShareTotal(f.text, userName));
  }, [files, people, userName]);

  // What actually travels. On a split export the phone rewrites the file as
  // MY OWN rows - my share already worked out - and sends that instead of
  // the per-person columns.
  //
  // Because the model got this wrong on a real file, twice on one screen: a
  // +144.82 balance became a 144.82 expense (the share was 36.21), and
  // another leftover came back as INCOME under Salary. None of that is a
  // reading failure - it is arithmetic, the app can do it exactly, and a
  // model asked to do sums thirty times will eventually not. So it is no
  // longer asked: it gets a plain list and does the reading.
  const sent = useMemo(() => {
    if (!fileShare) return files;
    const csv = myShareCsv(fileShare);
    const bytes = new TextEncoder().encode(csv);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return files.map((f, i) => (i === fileShare.at
      ? { ...f, media_type: 'text/csv', data: btoa(binary), bytes: bytes.length, text: csv }
      : f));
  }, [files, fileShare]);
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
        // notTrip is the OTHER half of askTrip, and the half that was
        // missing: two years of dates is not a trip, and the phone knew it -
        // then sent "I have not said whether this is a trip" and the model
        // spent a fifty-second read asking. What the phone can rule out it
        // now rules out, in words the model reads as settled.
        return { ...scan, trip, askTrip: !trip && spanDays <= 45, notTrip: !trip && spanDays > 45 };
      }
    }
    return null;
  }, [files, trips]);

  const [step, setStep] = useState<Step>(evidence?.trip || evidence?.askTrip ? 'trip' : 'reading');
  // The column question comes FIRST when it applies: everything downstream -
  // the arithmetic, the cross-check, what gets sent - hangs off the answer.
  useEffect(() => {
    if (needsWho && whoName === null && !startedRef.current) setStep('who');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsWho]);
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
  // What the file is turning into, category by category, while it arrives.
  //
  // The wait is ninety seconds on a big export and the person cannot leave
  // it - so the screen owes them more than a bar. This is not decoration: it
  // is the shape of their own year assembling itself, in the colours their
  // Dashboard will use for it, and it answers the question they actually
  // have while they wait, which is not "how far along" but "what is in
  // there". It also surfaces a bad mapping while there is still a Back
  // button: Housing filling up on a file with no rent in it is visible here
  // long before the review screen.
  const [tally, setTally] = useState<Record<string, number>>({});
  const [questions, setQuestions] = useState<AiQuestion[]>([]);
  // The model's mapping of the file's categories onto mine, checked, and
  // what I have said about each: the target to use, or '' to create it.
  // Decided here, before a row is read, because that is the last moment a
  // new category can still change where those rows land.
  const [catMap, setCatMap] = useState<ResolvedMapping[]>([]);
  const [catPlan, setCatPlan] = useState<Record<string, string>>({});
  const [gapBusy, setGapBusy] = useState(false);
  const [gapFailed, setGapFailed] = useState(false);
  const planKey = (m: { type: string; source: string }) => `${m.type}:${m.source}`;
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [done, setDone] = useState<AiDone | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [error, setError] = useState<AiImportError | null>(null);
  // True once the opening has visibly overstayed its welcome: the line under
  // the pulse changes, so a slow function never reads as a frozen screen.
  const [openingSlow, setOpeningSlow] = useState(false);
  // Asked before the one action on this screen that cannot be undone: leaving
  // while the model is mid-answer. The request is aborted on unmount, the
  // server keeps generating, and the day's import is spent for nothing - all
  // of it silent, for the price of one tap on a back arrow.
  const [leaving, setLeaving] = useState(false);
  // Which TRUE moment the request is in, for the pre-first-row narration:
  // 'sent' while the upload is in flight, 'reading' once the headers arrive
  // and the model is at work. Never theatre - each line maps to an event.
  const [phase, setPhase] = useState<'sent' | 'reading' | 'triage' | 'repair' | null>(null);
  // Ten seconds into 'reading' with no row yet, the model is demonstrably
  // deep in the matching the prompt sets it (its instructions carry the
  // user's own categories) - say that instead of repeating "reading".
  const [matching, setMatching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);

  const lang = getLanguage() === 'it' ? 'it' : 'en';

  const start = (
    trip: { is_trip: boolean; name?: string } | null,
    priorAnswers?: { ask: string; answer: string }[],
    opts?: { triaged?: boolean; importId?: string },
  ) => {
    setStep('reading');
    setRows([]);
    setRunningTotal(0);
    setTally({});
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
      // Not "which column is me" any more - the file it is about to read has
      // one amount column and it is already mine. Said anyway, because it
      // tells the model the split question is ANSWERED and stops it asking.
      priors.push({
        ask: 'Whose spending is this file?',
        answer: `Mine (column "${fileShare.column}"). The amounts are already my own share - do not divide or adjust them, and they are all expenses.`,
      });
    }
    // The second negative. A personal statement has people's names all
    // through its descriptions - "sartoria Ale", "pranzo con Mirko" - and on
    // a real one the model read them as the members of a split-expense
    // group and asked, twice, which of them was me. splitPeople() looks for
    // per-person COLUMNS and found none; that finding now travels, so the
    // names stay what they are: who I was with, not who paid.
    if (people === null && !fileShare && sent.some((f) => f.text) && !priors.some((a) => /whose|column/i.test(a.ask))) {
      priors.push({
        ask: 'Whose spending is this file?',
        answer: 'All mine. This is a personal ledger, not a shared-expense export: there are no per-person columns, and any names in the descriptions are people I was with, not payers. Do not ask me which name or column is me.',
      });
    }
    // The first negative: what the date scan ruled out, said as a fact rather
    // than left as "not said".
    const tripFact = trip ?? (evidence?.notTrip ? { is_trip: false } : null);
    convertWithAi({
      files: sent, trip: tripFact, lang, triaged: opts?.triaged, importId: opts?.importId,
      // The catalogue the triage's mapping is checked against, by type: an
      // income word must land on an income category, and the check has to
      // know which list to look in.
      myCategories: {
        expense: (categories as { name?: string }[]).map((c) => c?.name ?? '').filter(Boolean),
        income: (incomeCategories as { name?: string }[]).map((c) => c?.name ?? '').filter(Boolean),
      },
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
        const cat = String(row.category ?? '').trim();
        if (cat) setTally((prev) => ({ ...prev, [cat]: (prev[cat] ?? 0) + Math.abs(amount) }));
      },
    })
      .then((d) => {
        clearTimers();
        setDone(d);
        // Categories the file needs and this account has not got. Handled
        // before the questions, and before any reading: creating one after
        // the rows are filed does not move them.
        if (d.categoryMap?.length) {
          setCatMap(d.categoryMap);
          // Settled lines start on the model's target; gaps start on "create".
          setCatPlan(Object.fromEntries(d.categoryMap.map((m) => [planKey(m), m.settled ? (m.target ?? '') : ''])));
          setGapFailed(false);
          setStep('categories');
          return;
        }
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
    // A column to settle first, or a trip to assert: both are screens, and
    // neither may be skipped by the reading starting underneath them.
    if (needsWho && whoName === null) return;
    if (evidence?.trip || evidence?.askTrip) return;
    startedRef.current = true;
    start(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsWho]);

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

  /**
   * Leave the gap screen: create what was marked "create", wait for the
   * cloud to have it, then read.
   *
   * The waiting is not politeness. The convert function reads the catalogue
   * from the synced row, so starting the reading before the push lands would
   * hand the model the OLD list and file every row meant for the new
   * category somewhere else - with this screen having promised otherwise. A
   * push that does not land is therefore a stop, not a warning.
   */
  const goFromCategories = async () => {
    const toCreate = catMap.filter((m) => (catPlan[planKey(m)] ?? '') === '');
    setGapBusy(true);
    setGapFailed(false);
    if (toCreate.length > 0) {
      const landed = await onCreateCategories?.(toCreate.map((m) => ({ name: m.source, type: m.type })));
      if (!landed) {
        setGapBusy(false);
        setGapFailed(true);
        return;
      }
    }
    // The WHOLE mapping travels as one answer - what the model proposed and I
    // left, what I changed, what I had created - in the shape it already
    // reads answers in. Every part of the reading then files the same word
    // the same way, and none of them has to ask.
    const lines = catMap.map((m) => {
      const chosen = catPlan[planKey(m)] ?? '';
      return `"${m.source}" (${m.type}) -> ${chosen || `${m.source} (new, just created)`}`;
    });
    const priors = lines.length
      ? [{ ask: 'Where does each category of the file go?', answer: lines.join('; ') }]
      : undefined;
    setGapBusy(false);
    start(tripAnswer, priors, { triaged: true, importId: done?.importId });
  };

  const goFromQuestions = () => {
    const prior = questions.map((q, i) => ({ ask: q.ask, answer: answers[i] ?? '' }))
      .filter((a) => a.answer.trim());
    // The questions have been asked. The re-run must not ask them again on
    // the sample, its reading is told it may not ask at all, and it stays
    // the SAME import - the credit was claimed under that id when the
    // question was asked, and a fresh id would pay twice for one file.
    start(tripAnswer, prior, { triaged: true, importId: done?.importId });
  };

  // Which of the file's NEW subcategories become chips. Nothing starts
  // ticked - the same rule as the review sheet this replaces, and for the
  // same reason: a pre-ticked "Hotel" is how a deleted chip kept coming back
  // on every import. The rows import either way, just without the chip.
  const [approvedSubs, setApprovedSubs] = useState<Set<string>>(() => new Set());
  const commit = () => {
    if (!done?.payload) return;
    onCommit(done.payload, approvedSubs);
    onClose();
  };

  // The reading screen's three ticks, driven by progress rather than theatre:
  // The colour each category wears everywhere else in the app, by name -
  // what arrives on the wire is the name, and the tally has to look like the
  // Dashboard the person is about to land on, not like a new palette.
  const hexOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of [...categories, ...incomeCategories] as { name?: string; color?: string }[]) {
      if (c?.name) map.set(c.name, categoryHex(c.color));
    }
    return map;
  }, [categories, incomeCategories]);

  // the first lights with the first row, the second once categories have
  // demonstrably arrived (every row carries one), the third at the end.
  const ticks: { label: string; on: boolean }[] = [
    { label: t('ai.tick1'), on: rows.length > 0 },
    { label: t('ai.tick2'), on: rows.length > 1 },
    { label: t('ai.tick3'), on: step === 'ready' },
  ];

  /** Leaving mid-read costs the day's import; every other screen is free. */
  const tryClose = () => (step === 'reading' ? setLeaving(true) : onClose());
  // Back does exactly what the chevron does: mid-read it asks, otherwise it
  // leaves. The confirm itself takes the next press, which means "stay".
  useBackClose(true, tryClose);
  useBackClose(leaving, () => setLeaving(false));

  const header = (title: string, sub?: string) => (
    <div className="px-6 pt-4 pb-2">
      <div className="flex items-center justify-between">
        <button onClick={tryClose} className="p-2 -ml-2 rounded-lg" aria-label={t('ai.close')}>
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
      {step === 'who' && people && (
        <>
          {header(t('ai.whoTitle'), t('ai.whoSub', { n: String(people.length) }))}
          <div className="flex-1 px-6 pt-2">
            <div className="flex flex-wrap gap-2">
              {people.map((name) => chipBtn(whoName === name, name, () => setWhoName(name), `who-${name}`))}
              {/* Somebody else's export, or a group I am not a column in:
                  the file still goes through, just without the shortcut. */}
              {chipBtn(whoName === '', t('ai.whoNone'), () => setWhoName(''), 'who-none')}
            </div>
          </div>
          {cta(t('ai.go'), () => {
            startedRef.current = true;
            if (evidence?.trip || evidence?.askTrip) setStep('trip');
            else start(null);
          }, whoName === null, 'who-go')}
        </>
      )}

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
                    : phase === 'repair' ? t('ai.phaseRepair')
                    : phase === 'triage' ? t('ai.phaseTriage')
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
              {/* The last stretch, and the only one that has to explain
                  itself. The rows have stopped arriving, the bar is not
                  moving and the wait is not over: a part came back with
                  fewer rows than went into it and is being read again.
                  Without this line the screen reads as a hang, which is the
                  worst possible moment to look broken - it is the moment the
                  app is busy NOT losing the person's money. */}
              {phase === 'repair' && (
                <div data-ai-repair className="mt-3 animate-pulse" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12.5, fontWeight: 500 }}>
                  {t('ai.phaseRepair')}
                </div>
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
            {/* The shape of it, filling in. Top five by size, in their own
                colours, each bar measured against the biggest so the tallest
                is always full width and the rest are read against it. The
                widths transition, which is the only movement on this screen:
                the bars grow because the numbers grew, not to entertain. */}
            {(() => {
              const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 5);
              if (top.length < 2) return null;
              const most = top[0][1] || 1;
              const cur = done?.payload?.currency ?? rows[rows.length - 1]?.currency ?? userCurrency;
              return (
                <div className="mt-4 flex flex-col gap-2" data-ai-tally={top.length}>
                  {top.map(([name, amount]) => (
                    <div key={name} data-ai-tally-row={name}>
                      <div className="flex items-baseline justify-between gap-3" style={{ fontSize: 11.5 }}>
                        <span className="truncate" style={{ color: 'var(--ink-2)' }}>{name}</span>
                        <span style={{ color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtAmount(amount, cur)}
                        </span>
                      </div>
                      <div className="mt-1 overflow-hidden" style={{ height: 5, borderRadius: 999, backgroundColor: 'var(--bg-inset)' }}>
                        <span
                          style={{
                            display: 'block', height: '100%', borderRadius: 999,
                            width: `${Math.max(3, Math.round((amount / most) * 100))}%`,
                            backgroundColor: hexOf.get(name) ?? 'var(--ghost)',
                            transition: 'width 500ms cubic-bezier(0.22, 1, 0.36, 1)',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
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

      {/* Where the file's categories go, decided BEFORE the reading - the only
          moment a new category still changes where the rows land.
          Two parts. The mapping the model made, one quiet line each, there to
          be glanced at and tappable if wrong: "Attivita fisica -> Sport" is a
          reading, not a question, and a real file once turned fifteen of
          those into fifteen questions. Then the words it could place nowhere:
          create it, or pick one of mine. Every choice is a category that
          exists, of the right type; there is no text field on this screen,
          because a typed category that does not exist is the failure it
          closes. */}
      {step === 'categories' && (() => {
        // A line where the model matched a word to itself is not a decision
        // and is not shown; it still travels in the answer. What is shown is
        // what somebody might want to change: a judgement call, or a gap.
        const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
        const settled = catMap.filter((m) => m.settled && !same(m.source, m.target ?? ''));
        const gaps = catMap.filter((m) => !m.settled);
        const listFor = (type: 'expense' | 'income') =>
          ((type === 'income' ? incomeCategories : categories) as { name?: string }[])
            .map((c) => c?.name).filter((n): n is string => !!n);
        const picker = (m: ResolvedMapping, chosen: string, quiet: boolean) => (
          <div
            className="relative flex items-center px-3.5 py-2 rounded-full"
            style={{
              border: `1.5px solid ${chosen !== '' ? (quiet ? 'var(--line)' : '#4F74F3') : 'var(--line)'}`,
              backgroundColor: chosen !== '' && !quiet ? '#4F74F3' : 'var(--bg-card)',
            }}
          >
            <span style={{ color: chosen !== '' && !quiet ? '#FFFFFF' : chosen !== '' ? 'var(--ink)' : 'var(--ink-2)', fontSize: 13.5, fontWeight: chosen !== '' ? 600 : 500 }}>
              {chosen !== '' ? chosen : t('ai.gapMap')}
            </span>
            <select
              data-ai-cat-map={m.source}
              aria-label={t('ai.gapMap')}
              value={chosen}
              onChange={(e) => setCatPlan((p) => ({ ...p, [planKey(m)]: e.target.value }))}
              className="absolute inset-0 w-full h-full opacity-0"
              style={{ WebkitAppearance: 'none', appearance: 'none' }}
            >
              <option value="">{onCreateCategories ? t('ai.gapCreate') : t('ai.gapMap')}</option>
              {listFor(m.type).map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
        );
        const typeTag = (m: ResolvedMapping) => m.type === 'income'
          ? <span className="ml-1.5" style={{ color: 'var(--ink-3)', fontSize: 11, fontWeight: 500 }}>{t('ai.catIncome')}</span>
          : null;
        return (
          <>
            {header(t('ai.catTitle'), t('ai.catSub'))}
            <div className="flex-1 px-6 pt-1 overflow-y-auto min-h-0">
              {gaps.length > 0 && (
                <p className="mt-2 mb-1" style={{ color: 'var(--ink-3)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {t(gaps.length === 1 ? 'ai.catGapsOne' : 'ai.catGaps')}
                </p>
              )}
              {gaps.map((m) => {
                const chosen = catPlan[planKey(m)] ?? '';
                return (
                  <div key={planKey(m)} data-ai-cat={m.source} data-ai-cat-kind="gap" className="py-3" style={{ borderTop: '1px solid var(--line-2)' }}>
                    <p style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 600 }}>{m.source}{typeTag(m)}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {onCreateCategories && (
                        <button
                          data-ai-cat-create={m.source}
                          onClick={() => setCatPlan((p) => ({ ...p, [planKey(m)]: '' }))}
                          className="px-3.5 py-2 rounded-full transition-colors"
                          style={{
                            border: `1.5px solid ${chosen === '' ? '#4F74F3' : 'var(--line)'}`,
                            backgroundColor: chosen === '' ? '#4F74F3' : 'var(--bg-card)',
                            color: chosen === '' ? '#FFFFFF' : 'var(--ink)',
                            fontSize: 13.5, fontWeight: chosen === '' ? 600 : 500,
                          }}
                        >
                          {t('ai.gapCreate')}
                        </button>
                      )}
                      {picker(m, chosen, false)}
                    </div>
                  </div>
                );
              })}
              {settled.length > 0 && (
                <p className="mt-4 mb-1" style={{ color: 'var(--ink-3)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {t('ai.catSettled')}
                </p>
              )}
              {settled.map((m) => {
                const chosen = catPlan[planKey(m)] ?? m.target ?? '';
                return (
                  <div key={planKey(m)} data-ai-cat={m.source} data-ai-cat-kind="settled" className="py-2.5 flex items-center justify-between gap-3" style={{ borderTop: '1px solid var(--line-2)' }}>
                    <p className="min-w-0 truncate" style={{ color: 'var(--ink-2)', fontSize: 14 }}>{m.source}{typeTag(m)}</p>
                    {picker(m, chosen, true)}
                  </div>
                );
              })}
              {gapFailed && (
                <p data-ai-gap-failed className="mt-3" style={{ color: 'var(--tone-warn)', fontSize: 12.5, lineHeight: 1.45 }}>
                  {t('ai.gapSyncFailed')}
                </p>
              )}
            </div>
            {cta(gapBusy ? t('ai.gapSaving') : t('ai.go'), goFromCategories, gapBusy)}
          </>
        );
      })()}

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
              // What was SENT: my share on every row, the unattributed ones
              // included at their full cost. The model is only reading now,
              // so the two should agree closely; the slack is for a rounded
              // cent, not for a different reading.
              const expected = fileShare.total + fileShare.unclearTotal;
              const slack = Math.max(expected * 0.02, 1);
              const agrees = Math.abs(read - expected) <= slack;
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
                    ? t('ai.checkOk', { amount: amount(expected) })
                    : t('ai.checkOff', { file: amount(expected), read: amount(read) })}
                </p>
              );
            })()}
            {/* What it worked out on its own - which column it took as mine,
                shares vs balances, the total of my share. The instructions
                promise me these as the five-second check against what
                Splitwise shows; the app used to parse them and throw them
                away, so a reading that had silently dropped my biggest rows
                looked exactly like a correct one. */}
            {(() => {
              // When the PHONE did the arithmetic, the model's own totals are
              // no longer worth printing - and worse than useless when they
              // disagree. A real reading of a 50-row trip came back with
              // "Totale mia quota: €1.087,02" under a card correctly saying
              // 1375,49: the app's figure is the summed column, the note was
              // the model adding fifty numbers in prose. So on a derived
              // file, any note carrying a money figure is dropped and the
              // rest - which column, shares or balances - stands.
              const MONEY = /[€$£]\s?[\d.,]+|[\d.,]+\s?[€$£]|\d+[.,]\d{2}\b/;
              const notes = (done?.notes ?? []).filter((n) => !(fileShare && MONEY.test(n)));
              if (notes.length === 0) return null;
              return (
                <div data-ai-notes className="mt-3 px-1">
                  {notes.slice(0, 4).map((n, i) => (
                    <p key={i} style={{ color: 'var(--ink-2)', fontSize: 12, lineHeight: 1.5 }}>{n}</p>
                  ))}
                </div>
              );
            })()}
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
            {/* The receipt: rows counted on the way out against rows that
                came back.
                A friend's 1,206-row export came back ten rows and 556 EUR
                short. The split had been exact, buildImport had dropped
                nothing - the reading simply did not emit them - and this
                screen said "Pronte" over a year that was 1% too cheap. The
                phone had both numbers the whole time and never put them side
                by side.
                It is stated as a fact rather than an alarm, because a
                shortfall is not always a fault: a Splitwise export has
                settlement rows the model is TOLD to skip. What makes it
                actionable is the last sentence - importing the same file
                again adds only what is missing, since the dedupe recognises
                everything already here. */}
            {(() => {
              const read = done?.payload?.transactions.length ?? 0;
              const short = (done?.rowsSent ?? 0) - read;
              if (!done?.rowsSent || short <= 0) return null;
              return (
                <p data-ai-short={short} className="mt-2 px-1" style={{ color: 'var(--tone-warn)', fontSize: 12, lineHeight: 1.5 }}>
                  {t(short === 1 ? 'ai.short1' : 'ai.shortN', {
                    n: String(short), sent: String(done.rowsSent), read: String(read),
                  })}
                </p>
              );
            })()}
            {/* Rows whose category is none of mine, and what became of them.
                This is the last screen where it is still undoable, and until
                now it said nothing at all.
                It matters most after a mapping question. The model asks
                "Barbiere: Health or Other?", the answer typed into the box
                is a category that does not exist, and one of two things
                happens depending on a detail nobody knows about their own
                account: WITH a catch-all ("Others") the rows land there and
                the typed name is kept as a subcategory; WITHOUT one they are
                dropped, counted among "skipped" and never explained. Either
                way the person asked for Sport and did not get it. Both are
                named here, with the categories that had no home - the one
                word that says what to fix. */}
            {(() => {
              const homeless = new Set<string>();
              // Dropped outright, for want of a catch-all to land in:
              // buildImport puts the name in the skip reason, and this is the
              // only place it is ever readable.
              let dropped = 0;
              for (const s of preview.skipped) {
                const m = /category "(.*)"$/.exec(s.reason);
                if (m && m[1]) { homeless.add(m[1]); dropped += 1; }
              }
              // Filed under the catch-all instead, with the original name
              // kept as the subcategory - which is where it reads back.
              for (const tx of preview.transactions) {
                if (CATCHALL_RE.test(tx.category.name.trim()) && tx.subcategory) homeless.add(tx.subcategory);
              }
              if (homeless.size === 0) return null;
              const names = [...homeless].slice(0, 4).join(', ');
              return (
                <p data-ai-homeless={dropped + preview.defaulted} className="mt-2 px-1" style={{ color: 'var(--tone-warn)', fontSize: 12 }}>
                  {dropped > 0
                    ? t(dropped === 1 ? 'ai.homelessDropped1' : 'ai.homelessDroppedN', { n: String(dropped), names })
                    : t(preview.defaulted === 1 ? 'ai.homelessOther1' : 'ai.homelessOtherN', { n: String(preview.defaulted), names })}
                </p>
              );
            })()}
            {/* The file's subcategories that are not chips of mine yet, to
                tick HERE rather than on a second sheet after Add. One
                decision, one place: a real import ended with this screen,
                then a dialog asking about two subcategories, and the person
                had every right to wonder why the app had not asked while
                they were already looking at the list. */}
            {preview.proposedSubcategories.length > 0 && (
              <div data-ai-subs className="mt-4 rounded-2xl px-4 py-3" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--line-2)' }}>
                <p style={{ color: 'var(--ink)', fontSize: 13.5, fontWeight: 600 }}>
                  {preview.proposedSubcategories.length === 1
                    ? t('imp.newSub.one')
                    : t('imp.newSub.other', { n: String(preview.proposedSubcategories.length) })}
                </p>
                <p className="mt-0.5" style={{ color: 'var(--ink-3)', fontSize: 12, lineHeight: 1.45 }}>{t('imp.newSubBody')}</p>
                <div className="mt-2 flex flex-col">
                  {preview.proposedSubcategories.map((sp) => {
                    const k = proposalKey(sp);
                    const on = approvedSubs.has(k);
                    return (
                      <button
                        key={k}
                        data-ai-sub={sp.name}
                        data-ai-sub-on={on ? 'yes' : 'no'}
                        onClick={() => setApprovedSubs((prev) => {
                          const next = new Set(prev);
                          if (next.has(k)) next.delete(k); else next.add(k);
                          return next;
                        })}
                        className="flex items-center gap-2.5 py-2 text-left"
                      >
                        <span
                          className="flex-shrink-0 grid place-items-center rounded-md"
                          style={{
                            width: 18, height: 18,
                            backgroundColor: on ? '#4F74F3' : 'transparent',
                            border: on ? '1.5px solid #4F74F3' : '1.5px solid var(--ghost)',
                          }}
                        >
                          {on && <Check className="w-3 h-3 text-white" strokeWidth={3.2} />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate" style={{ color: 'var(--ink)', fontSize: 13.5, fontWeight: 500 }}>{sp.name}</span>
                          <span className="block" style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>
                            {t(sp.rows === 1 ? 'imp.proposalMeta.one' : 'imp.proposalMeta.other', { cat: sp.categoryName, n: sp.rows })}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
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
          // A read that was told not to ask, asking. The question itself is
          // the detail: it is what the person will want to tell me about.
          : error.code === 'asked_late' ? {
              icon: AlertCircle, title: t('ai.errAskedLateTitle'), sub: t('ai.errAskedLateSub'), retry: true,
              detail: error.message ? error.message.slice(0, 200) : undefined,
            }
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

      {/* Its own markup rather than ConfirmDialog, which sits at z-50 and
          would render UNDER this flow's z-70. */}
      {leaving && (
        <div data-overlay data-ai-leave className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-6 max-w-[430px] mx-auto">
          <div className="w-full max-w-sm rounded-2xl px-6 py-5" style={{ backgroundColor: 'var(--bg-card)' }}>
            <h3 style={{ color: 'var(--ink)', fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>{t('ai.leaveTitle')}</h3>
            <p className="mt-1.5" style={{ color: 'var(--ink-2)', fontSize: 13.5, lineHeight: 1.5 }}>{t('ai.leaveBody')}</p>
            <button
              data-ai-leave-stay
              onClick={() => setLeaving(false)}
              className="w-full mt-4 py-3 rounded-xl font-semibold text-[15px]"
              style={{ backgroundColor: '#4F74F3', color: '#FFFFFF' }}
            >
              {t('ai.leaveStay')}
            </button>
            <button
              data-ai-leave-go
              onClick={onClose}
              className="w-full mt-2 py-2.5 rounded-xl font-medium text-[14px]"
              style={{ color: 'var(--ink-2)' }}
            >
              {t('ai.leaveGo')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
