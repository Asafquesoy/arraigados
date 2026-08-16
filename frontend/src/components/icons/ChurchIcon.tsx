import type { IconProps } from "./types";

export function ChurchIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2v3M10.5 3.5h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M12 6l7 5v10H5V11l7-5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 12v9M9 21v-5a3 3 0 0 1 6 0v5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
