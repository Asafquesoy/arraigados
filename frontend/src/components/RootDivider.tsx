import { useMemo } from "react";
import { boundsToViewBox, generateRoots } from "./root/generateRoots";
import { AnimatedRoots } from "./root/AnimatedRoots";

interface RootDividerProps {
  className?: string;
  /** Requerido a propósito: cada lugar donde se use debe pasar su propia
   * semilla para que no se repita el mismo patrón en los 4 usos del sitio. */
  seed: number;
}

/**
 * Separador de sección con el mismo lenguaje de raíz que `RootGrow`
 * (ver `root/generateRoots.ts`) — un sistema de raíz generado y ramificado,
 * horizontal y compacto. El `viewBox` se calcula a partir del bounding box
 * real de lo generado (`boundsToViewBox`) en vez de uno fijo adivinado: como
 * la forma cambia con la semilla, un tamaño fijo podía quedarse corto y
 * dejar ramas pintándose fuera del espacio reservado por el layout: ahora
 * el rectángulo siempre encierra exactamente el dibujo, sin desbordarse.
 */
export function RootDivider({ className, seed }: RootDividerProps) {
  const { segments, bounds } = useMemo(
    () =>
      generateRoots({
        seed,
        originX: 200,
        originY: 0,
        // Abanico asimétrico como el Hero (nada de ±90° puro — eso aplanaba
        // las curvas hasta que dejaban de leerse como raíces), pero sin
        // ángulos cercanos a la vertical: el ancho lo fuerza el CSS
        // (`width: 100%`), así que lo único que controla qué tan "alto" se
        // ve el separador es cuánto cuelgan las ramas hacia abajo — un
        // divisor necesita quedar ancho y bajo, no un cono vertical.
        primaryAngles: [-82, -68, -54, -40, 40, 54, 68, 82],
        primaryLength: [16, 26],
        maxDepth: 2,
        // Compresión suave (no agresiva como el 0.22 que se probó antes,
        // que aplastaba el bamboleo de las curvas hasta verse como picos
        // rectos) — solo para recortar el poco que las ramas más internas
        // siguen colgando hacia abajo.
        squashY: 0.62,
        // El grosor del trazo está calibrado para las raíces largas del
        // Hero (68-94 unidades) — a esta escala mucho más chica se vería
        // gruesa sin escalarlo también.
        widthScale: 0.3,
      }),
    [seed]
  );

  const viewBox = useMemo(() => boundsToViewBox(bounds), [bounds]);

  return <AnimatedRoots segments={segments} viewBox={viewBox} className={`root-divider ${className ?? ""}`} />;
}
