import type { IconProps } from "./types";

export function WhatsAppIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 3.5a8.4 8.4 0 0 0-7.2 12.7L3.5 20.5l4.4-1.3A8.4 8.4 0 1 0 12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M8.7 8.3c.2-.4.4-.5.7-.5h.5c.2 0 .4 0 .6.5.2.5.6 1.5.7 1.6.1.1.1.3 0 .5-.1.2-.2.3-.4.5-.2.2-.4.4-.2.7.2.4 1 1.5 2.1 2.1.3.2.5.1.7-.1.2-.2.7-.8.9-1 .2-.2.4-.2.6-.1.2.1 1.4.7 1.7.8.2.1.4.2.4.4 0 .2 0 1-.4 1.4-.4.4-1.3.8-2.2.6-.9-.2-2.5-.9-3.8-2.3-1.3-1.4-1.9-2.8-2-3.1-.1-.3-.8-1.3-.8-2.3 0-1 .5-1.5.7-1.7Z"
        fill="currentColor"
      />
    </svg>
  );
}
