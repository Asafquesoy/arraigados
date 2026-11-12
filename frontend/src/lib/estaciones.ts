import type { EstacionInfo, ValoresFila } from "./api";

/**
 * Captura de las hojas de los encargados (Rally sucio, Búsqueda del tesoro): un renglón por equipo y
 * estación. Aquí viven el borrador de un renglón (lo que se ve en pantalla, con campos vacíos), su
 * conversión a lo que se manda al servidor y el espejo de las cuentas del backend
 * (`backend/app/juegos.py`) solo para mostrar los puntos en vivo — la cuenta de verdad la hace el servidor.
 */

export type Tri = boolean | null;

export interface Borrador {
  // Rally
  prueba: Tri;
  noTermino: boolean;
  nivel: number | null; // 1 = ¼, 2 = ½, 3 = ¾ (null = no circularon nada)
  logrado: string;
  total: string;
  son: string;
  logro: string;
  lados: number | null;
  // Tiempo (rally si terminó, búsqueda, capilla opcional)
  min: string;
  seg: string;
  // Búsqueda
  unidad: Tri;
  pregunta: "F" | "D" | null;
  preguntaOk: Tri;
  palabra: Tri;
  fruto: [Tri, Tri, Tri];
}

export const RECITACION_PUNTOS: Record<string, number> = { sin_errores: 40, errores: 20, leyendo: 0 };
export const LUGAR_PUNTOS: Record<number, number> = { 1: 60, 2: 40, 3: 30 };

export function borradorVacio(est: EstacionInfo): Borrador {
  return {
    prueba: null,
    noTermino: false,
    nivel: null,
    logrado: "",
    total: est.total_sugerido != null ? String(est.total_sugerido) : "",
    son: "",
    logro: "",
    lados: null,
    min: "",
    seg: "",
    unidad: null,
    pregunta: null,
    preguntaOk: null,
    palabra: null,
    fruto: [null, null, null],
  };
}

const txt = (v: unknown): string => (typeof v === "number" ? String(v) : "");

/** Borrador a partir de lo ya guardado (para corregir una estación); sin nada guardado, uno vacío. */
export function borradorDesde(est: EstacionInfo, v?: ValoresFila | null): Borrador {
  const b = borradorVacio(est);
  if (!v) return b;
  const t = typeof v.tiempo === "number" ? v.tiempo : null;
  if (t !== null) {
    b.min = String(Math.floor(t / 60));
    b.seg = String(t % 60).padStart(2, "0");
  }
  if (est.tipo === "rally") {
    b.prueba = typeof v.prueba === "boolean" ? v.prueba : null;
    b.noTermino = v.termino === false;
    b.nivel = typeof v.nivel === "number" && v.nivel > 0 ? v.nivel : null;
    if (typeof v.logrado === "number") b.logrado = txt(v.logrado);
    if (typeof v.total === "number") b.total = txt(v.total);
    b.son = txt(v.son);
    b.logro = txt(v.logro);
    b.lados = typeof v.lados === "number" ? v.lados : null;
  } else if (est.tipo === "busqueda") {
    b.unidad = typeof v.unidad === "boolean" ? v.unidad : null;
    b.pregunta = v.pregunta === "F" || v.pregunta === "D" ? v.pregunta : null;
    b.preguntaOk = typeof v.pregunta_ok === "boolean" ? v.pregunta_ok : null;
    b.palabra = typeof v.palabra === "boolean" ? v.palabra : null;
    if (Array.isArray(v.fruto)) {
      const f = v.fruto;
      b.fruto = [0, 1, 2].map((i) => (typeof f[i] === "boolean" ? f[i] : null)) as [Tri, Tri, Tri];
    }
  }
  return b;
}

/** Un renglón sin tocar no se guarda (ese equipo no pasó por la estación). El «de __» sugerido no cuenta. */
export function esVacio(est: EstacionInfo, b: Borrador): boolean {
  const v = borradorVacio(est);
  return (
    b.prueba === v.prueba &&
    b.noTermino === v.noTermino &&
    b.nivel === v.nivel &&
    b.logrado === v.logrado &&
    (b.total === v.total || b.total === "") &&
    b.son === v.son &&
    b.logro === v.logro &&
    b.lados === v.lados &&
    b.min === v.min &&
    b.seg === v.seg &&
    b.unidad === v.unidad &&
    b.pregunta === v.pregunta &&
    b.preguntaOk === v.preguntaOk &&
    b.palabra === v.palabra &&
    b.fruto.every((x) => x === null)
  );
}

/** 135 → «2:15». */
export function fmtTiempo(seg: number): string {
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;
}

/** Minutos + segundos de los dos campos → segundos. `null` = sin escribir; `error` = algo no cuadra. */
export function leerTiempo(min: string, seg: string): { seg: number | null; error?: string } {
  if (min.trim() === "" && seg.trim() === "") return { seg: null };
  const m = min.trim() === "" ? 0 : Number(min);
  const s = seg.trim() === "" ? 0 : Number(seg);
  if (!Number.isInteger(m) || !Number.isInteger(s) || m < 0 || s < 0) return { seg: null, error: "El tiempo son minutos y segundos enteros." };
  if (s > 59) return { seg: null, error: "Los segundos van de 0 a 59." };
  if (m * 60 + s === 0) return { seg: null, error: "El tiempo no puede ser 0:00." };
  return { seg: m * 60 + s };
}

function entero(texto: string, min: number, max: number): number | null {
  if (texto.trim() === "") return null;
  const n = Number(texto);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export type ResultadoValores = { valores: ValoresFila } | { error: string };

/** Lo que marcó el encargado → lo que espera el servidor, con el mismo criterio de «completo» que él. */
export function valoresDesde(est: EstacionInfo, b: Borrador): ResultadoValores {
  if (est.tipo === "rally") return valoresRally(est, b);
  if (est.tipo === "busqueda") return valoresBusqueda(b);
  return { error: "Esta estación se captura distinto." };
}

function valoresRally(est: EstacionInfo, b: Borrador): ResultadoValores {
  if (b.prueba === null) return { error: "Marca la Prueba de raíz (✔ o ✖)." };
  if (!b.noTermino) {
    const t = leerTiempo(b.min, b.seg);
    if (t.error) return { error: t.error };
    if (t.seg === null) return { error: "Escribe en cuánto tiempo terminó o marca «No terminó»." };
    if (t.seg > est.limite_seg) {
      return { error: `El tiempo (${fmtTiempo(t.seg)}) pasa del límite de ${fmtTiempo(est.limite_seg)}: marca «No terminó».` };
    }
    return { valores: { prueba: b.prueba, termino: true, tiempo: t.seg } };
  }
  const base = { prueba: b.prueba, termino: false };
  switch (est.avance) {
    case "nivel":
      return { valores: { ...base, nivel: b.nivel ?? 0 } };
    case "conteo": {
      const total = entero(b.total, 1, 200);
      const logrado = entero(b.logrado, 0, 200);
      if (total === null || logrado === null) return { error: `Anota «${est.etiqueta_avance}» y de cuántos eran.` };
      if (logrado > total) return { error: `«${est.etiqueta_avance}» no puede ser más que el total.` };
      return { valores: { ...base, logrado, total } };
    }
    case "son_logro": {
      const son = entero(b.son, 1, 100);
      const logro = entero(b.logro, 0, 100);
      if (son === null || logro === null) return { error: `Anota cuántos eran y cuántos ${est.etiqueta_avance}.` };
      if (logro > son) return { error: `No pueden haber ${est.etiqueta_avance} más de los que eran.` };
      return { valores: { ...base, son, logro } };
    }
    default:
      if (b.lados === null) return { error: "Marca cuántos lados quedaron bien formados (0 a 4)." };
      return { valores: { ...base, lados: b.lados } };
  }
}

function valoresBusqueda(b: Borrador): ResultadoValores {
  if (b.unidad === null) return { error: "Marca Unidad (✔ o ✖)." };
  if (b.pregunta === null) return { error: "Marca si la pregunta fue Fácil (F) o Difícil (D)." };
  if (b.preguntaOk === null) return { error: "Marca si respondieron bien la pregunta (✔ o ✖)." };
  if (b.palabra === null) return { error: "Marca Palabra (✔ o ✖)." };
  if (b.fruto.some((x) => x === null)) return { error: "Marca ✔ o ✖ en las 3 situaciones de «¿Fruto o carne?»." };
  const t = leerTiempo(b.min, b.seg);
  if (t.error) return { error: t.error };
  if (t.seg === null) return { error: "Escribe el tiempo del cronómetro." };
  return {
    valores: {
      unidad: b.unidad,
      pregunta: b.pregunta,
      pregunta_ok: b.preguntaOk,
      palabra: b.palabra,
      fruto: b.fruto as boolean[],
      tiempo: t.seg,
    },
  };
}

// ---- Espejo de las cuentas (backend/app/juegos.py) ----

/** Al entero más cercano, la mitad hacia arriba, con enteros (num/den) para no depender de decimales. */
function redondear(num: number, den: number): number {
  return Math.floor((2 * num + den) / (2 * den));
}

/** Avance 0–1 de un juego del rally que no terminaron, como fracción `[num, den]`. */
function avanceFraccion(est: EstacionInfo, v: ValoresFila): [number, number] {
  const frac = (n: unknown, d: unknown): [number, number] =>
    typeof n === "number" && typeof d === "number" && d > 0 && n >= 0 ? [Math.min(n, d), d] : [0, 1];
  switch (est.avance) {
    case "nivel":
      return typeof v.nivel === "number" && v.nivel >= 0 && v.nivel <= 3 ? [v.nivel, 4] : [0, 1];
    case "conteo":
      return frac(v.logrado, v.total);
    case "son_logro":
      return frac(v.logro, v.son);
    default:
      return typeof v.lados === "number" && v.lados >= 0 && v.lados <= 4 ? [v.lados, 4] : [0, 1];
  }
}

function puntosRally(est: EstacionInfo, v: ValoresFila): number {
  let num: number;
  let den = 1;
  if (v.termino === true) {
    const t = v.tiempo;
    if (typeof t !== "number" || t <= 0) return 0;
    num = t * 3 <= est.limite_seg ? 100 : t * 3 <= 2 * est.limite_seg ? 80 : 60;
  } else {
    const [n, d] = avanceFraccion(est, v);
    num = 40 * n;
    den = d;
  }
  if (v.prueba !== true) den *= 2;
  return redondear(num, den);
}

function puntosBusqueda(v: ValoresFila): number {
  const fruto = Array.isArray(v.fruto) ? v.fruto : [];
  const aciertos = fruto.filter((x) => x === true).length;
  const t = typeof v.tiempo === "number" ? v.tiempo : Infinity;
  const bono = t <= 180 ? 10 : t <= 240 ? 6 : t <= 300 ? 2 : 0;
  return (
    (v.unidad === true ? 10 : 0) +
    (v.pregunta_ok === true ? (v.pregunta === "D" ? 20 : 10) : 0) +
    (v.palabra === true ? 10 : 0) +
    6 * aciertos +
    (aciertos === 3 ? 2 : 0) +
    bono
  );
}

export function puntosCapilla(lugar: number | null, recitacion: string | null): number {
  return (lugar ? (LUGAR_PUNTOS[lugar] ?? 0) : 0) + (recitacion ? (RECITACION_PUNTOS[recitacion] ?? 0) : 0);
}

/** Puntos que vale un renglón ya completo de rally o búsqueda. */
export function puntosFila(est: EstacionInfo, v: ValoresFila): number {
  if (est.tipo === "rally") return puntosRally(est, v);
  if (est.tipo === "busqueda") return puntosBusqueda(v);
  return puntosCapilla(typeof v.lugar === "number" ? v.lugar : null, typeof v.recitacion === "string" ? v.recitacion : null);
}

/** Normaliza un nombre para compararlo (sin acentos ni mayúsculas). */
export function claveNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Pone los equipos en el orden de los renglones de la hoja de papel de la estación. Los equipos que no
 * estén en esa lista (p. ej. uno nuevo) van al final, en su orden de siempre.
 */
export function ordenarComoHoja<T extends { nombre: string }>(est: EstacionInfo, equipos: T[]): T[] {
  const posicion = new Map(est.orden_equipos.map((n, i) => [claveNombre(n), i]));
  return equipos
    .map((e, i) => ({ e, i, p: posicion.get(claveNombre(e.nombre)) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((x) => x.e);
}
