import { Plane, Tag, Trash2, Wallet } from 'lucide-react';
import { t } from '../i18n';

interface ActivitySelectionBarProps {
  count: number;
  onCategory: () => void;
  onSource: () => void;
  /** Absent when the user has no travel category: without one there is nowhere
   *  to file a trip, and the action would only ever explain itself. */
  onTrip?: () => void;
  onDelete: () => void;
}

/**
 * The bar that replaces the dock while rows are selected.
 *
 * It takes the dock's exact position and slab so the bottom of the screen does
 * not jump: the same dark glass, in the same place, now carrying what you can
 * do with the rows instead of where you can go. Navigation is out of reach
 * while selecting, which is the point - leaving the tab is what Done is for.
 *
 * Every action is disabled at zero. Selection mode with nothing ticked is a
 * normal state (you get there by unticking the last row), and a live Delete
 * button over an empty selection is an invitation to find out what it does.
 */
export function ActivitySelectionBar({
  count,
  onCategory,
  onSource,
  onTrip,
  onDelete,
}: ActivitySelectionBarProps) {
  const none = count === 0;
  const item = (
    key: string,
    Icon: typeof Tag,
    label: string,
    onClick: () => void,
    disabled: boolean,
    danger = false,
  ) => (
    <button
      key={key}
      data-sel-action={key}
      disabled={disabled}
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl transition-opacity active:opacity-60"
      style={{ opacity: disabled ? 0.35 : 1 }}
    >
      <Icon size={19} strokeWidth={2} style={{ color: danger ? '#FF6B6B' : 'rgba(255,255,255,0.92)' }} />
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.1,
          color: danger ? '#FF6B6B' : 'rgba(255,255,255,0.92)',
        }}
      >
        {label}
      </span>
    </button>
  );

  return (
    <div
      className="fixed left-0 right-0 z-50 px-3.5"
      style={{ bottom: 'max(20px, env(safe-area-inset-bottom))' }}
    >
      <div
        data-sel-bar
        className={`relative w-full max-w-[430px] mx-auto grid ${onTrip ? 'grid-cols-4' : 'grid-cols-3'} items-center px-2 py-2 rounded-[26px] backdrop-blur-[26px] backdrop-saturate-150`}
        style={{
          backgroundColor: 'rgba(28, 28, 30, 0.84)',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.10)',
        }}
      >
        {/* Category stays live on a mixed selection and explains itself on tap
            rather than greying out: a dead button with no reason attached is
            the one thing worse than a refusal. */}
        {item('category', Tag, t('sel.category'), onCategory, none)}
        {item('source', Wallet, t('sel.account'), onSource, none)}
        {onTrip && item('trip', Plane, t('sel.trip'), onTrip, none)}
        {item('delete', Trash2, t('sel.delete'), onDelete, none, true)}
      </div>
    </div>
  );
}
