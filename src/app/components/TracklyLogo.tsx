import { useId } from 'react';

interface TracklyLogoProps {
  size?: number;
  className?: string;
}

// The TracklyLab mark: a lens ring with the spending line climbing through it,
// ending in a dot that sits on the ring itself. The ring is interrupted around
// that dot - the gap is what makes the dot read as a separate element rather
// than a thick spot on the stroke, and it is why the line can keep its full
// length instead of being cramped inside the circle.
//
// If this ever needs redrawing, the same geometry is repeated in four other
// places, all scaled from this 48-unit grid: the favicons in index.html and
// site/index.html, the landing page's hero mark, and the PNG app icons under
// public/icons (generated, 512-unit grid - multiply every number by 10.667).
export function TracklyLogo({ size = 56, className }: TracklyLogoProps) {
  const gid = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      <defs>
        {/* userSpaceOnUse so the knockout circle below picks up the same
            gradient stop the tile has at that point, and disappears into it. */}
        <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="48" y2="48">
          <stop offset="0" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="48" height="48" rx="13" fill={`url(#${gid})`} />
      <circle cx="24" cy="24" r="13.2" fill="none" stroke="#FFFFFF" strokeWidth="3" />
      {/* Cuts the ring where the line breaks through. Drawn before the line so
          only the ring is removed, not the line crossing the same spot. */}
      <circle cx="33.33" cy="14.67" r="5" fill={`url(#${gid})`} />
      <polyline
        points="17.5,27.8 21,23.8 24.5,26.3 33.33,14.67"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="33.33" cy="14.67" r="3.4" fill="#FFFFFF" />
    </svg>
  );
}
