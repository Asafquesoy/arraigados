import type { JuegoDetalle } from "../lib/api";
import { textoSobre } from "../lib/colorEquipo";
import { fmtTiempo } from "../lib/estaciones";
import { fmtPts } from "../lib/juegos";
import "./EstacionesCaptura.css";

function Pos({ valor }: { valor: number | null }) {
  return (
    <span className={`juegos-pos mono ${valor === 1 ? "is-primero" : ""}`} aria-label={valor ? `Lugar ${valor}` : "Sin lugar todavía"}>
      {valor ?? "–"}
    </span>
  );
}

function Chip({ nombre, color }: { nombre: string; color: string }) {
  return (
    <span className="juegos-equipo" style={{ background: color, color: textoSobre(color) }}>
      {nombre}
    </span>
  );
}

/**
 * Resultados de un juego por estaciones: puntos de cada equipo en cada estación, total, tiempo que
 * cuenta para el desempate y lugar. Tabla desde 1024px; tarjetas debajo (misma elección que el resto
 * de pantallas de /admin/juegos, hecha por el padre con `useMediaQuery`).
 */
export function ResultadosEstaciones({ detalle, esEscritorio }: { detalle: JuegoDetalle; esEscritorio: boolean }) {
  const { juego, equipos } = detalle;
  const estaciones = juego.estaciones;
  const regla =
    juego.clave === "rally_sucio"
      ? "Si hay empate gana quien sumó menos tiempo en los 10 juegos (un juego sin terminar o sin jugar cuenta con su tiempo límite)."
      : "Si hay empate gana quien sumó menos tiempo en las estaciones que completó (la capilla no cuenta para el tiempo).";

  const tiempo = (s: number | null) => (s === null ? "—" : fmtTiempo(s));

  return (
    <div className="glass-card juegos-tarjeta">
      <h2 className="juegos-subtitulo">Resultados</h2>
      <p className="muted juegos-nota">
        El puntaje de cada equipo es la suma de sus estaciones; el juego vale {juego.puntos_max} puntos. {regla}
      </p>

      {esEscritorio ? (
        <table className="juegos-tabla juegos-tabla-estaciones">
          <thead>
            <tr>
              <th className="juegos-col-pos">#</th>
              <th className="col-equipo">Equipo</th>
              {estaciones.map((e) => (
                <th className="num col-estacion" key={e.clave} title={`${e.nombre} · hasta ${e.puntos_max}`}>
                  {e.nombre}
                </th>
              ))}
              <th className="num col-total">
                Total<small>/ {juego.puntos_max}</small>
              </th>
              <th className="num col-tiempo">Tiempo</th>
            </tr>
          </thead>
          <tbody>
            {equipos.map((e) => (
              <tr key={e.equipo_id}>
                <td className="juegos-col-pos">
                  <Pos valor={e.posicion} />
                </td>
                <td>
                  <Chip nombre={e.nombre} color={e.color} />
                </td>
                {estaciones.map((s) => (
                  <td className="num" key={s.clave}>
                    {s.clave in e.por_criterio ? fmtPts(e.por_criterio[s.clave]) : <span className="muted">—</span>}
                  </td>
                ))}
                <td className="num juegos-total">{e.hojas ? fmtPts(e.total) : <span className="muted">—</span>}</td>
                <td className="num">{e.hojas ? tiempo(e.tiempo_seg) : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="juegos-lista-tarjetas">
          {equipos.map((e) => (
            <li className="juegos-equipo-card" key={e.equipo_id}>
              <div className="juegos-equipo-card-cabecera">
                <Pos valor={e.posicion} />
                <Chip nombre={e.nombre} color={e.color} />
                <span className="juegos-total mono">{e.hojas ? fmtPts(e.total) : "—"}</span>
              </div>
              <p className="muted juegos-nota">
                {e.hojas === 0 ? "Sin estaciones todavía" : `${e.hojas} de ${estaciones.length} estaciones`}
                {e.hojas > 0 && ` · tiempo ${tiempo(e.tiempo_seg)}`}
              </p>
              {e.hojas > 0 && (
                <dl className="juegos-desglose juegos-desglose-estaciones">
                  {estaciones.map((s) => (
                    <div key={s.clave}>
                      <dt className="muted">{s.nombre}</dt>
                      <dd className="mono">{s.clave in e.por_criterio ? fmtPts(e.por_criterio[s.clave]) : "—"}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
