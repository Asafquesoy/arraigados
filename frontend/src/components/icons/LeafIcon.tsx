import type { IconProps } from "./types";

export function LeafIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M5 19c-1-6 1-11 6-14 5-3 9-1 9-1s1 6-3 10c-3.6 3.6-8 4-12 5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M6 18c3-4 6-7 12-13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
