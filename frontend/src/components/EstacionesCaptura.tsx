import { useCallback, useMemo, useState } from "react";
import type { FilaEstacion, JuegoDetalle } from "../lib/api";
import { HojaCapilla } from "./HojaCapilla";
import { HojaEstacion } from "./HojaEstacion";
import "./EstacionesCaptura.css";

interface EstacionesCapturaProps {
  detalle: JuegoDetalle;
  guardando: boolean;
  /** Error del servidor al guardar la estación abierta. */
  error: string | null;
  /** Devuelve `true` si se guardó (y ya recargó `detalle`). */
  onGuardar: (estacion: string, filas: FilaEstacion[]) => Promise<boolean>;
  onLimpiarError: () => void;
}

/**
 * Captura de un juego por estaciones (Rally sucio, Búsqueda del tesoro): arriba una ficha por
 * estación con cuántos equipos lleva capturados — para ver de un vistazo qué hojas faltan — y
 * abajo la hoja de la estación elegida. Al guardar pasa sola a la siguiente estación sin capturar.
 */
export function EstacionesCaptura({ detalle, guardando, error, onGuardar, onLimpiarError }: EstacionesCapturaProps) {
  const { juego, equipos, hojas } = detalle;

  const capturados = useMemo(() => {
    const por: Record<string, number> = {};
    for (const h of hojas) por[h.juez] = (por[h.juez] ?? 0) + 1;
    return por;
  }, [hojas]);

  const [activa, setActiva] = useState(() => (juego.estaciones.find((e) => !capturados[e.clave]) ?? juego.estaciones[0]).clave);
  const [sucio, setSucio] = useState(false);
  const alCambiar = useCallback((hay: boolean) => setSucio(hay), []);

  const estacion = juego.estaciones.find((e) => e.clave === activa) ?? juego.estaciones[0];
  const meta = (clave: string, tipo: string) => (tipo === "capilla" ? 3 : equipos.length);

  function elegir(clave: string) {
    if (clave === activa) return;
    if (sucio && !window.confirm("Tienes datos sin guardar en esta estación. Si cambias de estación se van a borrar. ¿Cambiar de todos modos?")) return;
    onLimpiarError();
    setSucio(false);
    setActiva(clave);
  }

  async function guardar(filas: FilaEstacion[]): Promise<boolean> {
    const ok = await onGuardar(estacion.clave, filas);
    if (ok && filas.length > 0) {
      // A la siguiente estación sin nada capturado (de la actual hacia adelante, y luego desde el principio).
      const i = juego.estaciones.findIndex((e) => e.clave === estacion.clave);
      const orden = [...juego.estaciones.slice(i + 1), ...juego.estaciones.slice(0, i)];
      const siguiente = orden.find((e) => !capturados[e.clave]);
      if (siguiente) {
        setSucio(false);
        setActiva(siguiente.clave);
      }
    }
    return ok;
  }

  return (
    <div className="glass-card juegos-tarjeta juegos-captura">
      <h2 className="juegos-subtitulo">Capturar hojas del encargado</h2>
      <p className="muted juegos-nota">
        Elige la estación y pasa su hoja renglón por renglón, en el mismo orden del papel. Los puntos se calculan solos.
      </p>

      <div className="estaciones-selector" role="group" aria-label="Estaciones">
        {juego.estaciones.map((e) => {
          const n = capturados[e.clave] ?? 0;
          const total = meta(e.clave, e.tipo);
          const completa = n >= total;
          return (
            <button
              key={e.clave}
              type="button"
              aria-pressed={e.clave === activa}
              className={`estacion-ficha ${e.clave === activa ? "is-activa" : ""} ${completa ? "is-completa" : n > 0 ? "is-parcial" : ""}`}
              onClick={() => elegir(e.clave)}
            >
              <span className="estacion-ficha-nombre">{e.nombre}</span>
              {e.tipo === "busqueda" && e.subtitulo && <span className="estacion-ficha-sub">{e.subtitulo}</span>}
              <span className="estacion-ficha-estado mono">
                {completa ? "✔ " : ""}
                {n}/{total}
              </span>
            </button>
          );
        })}
      </div>

      {estacion.tipo === "capilla" ? (
        <HojaCapilla
          key={estacion.clave}
          estacion={estacion}
          equipos={equipos}
          hojas={hojas}
          guardando={guardando}
          error={error}
          onGuardar={guardar}
          onCambios={alCambiar}
        />
      ) : (
        <HojaEstacion
          key={estacion.clave}
          estacion={estacion}
          equipos={equipos}
          hojas={hojas}
          guardando={guardando}
          error={error}
          onGuardar={guardar}
          onCambios={alCambiar}
        />
      )}
    </div>
  );
}
