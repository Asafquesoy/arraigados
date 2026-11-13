import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Link, Navigate } from "react-router-dom";
import { useReducedMotion } from "motion/react";
import { BotonCopiar } from "../components/BotonCopiar";
import { ConfirmButton } from "../components/ConfirmButton";
import { EstacionesCaptura } from "../components/EstacionesCaptura";
import { HojaCalificacion } from "../components/HojaCalificacion";
import { fmtExtra, PuntosExtra } from "../components/PuntosExtra";
import { ResultadosEstaciones } from "../components/ResultadosEstaciones";
import { Reveal } from "../components/Reveal";
import { Skeleton } from "../components/Skeleton";
import { Toast } from "../components/Toast";
import { TorneoVoleibol } from "../components/TorneoVoleibol";
import { useAdminAuth } from "../lib/AdminAuthContext";
import {
  apiFetch,
  ApiError,
  type FilaEstacion,
  type HojaOut,
  type JuegoDetalle,
  type JuegoInfo,
  type Posiciones,
  type ValoresHoja,
} from "../lib/api";
import { textoSobre } from "../lib/colorEquipo";
import { fmtPts } from "../lib/juegos";
import { filasDeJuego, filasGenerales, juegoTienePodio, textoPosiciones, textoTodo } from "../lib/podio";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useToast } from "../lib/useToast";
import "./Juegos.css";

type Vista = "posiciones" | string;

function EquipoChip({ nombre, color }: { nombre: string; color: string }) {
  return (
    <span className="juegos-equipo" style={{ background: color, color: textoSobre(color) }}>
      {nombre}
    </span>
  );
}

function Posicion({ valor }: { valor: number | null }) {
  return (
    <span className={`juegos-pos mono ${valor === 1 ? "is-primero" : ""}`} aria-label={valor ? `Lugar ${valor}` : "Sin lugar todavía"}>
      {valor ?? "–"}
    </span>
  );
}

/** Celda/valor de puntos extra: «+100» en verde, «−50» en rojo, y un guion apagado si no hay. */
function ValorExtra({ puntos }: { puntos: number }) {
  if (!puntos) return <span className="muted">—</span>;
  return <span className={`juegos-extra ${puntos > 0 ? "is-suma" : "is-resta"}`}>{fmtExtra(puntos)}</span>;
}

/** Tabla de posiciones general: una columna por juego y el total. Tarjetas en pantallas angostas. */
function VistaPosiciones({
  datos,
  esEscritorio,
  canEdit,
  onCambioExtra,
}: {
  datos: Posiciones;
  esEscritorio: boolean;
  canEdit: boolean;
  onCambioExtra: (mensaje: string) => Promise<void>;
}) {
  const { juegos, equipos } = datos;
  if (equipos.length === 0) {
    return (
      <div className="glass-card juegos-aviso">
        <p>Todavía no hay equipos.</p>
        <p className="muted">
          Créalos en <Link to="/admin/equipos">Equipos</Link> y aquí aparecerán para calificarlos.
        </p>
      </div>
    );
  }
  const hayPuntos = equipos.some((e) => e.posicion !== null);
  const hayExtraGeneral = equipos.some((e) => e.extra !== 0);
  const juegosConPodio = juegos.filter((j) => juegoTienePodio(datos, j));

  return (
    <>
    <div className="glass-card juegos-tarjeta">
      {!hayPuntos && <p className="muted juegos-nota">Aún no hay calificaciones capturadas. Entra a un juego para empezar.</p>}
      {hayPuntos && (
        <div className="juegos-copiar" role="group" aria-label="Copiar posiciones para compartir">
          <span className="muted juegos-copiar-titulo">Copiar para compartir:</span>
          <BotonCopiar label="Total general" texto={() => textoPosiciones("Total general", filasGenerales(datos))} />
          {juegosConPodio.map((j) => (
            <BotonCopiar key={j.clave} label={j.nombre} texto={() => textoPosiciones(j.nombre, filasDeJuego(datos, j))} />
          ))}
          {juegosConPodio.length > 0 && <BotonCopiar label="Todo junto" className="btn-sm btn-copiar-todo" texto={() => textoTodo(datos)} />}
        </div>
      )}
      {hayPuntos && (
        <p className="muted juegos-nota">
          El total suma los juegos{hayExtraGeneral || datos.puntos_extra.length > 0 ? " y los puntos extra o descuentos" : ""}.
        </p>
      )}
      {esEscritorio ? (
        <table className="juegos-tabla">
          <thead>
            <tr>
              <th className="juegos-col-pos">#</th>
              <th>Equipo</th>
              {juegos.map((j) => (
                <th className="num" key={j.clave}>
                  {j.nombre}
                  {j.puntos_max > 0 && <small>/ {j.puntos_max}</small>}
                </th>
              ))}
              {hayExtraGeneral && (
                <th className="num" title="Puntos extra o descuentos generales (no de un juego en particular)">
                  Extra
                </th>
              )}
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {equipos.map((e) => (
              <tr key={e.equipo_id}>
                <td className="juegos-col-pos">
                  <Posicion valor={e.posicion} />
                </td>
                <td>
                  <EquipoChip nombre={e.nombre} color={e.color} />
                </td>
                {juegos.map((j) => {
                  const v = e.por_juego[j.clave];
                  return (
                    <td className="num" key={j.clave}>
                      {v === null || v === undefined ? <span className="muted">—</span> : fmtPts(v)}
                    </td>
                  );
                })}
                {hayExtraGeneral && (
                  <td className="num">
                    <ValorExtra puntos={e.extra} />
                  </td>
                )}
                <td className="num juegos-total">{e.posicion === null ? <span className="muted">—</span> : fmtPts(e.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="juegos-lista-tarjetas">
          {equipos.map((e) => (
            <li className="juegos-equipo-card" key={e.equipo_id}>
              <div className="juegos-equipo-card-cabecera">
                <Posicion valor={e.posicion} />
                <EquipoChip nombre={e.nombre} color={e.color} />
                <span className="juegos-total mono">{e.posicion === null ? "—" : fmtPts(e.total)}</span>
              </div>
              <dl className="juegos-desglose">
                {juegos.map((j) => {
                  const v = e.por_juego[j.clave];
                  return (
                    <div key={j.clave}>
                      <dt className="muted">{j.nombre}</dt>
                      <dd className="mono">{v === null || v === undefined ? "—" : fmtPts(v)}</dd>
                    </div>
                  );
                })}
                {e.extra !== 0 && (
                  <div>
                    <dt className="muted">Extra general</dt>
                    <dd className="mono">
                      <ValorExtra puntos={e.extra} />
                    </dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
    <PuntosExtra
      juegoClave={null}
      juegos={juegos}
      equipos={equipos}
      puntosExtra={datos.puntos_extra}
      canEdit={canEdit}
      onCambio={onCambioExtra}
    />
    </>
  );
}

interface VistaJuegoProps {
  detalle: JuegoDetalle;
  /** Todos los juegos, para el «Aplica a» de los puntos extra. */
  juegos: JuegoInfo[];
  onCambioExtra: (mensaje: string) => Promise<void>;
  esEscritorio: boolean;
  canEdit: boolean;
  editando: HojaOut | null;
  guardando: boolean;
  errorForm: string | null;
  formRef: RefObject<HTMLDivElement>;
  onGuardar: (datos: { equipo_id: number; juez: string; valores: ValoresHoja }) => Promise<boolean>;
  onEditar: (hoja: HojaOut) => void;
  onCancelarEdicion: () => void;
  onBorrar: (hoja: HojaOut) => void;
}

function VistaJuego({
  detalle,
  juegos,
  onCambioExtra,
  esEscritorio,
  canEdit,
  editando,
  guardando,
  errorForm,
  formRef,
  onGuardar,
  onEditar,
  onCancelarEdicion,
  onBorrar,
}: VistaJuegoProps) {
  const { juego, equipos, hojas } = detalle;

  if (juego.criterios.length === 0) {
    return (
      <div className="glass-card juegos-aviso">
        <p className="juegos-aviso-titulo">Reglas pendientes</p>
        <p className="muted">
          {juego.nombre} todavía no tiene criterios de calificación. Cuando se definan se agregan al catálogo
          (<span className="mono">backend/app/juegos.py</span>) y aquí aparecerán el formulario y los resultados.
        </p>
      </div>
    );
  }

  const equipoDe = new Map(equipos.map((e) => [e.equipo_id, e]));
  const conHojas = equipos.filter((e) => e.hojas > 0);
  const hayExtra = equipos.some((e) => e.extra !== 0);
  const hayPodio = equipos.some((e) => e.posicion !== null);

  return (
    <>
      {canEdit && (
        <div className="glass-card juegos-tarjeta juegos-captura" ref={formRef}>
          <h2 className="juegos-subtitulo">
            {editando ? `Editando la hoja de ${editando.juez} · ${equipoDe.get(editando.equipo_id)?.nombre ?? ""}` : "Capturar hoja"}
          </h2>
          {equipos.length === 0 ? (
            <p className="muted">
              Primero crea los equipos en <Link to="/admin/equipos">Equipos</Link>.
            </p>
          ) : (
            <HojaCalificacion
              key={editando?.id ?? "nueva"}
              juego={juego}
              equipos={equipos}
              hojas={hojas}
              inicial={editando}
              guardando={guardando}
              error={errorForm}
              onGuardar={onGuardar}
              onCancelar={editando ? onCancelarEdicion : undefined}
            />
          )}
        </div>
      )}

      <div className="glass-card juegos-tarjeta">
        <div className="juegos-cabecera-tarjeta">
          <h2 className="juegos-subtitulo">Resultados</h2>
          {hayPodio && (
            <BotonCopiar
              label="Copiar posiciones"
              texto={() =>
                textoPosiciones(
                  juego.nombre,
                  equipos.map((e) => ({ posicion: e.posicion, nombre: e.nombre, total: e.total })),
                )
              }
            />
          )}
        </div>
        <p className="muted juegos-nota">
          El puntaje de cada equipo es el promedio de sus hojas (una por juez). El juego vale {juego.puntos_max} puntos
          {hayExtra ? "; el total ya incluye los puntos extra o descuentos." : "."}
        </p>
        {esEscritorio ? (
          <table className="juegos-tabla">
            <thead>
              <tr>
                <th className="juegos-col-pos">#</th>
                <th>Equipo</th>
                <th className="num">Hojas</th>
                {juego.criterios.map((c) => (
                  <th className="num" key={c.clave} title={c.descripcion}>
                    {c.nombre}
                    <small>/ {c.puntos}</small>
                  </th>
                ))}
                {hayExtra && <th className="num">Extra</th>}
                <th className="num">
                  Total<small>/ {juego.puntos_max}</small>
                </th>
              </tr>
            </thead>
            <tbody>
              {equipos.map((e) => (
                <tr key={e.equipo_id}>
                  <td className="juegos-col-pos">
                    <Posicion valor={e.posicion} />
                  </td>
                  <td>
                    <EquipoChip nombre={e.nombre} color={e.color} />
                  </td>
                  <td className="num">{e.hojas}</td>
                  {juego.criterios.map((c) => (
                    <td className="num" key={c.clave}>
                      {e.hojas ? fmtPts(e.por_criterio[c.clave] ?? 0) : <span className="muted">—</span>}
                    </td>
                  ))}
                  {hayExtra && (
                    <td className="num">
                      <ValorExtra puntos={e.extra} />
                    </td>
                  )}
                  <td className="num juegos-total">{e.hojas || e.extra ? fmtPts(e.total) : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ul className="juegos-lista-tarjetas">
            {equipos.map((e) => (
              <li className="juegos-equipo-card" key={e.equipo_id}>
                <div className="juegos-equipo-card-cabecera">
                  <Posicion valor={e.posicion} />
                  <EquipoChip nombre={e.nombre} color={e.color} />
                  <span className="juegos-total mono">{e.hojas || e.extra ? fmtPts(e.total) : "—"}</span>
                </div>
                <p className="muted juegos-nota">
                  {e.hojas === 0 ? "Sin hojas todavía" : e.hojas === 1 ? "1 hoja" : `${e.hojas} hojas`}
                </p>
                {(e.hojas > 0 || e.extra !== 0) && (
                  <dl className="juegos-desglose">
                    {e.hojas > 0 &&
                      juego.criterios.map((c) => (
                        <div key={c.clave}>
                          <dt className="muted">
                            {c.nombre} <small>/ {c.puntos}</small>
                          </dt>
                          <dd className="mono">{fmtPts(e.por_criterio[c.clave] ?? 0)}</dd>
                        </div>
                      ))}
                    {e.extra !== 0 && (
                      <div>
                        <dt className="muted">Extra</dt>
                        <dd className="mono">
                          <ValorExtra puntos={e.extra} />
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <PuntosExtra
        juegoClave={juego.clave}
        juegos={juegos}
        equipos={equipos}
        puntosExtra={detalle.puntos_extra}
        canEdit={canEdit}
        onCambio={onCambioExtra}
      />

      {conHojas.length > 0 && (
        <div className="glass-card juegos-tarjeta">
          <h2 className="juegos-subtitulo">Hojas capturadas</h2>
          <div className="juegos-hojas">
            {conHojas.map((eq) => (
              <section className="juegos-hojas-equipo" key={eq.equipo_id} aria-label={`Hojas de ${eq.nombre}`}>
                <EquipoChip nombre={eq.nombre} color={eq.color} />
                <ul className="juegos-hojas-lista">
                  {hojas
                    .filter((h) => h.equipo_id === eq.equipo_id)
                    .map((h) => (
                      <li className={`juegos-hoja ${editando?.id === h.id ? "is-editando" : ""}`} key={h.id}>
                        <div className="juegos-hoja-info">
                          <p className="juegos-hoja-juez">{h.juez}</p>
                          <p className="muted juegos-hoja-desglose">
                            {juego.criterios.map((c) => `${c.nombre} ${fmtPts(h.puntos[c.clave] ?? 0)}`).join(" · ")}
                          </p>
                        </div>
                        <span className="juegos-hoja-total mono">{fmtPts(h.total)}</span>
                        {canEdit && (
                          <div className="juegos-hoja-acciones">
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEditar(h)}>
                              Editar
                            </button>
                            <ConfirmButton label="Borrar" confirmLabel="¿Seguro?" className="btn-sm" onConfirm={() => onBorrar(h)} />
                          </div>
                        )}
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

interface VistaEstacionesProps {
  detalle: JuegoDetalle;
  juegos: JuegoInfo[];
  onCambioExtra: (mensaje: string) => Promise<void>;
  esEscritorio: boolean;
  canEdit: boolean;
  guardando: boolean;
  errorForm: string | null;
  onGuardar: (estacion: string, filas: FilaEstacion[]) => Promise<boolean>;
  onLimpiarError: () => void;
}

/** Rally sucio y Búsqueda del tesoro: se capturan las hojas de los encargados, estación por estación. */
function VistaEstaciones({
  detalle,
  juegos,
  onCambioExtra,
  esEscritorio,
  canEdit,
  guardando,
  errorForm,
  onGuardar,
  onLimpiarError,
}: VistaEstacionesProps) {
  return (
    <>
      {canEdit &&
        (detalle.equipos.length === 0 ? (
          <div className="glass-card juegos-aviso">
            <p>
              Primero crea los equipos en <Link to="/admin/equipos">Equipos</Link>.
            </p>
          </div>
        ) : (
          <EstacionesCaptura detalle={detalle} guardando={guardando} error={errorForm} onGuardar={onGuardar} onLimpiarError={onLimpiarError} />
        ))}
      <ResultadosEstaciones detalle={detalle} esEscritorio={esEscritorio} />
      <PuntosExtra
        juegoClave={detalle.juego.clave}
        juegos={juegos}
        equipos={detalle.equipos}
        puntosExtra={detalle.puntos_extra}
        canEdit={canEdit}
        onCambio={onCambioExtra}
      />
    </>
  );
}

interface VistaTorneoProps {
  detalle: JuegoDetalle;
  juegos: JuegoInfo[];
  onCambio: (mensaje: string) => Promise<void>;
  onAviso: (mensaje: string) => void;
  esEscritorio: boolean;
  canEdit: boolean;
}

/** Voleibol gigante: sorteo, partidos, tabla y finales (`TorneoVoleibol`) más los puntos extra del juego. */
function VistaTorneo({ detalle, juegos, onCambio, onAviso, esEscritorio, canEdit }: VistaTorneoProps) {
  return (
    <>
      {detalle.torneo && (
        <TorneoVoleibol
          clave={detalle.juego.clave}
          torneo={detalle.torneo}
          nEquipos={detalle.equipos.length}
          canEdit={canEdit}
          esEscritorio={esEscritorio}
          onCambio={onCambio}
          onAviso={onAviso}
        />
      )}
      <PuntosExtra
        juegoClave={detalle.juego.clave}
        juegos={juegos}
        equipos={detalle.equipos}
        puntosExtra={detalle.puntos_extra}
        canEdit={canEdit}
        onCambio={onCambio}
      />
    </>
  );
}

export function Juegos() {
  const { username, role, loading: authLoading } = useAdminAuth();
  const canEdit = role === "ADMIN";
  const esEscritorio = useMediaQuery("(min-width: 1024px)");
  const reducirMovimiento = useReducedMotion();
  const [toast, setToast] = useToast();

  const [posiciones, setPosiciones] = useState<Posiciones | null>(null);
  const [vista, setVista] = useState<Vista>("posiciones");
  const [detalle, setDetalle] = useState<JuegoDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<HojaOut | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  // La vista actual, para que una respuesta que llega tarde de otro juego no pise la que se está viendo.
  const vistaRef = useRef<Vista>(vista);
  vistaRef.current = vista;

  const cargarPosiciones = useCallback(async () => {
    try {
      setPosiciones(await apiFetch<Posiciones>("/admin/juegos/posiciones"));
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "No se pudieron cargar las posiciones.");
    } finally {
      setCargando(false);
    }
  }, [setToast]);

  const cargarJuego = useCallback(
    async (clave: string) => {
      try {
        const d = await apiFetch<JuegoDetalle>(`/admin/juegos/${clave}`);
        if (vistaRef.current === clave) setDetalle(d);
      } catch (err) {
        setToast(err instanceof ApiError ? err.message : "No se pudo cargar el juego.");
      }
    },
    [setToast],
  );

  const recargar = useCallback(async () => {
    const actual = vistaRef.current;
    await Promise.all([cargarPosiciones(), actual !== "posiciones" ? cargarJuego(actual) : Promise.resolve()]);
  }, [cargarPosiciones, cargarJuego]);

  useEffect(() => {
    if (!authLoading && username) cargarPosiciones();
  }, [authLoading, username, cargarPosiciones]);

  useEffect(() => {
    setEditando(null);
    setErrorForm(null);
    setDetalle(null);
    if (vista !== "posiciones" && username) cargarJuego(vista);
  }, [vista, username, cargarJuego]);

  // Con la pestaña en segundo plano pueden haber capturado otras personas: al volver, se refresca.
  useEffect(() => {
    if (!username) return;
    const alVolver = () => {
      if (document.visibilityState === "visible") recargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [username, recargar]);

  if (!authLoading && !username) return <Navigate to="/admin" replace />;
  if (!authLoading && role === "RECEPCION") return <Navigate to="/admin/recepcion" replace />;

  async function guardar(datos: { equipo_id: number; juez: string; valores: ValoresHoja }): Promise<boolean> {
    setGuardando(true);
    setErrorForm(null);
    try {
      if (editando) {
        await apiFetch<HojaOut>(`/admin/juegos/hojas/${editando.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(datos),
        });
      } else {
        await apiFetch<HojaOut>(`/admin/juegos/${vista}/hojas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(datos),
        });
      }
      setToast(editando ? "Hoja actualizada." : "Hoja guardada.");
      setEditando(null);
      await recargar();
      return true;
    } catch (err) {
      setErrorForm(err instanceof ApiError ? err.message : "No se pudo guardar la hoja. Intenta de nuevo.");
      return false;
    } finally {
      setGuardando(false);
    }
  }

  async function guardarEstacion(estacion: string, filas: FilaEstacion[]): Promise<boolean> {
    setGuardando(true);
    setErrorForm(null);
    try {
      await apiFetch<HojaOut[]>(`/admin/juegos/${vista}/estaciones/${estacion}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filas }),
      });
      setToast("Estación guardada.");
      await recargar();
      return true;
    } catch (err) {
      setErrorForm(err instanceof ApiError ? err.message : "No se pudo guardar la estación. Intenta de nuevo.");
      return false;
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(hoja: HojaOut) {
    try {
      await apiFetch(`/admin/juegos/hojas/${hoja.id}`, { method: "DELETE" });
      if (editando?.id === hoja.id) setEditando(null);
      setToast("Hoja borrada.");
      await recargar();
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "No se pudo borrar la hoja.");
    }
  }

  function editar(hoja: HojaOut) {
    setEditando(hoja);
    setErrorForm(null);
    // El formulario está arriba de la lista: se lleva la vista hasta él para que se note que cambió a "editando".
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: reducirMovimiento ? "auto" : "smooth", block: "start" }));
  }

  const juegos: JuegoInfo[] = posiciones?.juegos ?? [];

  /** Después de sumar, editar o borrar puntos extra: avisa y vuelve a pedir posiciones y el juego abierto. */
  async function alCambiarExtra(mensaje: string) {
    setToast(mensaje);
    await recargar();
  }

  return (
    <div className="page-container juegos">
      <Reveal>
        <p className="eyebrow">Panel administrativo</p>
        <h1 className="display-title juegos-titulo">Juegos</h1>
        <p className="muted">
          {canEdit
            ? "Vacía aquí las hojas de los jueces y los puntos se suman solos por equipo."
            : "Calificaciones de los juegos por equipo. Solo un administrador puede capturarlas."}
        </p>
      </Reveal>

      <div className="juegos-tabs" role="tablist" aria-label="Juegos">
        <button
          type="button"
          role="tab"
          aria-selected={vista === "posiciones"}
          className={`juegos-tab ${vista === "posiciones" ? "is-active" : ""}`}
          onClick={() => setVista("posiciones")}
        >
          Posiciones
        </button>
        {juegos.map((j) => (
          <button
            type="button"
            role="tab"
            key={j.clave}
            aria-selected={vista === j.clave}
            className={`juegos-tab ${vista === j.clave ? "is-active" : ""}`}
            onClick={() => setVista(j.clave)}
          >
            {j.nombre}
            {j.criterios.length === 0 && j.modo === "jueces" && <span className="juegos-tab-pronto">pronto</span>}
          </button>
        ))}
      </div>

      <div className="juegos-contenido">
        {cargando || (vista !== "posiciones" && !detalle) ? (
          <div className="glass-card juegos-tarjeta" aria-busy="true">
            <Skeleton height={20} width="35%" />
            <Skeleton height={14} width="80%" className="juegos-skeleton" />
            <Skeleton height={14} width="65%" className="juegos-skeleton" />
            <Skeleton height={14} width="72%" className="juegos-skeleton" />
          </div>
        ) : vista === "posiciones" ? (
          posiciones && (
            <VistaPosiciones datos={posiciones} esEscritorio={esEscritorio} canEdit={canEdit} onCambioExtra={alCambiarExtra} />
          )
        ) : (
          detalle &&
          (detalle.juego.modo === "torneo" ? (
            <VistaTorneo
              detalle={detalle}
              juegos={juegos}
              onCambio={alCambiarExtra}
              onAviso={setToast}
              esEscritorio={esEscritorio}
              canEdit={canEdit}
            />
          ) : detalle.juego.modo === "estaciones" ? (
            <VistaEstaciones
              detalle={detalle}
              juegos={juegos}
              onCambioExtra={alCambiarExtra}
              esEscritorio={esEscritorio}
              canEdit={canEdit}
              guardando={guardando}
              errorForm={errorForm}
              onGuardar={guardarEstacion}
              onLimpiarError={() => setErrorForm(null)}
            />
          ) : (
            <VistaJuego
              detalle={detalle}
              juegos={juegos}
              onCambioExtra={alCambiarExtra}
              esEscritorio={esEscritorio}
              canEdit={canEdit}
              editando={editando}
              guardando={guardando}
              errorForm={errorForm}
              formRef={formRef}
              onGuardar={guardar}
              onEditar={editar}
              onCancelarEdicion={() => {
                setEditando(null);
                setErrorForm(null);
              }}
              onBorrar={borrar}
            />
          ))
        )}
      </div>

      <Toast message={toast} />
    </div>
  );
}
