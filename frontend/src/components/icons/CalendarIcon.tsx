import type { IconProps } from "./types";

export function CalendarIcon({ size = 24, className, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M4 9h16M8 3v3M16 3v3" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M8 13h1M12 13h1M16 13h1M8 17h1M12 17h1" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}
