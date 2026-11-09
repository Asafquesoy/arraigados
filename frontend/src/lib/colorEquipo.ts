/** Texto oscuro o claro según el brillo del color del equipo, para que lo escrito
 *  encima se lea sobre cualquier color (el amarillo y el azul oscuro piden textos
 *  opuestos). Devuelve un valor CSS listo para `color`. */
export function textoSobre(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "var(--hueso)";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "var(--corteza)" : "var(--hueso)";
}

/** "Ana María Pérez" → "AM": las iniciales de las dos primeras palabras. */
export function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  const letras = palabras.slice(0, 2).map((p) => p[0]);
  return letras.join("").toUpperCase() || "?";
}
