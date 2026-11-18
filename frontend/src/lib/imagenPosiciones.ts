import type { JuegoInfo, Posiciones } from "./api";
import { esClaro } from "./colorEquipo";
import { fmtPts } from "./juegos";
import { actualizado, filasDeJuego } from "./podio";

/** Imágenes PNG de las posiciones, dibujadas con Canvas 2D (sin dependencias; las fuentes son locales). */

const ANCHO = 1080;
const ESCALA = 2;
const MARGEN = 48;

function token(nombre: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
}

interface Paleta {
  noche: string;
  corteza: string;
  amarillo: string;
  ambar: string;
  naranja: string;
  hueso: string;
  tenue: string;
  apagado: string;
}

function paleta(): Paleta {
  return {
    noche: token("--noche-dosel"),
    corteza: token("--corteza"),
    amarillo: token("--amarillo"),
    ambar: token("--ambar"),
    naranja: token("--naranja-raiz"),
    hueso: token("--hueso"),
    tenue: token("--hueso-tenue"),
    apagado: token("--hueso-apagado"),
  };
}

async function cargarFuentes() {
  const display = token("--fuente-display") || '"Bagel Fat One"';
  await Promise.all([
    document.fonts.load(`40px ${display}`),
    document.fonts.load("600 24px 'Bricolage Grotesque'"),
    document.fonts.load("400 24px 'Bricolage Grotesque'"),
    document.fonts.load("600 24px 'IBM Plex Mono'"),
  ]).catch(() => undefined);
  return { display, texto: "'Bricolage Grotesque', system-ui, sans-serif", mono: "'IBM Plex Mono', monospace" };
}

function cargarLogo(): Promise<HTMLImageElement | null> {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = "/logo.png";
  });
}

function recortar(ctx: CanvasRenderingContext2D, texto: string, max: number): string {
  if (ctx.measureText(texto).width <= max) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Parte un texto en hasta `maxLineas` líneas que quepan en `max` px (la última se recorta con «…»). */
function envolver(ctx: CanvasRenderingContext2D, texto: string, max: number, maxLineas: number): string[] {
  const palabras = texto.split(/\s+/);
  const lineas: string[] = [];
  let actual = "";
  for (const w of palabras) {
    const prueba = actual ? `${actual} ${w}` : w;
    if (ctx.measureText(prueba).width <= max || !actual) actual = prueba;
    else {
      lineas.push(actual);
      actual = w;
    }
  }
  if (actual) lineas.push(actual);
  if (lineas.length > maxLineas) {
    const resto = lineas.slice(maxLineas - 1).join(" ");
    lineas.length = maxLineas - 1;
    lineas.push(resto);
  }
  return lineas.map((l) => recortar(ctx, l, max));
}

function rectRedondo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

interface Lienzo {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
}

function crearLienzo(alto: number, p: Paleta): Lienzo {
  const canvas = document.createElement("canvas");
  canvas.width = ANCHO * ESCALA;
  canvas.height = alto * ESCALA;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.scale(ESCALA, ESCALA);
  const fondo = ctx.createLinearGradient(0, 0, 0, alto);
  fondo.addColorStop(0, p.corteza);
  fondo.addColorStop(1, p.noche);
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, ANCHO, alto);
  // Luz dorada desde arriba a la derecha.
  const luz = ctx.createRadialGradient(ANCHO, 0, 0, ANCHO, 0, 700);
  luz.addColorStop(0, "rgba(255, 200, 0, 0.22)");
  luz.addColorStop(1, "rgba(255, 200, 0, 0)");
  ctx.fillStyle = luz;
  ctx.fillRect(0, 0, ANCHO, alto);
  return { ctx, canvas };
}

function aBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo crear la imagen."))), "image/png"));
}

/** Cabecera (título + subtítulo + logo). Devuelve la `y` donde empieza el contenido. */
function cabecera(ctx: CanvasRenderingContext2D, p: Paleta, f: { display: string; texto: string }, titulo: string, sub: string, logo: HTMLImageElement | null): number {
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = p.amarillo;
  ctx.font = `42px ${f.display}`;
  ctx.fillText(recortar(ctx, titulo, ANCHO - MARGEN * 2 - 120), MARGEN, MARGEN + 40);
  ctx.fillStyle = p.tenue;
  ctx.font = `400 22px ${f.texto}`;
  ctx.fillText(sub, MARGEN, MARGEN + 76);
  if (logo) {
    const h = 84;
    const w = (logo.width / logo.height) * h;
    ctx.drawImage(logo, ANCHO - MARGEN - w, MARGEN - 8, w, h);
  }
  return MARGEN + 112;
}

function pie(ctx: CanvasRenderingContext2D, p: Paleta, f: { texto: string }, alto: number) {
  ctx.fillStyle = p.apagado;
  ctx.font = `400 18px ${f.texto}`;
  ctx.textAlign = "left";
  ctx.fillText("Arraigados 2026", MARGEN, alto - 30);
  ctx.textAlign = "right";
  ctx.fillText(actualizado(), ANCHO - MARGEN, alto - 30);
  ctx.textAlign = "left";
}

function pastilla(ctx: CanvasRenderingContext2D, p: Paleta, f: { texto: string }, x: number, yCentro: number, ancho: number, nombre: string, color: string) {
  const alto = 36;
  ctx.fillStyle = color;
  rectRedondo(ctx, x, yCentro - alto / 2, ancho, alto, 18);
  ctx.fill();
  ctx.fillStyle = esClaro(color) === false || esClaro(color) === null ? p.hueso : p.corteza;
  ctx.font = `600 20px ${f.texto}`;
  ctx.textBaseline = "middle";
  ctx.fillText(recortar(ctx, nombre, ancho - 28), x + 14, yCentro + 1);
  ctx.textBaseline = "alphabetic";
}

function colorLugar(p: Paleta, lugar: number | null): string {
  if (lugar === 1) return p.amarillo;
  if (lugar === 2) return p.hueso;
  if (lugar === 3) return p.naranja;
  return p.apagado;
}

function circuloLugar(ctx: CanvasRenderingContext2D, p: Paleta, f: { mono: string }, x: number, y: number, lugar: number | null) {
  ctx.fillStyle = colorLugar(p, lugar);
  ctx.beginPath();
  ctx.arc(x, y, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lugar && lugar <= 3 ? p.corteza : p.noche;
  ctx.font = `600 20px ${f.mono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(lugar === null ? "–" : String(lugar), x, y + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

/** Tabla general: una columna por juego, extra (si hay) y total. */
export async function imagenGeneral(datos: Posiciones): Promise<Blob> {
  const p = paleta();
  const [f, logo] = await Promise.all([cargarFuentes(), cargarLogo()]);
  // Un juego que ningún equipo ha jugado solo ocuparía una columna de guiones.
  const juegos = datos.juegos.filter((j) => datos.equipos.some((e) => e.por_juego[j.clave] != null));
  const hayExtra = datos.equipos.some((e) => e.extra !== 0);
  const equipos = [...datos.equipos].sort(
    (a, b) => (a.posicion ?? 1e9) - (b.posicion ?? 1e9) || a.nombre.localeCompare(b.nombre, "es"),
  );

  const columnas = juegos.length + (hayExtra ? 1 : 0) + 1;
  const anchoTotal = 190;
  const util = ANCHO - MARGEN * 2;
  const anchoPos = 56;
  // El equipo toma lo que sobra, entre 200 y 300 px; las columnas de puntos se reparten el resto.
  const anchoEquipo = Math.min(300, Math.max(200, util - anchoPos - anchoTotal - (columnas - 1) * 120));
  const anchoCol = (util - anchoPos - anchoEquipo - anchoTotal) / Math.max(1, columnas - 1);
  const filaAlto = 56;
  const cabAlto = 100;
  const alto = 150 + cabAlto + equipos.length * filaAlto + 90;

  const { ctx, canvas } = crearLienzo(alto, p);
  const y0 = cabecera(ctx, p, f, "Posiciones · Total general", "Puntos por juego y total", logo);

  // Encabezados
  ctx.fillStyle = p.ambar;
  ctx.font = `600 18px ${f.texto}`;
  ctx.textAlign = "left";
  ctx.fillText("#", MARGEN + 8, y0 + 36);
  ctx.fillText("EQUIPO", MARGEN + anchoPos, y0 + 36);
  ctx.textAlign = "right";
  let x = MARGEN + anchoPos + anchoEquipo;
  const etiquetas = [...juegos.map((j) => ({ t: j.nombre, s: j.puntos_max > 0 ? `/ ${j.puntos_max}` : "" })), ...(hayExtra ? [{ t: "Extra", s: "" }] : [])];
  for (const e of etiquetas) {
    ctx.font = `600 17px ${f.texto}`;
    const lineas = envolver(ctx, e.t, anchoCol - 24, 2);
    lineas.forEach((l, k) => ctx.fillText(l, x + anchoCol - 20, y0 + 24 + k * 22));
    if (e.s) {
      ctx.font = `400 15px ${f.mono}`;
      ctx.fillStyle = p.apagado;
      ctx.fillText(e.s, x + anchoCol - 20, y0 + 24 + lineas.length * 22);
      ctx.fillStyle = p.ambar;
    }
    x += anchoCol;
  }
  ctx.font = `600 18px ${f.texto}`;
  ctx.fillText("TOTAL", MARGEN + util - 12, y0 + 36);
  ctx.strokeStyle = p.ambar;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(MARGEN, y0 + cabAlto - 10);
  ctx.lineTo(MARGEN + util, y0 + cabAlto - 10);
  ctx.stroke();
  ctx.globalAlpha = 1;

  equipos.forEach((e, i) => {
    const y = y0 + cabAlto + i * filaAlto;
    const yc = y + filaAlto / 2;
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(247, 243, 227, 0.05)";
      rectRedondo(ctx, MARGEN - 8, y + 2, util + 16, filaAlto - 4, 12);
      ctx.fill();
    }
    circuloLugar(ctx, p, f, MARGEN + 26, yc, e.posicion);
    pastilla(ctx, p, f, MARGEN + anchoPos, yc, anchoEquipo - 16, e.nombre, e.color);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    let cx = MARGEN + anchoPos + anchoEquipo;
    ctx.font = `400 22px ${f.mono}`;
    for (const j of juegos) {
      const v = e.por_juego[j.clave];
      ctx.fillStyle = v == null ? p.apagado : p.hueso;
      ctx.fillText(v == null ? "—" : fmtPts(v), cx + anchoCol - 20, yc + 1);
      cx += anchoCol;
    }
    if (hayExtra) {
      ctx.fillStyle = e.extra === 0 ? p.apagado : p.hueso;
      ctx.fillText(e.extra === 0 ? "—" : `${e.extra > 0 ? "+" : "−"}${fmtPts(Math.abs(e.extra))}`, cx + anchoCol - 20, yc + 1);
    }
    ctx.font = `600 28px ${f.mono}`;
    ctx.fillStyle = e.posicion === null ? p.apagado : p.amarillo;
    ctx.fillText(e.posicion === null ? "—" : fmtPts(e.total), MARGEN + util - 12, yc + 1);
    ctx.textBaseline = "alphabetic";
  });

  pie(ctx, p, f, alto);
  return aBlob(canvas);
}

/** Podio de un solo juego. */
export async function imagenJuego(datos: Posiciones, juego: JuegoInfo): Promise<Blob> {
  const p = paleta();
  const [f, logo] = await Promise.all([cargarFuentes(), cargarLogo()]);
  const filas = filasDeJuego(datos, juego);
  const conLugar = filas
    .filter((r) => r.posicion !== null)
    .sort((a, b) => (a.posicion as number) - (b.posicion as number) || a.nombre.localeCompare(b.nombre, "es"));
  const sinLugar = filas.filter((r) => r.posicion === null).map((r) => r.nombre);
  const color = new Map(datos.equipos.map((e) => [e.nombre, e.color]));

  const filaAlto = 72;
  const alto = 200 + Math.max(1, conLugar.length) * filaAlto + (sinLugar.length ? 60 : 0) + 90;
  const { ctx, canvas } = crearLienzo(alto, p);
  const y0 = cabecera(ctx, p, f, `Posiciones · ${juego.nombre}`, juego.puntos_max > 0 ? `Vale ${juego.puntos_max} puntos` : "Puntos del juego", logo);
  const util = ANCHO - MARGEN * 2;

  if (conLugar.length === 0) {
    ctx.fillStyle = p.tenue;
    ctx.font = `400 26px ${f.texto}`;
    ctx.fillText("Todavía no hay puntos capturados.", MARGEN, y0 + 50);
  }
  conLugar.forEach((r, i) => {
    const y = y0 + 10 + i * filaAlto;
    const yc = y + filaAlto / 2;
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(247, 243, 227, 0.05)";
      rectRedondo(ctx, MARGEN - 8, y + 2, util + 16, filaAlto - 4, 14);
      ctx.fill();
    }
    circuloLugar(ctx, p, f, MARGEN + 30, yc, r.posicion);
    pastilla(ctx, p, f, MARGEN + 80, yc, 420, r.nombre, color.get(r.nombre) ?? p.ambar);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = `600 34px ${f.mono}`;
    ctx.fillStyle = r.posicion === 1 ? p.amarillo : p.hueso;
    ctx.fillText(`${fmtPts(r.total)}`, MARGEN + util - 70, yc + 1);
    ctx.font = `400 20px ${f.texto}`;
    ctx.fillStyle = p.apagado;
    ctx.fillText("pts", MARGEN + util - 12, yc + 4);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  });
  if (sinLugar.length) {
    ctx.fillStyle = p.apagado;
    ctx.font = `400 20px ${f.texto}`;
    const yy = y0 + 10 + Math.max(1, conLugar.length) * filaAlto + 40;
    ctx.fillText(recortar(ctx, `Sin puntos todavía: ${sinLugar.join(", ")}`, util), MARGEN, yy);
  }

  pie(ctx, p, f, alto);
  return aBlob(canvas);
}
