/** Texto oscuro o claro según el brillo del color del equipo, para que lo escrito
 *  encima se lea sobre cualquier color (el amarillo y el azul oscuro piden textos
 *  opuestos). Devuelve un valor CSS listo para `color`. */
export function textoSobre(hex: string): string {
  const claro = esClaro(hex);
  if (claro === null) return "var(--hueso)";
  return claro ? "var(--corteza)" : "var(--hueso)";
}

/** ¿El color es lo bastante claro para llevar texto oscuro? `null` si no es un hex de 6 dígitos. */
export function esClaro(hex: string): boolean | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

/** "Ana María Pérez" → "AM": las iniciales de las dos primeras palabras. */
export function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  const letras = palabras.slice(0, 2).map((p) => p[0]);
  return letras.join("").toUpperCase() || "?";
}
