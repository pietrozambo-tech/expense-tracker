import { useState } from 'react';
import { X, BarChart3, ArrowDownToLine, SlidersHorizontal, ChevronRight } from 'lucide-react';
import { t } from '../i18n';
import { installPlatform, type Nudge } from '../lib/nudges';

// One slim card at the top of the Dashboard, one nudge at a time - see
// lib/nudges.ts for which one and why. The card is advice, so everything
// about it stays dismissible and quiet: no colour shouting, one line of body,
// and the X answers "no" permanently.

const ICONS: Record<Nudge, typeof BarChart3> = {
  recap: BarChart3,
  install: ArrowDownToLine,
  customize: SlidersHorizontal,
};

export interface RecapFacts {
  /** Month name, already localised ("July" / "Luglio"). */
  month: string;
  /** Pre-formatted amounts - the card does no money arithmetic. */
  spent: string;
  saved: string | null; // null when the month had no income to save from
  topCategory: string | null;
}

export function NudgeCenter({
  nudge,
  recap,
  onDismiss,
  onAction,
}: {
  nudge: Nudge;
  recap?: RecapFacts;
  onDismiss: () => void;
  /** recap -> Trend; customize -> Settings. Install handles itself. */
  onAction: () => void;
}) {
  // The install card's steps unfold in place: a sheet for three lines of
  // instructions is ceremony, and the unfold keeps Safari's Share button
  // visible below while the user follows them.
  const [showSteps, setShowSteps] = useState(false);
  const Icon = ICONS[nudge];

  const title =
    nudge === 'recap' ? t('nudge.recapTitle', { month: recap?.month ?? '' })
    : nudge === 'install' ? t('nudge.installTitle')
    : t('nudge.customizeTitle');

  const body =
    nudge === 'recap'
      ? [
          t('nudge.recapSpent', { amount: recap?.spent ?? '' }),
          recap?.topCategory ? t('nudge.recapTop', { name: recap.topCategory }) : null,
          recap?.saved ? t('nudge.recapSaved', { amount: recap.saved }) : null,
        ].filter(Boolean).join(' · ')
      : nudge === 'install' ? t('nudge.installBody')
      : t('nudge.customizeBody');

  const cta =
    nudge === 'recap' ? t('nudge.recapCta')
    : nudge === 'install' ? (showSteps ? null : t('nudge.installHow'))
    : t('nudge.customizeCta');

  const steps =
    installPlatform() === 'android'
      ? [t('nudge.installAnd1'), t('nudge.installAnd2'), t('nudge.installAnd3')]
      : [t('nudge.installIos1'), t('nudge.installIos2'), t('nudge.installIos3')];

  return (
    <div
      data-nudge={nudge}
      className="mx-4 mt-3 px-4 py-3.5 bg-white rounded-2xl"
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
