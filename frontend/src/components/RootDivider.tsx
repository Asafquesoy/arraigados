import { useId } from "react";

interface RootDividerProps {
  className?: string;
}

export function RootDivider({ className }: RootDividerProps) {
  const gradientId = useId();

  return (
    <svg
      className={`root-divider ${className ?? ""}`}
      viewBox="0 0 400 40"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M200 0v8M200 8c-30 4-45 8-60 20M200 8c30 4 45 8 60 20M200 8c-15 6-22 14-30 26M200 8c15 6 22 14 30 26M160 22c-12 3-18 8-24 14M240 22c12 3 18 8 24 14"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--amarillo)" />
          <stop offset="100%" stopColor="var(--naranja-raiz)" />
        </linearGradient>
      </defs>
    </svg>
  );
}
