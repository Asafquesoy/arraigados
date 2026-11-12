import { useEffect, useId, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { useReducedMotion } from "motion/react";
import type { EstacionInfo, FilaEstacion, HojaOut, ResultadoEquipoJuego } from "../lib/api";
import { textoSobre } from "../lib/colorEquipo";
import {
  borradorDesde,
  borradorVacio,
  esVacio,
  fmtTiempo,
  ordenarComoHoja,
  puntosFila,
  seccionesEstado,
  valoresDesde,
  type Borrador,
} from "../lib/estaciones";
import { mantenerVisibleSobreBarra } from "../lib/enfocarVisible";
import { fmtPts } from "../lib/juegos";
import { useAvisoSalida } from "../lib/useAvisoSalida";
import { useMediaQuery } from "../lib/useMediaQuery";
import { BarraGuardar } from "./BarraGuardar";
import { CampoNumero, CampoTiempo, MarcaSiNo, OpcionesChip } from "./ControlesHoja";
import { ChevronDownIcon } from "./icons/ChevronDownIcon";
import { Campo, Seccion, type EstadoVisual } from "./SeccionHoja";
import "./EstacionesCaptura.css";

interface HojaEstacionProps {
  estacion: EstacionInfo;
  equipos: ResultadoEquipoJuego[];
  /** Todas las filas guardadas del juego: de ahí sale lo ya capturado de esta estación. */
  hojas: HojaOut[];
  guardando: boolean;
  /** Error del servidor al guardar. */
  error: string | null;
  /** Devuelve `true` si se guardó. */
  onGuardar: (filas: FilaEstacion[]) => Promise<boolean>;
  /** Avisa si hay cambios sin guardar (para que quien la contiene pregunte antes de cambiar de estación). */
  onCambios: (hayCambios: boolean) => void;
}

type Parche = Partial<Borrador>;

const NIVELES = [
  { valor: 1, texto: "¼", leer: "un cuarto" },
  { valor: 2, texto: "½", leer: "la mitad" },
  { valor: 3, texto: "¾", leer: "tres cuartos" },
];
const LADOS = [0, 1, 2, 3, 4].map((n) => ({ valor: n, texto: String(n), leer: `${n} lados` }));
// «F · Fácil» en teléfono; en la tabla de escritorio solo «F» (la parte larga se oculta con CSS).
const PREGUNTA = [
  {
    valor: "F" as const,
    texto: (
      <>
        <strong>F</strong>
        <span className="opcion-larga"> · Fácil</span>
      </>
    ),
    leer: "fácil",
  },
  {
    valor: "D" as const,
    texto: (
      <>
        <strong>D</strong>
        <span className="opcion-larga"> · Difícil</span>
      </>
    ),
    leer: "difícil",
  },
];
const TERMINO = [
  { valor: "si" as const, texto: "Terminó", leer: "terminó" },
  { valor: "no" as const, texto: "No terminó", leer: "no terminó" },
];

/**
 * Hoja de captura de UNA estación (Rally sucio / Búsqueda del tesoro), igual que la hoja de papel del
 * encargado: un renglón por equipo, en el mismo orden, con las mismas marcas (✔/✖, F/D, tiempo).
 *
 * Dos presentaciones del MISMO contenido (`useMediaQuery` decide cuál; el DOM de los bloques es el mismo):
 * - **tabla** (escritorio): los 10 renglones abiertos, con líneas entre columnas.
 * - **acordeón** (teléfono y tableta): un equipo abierto a la vez; cada campo es un bloque con su título y
 *   un botón «Siguiente: <equipo>» que abre el siguiente en el orden del papel.
 *
 * Quien captura solo copia lo que circuló el encargado; los puntos salen de las reglas (`lib/estaciones.ts`
 * en vivo, `backend/app/juegos.py` al guardar). Un renglón sin tocar no se guarda (ese equipo no pasó por la
 * estación); si se vacía uno ya guardado, se borra al guardar.
 */
export function HojaEstacion({ estacion, equipos, hojas, guardando, error, onGuardar, onCambios }: HojaEstacionProps) {
  const uid = useId();
  const reducirMovimiento = useReducedMotion();
  const rally = estacion.tipo === "rally";
  // La búsqueda tiene 7 columnas con 7 pares ✔/✖: solo cabe como tabla con mouse y pantalla ancha.
  const tabla = useMediaQuery(rally ? "(min-width: 1024px)" : "(min-width: 1280px) and (pointer: fine)");

  const ordenados = useMemo(() => ordenarComoHoja(estacion, equipos), [estacion, equipos]);
  const guardadas = useMemo(() => hojas.filter((h) => h.juez === estacion.clave), [hojas, estacion.clave]);

  const [borradores, setBorradores] = useState<Record<number, Borrador>>(() =>
    Object.fromEntries(
      equipos.map((e) => [e.equipo_id, borradorDesde(estacion, guardadas.find((h) => h.equipo_id === e.equipo_id)?.valores)]),
    ),
  );
  const [base, setBase] = useState(() => JSON.stringify(borradores));
  const [intentado, setIntentado] = useState(false);
  // Acordeón: el equipo abierto (arranca en el primero que falta por capturar, en el orden del papel).
  const [abierto, setAbierto] = useState<number | null>(
    () => (ordenados.find((e) => esVacio(estacion, borradores[e.equipo_id] ?? borradorVacio(estacion))) ?? ordenados[0])?.equipo_id ?? null,
  );

  const sucio = JSON.stringify(borradores) !== base;
  useAvisoSalida(sucio);
  useEffect(() => {
    onCambios(sucio);
  }, [sucio, onCambios]);
  useEffect(() => () => onCambios(false), [onCambios]);

  const filas = useMemo(
    () =>
      ordenados.map((eq) => {
        const b = borradores[eq.equipo_id] ?? borradorVacio(estacion);
        const secciones = seccionesEstado(estacion, b);
        if (esVacio(estacion, b)) return { eq, b, vacio: true as const, error: null, puntos: null, valores: null, secciones };
        const r = valoresDesde(estacion, b);
        return "error" in r
          ? { eq, b, vacio: false as const, error: r.error, puntos: null, valores: null, secciones }
          : { eq, b, vacio: false as const, error: null, puntos: puntosFila(estacion, r.valores), valores: r.valores, secciones };
      }),
    [ordenados, borradores, estacion],
  );

  const capturados = filas.filter((f) => !f.vacio).length;
  const conError = filas.filter((f) => f.error);
  const totalPuntos = filas.reduce((s, f) => s + (f.puntos ?? 0), 0);

  const idFila = (equipoId: number) => `${uid}-fila-${equipoId}`;
  function llevarA(equipoId: number) {
    requestAnimationFrame(() =>
      document.getElementById(idFila(equipoId))?.scrollIntoView({ block: "start", behavior: reducirMovimiento ? "auto" : "smooth" }),
    );
  }

  function cambiar(equipoId: number, parche: Parche) {
    setBorradores((prev) => ({ ...prev, [equipoId]: { ...(prev[equipoId] ?? borradorVacio(estacion)), ...parche } }));
  }

  function alternar(equipoId: number) {
    const abrir = abierto !== equipoId;
    setAbierto(abrir ? equipoId : null);
    if (abrir) llevarA(equipoId);
  }

  function siguiente(indice: number) {
    const sig = ordenados[indice + 1];
    setAbierto(sig ? sig.equipo_id : null);
    if (sig) llevarA(sig.equipo_id);
  }

  // Enter dentro de una casilla no debe guardar la estación a medias (es lo que haría el submit implícito).
  function alTeclear(ev: KeyboardEvent<HTMLFormElement>) {
    if (ev.key === "Enter" && (ev.target as HTMLElement).tagName === "INPUT") ev.preventDefault();
  }

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    setIntentado(true);
    if (conError.length > 0) {
      const primero = conError[0].eq.equipo_id;
      if (!tabla) setAbierto(primero);
      llevarA(primero);
      return;
    }
    const aGuardar: FilaEstacion[] = filas.flatMap((f) => (f.valores ? [{ equipo_id: f.eq.equipo_id, valores: f.valores }] : []));
    if (aGuardar.length === 0 && guardadas.length > 0) {
      const ok = window.confirm(`Vaciaste todos los renglones: se va a borrar lo capturado de «${estacion.nombre}». ¿Continuar?`);
      if (!ok) return;
    }
    if (await onGuardar(aGuardar)) {
      setBase(JSON.stringify(borradores));
      setIntentado(false);
    }
  }

  const aviso =
    intentado && conError.length > 0
      ? `Falta completar ${conError.length === 1 ? "1 equipo" : `${conError.length} equipos`}: ${conError
          .slice(0, 3)
          .map((f) => f.eq.nombre)
          .join(", ")}${conError.length > 3 ? "…" : ""}.`
      : null;

  return (
    <form
      className={`estacion-hoja estacion-hoja--${estacion.tipo} ${tabla ? "es-tabla" : "es-acordeon"}`}
      onSubmit={enviar}
      onKeyDown={alTeclear}
      onFocus={mantenerVisibleSobreBarra}
      noValidate
    >
      <div className="estacion-encabezado">
        <h2 className="juegos-subtitulo">{estacion.nombre}</h2>
        <p className="muted estacion-info">
          {rally ? `Límite ${fmtTiempo(estacion.limite_seg)} min` : estacion.subtitulo ? `Señal: ${estacion.subtitulo}` : ""}
          {" · "}
          Copia lo que circuló el encargado, en el orden del papel; los puntos salen solos.
        </p>
      </div>

      {tabla && (
        <div className="estacion-cabecera" aria-hidden="true">
          <span>Equipo</span>
          {rally ? (
            <>
              <span>Prueba de raíz</span>
              <span>Resultado</span>
            </>
          ) : (
            <>
              <span>Unidad</span>
              <span>Pregunta</span>
              <span>Palabra</span>
              <span>¿Fruto o carne?</span>
              <span>Tiempo</span>
            </>
          )}
          <span className="estacion-cabecera-pts">Puntos</span>
        </div>
      )}

      <ul className="estacion-filas">
        {filas.map((f, i) => {
          const comunes = {
            id: idFila(f.eq.equipo_id),
            estacion,
            equipo: f.eq,
            indice: i + 1,
            b: f.b,
            vacio: f.vacio,
            incompleto: f.error !== null,
            error: intentado ? f.error : null,
            puntos: f.puntos,
            secciones: f.secciones,
            intentado,
            onCambio: (p: Parche) => cambiar(f.eq.equipo_id, p),
            onVaciar: () => setBorradores((prev) => ({ ...prev, [f.eq.equipo_id]: borradorVacio(estacion) })),
          };
          return tabla ? (
            <RenglonTabla key={f.eq.equipo_id} {...comunes} />
          ) : (
            <RenglonAcordeon
              key={f.eq.equipo_id}
              {...comunes}
              abierto={abierto === f.eq.equipo_id}
              onAlternar={() => alternar(f.eq.equipo_id)}
              siguienteNombre={ordenados[i + 1]?.nombre ?? null}
              onSiguiente={() => siguiente(i)}
            />
          );
        })}
      </ul>

      <BarraGuardar
        resumen={`${capturados} de ${equipos.length} equipos`}
        total={totalPuntos}
        aviso={aviso}
        error={error}
        guardando={guardando}
        sucio={sucio}
        etiqueta="Guardar estación"
      />
    </form>
  );
}

interface RenglonProps {
  id: string;
  estacion: EstacionInfo;
  equipo: ResultadoEquipoJuego;
  indice: number;
  b: Borrador;
  vacio: boolean;
  /** Falta algo en este renglón (se muestra en la cabecera; en rojo solo si ya se intentó guardar). */
  incompleto: boolean;
  /** Mensaje de error a mostrar (solo después de intentar guardar). */
  error: string | null;
  puntos: number | null;
  secciones: ReturnType<typeof seccionesEstado>;
  intentado: boolean;
  onCambio: (p: Parche) => void;
  onVaciar: () => void;
}

function Chip({ equipo }: { equipo: ResultadoEquipoJuego }) {
  return (
    <span className="estacion-equipo" style={{ background: equipo.color, color: textoSobre(equipo.color) }}>
      {equipo.nombre}
    </span>
  );
}

/** Escritorio: el renglón es una fila de la tabla; cada bloque es una celda. */
function RenglonTabla(p: RenglonProps) {
  const { id, equipo, indice, vacio, error, puntos, onVaciar } = p;
  return (
    <li id={id} className={`estacion-fila ${error ? "has-error" : ""} ${vacio ? "is-vacio" : ""}`}>
      <div className="estacion-celda-equipo">
        <span className="estacion-num mono">{indice}</span>
        <Chip equipo={equipo} />
      </div>
      <Secciones {...p} />
      <div className="estacion-pts mono">
        {!vacio && (
          <button type="button" className="estacion-vaciar" onClick={onVaciar} aria-label={`Vaciar el renglón de ${equipo.nombre}`} title="Vaciar este renglón">
            ×
          </button>
        )}
        <span aria-label={puntos === null ? "Sin puntos todavía" : `${fmtPts(puntos)} puntos`}>
          {puntos === null ? <span className="muted">—</span> : fmtPts(puntos)}
        </span>
      </div>
      {error && (
        <p className="field-error estacion-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

/** Teléfono/tableta: cabecera tocable con el estado del equipo y, abierto, sus bloques + «Siguiente». */
function RenglonAcordeon(p: RenglonProps & { abierto: boolean; onAlternar: () => void; siguienteNombre: string | null; onSiguiente: () => void }) {
  const { id, equipo, indice, vacio, incompleto, error, puntos, secciones, abierto, onAlternar, siguienteNombre, onSiguiente, onVaciar } = p;
  const faltan = secciones.filter((s) => !s.completa).map((s) => s.titulo);
  const estado = vacio ? "vacio" : incompleto ? "medias" : "listo";
  const texto = vacio ? "Vacío" : incompleto ? `Falta: ${faltan.length ? faltan.join(", ") : "revisar"}` : "Listo";
  return (
    <li id={id} className={`estacion-acordeon es-${estado} ${abierto ? "is-abierto" : ""} ${error ? "has-error" : ""}`}>
      <button type="button" className="estacion-acordeon-cabecera" aria-expanded={abierto} aria-controls={`${id}-cuerpo`} onClick={onAlternar}>
        <span className="estacion-num mono">{indice}</span>
        <span className="estacion-acordeon-titulo">
          <Chip equipo={equipo} />
          <span className="estacion-estado">{texto}</span>
        </span>
        <span className="estacion-pts-simple mono" aria-label={puntos === null ? "Sin puntos todavía" : `${fmtPts(puntos)} puntos`}>
          {puntos === null ? <span className="muted">—</span> : fmtPts(puntos)}
        </span>
        <ChevronDownIcon size={22} className="estacion-chevron" />
      </button>

      {abierto && (
        <div id={`${id}-cuerpo`} className="estacion-acordeon-cuerpo">
          <Secciones {...p} />
          {error && (
            <p className="field-error estacion-error" role="alert">
              {error}
            </p>
          )}
          <div className="estacion-acordeon-pie">
            {!vacio && (
              <button type="button" className="btn btn-ghost estacion-vaciar-equipo" onClick={onVaciar}>
                Vaciar este equipo
              </button>
            )}
            <button type="button" className="btn btn-primary estacion-siguiente" onClick={onSiguiente}>
              {siguienteNombre ? `Siguiente: ${siguienteNombre} →` : "Terminé este equipo"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Los bloques de un renglón (los mismos en tabla y acordeón; el CSS decide cómo se acomodan). */
function Secciones({ estacion, equipo, b, vacio, intentado, secciones, onCambio }: RenglonProps) {
  const nombre = equipo.nombre;
  // Verde si está completo; rojo solo si ya se intentó guardar y el equipo tiene algo capturado; hueco si no.
  const estado = (clave: string): EstadoVisual => {
    if (secciones.find((s) => s.clave === clave)?.completa) return "completa";
    return intentado && !vacio ? "falta" : "vacia";
  };

  if (estacion.tipo === "rally") {
    return (
      <div className="estacion-secciones">
        <Seccion titulo="Prueba de raíz" pista="un intento" estado={estado("prueba")}>
          <Campo etiqueta="¿Acertaron?">
            <MarcaSiNo valor={b.prueba} onChange={(v) => onCambio({ prueba: v })} etiqueta={`${nombre}, prueba de raíz`} />
          </Campo>
        </Seccion>
        <Seccion titulo="Resultado" pista={`límite ${fmtTiempo(estacion.limite_seg)}`} estado={estado("resultado")}>
          <Campo etiqueta="¿Terminó el juego?" bloque>
            <OpcionesChip
              ancho
              quitable={false}
              opciones={TERMINO}
              valor={b.noTermino ? "no" : "si"}
              onChange={(v) => onCambio({ noTermino: v === "no" })}
              etiqueta={`${nombre}, ¿terminó?`}
            />
          </Campo>
          {b.noTermino ? (
            <Campo etiqueta="Lo que lograron" bloque>
              <AvanceRally estacion={estacion} b={b} nombre={nombre} onCambio={onCambio} />
            </Campo>
          ) : (
            <Campo etiqueta="Terminó en">
              <CampoTiempo valor={b.tiempo} etiqueta={`${nombre}, terminó en`} onChange={(tiempo) => onCambio({ tiempo })} />
            </Campo>
          )}
        </Seccion>
      </div>
    );
  }

  return (
    <div className="estacion-secciones">
      <Seccion titulo="Unidad" pista="varios participaron" estado={estado("unidad")}>
        <Campo etiqueta="¿Participaron varios?">
          <MarcaSiNo valor={b.unidad} onChange={(v) => onCambio({ unidad: v })} etiqueta={`${nombre}, unidad`} />
        </Campo>
      </Seccion>
      <Seccion titulo="Pregunta" pista="el equipo elige antes de oírla" estado={estado("pregunta")}>
        <Campo etiqueta="¿Fácil o difícil?">
          <OpcionesChip opciones={PREGUNTA} valor={b.pregunta} onChange={(v) => onCambio({ pregunta: v })} etiqueta={`${nombre}, tipo de pregunta`} />
        </Campo>
        <Campo etiqueta="¿Respondió bien?">
          <MarcaSiNo valor={b.preguntaOk} onChange={(v) => onCambio({ preguntaOk: v })} etiqueta={`${nombre}, respuesta a la pregunta`} />
        </Campo>
      </Seccion>
      <Seccion titulo="Palabra" pista="completar el versículo" estado={estado("palabra")}>
        <Campo etiqueta="¿Completaron la palabra?">
          <MarcaSiNo valor={b.palabra} onChange={(v) => onCambio({ palabra: v })} etiqueta={`${nombre}, palabra`} />
        </Campo>
      </Seccion>
      <Seccion titulo="¿Fruto o carne?" pista="una respuesta por situación" estado={estado("fruto")}>
        {([0, 1, 2] as const).map((n) => (
          <Campo key={n} etiqueta={`Situación ${n + 1}`} corta={String(n + 1)}>
            <MarcaSiNo
              valor={b.fruto[n]}
              onChange={(v) => onCambio({ fruto: b.fruto.map((x, k) => (k === n ? v : x)) as Borrador["fruto"] })}
              etiqueta={`${nombre}, situación ${n + 1}`}
            />
          </Campo>
        ))}
      </Seccion>
      <Seccion titulo="Tiempo" pista="del cronómetro" estado={estado("tiempo")}>
        <Campo etiqueta="Tiempo del cronómetro">
          <CampoTiempo valor={b.tiempo} etiqueta={`${nombre}, tiempo`} onChange={(tiempo) => onCambio({ tiempo })} />
        </Campo>
      </Seccion>
    </div>
  );
}

/** Lo que lograron en un juego del rally que no terminaron: depende de la estación (hoja del encargado). */
function AvanceRally({ estacion, b, nombre, onCambio }: { estacion: EstacionInfo; b: Borrador; nombre: string; onCambio: (p: Parche) => void }) {
  const et = estacion.etiqueta_avance;
  switch (estacion.avance) {
    case "nivel":
      return (
        <div className="estacion-avance">
          <span className="estacion-avance-texto">Nivel de agua</span>
          <OpcionesChip opciones={NIVELES} valor={b.nivel} onChange={(v) => onCambio({ nivel: v })} etiqueta={`${nombre}, nivel de agua`} />
        </div>
      );
    case "conteo":
      return (
        <div className="estacion-avance">
          <span className="estacion-avance-texto">{et}</span>
          <span className="estacion-avance-par">
            <CampoNumero valor={b.logrado} onChange={(v) => onCambio({ logrado: v })} etiqueta={`${nombre}, ${et}`} />
            <span className="estacion-avance-texto">de</span>
            <CampoNumero valor={b.total} onChange={(v) => onCambio({ total: v })} etiqueta={`${nombre}, total`} />
          </span>
        </div>
      );
    case "son_logro":
      return (
        <div className="estacion-avance">
          <span className="estacion-avance-par">
            <span className="estacion-avance-texto">Son</span>
            <CampoNumero valor={b.son} onChange={(v) => onCambio({ son: v })} etiqueta={`${nombre}, cuántos son`} max={100} />
          </span>
          <span className="estacion-avance-par">
            <span className="estacion-avance-texto">{et}</span>
            <CampoNumero valor={b.logro} onChange={(v) => onCambio({ logro: v })} etiqueta={`${nombre}, ${et}`} max={100} />
          </span>
        </div>
      );
    default:
      return (
        <div className="estacion-avance">
          <span className="estacion-avance-texto">{et}</span>
          <OpcionesChip opciones={LADOS} valor={b.lados} onChange={(v) => onCambio({ lados: v })} etiqueta={`${nombre}, lados bien formados`} />
        </div>
      );
  }
}
