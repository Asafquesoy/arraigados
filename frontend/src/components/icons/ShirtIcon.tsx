import type { IconProps } from "./types";

export function ShirtIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M8 4 4 7l2 3 2-1v11h8V9l2 1 2-3-4-3c-1 1-2 1.5-4 1.5S9 5 8 4z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
