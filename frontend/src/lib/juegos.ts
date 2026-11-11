import type { CriterioJuego } from "./api";

/** 520 → "520", 87.5 → "87.5" (máximo un decimal, igual que redondea el backend). */
export function fmtPts(n: number): string {
  return n.toLocaleString("es-MX", { maximumFractionDigits: 1 });
}

/**
 * Puntos que vale lo que puso el juez en un criterio — espejo de `juegos.puntos_hoja` en el
 * backend, solo para mostrar el subtotal en vivo mientras se captura (la cuenta de verdad la
 * hace el servidor). `null` = todavía sin calificar o fuera de rango.
 */
export function puntosCriterio(c: CriterioJuego, valor: number | boolean | null | undefined): number | null {
  if (c.tipo === "si_no") return valor === true ? c.puntos : valor === false ? 0 : null;
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < 0 || valor > c.escala_max) return null;
  return (valor / c.escala_max) * c.puntos;
}
