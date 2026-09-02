// What the save toast is allowed to say, and - mostly - what it is not.
import { saveInsight, normalise, type InsightRow } from '../../src/app/lib/saveInsight';

const fail: string[] = [];
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

const NOW = new Date(2026, 8, 20); // 20 Sep 2026
let n = 0;
const row = (over: Partial<InsightRow> = {}): InsightRow => ({
  id: `r${n++}`, date: '2026-09-14', description: 'Caffè', amount: 6, type: 'expense', ...over,
});

// ── the handshake ────────────────────────────────────────────────────────
{
  const first = row({ description: 'Spesa' });
  ok(saveInsight({ rows: [first], saved: first, now: NOW })?.kind === 'first',
    'the very first expense a person writes gets the handshake');

  const second = row();
  ok(saveInsight({ rows: [first, second], saved: second, now: NOW }) === null,
    'the second does not - the handshake happens once');
}

// ── the invisible sum ────────────────────────────────────────────────────
{
  const rows = [row(), row(), row()];
  ok(saveInsight({ rows, saved: rows[2], now: NOW }) === null,
    'three of the same thing is not yet a pattern');

  const four = [...rows, row()];
  const got = saveInsight({ rows: four, saved: four[3], now: NOW });
  ok(got?.kind === 'repeat' && got.times === 4 && got.total === 24,
    `the fourth adds them up - the one thing the app never shows (${JSON.stringify(got)})`);

  const five = [...four, row()];
  ok(saveInsight({ rows: five, saved: five[4], now: NOW }) === null,
    'the fifth says nothing: the sentence has not changed, only the number');

  const eight = [...five, row(), row(), row()];
  const again = saveInsight({ rows: eight, saved: eight[7], now: NOW });
  ok(again?.kind === 'repeat' && again.times === 8,
    'the eighth speaks again, because doubling IS new');
}

// ── what it refuses ──────────────────────────────────────────────────────
{
  const cheap = [1, 2, 3, 4].map(() => row({ amount: 0.8, description: 'Gomme' }));
  ok(saveInsight({ rows: cheap, saved: cheap[3], now: NOW }) === null,
    'four things at 80 cents add up to a number nobody needed told');

  const old = [1, 2, 3, 4].map(() => row({ date: '2026-03-14' }));
  ok(saveInsight({ rows: old, saved: old[3], now: NOW }) === null,
    'a backdated receipt says nothing - "this month" would name the wrong month');

  const mixed = [row({ date: '2026-08-14' }), row({ date: '2026-08-15' }), row(), row()];
  ok(saveInsight({ rows: mixed, saved: mixed[3], now: NOW }) === null,
    'and last month\'s coffees do not count towards this month\'s four');

  const blank = [row({ description: '' }), row({ description: '' }), row({ description: '' }), row({ description: '' })];
  ok(saveInsight({ rows: blank, saved: blank[3], now: NOW }) === null,
    'rows with no description are not "the same thing" four times');

  const income = [1, 2, 3, 4].map(() => row({ type: 'income', description: 'Stipendio', amount: 2000 }));
  ok(saveInsight({ rows: income, saved: income[3], now: NOW }) === null,
    'and money coming IN is not a habit to warn anybody about');
}

// ── the same thing, typed differently ────────────────────────────────────
{
  const same = [
    row({ description: 'Caffè' }), row({ description: 'caffè ' }),
    row({ description: '  Caffè' }), row({ description: 'Caffè.' }),
  ];
  const got = saveInsight({ rows: same, saved: same[3], now: NOW });
  ok(got?.kind === 'repeat' && got.times === 4,
    'case, stray spaces and a trailing stop are not four different purchases');
  ok(got?.kind === 'repeat' && got.label === 'Caffè.',
    'and it quotes back what was actually typed, not the folded key');
  ok(normalise('  Un   Caffè. ') === 'un caffè',
    'the folding itself: trimmed, lowered, spaces collapsed, punctuation dropped');
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nthe toast speaks twice, and stays quiet otherwise');
process.exit(fail.length ? 1 : 0);
