import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import type { HojaOut, JuegoInfo, ResultadoEquipoJuego, ValoresHoja } from "../lib/api";
import { fmtPts, puntosCriterio } from "../lib/juegos";
import "./HojaCalificacion.css";

/** Lo que hay escrito en cada criterio: texto del campo numérico (escala) o sí/no/sin elegir. */
type Borrador = Record<string, string | boolean | null>;

interface HojaCalificacionProps {
  juego: JuegoInfo;
  equipos: ResultadoEquipoJuego[];
  /** Hojas ya capturadas de este juego: de ahí salen los jueces sugeridos y los equipos que cada juez ya calificó. */
  hojas: HojaOut[];
  /** Si viene, el formulario edita esa hoja en vez de crear una nueva. */
  inicial?: HojaOut | null;
  guardando: boolean;
  /** Error del servidor (p. ej. 409 juez repetido). */
  error: string | null;
  /** Devuelve `true` si se guardó. */
  onGuardar: (datos: { equipo_id: number; juez: string; valores: ValoresHoja }) => Promise<boolean>;
  onCancelar?: () => void;
}

function borradorInicial(juego: JuegoInfo, hoja?: HojaOut | null): Borrador {
  const b: Borrador = {};
  for (const c of juego.criterios) {
    const v = hoja?.valores[c.clave];
    b[c.clave] = c.tipo === "si_no" ? (typeof v === "boolean" ? v : null) : typeof v === "number" ? String(v) : "";
  }
  return b;
}

/**
 * Formulario de una hoja de juez, dibujado a partir de los criterios del juego (ver
 * `backend/app/juegos.py`): un campo numérico por criterio de escala y un Sí/No grande por
 * criterio de sí/no, con los puntos que vale lo escrito y el total de la hoja en vivo. Sirve
 * para cualquier juego: no tiene nada del sketch adentro. Al guardar una hoja nueva conserva el
 * juez (lo normal es vaciar varias hojas seguidas de la misma persona) y limpia lo demás.
 */
export function HojaCalificacion({ juego, equipos, hojas, inicial, guardando, error, onGuardar, onCancelar }: HojaCalificacionProps) {
  const uid = useId();
  const equipoRef = useRef<HTMLSelectElement>(null);
  const [equipoId, setEquipoId] = useState(inicial ? String(inicial.equipo_id) : "");
  const [juez, setJuez] = useState(inicial?.juez ?? "");
  const [valores, setValores] = useState<Borrador>(() => borradorInicial(juego, inicial));
  const [errores, setErrores] = useState<Record<string, string>>({});

  const jueces = useMemo(() => [...new Set(hojas.map((h) => h.juez))].sort((a, b) => a.localeCompare(b, "es")), [hojas]);

  // Equipos que este juez ya calificó (sin contar la hoja que se está editando): no se pueden repetir.
  const yaCalificados = useMemo(() => {
    const nombre = juez.trim().toLowerCase();
    if (!nombre) return new Set<number>();
    return new Set(
      hojas.filter((h) => h.juez.toLowerCase() === nombre && h.id !== inicial?.id).map((h) => h.equipo_id),
    );
  }, [hojas, juez, inicial?.id]);

  const { subtotal, faltan } = useMemo(() => {
    let suma = 0;
    let sinCalificar = 0;
    for (const c of juego.criterios) {
      const b = valores[c.clave];
      const pts = puntosCriterio(c, c.tipo === "si_no" ? (b as boolean | null) : b === "" ? null : Number(b));
      if (pts === null) sinCalificar += 1;
      else suma += pts;
    }
    return { subtotal: suma, faltan: sinCalificar };
  }, [juego.criterios, valores]);

  function validar(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!equipoId) e.equipo = "Elige el equipo.";
    if (!juez.trim()) e.juez = "Escribe el nombre o número del juez.";
    for (const c of juego.criterios) {
      const b = valores[c.clave];
      if (c.tipo === "si_no") {
        if (b === null) e[c.clave] = "Elige sí o no.";
      } else if (b === "" || puntosCriterio(c, Number(b)) === null) {
        e[c.clave] = `Un número entero de 0 a ${c.escala_max}.`;
      }
    }
    return e;
  }

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    const e = validar();
    setErrores(e);
    if (Object.keys(e).length > 0) return;

    const datos: ValoresHoja = {};
    for (const c of juego.criterios) {
      datos[c.clave] = c.tipo === "si_no" ? (valores[c.clave] as boolean) : Number(valores[c.clave]);
    }
    const ok = await onGuardar({ equipo_id: Number(equipoId), juez: juez.trim(), valores: datos });
    if (ok && !inicial) {
      setEquipoId("");
      setValores(borradorInicial(juego));
      setErrores({});
      equipoRef.current?.focus();
    }
  }

  function cambiar(clave: string, valor: string | boolean) {
    setValores((prev) => ({ ...prev, [clave]: valor }));
    setErrores((prev) => {
      if (!prev[clave]) return prev;
      const { [clave]: _quitado, ...resto } = prev;
      return resto;
    });
  }

  return (
    <form className="hoja-form" onSubmit={enviar} noValidate>
      <div className="hoja-form-cabecera">
        <div className={`field ${errores.equipo ? "has-error" : ""}`}>
          <label htmlFor={`${uid}-equipo`}>Equipo</label>
          <select
            id={`${uid}-equipo`}
            ref={equipoRef}
            value={equipoId}
            onChange={(e) => {
              setEquipoId(e.target.value);
              setErrores((prev) => ({ ...prev, equipo: "" }));
            }}
          >
            <option value="">Elige un equipo…</option>
            {equipos.map((eq) => (
              <option key={eq.equipo_id} value={eq.equipo_id} disabled={yaCalificados.has(eq.equipo_id)}>
                {eq.nombre}
                {yaCalificados.has(eq.equipo_id) ? " · ya calificado por este juez" : ""}
              </option>
            ))}
          </select>
          {errores.equipo && <p className="field-error">{errores.equipo}</p>}
        </div>

        <div className={`field ${errores.juez ? "has-error" : ""}`}>
          <label htmlFor={`${uid}-juez`}>Juez (nombre o número)</label>
          <input
            id={`${uid}-juez`}
            type="text"
            list={`${uid}-jueces`}
            value={juez}
            maxLength={80}
            autoComplete="off"
            placeholder="Juez 1"
            onChange={(e) => {
              setJuez(e.target.value);
              setErrores((prev) => ({ ...prev, juez: "" }));
            }}
          />
          <datalist id={`${uid}-jueces`}>
            {jueces.map((j) => (
              <option key={j} value={j} />
            ))}
          </datalist>
          {errores.juez && <p className="field-error">{errores.juez}</p>}
        </div>
      </div>

      <div className="hoja-criterios">
        {juego.criterios.map((c) => {
          const valor = valores[c.clave];
          const pts = puntosCriterio(c, c.tipo === "si_no" ? (valor as boolean | null) : valor === "" ? null : Number(valor));
          return (
            <div className={`hoja-criterio ${errores[c.clave] ? "has-error" : ""}`} key={c.clave}>
              <div className="hoja-criterio-texto">
                <p className="hoja-criterio-nombre">
                  {c.nombre} <span className="hoja-criterio-vale mono">vale {c.puntos}</span>
                </p>
                {c.descripcion && <p className="muted hoja-criterio-desc">{c.descripcion}</p>}
              </div>

              <div className="hoja-criterio-control">
                {c.tipo === "escala" ? (
                  <div className="hoja-escala">
                    <div className="field hoja-escala-campo">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={c.escala_max}
                        step={1}
                        value={valor as string}
                        aria-label={`${c.nombre}: calificación de 0 a ${c.escala_max}`}
                        aria-invalid={errores[c.clave] ? true : undefined}
                        onChange={(e) => cambiar(c.clave, e.target.value)}
                      />
                    </div>
                    <span className="muted hoja-escala-de">/ {c.escala_max}</span>
                    <span className="hoja-criterio-pts mono">{pts === null ? "—" : `${fmtPts(pts)} pts`}</span>
                  </div>
                ) : (
                  <div className="hoja-sino" role="radiogroup" aria-label={c.nombre}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={valor === true}
                      className={`hoja-sino-btn ${valor === true ? "is-si" : ""}`}
                      onClick={() => cambiar(c.clave, true)}
                    >
                      Sí <span className="mono">+{c.puntos}</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={valor === false}
                      className={`hoja-sino-btn ${valor === false ? "is-no" : ""}`}
                      onClick={() => cambiar(c.clave, false)}
                    >
                      No <span className="mono">+0</span>
                    </button>
                  </div>
                )}
              </div>
              {errores[c.clave] && <p className="field-error hoja-criterio-error">{errores[c.clave]}</p>}
            </div>
          );
        })}
      </div>

      <div className="hoja-total" aria-live="polite">
        <span>Total de la hoja</span>
        <strong className="mono">
          {fmtPts(subtotal)} / {juego.puntos_max}
        </strong>
        {faltan > 0 && <span className="muted hoja-total-faltan">{faltan === 1 ? "falta 1 criterio" : `faltan ${faltan} criterios`}</span>}
      </div>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <div className="hoja-acciones">
        <button type="submit" className="btn btn-primary" disabled={guardando}>
          {guardando && <span className="spinner" />}
          {guardando ? "Guardando..." : inicial ? "Guardar cambios" : "Guardar hoja"}
        </button>
        {onCancelar && (
          <button type="button" className="btn btn-ghost" onClick={onCancelar} disabled={guardando}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
