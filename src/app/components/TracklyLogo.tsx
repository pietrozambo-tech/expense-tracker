import { useId } from 'react';

interface TracklyLogoProps {
  size?: number;
  className?: string;
}

// Placeholder TracklyLab mark: a rounded gradient tile with an upward "tracking"
// spark. Designed to be easily swapped for a final logo later.
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
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="48" height="48" rx="13" fill={`url(#${gid})`} />
      <polyline
        points="11,31 20,22 27,27 37,14"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.97"
      />
      <circle cx="37" cy="14" r="3.6" fill="#FFFFFF" />
    </svg>
  );
}
