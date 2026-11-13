import type { EmpateTorneo, FilaTablaTorneo, LugarFinal, PartidoTorneo, TerminoPartido } from "./api";
import { actualizado, textoPosiciones, type FilaPodio } from "./podio";

/** Etiqueta corta de cada opción (cabe en 2 renglones en un teléfono de 320px). */
export const ETIQUETA_TERMINO: Record<TerminoPartido, string> = {
  normal: "Normal",
  tope: "Por tope",
  siguiente_punto: "Siguiente punto",
  volado: "No se jugó",
};

/** Lo que significa cada opción, para quien captura en el campamento sin haber leído el reglamento. */
export const AYUDA_TERMINO: Record<TerminoPartido, string> = {
  normal: "Alguien llegó a 7 puntos.",
  tope: "Se acabaron los 4 minutos y ganó el que iba arriba.",
  siguiente_punto: "Iban empatados al acabarse el tiempo y el siguiente punto decidió (por ejemplo 7 – 6).",
  volado: "El partido no se jugó: se anota 7 – 0 para quien ganó el volado.",
};

/** Cómo se dice lo que terminó el partido, en minúsculas y dentro de una frase. */
export const TERMINO_CORTO: Record<TerminoPartido, string> = {
  normal: "",
  tope: "por tope de tiempo",
  siguiente_punto: "con el siguiente punto",
  volado: "no se jugó · ganó el volado",
};

/** «3.º», o «3.º y 4.º» / «5.º a 7.º» para un empate que ocupa varios lugares. */
export function textoLugares(primero: number, ultimo: number): string {
  if (primero === ultimo) return `${primero}.º`;
  return ultimo === primero + 1 ? `${primero}.º y ${ultimo}.º` : `${primero}.º a ${ultimo}.º`;
}

export function textoEmpate(e: EmpateTorneo): string {
  const donde = e.primero === e.ultimo ? "el lugar" : "los lugares";
  return `Empate exacto por ${donde} ${textoLugares(e.primero, e.ultimo)} de la tabla`;
}

/** El título de cada ronda tal como se dice en la cancha. */
export const TITULO_RONDA: Record<PartidoTorneo["ronda"], string> = {
  r1: "Ronda 1",
  r2: "Ronda 2",
  tercero: "Tercer lugar",
  final: "Gran final",
};

/** Los partidos de una ronda listos para pegar en WhatsApp: los jugados con marcador, los demás «A vs B». */
export function textoPartidos(titulo: string, partidos: PartidoTorneo[]): string {
  const lineas = [`🏐 Voleibol gigante — ${titulo}`, ""];
  partidos.forEach((p, i) => {
    const numero = partidos.length > 1 ? `${i + 1}. ` : "";
    if (p.saltado) {
      lineas.push(`${numero}${p.a.nombre} vs ${p.b.nombre} — saltado`);
    } else if (p.jugado && p.pa !== null && p.pb !== null) {
      const como = p.termino && TERMINO_CORTO[p.termino] ? ` (${TERMINO_CORTO[p.termino]})` : "";
      lineas.push(`${numero}${p.a.nombre} ${p.pa} – ${p.pb} ${p.b.nombre}${como}`);
    } else {
      const marca = p.estado === "en_cancha" ? " ← en cancha" : p.estado === "proximo" ? " ← sigue" : "";
      lineas.push(`${numero}${p.a.nombre} vs ${p.b.nombre}${marca}`);
    }
  });
  lineas.push("", actualizado());
  return lineas.join("\n");
}

/** La tabla de posiciones del torneo (victorias, puntos a favor – en contra y diferencia). */
export function textoTabla(titulo: string, filas: FilaTablaTorneo[]): string {
  const lineas = [`🏐 Voleibol gigante — ${titulo}`, ""];
  for (const f of filas) {
    const dif = f.dif > 0 ? `+${f.dif}` : f.dif < 0 ? `−${Math.abs(f.dif)}` : "0";
    const empate = f.empate ? " (empate)" : f.por_volado ? " (volado)" : "";
    lineas.push(`${f.lugar}.º ${f.equipo.nombre} — ${f.victorias} V · ${f.f}–${f.c} (${dif})${empate}`);
  }
  lineas.push("", actualizado());
  return lineas.join("\n");
}

/** Lugares finales con sus puntos, con el mismo formato de medallas que el resto de los podios. */
export function textoLugaresFinales(lugares: LugarFinal[], definitivo: boolean): string {
  const filas: FilaPodio[] = lugares.map((l) => ({ posicion: l.lugar, nombre: l.equipo.nombre, total: l.puntos }));
  return textoPosiciones(`Voleibol gigante${definitivo ? "" : " (provisional)"}`, filas);
}
