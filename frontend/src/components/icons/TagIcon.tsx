import type { IconProps } from "./types";

export function TagIcon({ size = 24, className, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M11.5 4H5a1 1 0 0 0-1 1v6.5a1 1 0 0 0 .29.71l8.5 8.5a1 1 0 0 0 1.42 0l6.5-6.5a1 1 0 0 0 0-1.42l-8.5-8.5A1 1 0 0 0 11.5 4z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <circle cx="8.2" cy="7.7" r="1.2" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
  );
}
