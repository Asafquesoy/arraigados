import type { IconProps } from "./types";

export function ChevronDownIcon({ size = 24, className, strokeWidth = 2.2 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5.5 9 12 15.5 18.5 9" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
