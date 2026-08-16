import { useId, useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";

interface RootGrowProps {
  className?: string;
  delay?: number;
}

interface RootSegment {
  d: string;
  width: number;
  opacity: number;
  duration: number;
  depth: number;
}

// PRNG determinista (mulberry32): mismo layout de raíz en cada carga —
// "diseñado", no aleatorio en cada render — pero fácil de re-sembrar para
// probar variantes.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Un segmento curvo desde (x0,y0) en dirección `angleDeg` (0 = recto hacia
 * abajo, positivo = hacia la derecha) con un ligero "bamboleo" perpendicular
 * en los puntos de control — evita que las raíces se vean como líneas
 * rectas o curvas perfectamente uniformes.
 */
function segment(x0: number, y0: number, angleDeg: number, length: number, rand: () => number) {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(rad) * length;
  const dy = Math.cos(rad) * length;
  const x1 = x0 + dx;
  const y1 = y0 + dy;
  const perpX = Math.cos(rad);
  const perpY = -Math.sin(rad);
  const bend1 = (rand() - 0.5) * length * 0.4;
  const bend2 = (rand() - 0.5) * length * 0.4;
  const c1x = x0 + dx * 0.33 + perpX * bend1;
  const c1y = y0 + dy * 0.33 + perpY * bend1;
  const c2x = x0 + dx * 0.66 + perpX * bend2;
  const c2y = y0 + dy * 0.66 + perpY * bend2;
  const d = `M${x0.toFixed(1)} ${y0.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  return { d, x1, y1 };
}

const DEPTH_STYLE = [
  { opacity: 1, duration: 0.7 },
  { opacity: 0.92, duration: 0.55 },
  { opacity: 0.78, duration: 0.42 },
  { opacity: 0.6, duration: 0.32 },
];

/** Cuántos hijos genera una raíz de esta profundidad — decrece con cada
 * generación para que el árbol se ramifique mucho sin explotar sin control. */
function childCountFor(depth: number, rand: () => number): number {
  if (depth === 0) return rand() < 0.4 ? 3 : 2;
  if (depth === 1) return rand() < 0.4 ? 2 : 1;
  if (depth === 2) return rand() < 0.35 ? 2 : 1;
  return 0;
}

/**
 * Genera un sistema de raíz por generaciones — como la raíz real del logo
 * (denso, fibroso, asimétrico) en vez de un puñado de líneas simétricas.
 * Recursivo: cada raíz se bifurca por generación con ángulo y longitud
 * aleatorios (pero deterministas), grosor decreciente. Profundidad 0 =
 * raíces primarias que salen del tronco, hasta 3 = raicillas finas de
 * remate — cuatro generaciones en vez de tres para que se vea tupido.
 */
function buildRoots(seed: number): RootSegment[] {
  const rand = mulberry32(seed);
  const out: RootSegment[] = [];
  const MAX_DEPTH = 3;

  function branch(x: number, y: number, angle: number, length: number, width: number, depth: number) {
    const seg = segment(x, y, angle, length, rand);
    const style = DEPTH_STYLE[depth];
    out.push({ d: seg.d, width, opacity: style.opacity, duration: style.duration, depth });

    // Raicillas finas que brotan a la mitad del trazo (no solo en la punta)
    // — es lo que da la textura "fibrosa"/tupida del logo en vez de solo
    // ramas que se bifurcan limpiamente en sus extremos.
    if (depth <= 1 && rand() < 0.45) {
      const t = 0.4 + rand() * 0.35;
      const midX = x + (seg.x1 - x) * t;
      const midY = y + (seg.y1 - y) * t;
      const sprigAngle = angle + (rand() < 0.5 ? -1 : 1) * (50 + rand() * 40);
      const sprigLength = length * (0.22 + rand() * 0.16);
      const sprigWidth = Math.max(width * 0.42, 0.3);
      const sprigSeg = segment(midX, midY, sprigAngle, sprigLength, rand);
      out.push({ d: sprigSeg.d, width: sprigWidth, opacity: 0.55, duration: 0.28, depth: MAX_DEPTH });
    }

    if (depth >= MAX_DEPTH) return;
    const childCount = childCountFor(depth, rand);
    for (let i = 0; i < childCount; i++) {
      const spread = 22 + depth * 6;
      const fan = childCount > 1 ? (i - (childCount - 1) / 2) * (18 + depth * 4) : 0;
      const childAngle = angle + fan + (rand() - 0.5) * spread;
      const childLength = length * (0.5 + rand() * 0.2);
      const childWidth = Math.max(width * 0.6, 0.32);
      branch(seg.x1, seg.y1, childAngle, childLength, childWidth, depth + 1);
    }
  }

  // Raíces primarias: un abanico asimétrico desde el tronco, incluyendo una
  // central que continúa el tronco casi recto (como la raíz gruesa central
  // del logo) y varias laterales a distintos ángulos y longitudes.
  const primaryAngles = [-80, -66, -52, -38, -24, -10, 4, 18, 32, 46, 60, 74];
  for (const base of primaryAngles) {
    const angle = base + (rand() - 0.5) * 9;
    const length = 68 + rand() * 26;
    const width = (Math.abs(base) <= 10 ? 1.9 : 1.55) + rand() * 0.2;
    branch(120, 0, angle, length, width, 0);
  }

  return out;
}

const ROOTS = buildRoots(7);

export function RootGrow({ className, delay = 0 }: RootGrowProps) {
  const gradientId = useId();
  const reduce = useReducedMotion();

  // Orden de dibujo por generación (gruesas primero, capilares al final),
  // no por orden de inserción de la recursión.
  const ordered = useMemo(() => [...ROOTS].sort((a, b) => a.depth - b.depth), []);

  return (
    <svg
      className={className}
      viewBox="0 0 240 170"
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
      {ordered.map((seg, i) => (
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
