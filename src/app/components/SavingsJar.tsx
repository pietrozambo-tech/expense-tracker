import type { CSSProperties } from 'react';

interface SavingsJarProps {
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}

// A culturally-neutral savings icon: a money jar with a coin.
// Matches lucide's line-icon style (24×24, stroke = currentColor) so it can be
// dropped in wherever a lucide icon was used, inheriting size + colour.
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
      {/* lid */}
      <rect x="6.5" y="3" width="11" height="3" rx="1.2" />
      {/* coin slot on the lid */}
      <path d="M10 4.5h4" />
      {/* jar body */}
      <path d="M7.5 6h9v11a4 4 0 0 1-4 4h-1a4 4 0 0 1-4-4V6Z" />
      {/* coin inside */}
      <circle cx="12" cy="14" r="2.1" />
    </svg>
  );
}
