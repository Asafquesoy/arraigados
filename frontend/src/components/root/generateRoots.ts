export interface RootSegment {
  d: string;
  width: number;
  opacity: number;
  duration: number;
  depth: number;
}

export interface RootBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface RootGenResult {
  segments: RootSegment[];
  /** Rectángulo mínimo que contiene todos los trazos generados (incluyendo
   * los puntos de control de las curvas, no solo los extremos) — para armar
   * un `viewBox` que siempre encierre el dibujo real, sin adivinar. */
  bounds: RootBounds;
}

export interface RootGenOptions {
  /** Semilla del PRNG — mismo layout de raíz en cada carga ("diseñado", no aleatorio). */
  seed: number;
  originX: number;
  originY: number;
  /** Ángulo base de cada raíz primaria (0 = recto hacia abajo, ±90 = horizontal). */
  primaryAngles: number[];
  /** Longitud mínima/máxima de las raíces primarias. */
  primaryLength: [number, number];
  /** Generaciones de ramificación después de las primarias (0 = solo primarias). */
  maxDepth: number;
  /** Factor de compresión vertical (1 = sin comprimir). Los ángulos de las
   * primarias y el bamboleo de las curvas ya sesgan el crecimiento hacia los
   * lados, pero con ciertas semillas una rama puede terminar más vertical de
   * lo esperado — este factor la mantiene corta en Y sin importar la
   * semilla, para que un separador horizontal compacto (`RootDivider`)
   * nunca crezca más alto que su espacio por mala suerte del PRNG. */
  squashY?: number;
  /** Multiplicador del grosor de trazo (1 = sin cambio). El grosor base está
   * calibrado para las longitudes del Hero (raíces largas); un sistema de
   * raíz más corto (como `RootDivider`) necesita trazos proporcionalmente
   * más delgados o se ven "gruesos" para su tamaño — se aplica una sola vez
   * al grosor de las primarias y se propaga solo por herencia a
   * hijos/raicillas (que ya son un porcentaje del grosor del padre). */
  widthScale?: number;
}

// PRNG determinista (mulberry32).
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
 * rectas o curvas perfectamente uniformes. Devuelve también el rectángulo
 * mínimo que contiene los 4 puntos de la curva (inicio, 2 de control, fin),
 * para poder acumular el bounding box real de todo el árbol.
 */
function segment(x0: number, y0: number, angleDeg: number, length: number, rand: () => number, squashY: number) {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(rad) * length;
  const dy = Math.cos(rad) * length * squashY;
  const x1 = x0 + dx;
  const y1 = y0 + dy;
  const perpX = Math.cos(rad);
  const perpY = -Math.sin(rad) * squashY;
  const bend1 = (rand() - 0.5) * length * 0.4;
  const bend2 = (rand() - 0.5) * length * 0.4;
  const c1x = x0 + dx * 0.33 + perpX * bend1;
  const c1y = y0 + dy * 0.33 + perpY * bend1;
  const c2x = x0 + dx * 0.66 + perpX * bend2;
  const c2y = y0 + dy * 0.66 + perpY * bend2;
  const d = `M${x0.toFixed(1)} ${y0.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  const bounds: RootBounds = {
    minX: Math.min(x0, c1x, c2x, x1),
    maxX: Math.max(x0, c1x, c2x, x1),
    minY: Math.min(y0, c1y, c2y, y1),
    maxY: Math.max(y0, c1y, c2y, y1),
  };
  return { d, x1, y1, bounds };
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
 * Genera un sistema de raíz por generaciones — fibroso y asimétrico, como la
 * raíz real del logo, en vez de un puñado de líneas simétricas. Recursivo:
 * cada raíz se bifurca por generación con ángulo y longitud aleatorios (pero
 * deterministas dada la semilla), grosor decreciente. Profundidad 0 = raíces
 * primarias; hasta `maxDepth` = raicillas finas de remate.
 *
 * Parametrizable para reusarse tanto en el adorno vertical del Hero
 * (`RootGrow`) como en el separador horizontal de sección (`RootDivider`) —
 * mismo lenguaje visual, distinta forma/tamaño/semilla. Devuelve también el
 * bounding box real de lo generado, para que quien lo use pueda armar un
 * `viewBox` que encierre el dibujo exacto en vez de uno adivinado a mano
 * (relevante porque el resultado varía con la semilla).
 */
export function generateRoots(options: RootGenOptions): RootGenResult {
  const { seed, originX, originY, primaryAngles, primaryLength, maxDepth, squashY = 1, widthScale = 1 } = options;
  const rand = mulberry32(seed);
  const out: RootSegment[] = [];
  const bounds: RootBounds = { minX: originX, maxX: originX, minY: originY, maxY: originY };

  function extend(b: RootBounds) {
    bounds.minX = Math.min(bounds.minX, b.minX);
    bounds.maxX = Math.max(bounds.maxX, b.maxX);
    bounds.minY = Math.min(bounds.minY, b.minY);
    bounds.maxY = Math.max(bounds.maxY, b.maxY);
  }

  function branch(x: number, y: number, angle: number, length: number, width: number, depth: number) {
    const seg = segment(x, y, angle, length, rand, squashY);
    extend(seg.bounds);
    const style = DEPTH_STYLE[Math.min(depth, DEPTH_STYLE.length - 1)];
    out.push({ d: seg.d, width, opacity: style.opacity, duration: style.duration, depth });

    // Raicillas finas que brotan a la mitad del trazo (no solo en la punta)
    // — es lo que da la textura "fibrosa"/tupida en vez de solo ramas que se
    // bifurcan limpiamente en sus extremos.
    if (depth <= 1 && rand() < 0.45) {
      const t = 0.4 + rand() * 0.35;
      const midX = x + (seg.x1 - x) * t;
      const midY = y + (seg.y1 - y) * t;
      const sprigAngle = angle + (rand() < 0.5 ? -1 : 1) * (50 + rand() * 40);
      const sprigLength = length * (0.22 + rand() * 0.16);
      const sprigWidth = Math.max(width * 0.42, 0.3 * widthScale);
      const sprigSeg = segment(midX, midY, sprigAngle, sprigLength, rand, squashY);
      extend(sprigSeg.bounds);
      out.push({ d: sprigSeg.d, width: sprigWidth, opacity: 0.55, duration: 0.28, depth: maxDepth });
    }

    if (depth >= maxDepth) return;
    const childCount = childCountFor(depth, rand);
    for (let i = 0; i < childCount; i++) {
      const spread = 22 + depth * 6;
      const fan = childCount > 1 ? (i - (childCount - 1) / 2) * (18 + depth * 4) : 0;
      const childAngle = angle + fan + (rand() - 0.5) * spread;
      const childLength = length * (0.5 + rand() * 0.2);
      const childWidth = Math.max(width * 0.6, 0.32 * widthScale);
      branch(seg.x1, seg.y1, childAngle, childLength, childWidth, depth + 1);
    }
  }

  const [minLen, maxLen] = primaryLength;
  for (const base of primaryAngles) {
    const angle = base + (rand() - 0.5) * 9;
    const length = minLen + rand() * (maxLen - minLen);
    const width = ((Math.abs(base) <= 10 ? 1.9 : 1.55) + rand() * 0.2) * widthScale;
    branch(originX, originY, angle, length, width, 0);
  }

  // Orden de dibujo por generación (gruesas primero, capilares al final),
  // no por orden de inserción de la recursión.
  out.sort((a, b) => a.depth - b.depth);

  return { segments: out, bounds };
}

/** Convierte un bounding box en un string de `viewBox`, con un margen para
 * no recortar el grosor del trazo justo en los bordes. */
export function boundsToViewBox(bounds: RootBounds, pad = 3): string {
  const width = bounds.maxX - bounds.minX + pad * 2;
  const height = bounds.maxY - bounds.minY + pad * 2;
  return `${(bounds.minX - pad).toFixed(1)} ${(bounds.minY - pad).toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)}`;
}
