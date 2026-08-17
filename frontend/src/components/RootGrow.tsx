import { useMemo } from "react";
import { generateRoots } from "./root/generateRoots";
import { AnimatedRoots } from "./root/AnimatedRoots";

interface RootGrowProps {
  className?: string;
  delay?: number;
  /** Semilla del generador — mismo valor por defecto que siempre usó este
   * componente, así que el Hero se ve idéntico sin pasar nada. Pásale otra
   * semilla (p. ej. en Confirmacion.tsx) para una raíz con otro patrón. */
  seed?: number;
}

/**
 * Raíz decorativa que se "dibuja" al entrar en pantalla. Usada en el hero y
 * en la pantalla de confirmación. El sistema de raíz en sí se genera en
 * `root/generateRoots.ts` (denso, fibroso, asimétrico); este componente solo
 * fija los parámetros de forma para la variante "colgante" del Hero — el
 * separador horizontal `RootDivider` usa el mismo generador con otra forma.
 */
export function RootGrow({ className, delay = 0, seed = 7 }: RootGrowProps) {
  const { segments } = useMemo(
    () =>
      generateRoots({
        seed,
        originX: 120,
        originY: 0,
        // Abanico asimétrico de raíces primarias colgando hacia abajo,
        // incluyendo una central que continúa casi recto (como la raíz
        // gruesa central del logo) y varias laterales a distintos ángulos.
        primaryAngles: [-80, -66, -52, -38, -24, -10, 4, 18, 32, 46, 60, 74],
        primaryLength: [68, 94],
        maxDepth: 3,
      }),
    [seed]
  );

  return <AnimatedRoots segments={segments} viewBox="0 0 240 170" className={className} delay={delay} />;
}
