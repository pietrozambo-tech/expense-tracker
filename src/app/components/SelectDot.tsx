import { Check } from 'lucide-react';

/**
 * The tick that appears at the head of every row in Activity's selection mode.
 *
 * It is the whole visual difference between "a list you read" and "a list you
 * are acting on", so it takes the brand indigo rather than a grey: the filled
 * dots have to be countable from a scroll, and the header's count has to be
 * believable without checking it row by row.
 *
 * Rendered as a span, not a button - the row underneath is already the target,
 * and a control inside a control gives a phone two overlapping tap areas
 * roughly the size of a fingertip.
 */
export function SelectDot({ on }: { on: boolean }) {
  return (
    <span
      data-select-dot={on ? 'on' : 'off'}
      className="flex-shrink-0 w-[22px] h-[22px] rounded-full flex items-center justify-center"
      style={{
        border: on ? '1.5px solid transparent' : '1.5px solid var(--line)',
        // The brand as a FILL, not --accent-ink: that token lightens in dark
        // mode because it is meant to be read as text, and a white tick on it
        // there is barely a tick at 13px.
        backgroundColor: on ? '#4F74F3' : 'transparent',
        transition: 'background-color 140ms ease, border-color 140ms ease',
      }}
    >
      {on && <Check size={13} className="text-white" strokeWidth={3.5} />}
    </span>
  );
}
