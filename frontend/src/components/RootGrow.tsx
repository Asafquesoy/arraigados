import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";

interface RootGrowProps {
  className?: string;
  delay?: number;
}

/**
 * Raíz decorativa que se "dibuja" con stroke-dashoffset al entrar en pantalla.
 * Usada en el hero y como refuerzo visual del progreso del formulario.
 */
export function RootGrow({ className, delay = 0 }: RootGrowProps) {
  const gradientId = useId();
  const reduce = useReducedMotion();

  const paths = [
    "M120 0 C110 40 95 55 60 70 C35 80 20 95 12 130",
    "M120 0 C130 42 148 58 182 72 C206 82 222 98 230 132",
    "M120 0 C118 55 122 80 122 140",
    "M120 40 C95 55 78 62 55 78",
    "M120 40 C146 55 162 62 186 80",
  ];

  return (
    <svg
      className={className}
      viewBox="0 0 240 150"
      fill="none"
      aria-hidden="true"
      style={{ width: "100%", height: "auto", overflow: "visible" }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--amarillo)" />
          <stop offset="100%" stopColor="var(--naranja-raiz)" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      {paths.map((d, i) => (
        <motion.path
          key={d}
          d={d}
          stroke={`url(#${gradientId})`}
          strokeWidth={i === 2 ? 2 : 1.3}
          strokeLinecap="round"
          initial={reduce ? { opacity: 1 } : { pathLength: 0, opacity: 0 }}
          whileInView={reduce ? { opacity: 1 } : { pathLength: 1, opacity: 1 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 1.1, delay: delay + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </svg>
  );
}
