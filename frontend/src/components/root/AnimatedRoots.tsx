import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { RootSegment } from "./generateRoots";

interface AnimatedRootsProps {
  segments: RootSegment[];
  viewBox: string;
  className?: string;
  delay?: number;
}

/**
 * Dibuja un sistema de raíz ya generado (ver `generateRoots.ts`): gradiente
 * amarillo→ámbar→naranja compartido y un `motion.path` por segmento que se
 * traza con `pathLength` al entrar en pantalla, gruesos primero y capilares
 * al final. Reutilizado por `RootGrow` (adorno del Hero/confirmación) y
 * `RootDivider` (separador horizontal de sección) — mismo mecanismo de
 * dibujo, cada uno le pasa su propio `segments`/`viewBox`.
 */
export function AnimatedRoots({ segments, viewBox, className, delay = 0 }: AnimatedRootsProps) {
  const gradientId = useId();
  const reduce = useReducedMotion();

  return (
    <svg
      className={className}
      viewBox={viewBox}
      fill="none"
      aria-hidden="true"
      style={{ width: "100%", height: "auto", overflow: "visible" }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--amarillo)" />
          <stop offset="55%" stopColor="var(--ambar)" />
          <stop offset="100%" stopColor="var(--naranja-raiz)" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      {segments.map((seg, i) => (
        <motion.path
          key={seg.d}
          d={seg.d}
          stroke={`url(#${gradientId})`}
          strokeWidth={seg.width}
          strokeOpacity={seg.opacity}
          strokeLinecap="round"
          initial={reduce ? { opacity: seg.opacity } : { pathLength: 0, opacity: 0 }}
          whileInView={reduce ? { opacity: seg.opacity } : { pathLength: 1, opacity: seg.opacity }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: seg.duration, delay: delay + i * 0.011, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </svg>
  );
}
