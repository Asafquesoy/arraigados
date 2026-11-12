import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { EstacionInfo, FilaEstacion, HojaOut, ResultadoEquipoJuego } from "../lib/api";
import { textoSobre } from "../lib/colorEquipo";
import {
  borradorDesde,
  borradorVacio,
  esVacio,
  fmtTiempo,
  ordenarComoHoja,
  puntosFila,
  valoresDesde,
  type Borrador,
} from "../lib/estaciones";
import { fmtPts } from "../lib/juegos";
import { useAvisoSalida } from "../lib/useAvisoSalida";
import { CampoNumero, CampoTiempo, MarcaSiNo, OpcionesChip } from "./ControlesHoja";
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
const PREGUNTA = [
  { valor: "F" as const, texto: "F", leer: "fácil" },
  { valor: "D" as const, texto: "D", leer: "difícil" },
];

/**
 * Hoja de captura de UNA estación (Rally sucio / Búsqueda del tesoro), igual que la hoja de papel del
 * encargado: un renglón por equipo, en el mismo orden, con las mismas marcas (✔/✖, F/D, «__ : __»).
 * Quien captura solo copia lo que circuló el encargado; los puntos salen de las reglas
 * (`lib/estaciones.ts` en vivo, `backend/app/juegos.py` al guardar). Un renglón sin tocar no se
 * guarda (ese equipo no pasó por la estación); si se vacía uno ya guardado, se borra al guardar.
 */
export function HojaEstacion({ estacion, equipos, hojas, guardando, error, onGuardar, onCambios }: HojaEstacionProps) {
  const uid = useId();
  const ordenados = useMemo(() => ordenarComoHoja(estacion, equipos), [estacion, equipos]);
  const guardadas = useMemo(() => hojas.filter((h) => h.juez === estacion.clave), [hojas, estacion.clave]);

  const [borradores, setBorradores] = useState<Record<number, Borrador>>(() =>
    Object.fromEntries(
      equipos.map((e) => [e.equipo_id, borradorDesde(estacion, guardadas.find((h) => h.equipo_id === e.equipo_id)?.valores)]),
    ),
  );
  const [base, setBase] = useState(() => JSON.stringify(borradores));
  const [intentado, setIntentado] = useState(false);

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
        if (esVacio(estacion, b)) return { eq, b, vacio: true as const, error: null, puntos: null, valores: null };
        const r = valoresDesde(estacion, b);
        return "error" in r
          ? { eq, b, vacio: false as const, error: r.error, puntos: null, valores: null }
          : { eq, b, vacio: false as const, error: null, puntos: puntosFila(estacion, r.valores), valores: r.valores };
      }),
    [ordenados, borradores, estacion],
  );

  const capturados = filas.filter((f) => !f.vacio).length;
  const conError = filas.filter((f) => f.error);
  const totalPuntos = filas.reduce((s, f) => s + (f.puntos ?? 0), 0);

  function cambiar(equipoId: number, parche: Parche) {
    setBorradores((prev) => ({ ...prev, [equipoId]: { ...(prev[equipoId] ?? borradorVacio(estacion)), ...parche } }));
  }

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    setIntentado(true);
    if (conError.length > 0) {
      const primero = conError[0];
      document.getElementById(`${uid}-fila-${primero.eq.equipo_id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
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

  const rally = estacion.tipo === "rally";

  return (
    <form className={`estacion-hoja estacion-hoja--${estacion.tipo}`} onSubmit={enviar} noValidate>
      <div className="estacion-encabezado">
        <h2 className="juegos-subtitulo">{estacion.nombre}</h2>
        <p className="muted estacion-info">
          {rally
            ? `Límite ${fmtTiempo(estacion.limite_seg)} min · Prueba de raíz: un intento`
            : estacion.subtitulo
              ? `Señal: ${estacion.subtitulo}`
              : ""}
          {" · "}
          Copia lo que circuló el encargado; los puntos salen solos.
        </p>
      </div>

      <div className="estacion-cabecera" aria-hidden="true">
        <span>Equipo</span>
        {rally ? (
          <>
            <span>Prueba de raíz</span>
            <span>Terminó en</span>
            <span>Si no terminó, cuánto lograron</span>
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

      <ul className="estacion-filas">
        {filas.map((f, i) => (
          <Renglon
            key={f.eq.equipo_id}
            id={`${uid}-fila-${f.eq.equipo_id}`}
            estacion={estacion}
            equipo={f.eq}
            indice={i + 1}
            b={f.b}
            vacio={f.vacio}
            error={intentado ? f.error : null}
            puntos={f.puntos}
            onCambio={(p) => cambiar(f.eq.equipo_id, p)}
            onVaciar={() => setBorradores((prev) => ({ ...prev, [f.eq.equipo_id]: borradorVacio(estacion) }))}
          />
        ))}
      </ul>

      <div className="hoja-total" aria-live="polite">
        <span>Total de la estación</span>
        <strong className="mono">{fmtPts(totalPuntos)} pts</strong>
        <span className="muted hoja-total-faltan">
          {capturados} de {equipos.length} equipos capturados
        </span>
      </div>

      {intentado && conError.length > 0 && (
        <p className="field-error" role="alert">
          {conError.length === 1 ? "Falta completar 1 renglón." : `Faltan por completar ${conError.length} renglones.`} Revisa los marcados en rojo.
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <div className="hoja-acciones">
        <button type="submit" className="btn btn-primary" disabled={guardando || !sucio}>
          {guardando && <span className="spinner" />}
          {guardando ? "Guardando..." : sucio ? "Guardar estación" : "Sin cambios"}
        </button>
      </div>
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
  error: string | null;
  puntos: number | null;
  onCambio: (p: Parche) => void;
  onVaciar: () => void;
}

function Renglon({ id, estacion, equipo, indice, b, vacio, error, puntos, onCambio, onVaciar }: RenglonProps) {
  const rally = estacion.tipo === "rally";
  const nombre = equipo.nombre;
  return (
    <li id={id} className={`estacion-fila ${error ? "has-error" : ""} ${vacio ? "is-vacio" : ""}`}>
      <div className="estacion-celda-equipo">
        <span className="estacion-num mono">{indice}</span>
        <span className="estacion-equipo" style={{ background: equipo.color, color: textoSobre(equipo.color) }}>
          {nombre}
        </span>
      </div>

      <div className="estacion-grupos">
        {rally ? (
          <>
            <Grupo etiqueta="Prueba de raíz">
              <MarcaSiNo valor={b.prueba} onChange={(v) => onCambio({ prueba: v })} etiqueta={`${nombre}, prueba de raíz`} />
            </Grupo>
            <Grupo etiqueta="Terminó en (min : seg)">
              {b.noTermino ? (
                <span className="muted estacion-sin-tiempo">—</span>
              ) : (
                <CampoTiempo min={b.min} seg={b.seg} etiqueta={`${nombre}, terminó en`} onChange={(min, seg) => onCambio({ min, seg })} />
              )}
            </Grupo>
            <Grupo etiqueta="Si no terminó" ancho>
              <label className="estacion-check">
                <input type="checkbox" checked={b.noTermino} onChange={(e) => onCambio({ noTermino: e.target.checked })} />
                <span>No terminó</span>
              </label>
              {b.noTermino && <AvanceRally estacion={estacion} b={b} nombre={nombre} onCambio={onCambio} />}
            </Grupo>
          </>
        ) : (
          <>
            <Grupo etiqueta="Unidad">
              <MarcaSiNo valor={b.unidad} onChange={(v) => onCambio({ unidad: v })} etiqueta={`${nombre}, unidad`} />
            </Grupo>
            <Grupo etiqueta="Pregunta">
              <div className="estacion-pregunta">
                <OpcionesChip
                  opciones={PREGUNTA}
                  valor={b.pregunta}
                  onChange={(v) => onCambio({ pregunta: v })}
                  etiqueta={`${nombre}, tipo de pregunta`}
                />
                <MarcaSiNo valor={b.preguntaOk} onChange={(v) => onCambio({ preguntaOk: v })} etiqueta={`${nombre}, respuesta a la pregunta`} />
              </div>
            </Grupo>
            <Grupo etiqueta="Palabra">
              <MarcaSiNo valor={b.palabra} onChange={(v) => onCambio({ palabra: v })} etiqueta={`${nombre}, palabra`} />
            </Grupo>
            <Grupo etiqueta="¿Fruto o carne?" ancho>
              <div className="estacion-fruto">
                {([0, 1, 2] as const).map((n) => (
                  <div className="estacion-fruto-item" key={n}>
                    <span className="estacion-fruto-n mono" aria-hidden="true">
                      {n + 1}
                    </span>
                    <MarcaSiNo
                      valor={b.fruto[n]}
                      onChange={(v) => onCambio({ fruto: b.fruto.map((x, k) => (k === n ? v : x)) as Borrador["fruto"] })}
                      etiqueta={`${nombre}, situación ${n + 1}`}
                    />
                  </div>
                ))}
              </div>
            </Grupo>
            <Grupo etiqueta="Tiempo (min : seg)">
              <CampoTiempo min={b.min} seg={b.seg} etiqueta={`${nombre}, tiempo`} onChange={(min, seg) => onCambio({ min, seg })} />
            </Grupo>
          </>
        )}
      </div>

      <div className="estacion-pts mono">
        {!vacio && (
          <button type="button" className="estacion-vaciar" onClick={onVaciar} aria-label={`Vaciar el renglón de ${nombre}`} title="Vaciar este renglón">
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
          <CampoNumero valor={b.logrado} onChange={(v) => onCambio({ logrado: v })} etiqueta={`${nombre}, ${et}`} />
          <span className="estacion-avance-texto">de</span>
          <CampoNumero valor={b.total} onChange={(v) => onCambio({ total: v })} etiqueta={`${nombre}, total`} />
        </div>
      );
    case "son_logro":
      return (
        <div className="estacion-avance">
          <span className="estacion-avance-texto">Son</span>
          <CampoNumero valor={b.son} onChange={(v) => onCambio({ son: v })} etiqueta={`${nombre}, cuántos son`} max={100} />
          <span className="estacion-avance-texto">· {et}</span>
          <CampoNumero valor={b.logro} onChange={(v) => onCambio({ logro: v })} etiqueta={`${nombre}, ${et}`} max={100} />
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

/** Un bloque del renglón con su etiqueta (solo se ve en celular: en escritorio la dan los encabezados). */
function Grupo({ etiqueta, ancho, children }: { etiqueta: string; ancho?: boolean; children: ReactNode }) {
  return (
    <div className={`estacion-grupo ${ancho ? "is-ancho" : ""}`}>
      <span className="estacion-etiqueta">{etiqueta}</span>
      <div className="estacion-grupo-control">{children}</div>
    </div>
  );
}
