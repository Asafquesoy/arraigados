import type { IconProps } from "./types";

export function EquiposIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="8.5" cy="7.5" r="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16.5" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 20c1-3.6 3.2-5.4 5.5-5.4S13 16.4 14 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14.2 15.2c2 .1 3.6 1.7 4.4 4.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
