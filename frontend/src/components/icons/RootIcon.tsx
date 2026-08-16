import type { IconProps } from "./types";

export function RootIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 2v9M12 11c-2 1-3 2-4 5M12 11c2 1 3 2 4 5M12 11c-1 2-1 4-0.5 7M12 11c1 2 1 4 0.5 7M8 16c-1.4.4-2 1.4-2.4 3M16 16c1.4.4 2 1.4 2.4 3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="4" r="2" fill="currentColor" />
    </svg>
  );
}
