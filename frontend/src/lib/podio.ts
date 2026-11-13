import type { JuegoInfo, Posiciones } from "./api";
import { fmtPts } from "./juegos";

/** Una fila para copiar: lugar (null = sin lugar todavía), nombre del equipo y sus puntos. */
export interface FilaPodio {
  posicion: number | null;
  nombre: string;
  total: number;
}

const MEDALLAS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

const FECHA = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

function actualizado(): string {
  return `Actualizado: ${FECHA.format(new Date()).replace(",", "")}`;
}

/**
 * Texto de un podio listo para pegar en WhatsApp: todos los equipos en orden, medalla a los lugares
 * 1.º–3.º (los empates comparten lugar y medalla) y sus puntos. Los equipos sin lugar todavía no
 * entran a la lista: se nombran aparte para que no parezca que quedaron en último.
 */
export function textoPosiciones(titulo: string, filas: FilaPodio[], conFecha = true): string {
  const conLugar = filas
    .filter((f) => f.posicion !== null)
    .sort((a, b) => (a.posicion as number) - (b.posicion as number) || a.nombre.localeCompare(b.nombre, "es"));
  const sinLugar = filas.filter((f) => f.posicion === null).map((f) => f.nombre);

  const lineas = [`🏆 ${titulo} — Posiciones`, ""];
  for (const f of conLugar) {
    const lugar = f.posicion as number;
    lineas.push(`${MEDALLAS[lugar] ?? ""}${MEDALLAS[lugar] ? " " : ""}${lugar}.º ${f.nombre} — ${fmtPts(f.total)} pts`);
  }
  if (conLugar.length === 0) lineas.push("Todavía no hay puntos capturados.");
  if (sinLugar.length > 0) lineas.push("", `Sin puntos todavía: ${sinLugar.join(", ")}`);
  if (conFecha) lineas.push("", actualizado());
  return lineas.join("\n");
}

/** Podio del total de todos los juegos (más los puntos extra generales). */
export function filasGenerales(datos: Posiciones): FilaPodio[] {
  return datos.equipos.map((e) => ({ posicion: e.posicion, nombre: e.nombre, total: e.total }));
}

/** ¿Algún equipo ya tiene lugar en este juego? (si no, no hay podio que copiar) */
export function juegoTienePodio(datos: Posiciones, juego: JuegoInfo): boolean {
  return datos.equipos.some((e) => e.posicion_por_juego[juego.clave] != null);
}

/** Podio de un solo juego, sacado de la tabla general (`posicion_por_juego` + `por_juego`). */
export function filasDeJuego(datos: Posiciones, juego: JuegoInfo): FilaPodio[] {
  return datos.equipos.map((e) => ({
    posicion: e.posicion_por_juego[juego.clave] ?? null,
    nombre: e.nombre,
    total: e.por_juego[juego.clave] ?? 0,
  }));
}

/** El general y el de cada juego con datos, en un solo mensaje (con una sola línea de "Actualizado"). */
export function textoTodo(datos: Posiciones): string {
  const bloques = [textoPosiciones("Total general", filasGenerales(datos), false)];
  for (const j of datos.juegos) {
    if (juegoTienePodio(datos, j)) bloques.push(textoPosiciones(j.nombre, filasDeJuego(datos, j), false));
  }
  bloques.push(actualizado());
  return bloques.join("\n\n");
}
