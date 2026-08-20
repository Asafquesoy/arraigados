import type { IconProps } from "./types";

/** Marca a alguien movido a mano a su equipo — ver EquipoCard.tsx. */
export function PinIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 2c-3.3 0-6 2.6-6 6 0 4.5 6 12 6 12s6-7.5 6-12c0-3.4-2.7-6-6-6z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="8" r="2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
