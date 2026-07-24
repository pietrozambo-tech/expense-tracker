import type { CSSProperties } from 'react';

interface SavingsJarProps {
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}

// A culturally-neutral savings icon: a coin dropping into a coin jar, with
// coins stacked inside. Matches lucide's line-icon style (24×24, stroke =
// currentColor) so it drops in wherever a lucide icon was used.
export function SavingsJar({ className, style, strokeWidth = 2 }: SavingsJarProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* coin dropping into the jar */}
      <circle cx="12" cy="3.3" r="1.9" />
      {/* jar rim / mouth */}
      <path d="M6.3 7.4h11.4" />
      {/* jar body */}
      <path d="M7.1 7.4v8.7a4.3 4.3 0 0 0 4.3 4.3h1.2a4.3 4.3 0 0 0 4.3-4.3V7.4" />
      {/* coins stacked inside */}
      <path d="M9.6 12.6h4.8" />
      <path d="M9.6 15.8h4.8" />
    </svg>
  );
}
