import type { IconProps } from "./types";

export function DropIcon({ size = 24, className, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 3c3.2 4 6 7.6 6 11a6 6 0 1 1-12 0c0-3.4 2.8-7 6-11z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <path d="M9.5 15.5a2.7 2.7 0 0 0 2.7 2.7" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}
