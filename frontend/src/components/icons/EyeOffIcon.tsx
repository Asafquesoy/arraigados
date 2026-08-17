import type { IconProps } from "./types";

export function EyeOffIcon({ size = 24, className, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M2.5 12c1.9-4 5.6-6.5 9.5-6.5s7.6 2.5 9.5 6.5c-1.9 4-5.6 6.5-9.5 6.5S4.4 16 2.5 12Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M3.5 20.5 20.5 3.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}
