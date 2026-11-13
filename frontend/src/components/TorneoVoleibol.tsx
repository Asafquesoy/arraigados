import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BotonCopiar } from "./BotonCopiar";
import { ConfirmButton } from "./ConfirmButton";
import { EquipoPastilla, TorneoPartido } from "./TorneoPartido";
import { apiFetch, ApiError, type EmpateTorneo, type FilaTablaTorneo, type LugarFinal, type MarcadorTorneo, type PartidoTorneo, type Torneo } from "../lib/api";
import { TITULO_RONDA, textoEmpate, textoLugaresFinales, textoPartidos, textoTabla } from "../lib/torneo";
import "./TorneoVoleibol.css";

interface TorneoVoleibolProps {
  clave: string;
  torneo: Torneo;
  /** Cuántos equipos hay hoy (antes del sorteo, el torneo todavía no sabe cuántos juegan). */
  nEquipos: number;
  canEdit: boolean;
  esEscritorio: boolean;
  /** Avisa con un toast y vuelve a pedir el juego y las posiciones. */
  onCambio: (mensaje: string) => Promise<void>;
  /** Solo un toast (errores). */
  onAviso: (mensaje: string) => void;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

function fmtDif(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
}

function vs(p: PartidoTorneo): string {
  return `${p.a.nombre} vs ${p.b.nombre}`;
}

function origenLugar(l: LugarFinal): string {
  if (l.origen === "final") return l.lugar === 1 ? "Ganó la gran final" : "Perdió la gran final";
  if (l.origen === "tercero") return l.lugar === 3 ? "Ganó el tercer lugar" : "Perdió el tercer lugar";
  return `${l.lugar}.º de la tabla`;
}

// ---- Un empate exacto de la tabla: volado de la app, o se anota lo que se decidió en la cancha ----

function EmpateCard({
  empate,
  canEdit,
  ocupado,
  onResolver,
}: {
  empate: EmpateTorneo;
  canEdit: boolean;
  ocupado: boolean;
  onResolver: (empate: EmpateTorneo, orden?: number[]) => Promise<void>;
}) {
  const [enCancha, setEnCancha] = useState(false);
  const [orden, setOrden] = useState<number[]>([]);
  const n = empate.equipos.length;

  async function guardarOrden() {
    const faltante = empate.equipos.map((e) => e.id).filter((id) => !orden.includes(id));
    await onResolver(empate, [...orden, ...faltante]);
    setEnCancha(false);
    setOrden([]);
  }

  return (
    <li className="torneo-empate">
      <p className="torneo-empate-titulo">{textoEmpate(empate)}</p>
      <div className="torneo-empate-equipos">
        {empate.equipos.map((e) => (
          <EquipoPastilla key={e.id} equipo={e} />
        ))}
      </div>
      <p className="muted torneo-ayuda">
        {empate.tipo === "punto_oro"
          ? "Decide quién va a la final o al tercer lugar: se resuelve con un punto de oro (una sola jugada entre los dos) o con un volado."
          : "Tienen las mismas victorias, diferencia y puntos a favor: se resuelve con un volado."}
        {!empate.bloquea && " No impide armar las finales, pero hay que resolverlo antes de cerrar el torneo."}
      </p>

      {canEdit && !enCancha && (
        <div className="torneo-acciones">
          <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => void onResolver(empate)}>
            Hacer volado aquí
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => setEnCancha(true)}>
            Lo decidimos en la cancha
          </button>
        </div>
      )}

      {canEdit && enCancha && (
        <>
          <p className="torneo-ayuda" id={`orden-${empate.equipos[0].id}`}>
            Toca los equipos en el orden en que quedaron (el que gana va primero):
          </p>
          <div className="torneo-orden" role="group" aria-labelledby={`orden-${empate.equipos[0].id}`}>
            {empate.equipos.map((e) => {
              const lugar = orden.indexOf(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  className={`torneo-chip torneo-orden-equipo ${lugar >= 0 ? "is-activo" : ""}`}
                  aria-pressed={lugar >= 0}
                  disabled={ocupado || lugar >= 0}
                  onClick={() => setOrden([...orden, e.id])}
                >
                  {lugar >= 0 && <span className="mono torneo-orden-num">{lugar + 1}.º</span>}
                  {e.nombre}
                </button>
              );
            })}
          </div>
          <div className="torneo-acciones">
            <button type="button" className="btn btn-primary btn-sm" disabled={ocupado || orden.length < n - 1} onClick={() => void guardarOrden()}>
              Guardar orden
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado || orden.length === 0} onClick={() => setOrden([])}>
              Borrar selección
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={ocupado}
              onClick={() => {
                setEnCancha(false);
                setOrden([]);
              }}
            >
              Cancelar
            </button>
          </div>
        </>
      )}
    </li>
  );
}

// ---- Tabla de posiciones del torneo ----

function TablaTorneo({ titulo, filas, esEscritorio, nota }: { titulo: string; filas: FilaTablaTorneo[]; esEscritorio: boolean; nota?: string }) {
  // Mientras la ronda va a medias, quien todavía no juega no tiene lugar (todos empatarían en «2.º»).
  const lugar = (f: FilaTablaTorneo) => (f.jugados === 0 ? "–" : f.lugar);
  const marca = (f: FilaTablaTorneo) =>
    f.empate ? <span className="torneo-marca is-empate">Empate</span> : f.por_volado ? <span className="torneo-marca">Volado</span> : null;
  return (
    <div className="glass-card juegos-tarjeta">
      <div className="juegos-cabecera-tarjeta">
        <h2 className="juegos-subtitulo">{titulo}</h2>
        <BotonCopiar label="Copiar tabla" texto={() => textoTabla(titulo, filas)} />
      </div>
      {nota && <p className="muted juegos-nota">{nota}</p>}
      {esEscritorio ? (
        <table className="juegos-tabla">
          <thead>
            <tr>
              <th className="juegos-col-pos">#</th>
              <th>Equipo</th>
              <th className="num">Victorias</th>
              <th className="num">Puntos a favor – en contra</th>
              <th className="num">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.equipo.id}>
                <td className="juegos-col-pos">
                  <span className="juegos-pos mono">{lugar(f)}</span>
                </td>
                <td>
                  <EquipoPastilla equipo={f.equipo} /> {marca(f)}
                </td>
                <td className="num">{f.victorias}</td>
                <td className="num">
                  {f.f} – {f.c}
                </td>
                <td className="num">{fmtDif(f.dif)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="torneo-tabla-lista">
          {filas.map((f) => (
            <li className="torneo-tabla-fila" key={f.equipo.id}>
              <span className="juegos-pos mono">{lugar(f)}</span>
              <div className="torneo-tabla-equipo">
                <div>
                  <EquipoPastilla equipo={f.equipo} /> {marca(f)}
                </div>
                {/* Tres piezas que no se parten: si no caben en un renglón, bajan completas. */}
                <p className="muted mono torneo-tabla-datos">
                  <span>
                    {f.victorias} {f.victorias === 1 ? "victoria" : "victorias"}
                  </span>
                  <span>
                    {f.f}–{f.c}
                  </span>
                  <span>dif. {fmtDif(f.dif)}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Pantalla del torneo ----

export function TorneoVoleibol({ clave, torneo, nEquipos, canEdit, esEscritorio, onCambio, onAviso }: TorneoVoleibolProps) {
  const [ocupado, setOcupado] = useState(false);
  const base = `/admin/juegos/${clave}/torneo`;
  const sig = torneo.siguiente;
  const porSlot = new Map(torneo.partidos.map((p) => [p.slot, p]));
  const enCancha = sig.en_cancha ? porSlot.get(sig.en_cancha) : undefined;
  const proximo = sig.proximo ? porSlot.get(sig.proximo) : undefined;

  async function ejecutar(f: () => Promise<unknown>, mensaje: string) {
    setOcupado(true);
    try {
      await f();
      await onCambio(mensaje);
    } catch (err) {
      onAviso(err instanceof ApiError ? err.message : "No se pudo completar la acción. Intenta de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  const post = (ruta: string, cuerpo?: unknown) =>
    apiFetch<Torneo>(`${base}${ruta}`, { method: "POST", headers: JSON_HEADERS, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const borrar = (ruta: string) => apiFetch<Torneo>(`${base}${ruta}`, { method: "DELETE" });

  async function guardarMarcador(slot: string, marcador: MarcadorTorneo): Promise<string | null> {
    setOcupado(true);
    try {
      await apiFetch<Torneo>(`${base}/partidos/${slot}`, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(marcador) });
      await onCambio(marcador.limpiar ? "Marcador quitado." : "Marcador guardado.");
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : "No se pudo guardar el marcador. Intenta de nuevo.";
    } finally {
      setOcupado(false);
    }
  }

  async function resolverEmpate(empate: EmpateTorneo, orden?: number[]) {
    setOcupado(true);
    try {
      const t = await post("/desempates", { ronda: empate.ronda, equipos: empate.equipos.map((e) => e.id), orden });
      const ids = new Set(empate.equipos.map((e) => e.id));
      const filas = (empate.ronda === "r1" ? t.tabla_r1 : t.tabla_r2) ?? [];
      const nombres = filas.filter((f) => ids.has(f.equipo.id)).sort((a, b) => a.lugar - b.lugar).map((f) => f.equipo.nombre);
      await onCambio(nombres.length === 2 ? `Ganó ${nombres[0]}.` : `Orden: ${nombres.join(", ")}.`);
    } catch (err) {
      onAviso(err instanceof ApiError ? err.message : "No se pudo resolver el empate. Intenta de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  // ---- qué sigue ----
  const empatesBloquean = torneo.empates.some((e) => e.bloquea);
  let titulo = "";
  let cuerpo: ReactNode = null;
  let boton: ReactNode = null;

  switch (sig.accion) {
    case "sin_equipos":
      titulo = "Faltan equipos";
      cuerpo = (
        <p>
          El torneo necesita un número par de equipos (mínimo 4) y ahora hay {nEquipos}. Créalos o corrígelos en <Link to="/admin/equipos">Equipos</Link>.
        </p>
      );
      break;
    case "sortear":
      titulo = "Haz el sorteo";
      cuerpo = <p>Los {nEquipos} equipos se sacan de dos en dos y cada pareja es un partido de la ronda 1. Se puede repetir mientras no haya marcadores.</p>;
      if (canEdit)
        boton = (
          <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => void ejecutar(() => post("/sorteo"), "Sorteo hecho: ya están los partidos de la ronda 1.")}>
            Hacer el sorteo
          </button>
        );
      break;
    case "capturar": {
      const ronda = enCancha ? TITULO_RONDA[enCancha.ronda] : "Torneo";
      titulo = `${ronda}: ${sig.faltan === 1 ? "falta 1 partido" : `faltan ${sig.faltan} partidos`}`;
      cuerpo = (
        <ul className="torneo-turnos">
          {enCancha && (
            <li>
              <span className="torneo-situacion is-en_cancha">En cancha</span>
              <span>
                {enCancha.ronda === "tercero" || enCancha.ronda === "final" ? `${enCancha.etiqueta}: ` : ""}
                <strong>{vs(enCancha)}</strong>
              </span>
            </li>
          )}
          {proximo && (
            <li>
              <span className="torneo-situacion is-proximo">Sigue</span>
              <span>
                {proximo.ronda === "tercero" || proximo.ronda === "final" ? `${proximo.etiqueta}: ` : ""}
                {vs(proximo)} — que ya estén listos al borde
              </span>
            </li>
          )}
        </ul>
      );
      if (canEdit && enCancha?.slot === "tercero")
        boton = (
          <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => void ejecutar(() => post("/tercero/saltar"), "Tercer lugar saltado.")}>
            Saltar el tercer lugar (solo si va atrasado)
          </button>
        );
      break;
    }
    case "desempatar":
      titulo = "Falta resolver un empate";
      cuerpo = (
        <p>
          {torneo.empates.length === 1 ? "Hay un empate exacto" : `Hay ${torneo.empates.length} empates exactos`} en la tabla. Hay que decidirlo con un
          volado antes de {empatesBloquean && torneo.fase === "ronda1" ? "armar la ronda 2" : torneo.fase === "ronda2" ? "armar las finales" : "cerrar el torneo"}.
        </p>
      );
      break;
    case "armar_ronda2":
    case "armar_finales": {
      const esRonda2 = sig.accion === "armar_ronda2";
      titulo = esRonda2 ? "¡Ronda 1 terminada! Sigue la ronda 2" : "¡Ronda 2 terminada! Siguen el tercer lugar y la gran final";
      cuerpo = torneo.propuesta && (
        <>
          <ul className="torneo-propuesta">
            {torneo.propuesta.partidos.map((p) => (
              <li key={p.slot}>
                <span className="torneo-propuesta-etiqueta">{esRonda2 ? `Partido ${p.slot.split("-")[1]}` : p.etiqueta}</span>
                <span>
                  {p.a.nombre} vs {p.b.nombre}
                </span>
              </li>
            ))}
          </ul>
          {torneo.propuesta.cambios.map((c) => (
            <p className="muted torneo-ayuda" key={c}>
              ↔ {c}
            </p>
          ))}
          {torneo.propuesta.ajustada && (
            <p className="muted torneo-ayuda">Los cambios simples no alcanzaron: se buscó el emparejamiento más cercano a la tabla sin repetir partidos.</p>
          )}
          {torneo.propuesta.con_revancha && <p className="field-error">No hay forma de evitar que se repita un partido de la ronda 1.</p>}
          {!esRonda2 && torneo.empates.length > 0 && (
            <p className="muted torneo-ayuda">Queda un empate más abajo en la tabla por resolver; no impide jugar las finales.</p>
          )}
        </>
      );
      if (canEdit)
        boton = (
          <button
            type="button"
            className="btn btn-primary"
            disabled={ocupado}
            onClick={() => void ejecutar(() => post(esRonda2 ? "/ronda2" : "/finales"), esRonda2 ? "Ronda 2 armada." : "Finales armadas.")}
          >
            {esRonda2 ? "Armar la ronda 2" : "Armar tercer lugar y final"}
          </button>
        );
      break;
    }
    case "terminado": {
      const campeon = torneo.lugares?.find((l) => l.lugar === 1);
      titulo = "¡Torneo terminado!";
      cuerpo = (
        <p>
          {campeon && (
            <>
              Campeón: <EquipoPastilla equipo={campeon.equipo} />.{" "}
            </>
          )}
          Los puntos del voleibol ya cuentan en el marcador general (pestaña Posiciones).
        </p>
      );
      break;
    }
  }

  // ---- partidos agrupados, lo más reciente primero ----
  const grupos = [
    { id: "r1", titulo: "Ronda 1", partidos: torneo.partidos.filter((p) => p.ronda === "r1") },
    { id: "r2", titulo: "Ronda 2", partidos: torneo.partidos.filter((p) => p.ronda === "r2") },
    { id: "finales", titulo: "Tercer lugar y gran final", partidos: torneo.partidos.filter((p) => p.ronda === "tercero" || p.ronda === "final") },
  ]
    .filter((g) => g.partidos.length > 0)
    .reverse();

  const hayJugadosR1 = torneo.tabla_r1?.some((f) => f.jugados > 0);
  const hayJugadosR2 = torneo.tabla_r2?.some((f) => f.jugados > 0);
  const r2Jugados = torneo.partidos.some((p) => p.ronda === "r2" && p.jugado);
  const finalesJugados = torneo.partidos.some((p) => (p.ronda === "tercero" || p.ronda === "final") && p.jugado);
  const hayFinales = torneo.partidos.some((p) => p.ronda === "tercero" || p.ronda === "final");
  const hayR2 = torneo.partidos.some((p) => p.ronda === "r2");

  return (
    <>
      <div className="glass-card juegos-tarjeta torneo-siguiente" aria-live="polite">
        <p className="eyebrow">Qué sigue</p>
        <h2 className="juegos-subtitulo">{titulo}</h2>
        <div className="torneo-siguiente-cuerpo">{cuerpo}</div>

        {torneo.empates.length > 0 && (
          <ul className="torneo-empates">
            {torneo.empates.map((e) => (
              <EmpateCard key={`${e.ronda}-${e.equipos.map((x) => x.id).join("-")}`} empate={e} canEdit={canEdit} ocupado={ocupado} onResolver={resolverEmpate} />
            ))}
          </ul>
        )}

        {torneo.tercero_saltado && sig.accion !== "terminado" && (
          <p className="muted torneo-ayuda">
            El tercer lugar se saltó: el 3.º y el 4.º se quedan como estaban en la tabla.{" "}
            {canEdit && (
              <button type="button" className="torneo-enlace" disabled={ocupado} onClick={() => void ejecutar(() => borrar("/tercero/saltar"), "El tercer lugar vuelve a jugarse.")}>
                Mejor jugarlo
              </button>
            )}
          </p>
        )}

        {torneo.avisos.map((a) => (
          <p className="torneo-aviso" role="status" key={a}>
            {a}
          </p>
        ))}

        {boton && <div className="torneo-acciones">{boton}</div>}
        {!canEdit && sig.accion !== "terminado" && <p className="muted torneo-ayuda">Solo un administrador puede sortear y capturar marcadores.</p>}
      </div>

      {grupos.map((g, i) => {
        const completo = g.partidos.every((p) => p.jugado || p.saltado);
        const contenido = (
          <ul className="torneo-partidos">
            {g.partidos.map((p) => (
              <TorneoPartido
                key={p.slot}
                partido={p}
                canEdit={canEdit}
                ocupado={ocupado}
                onGuardar={guardarMarcador}
                onQuitar={async (slot) => {
                  await guardarMarcador(slot, { pa: null, pb: null, termino: null, limpiar: true });
                }}
              />
            ))}
          </ul>
        );
        return (
          <div className="glass-card juegos-tarjeta" key={g.id}>
            <div className="juegos-cabecera-tarjeta">
              <h2 className="juegos-subtitulo">{g.titulo}</h2>
              <BotonCopiar label="Copiar partidos" texto={() => textoPartidos(g.titulo, g.partidos)} />
            </div>
            {completo && i > 0 ? (
              <details className="torneo-plegable">
                <summary>
                  {g.partidos.length === 1 ? "1 partido jugado" : `${g.partidos.length} partidos jugados`} · ver marcadores
                </summary>
                {contenido}
              </details>
            ) : (
              contenido
            )}
          </div>
        );
      })}

      {torneo.tabla_r2 && hayJugadosR2 && (
        <TablaTorneo
          titulo="Tabla tras la ronda 2"
          filas={torneo.tabla_r2}
          esEscritorio={esEscritorio}
          nota="Suma los partidos de la ronda 1 y la ronda 2. Con ella se arman la gran final y el tercer lugar."
        />
      )}
      {torneo.tabla_r1 && hayJugadosR1 && (
        <TablaTorneo
          titulo="Tabla tras la ronda 1"
          filas={torneo.tabla_r1}
          esEscritorio={esEscritorio}
          nota="Más victorias, luego mejor diferencia (puntos a favor menos en contra), luego más puntos a favor. Si sigue el empate: volado."
        />
      )}

      {torneo.lugares && (
        <div className="glass-card juegos-tarjeta">
          <div className="juegos-cabecera-tarjeta">
            <h2 className="juegos-subtitulo">{torneo.definitivo ? "Lugares finales y puntos" : "Lugares provisionales"}</h2>
            <BotonCopiar label="Copiar lugares" texto={() => textoLugaresFinales(torneo.lugares ?? [], torneo.definitivo)} />
          </div>
          <p className="muted juegos-nota">
            {torneo.definitivo
              ? "Estos puntos ya están sumados al marcador general."
              : "Todavía faltan partidos o empates por resolver: los puntos se suman al marcador general cuando termine el torneo."}
          </p>
          <ul className="torneo-lugares">
            {torneo.lugares.map((l) => (
              <li className="torneo-lugar" key={l.equipo.id}>
                <span className={`juegos-pos mono ${l.lugar === 1 ? "is-primero" : ""}`}>{l.lugar}</span>
                <div className="torneo-lugar-equipo">
                  <EquipoPastilla equipo={l.equipo} />
                  <span className="muted torneo-ayuda">{origenLugar(l)}</span>
                </div>
                <span className="juegos-total mono">{l.puntos} pts</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canEdit && torneo.fase !== "sin_sorteo" && (
        <details className="glass-card juegos-tarjeta torneo-opciones">
          <summary>Opciones del torneo</summary>
          <p className="muted juegos-nota">Para corregir un error grande. Un marcador mal puesto se arregla directo en su partido con «Corregir».</p>
          <div className="torneo-acciones">
            {torneo.fase === "ronda1" && !torneo.hay_marcadores && !hayR2 && (
              <ConfirmButton
                label="Volver a sortear"
                confirmLabel="¿Seguro? Se sortea otra vez"
                className="btn-sm"
                disabled={ocupado}
                onConfirm={() => void ejecutar(() => post("/sorteo"), "Nuevo sorteo hecho.")}
              />
            )}
            {torneo.fase === "ronda2" && !r2Jugados && (
              <ConfirmButton
                label="Deshacer la ronda 2"
                confirmLabel="¿Seguro? Se quitan sus partidos"
                className="btn-sm"
                disabled={ocupado}
                onConfirm={() => void ejecutar(() => borrar("/ronda2"), "Ronda 2 deshecha: se puede armar otra vez.")}
              />
            )}
            {hayFinales && !finalesJugados && (
              <ConfirmButton
                label="Deshacer las finales"
                confirmLabel="¿Seguro? Se quitan sus partidos"
                className="btn-sm"
                disabled={ocupado}
                onConfirm={() => void ejecutar(() => borrar("/finales"), "Finales deshechas: se pueden armar otra vez.")}
              />
            )}
            <ConfirmButton
              label="Reiniciar el torneo"
              confirmLabel="¿Seguro? Se borra todo"
              className="btn-sm"
              disabled={ocupado}
              onConfirm={() => void ejecutar(() => borrar(""), "Torneo reiniciado.")}
            />
          </div>
        </details>
      )}
    </>
  );
}
