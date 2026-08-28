import type { IconProps } from "./types";

export function PencilIcon({ size = 24, className, strokeWidth = 2.2 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M15.5 4.5 19.5 8.5M4 20L4.7 16.5C4.79 16.05 5.01 15.63 5.34 15.3L14.87 5.77C15.5 5.14 16.5 5.14 17.13 5.77L18.23 6.87C18.86 7.5 18.86 8.5 18.23 9.13L8.7 18.66C8.37 18.99 7.95 19.21 7.5 19.3L4 20Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
