import { useEffect, useId, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import type { EstacionInfo, FilaEstacion, HojaOut, ResultadoEquipoJuego } from "../lib/api";
import { textoSobre } from "../lib/colorEquipo";
import { leerTiempo, LUGAR_PUNTOS, puntosCapilla, RECITACION_PUNTOS } from "../lib/estaciones";
import { mantenerVisibleSobreBarra } from "../lib/enfocarVisible";
import { fmtPts } from "../lib/juegos";
import { useAvisoSalida } from "../lib/useAvisoSalida";
import { BarraGuardar } from "./BarraGuardar";
import { CampoTiempo } from "./ControlesHoja";
import { Campo, Seccion, type EstadoVisual } from "./SeccionHoja";
import "./EstacionesCaptura.css";

interface HojaCapillaProps {
  estacion: EstacionInfo;
  equipos: ResultadoEquipoJuego[];
  hojas: HojaOut[];
  guardando: boolean;
  error: string | null;
  onGuardar: (filas: FilaEstacion[]) => Promise<boolean>;
  onCambios: (hayCambios: boolean) => void;
}

type Recitacion = "sin_errores" | "errores" | "leyendo";

interface Lugar {
  equipoId: number | null;
  recitacion: Recitacion | null;
  /** Dígitos del tiempo («250» = 2:50). */
  tiempo: string;
}

const RECITACIONES: { valor: Recitacion; texto: string }[] = [
  { valor: "sin_errores", texto: "Sin errores" },
  { valor: "errores", texto: "1 a 3 errores" },
  { valor: "leyendo", texto: "Leyendo" },
];

const LUGARES = [1, 2, 3] as const;

const vacio = (): Lugar => ({ equipoId: null, recitacion: null, tiempo: "" });
const estaVacio = (l: Lugar) => l.equipoId === null && l.recitacion === null && l.tiempo === "";

/**
 * Hoja de la capilla (la meta de la Búsqueda del tesoro): solo anota a los 3 primeros equipos que
 * resuelven el acertijo, en el orden en que lo hacen, y cómo recitaron Efesios 3:17. Lugar y
 * recitación se suman (hasta 100). A diferencia de las demás estaciones, aquí el renglón es el
 * LUGAR y se elige el equipo, no al revés. Son solo tres, así que van siempre abiertos (sin acordeón),
 * cada uno con sus campos en bloques con título como en el resto de las hojas.
 */
export function HojaCapilla({ estacion, equipos, hojas, guardando, error, onGuardar, onCambios }: HojaCapillaProps) {
  const uid = useId();
  const guardadas = useMemo(() => hojas.filter((h) => h.juez === estacion.clave), [hojas, estacion.clave]);

  const [lugares, setLugares] = useState<Lugar[]>(() =>
    LUGARES.map((n) => {
      const h = guardadas.find((g) => g.valores.lugar === n);
      if (!h) return vacio();
      const t = typeof h.valores.tiempo === "number" ? h.valores.tiempo : null;
      return {
        equipoId: h.equipo_id,
        recitacion: RECITACIONES.some((r) => r.valor === h.valores.recitacion) ? (h.valores.recitacion as Recitacion) : null,
        tiempo: t !== null ? String(Math.floor(t / 60) * 100 + (t % 60)) : "",
      };
    }),
  );
  const [base, setBase] = useState(() => JSON.stringify(lugares));
  const [intentado, setIntentado] = useState(false);

  const sucio = JSON.stringify(lugares) !== base;
  useAvisoSalida(sucio);
  useEffect(() => {
    onCambios(sucio);
  }, [sucio, onCambios]);
  useEffect(() => () => onCambios(false), [onCambios]);

  // Un error por lugar (null = bien o sin llenar).
  const revision = useMemo(
    () =>
      lugares.map((l, i) => {
        if (estaVacio(l)) return { error: null as string | null, puntos: null as number | null, tiempo: null as number | null };
        if (lugares.slice(0, i).some(estaVacio)) {
          return { error: `Llena el ${LUGARES[i - 1]}.º antes que el ${LUGARES[i]}.º.`, puntos: null, tiempo: null };
        }
        if (l.equipoId === null) return { error: "Elige el equipo.", puntos: null, tiempo: null };
        if (l.recitacion === null) return { error: "Marca cómo recitaron: sin errores, 1 a 3 errores o leyendo.", puntos: null, tiempo: null };
        const t = leerTiempo(l.tiempo);
        if (t.error) return { error: t.error, puntos: null, tiempo: null };
        return { error: null, puntos: puntosCapilla(LUGARES[i], l.recitacion), tiempo: t.seg };
      }),
    [lugares],
  );

  const total = revision.reduce((s, r) => s + (r.puntos ?? 0), 0);
  const anotados = lugares.filter((l) => l.equipoId !== null).length;
  const equipoDe = (id: number | null) => equipos.find((e) => e.equipo_id === id);

  function cambiar(i: number, parche: Partial<Lugar>) {
    setLugares((prev) => prev.map((l, k) => (k === i ? { ...l, ...parche } : l)));
  }

  // Enter dentro de una casilla no debe guardar la capilla a medias (es lo que haría el submit implícito).
  function alTeclear(ev: KeyboardEvent<HTMLFormElement>) {
    if (ev.key === "Enter" && (ev.target as HTMLElement).tagName === "INPUT") ev.preventDefault();
  }

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    setIntentado(true);
    if (revision.some((r) => r.error)) return;
    const filas: FilaEstacion[] = lugares.flatMap((l, i) =>
      l.equipoId === null || l.recitacion === null
        ? []
        : [
            {
              equipo_id: l.equipoId,
              valores: {
                lugar: LUGARES[i],
                recitacion: l.recitacion,
                ...(revision[i].tiempo !== null ? { tiempo: revision[i].tiempo as number } : {}),
              },
            },
          ],
    );
    if (filas.length === 0 && guardadas.length > 0) {
      if (!window.confirm("Vaciaste los tres lugares: se va a borrar lo capturado de la capilla. ¿Continuar?")) return;
    }
    if (await onGuardar(filas)) {
      setBase(JSON.stringify(lugares));
      setIntentado(false);
    }
  }

  const hayError = revision.some((r) => r.error);
  const aviso = intentado && hayError ? "Revisa los lugares marcados en rojo." : null;

  return (
    <form className="estacion-hoja estacion-hoja--capilla" onSubmit={enviar} onKeyDown={alTeclear} onFocus={mantenerVisibleSobreBarra} noValidate>
      <div className="estacion-encabezado">
        <h2 className="juegos-subtitulo">{estacion.nombre}</h2>
        <p className="muted estacion-info">
          Solo se anotan los 3 primeros equipos que resuelven el acertijo, en el orden en que lo hacen. Los demás no reciben nada de la capilla.
        </p>
      </div>

      <ul className="capilla-lugares">
        {lugares.map((l, i) => {
          const n = LUGARES[i];
          const r = revision[i];
          const ocupados = new Set(lugares.filter((_, k) => k !== i).map((x) => x.equipoId));
          const mostrarError = intentado ? r.error : null;
          const vacioLugar = estaVacio(l);
          // Verde si está completo; rojo solo si ya se intentó guardar y este lugar tiene algo; hueco si no.
          const est = (completo: boolean): EstadoVisual => (completo ? "completa" : intentado && !vacioLugar ? "falta" : "vacia");
          return (
            <li key={n} className={`capilla-lugar ${mostrarError ? "has-error" : ""}`}>
              <div className="capilla-lugar-cabecera">
                <span className="capilla-lugar-n">{n}.º</span>
                <span className="muted capilla-lugar-vale">por el lugar +{LUGAR_PUNTOS[n]}</span>
                <span className="capilla-lugar-pts mono" aria-label={r.puntos === null ? "Sin puntos todavía" : `${fmtPts(r.puntos)} puntos`}>
                  {r.puntos === null ? <span className="muted">—</span> : fmtPts(r.puntos)}
                </span>
              </div>

              <div className="estacion-secciones">
                <Seccion titulo="Equipo" pista="quién resolvió el acertijo" estado={est(l.equipoId !== null)}>
                  <Campo etiqueta="Elige el equipo" bloque>
                    <div className="capilla-equipos" role="radiogroup" aria-label={`Equipo en el lugar ${n}`} id={`${uid}-${n}`}>
                      {equipos.map((e) => {
                        const elegido = l.equipoId === e.equipo_id;
                        const usado = ocupados.has(e.equipo_id);
                        return (
                          <button
                            key={e.equipo_id}
                            type="button"
                            role="radio"
                            aria-checked={elegido}
                            disabled={usado}
                            title={usado ? "Ya está en otro lugar" : undefined}
                            className={`opcion-chip capilla-equipo ${elegido ? "is-activo" : ""}`}
                            style={elegido ? { background: e.color, color: textoSobre(e.color), borderColor: "transparent" } : undefined}
                            onClick={() => cambiar(i, { equipoId: elegido ? null : e.equipo_id })}
                          >
                            {e.nombre}
                          </button>
                        );
                      })}
                    </div>
                  </Campo>
                </Seccion>

                <Seccion titulo="Recitación" pista="Efesios 3:17 de memoria" estado={est(l.recitacion !== null)}>
                  <Campo etiqueta="¿Cómo recitaron?" bloque>
                    <div className="capilla-recitacion" role="radiogroup" aria-label={`Lugar ${n}, recitación`}>
                      {RECITACIONES.map((o) => (
                        <button
                          key={o.valor}
                          type="button"
                          role="radio"
                          aria-checked={l.recitacion === o.valor}
                          className={`opcion-chip capilla-recitacion-op ${l.recitacion === o.valor ? "is-activo" : ""}`}
                          onClick={() => cambiar(i, { recitacion: l.recitacion === o.valor ? null : o.valor })}
                        >
                          {o.texto} <span className="mono capilla-op-pts">+{RECITACION_PUNTOS[o.valor]}</span>
                        </button>
                      ))}
                    </div>
                  </Campo>
                </Seccion>

                <Seccion titulo="Tiempo" pista="en que resolvió · opcional" estado="ninguno">
                  <Campo etiqueta="Tiempo en que resolvió">
                    <CampoTiempo valor={l.tiempo} etiqueta={`Lugar ${n}, tiempo en que resolvió`} onChange={(tiempo) => cambiar(i, { tiempo })} />
                  </Campo>
                </Seccion>
              </div>

              {l.equipoId !== null && (
                <p className="muted capilla-resumen">
                  {equipoDe(l.equipoId)?.nombre}
                  {r.puntos !== null ? ` · ${fmtPts(r.puntos)} de ${estacion.puntos_max} puntos` : ""}
                </p>
              )}
              {mostrarError && (
                <p className="field-error estacion-error" role="alert">
                  {mostrarError}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <BarraGuardar
        resumen={`${anotados} de 3 equipos`}
        total={total}
        aviso={aviso}
        error={error}
        guardando={guardando}
        sucio={sucio}
        etiqueta="Guardar capilla"
      />
    </form>
  );
}
