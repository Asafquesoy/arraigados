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
/**
 * Variants del path: cada segmento necesita su propia duración/retraso (más
 * grueso primero, capilares al final — ver `duration`/`i * 0.011` más abajo),
 * así que en vez de una transición fija en el variant se calcula desde
 * `custom` (el propio motion pasa el valor de `custom` de cada hijo a la
 * función). El `whileInView` vive solo en el `<svg>` padre: los hijos heredan
 * el cambio "hidden" → "visible" por propagación de variants sin necesitar
 * un IntersectionObserver cada uno — con sistemas de cientos de segmentos
 * (el Hero solo ya son 166) eso es la diferencia entre 1 observer y cientos.
 */
const pathVariants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: ({ opacity, duration, pathDelay }: { opacity: number; duration: number; pathDelay: number }) => ({
    pathLength: 1,
    opacity,
    transition: { duration, delay: pathDelay, ease: [0.16, 1, 0.3, 1] },
  }),
};

export function AnimatedRoots({ segments, viewBox, className, delay = 0 }: AnimatedRootsProps) {
  const gradientId = useId();
  const reduce = useReducedMotion();

  return (
    <motion.svg
      className={className}
      viewBox={viewBox}
      fill="none"
      aria-hidden="true"
      style={{ width: "100%", height: "auto", overflow: "visible" }}
      initial={reduce ? undefined : "hidden"}
      whileInView={reduce ? undefined : "visible"}
      viewport={{ once: true, margin: "-10%" }}
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
          initial={reduce ? { opacity: seg.opacity } : undefined}
          variants={reduce ? undefined : pathVariants}
          custom={reduce ? undefined : { opacity: seg.opacity, duration: seg.duration, pathDelay: delay + i * 0.011 }}
        />
      ))}
    </motion.svg>
  );
}
