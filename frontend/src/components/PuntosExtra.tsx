import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { ConfirmButton } from "./ConfirmButton";
import { apiFetch, ApiError, type JuegoInfo, type PuntosExtra as PuntosExtraFila, type PuntosExtraDatos } from "../lib/api";
import { textoSobre } from "../lib/colorEquipo";
import { formatFechaHora } from "../lib/fecha";
import { fmtPts } from "../lib/juegos";
import "./PuntosExtra.css";

export const PUNTOS_EXTRA_MAX = 10_000;
const MOTIVO_MAX = 200;

interface EquipoMini {
  equipo_id: number;
  nombre: string;
  color: string;
}

interface PuntosExtraProps {
  /** Juego de esta pestaña, o `null` en Posiciones (ahí se ven todos y el formulario arranca en «General»). */
  juegoClave: string | null;
  juegos: JuegoInfo[];
  equipos: EquipoMini[];
  /** Los que se muestran: todos en Posiciones, solo los del juego en la pestaña de un juego. */
  puntosExtra: PuntosExtraFila[];
  canEdit: boolean;
  /** Después de guardar o borrar: el padre avisa con un toast y vuelve a pedir las posiciones. */
  onCambio: (mensaje: string) => Promise<void>;
}

/** «+100» / «−50» (con el signo menos de verdad, que se distingue mejor del guion). */
export function fmtExtra(puntos: number): string {
  return `${puntos > 0 ? "+" : "−"}${fmtPts(Math.abs(puntos))}`;
}

function Etiqueta({ equipo }: { equipo: EquipoMini | undefined }) {
  if (!equipo) return <span className="juegos-equipo">Equipo borrado</span>;
  return (
    <span className="juegos-equipo" style={{ background: equipo.color, color: textoSobre(equipo.color) }}>
      {equipo.nombre}
    </span>
  );
}

interface FormularioProps {
  juegoClave: string | null;
  juegos: JuegoInfo[];
  equipos: EquipoMini[];
  inicial: PuntosExtraFila | null;
  onListo: (mensaje: string) => Promise<void>;
  onCancelar: () => void;
}

/** Sumar o quitar puntos a un equipo, con el motivo. Con `inicial` edita ese registro en vez de crear otro. */
function Formulario({ juegoClave, juegos, equipos, inicial, onListo, onCancelar }: FormularioProps) {
  const uid = useId();
  const equipoRef = useRef<HTMLSelectElement>(null);
  // En orden alfabético: las listas de resultados vienen por lugar y el orden cambiaría tras cada captura.
  const equiposOrdenados = useMemo(() => [...equipos].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), [equipos]);
  const [equipoId, setEquipoId] = useState(inicial ? String(inicial.equipo_id) : "");
  const [signo, setSigno] = useState<"suma" | "resta">(inicial && inicial.puntos < 0 ? "resta" : "suma");
  const [puntos, setPuntos] = useState(inicial ? String(Math.abs(inicial.puntos)) : "");
  const [aplicaA, setAplicaA] = useState(inicial ? (inicial.juego ?? "") : (juegoClave ?? ""));
  const [motivo, setMotivo] = useState(inicial?.motivo ?? "");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function limpiarError(campo: string) {
    setErrores((prev) => (prev[campo] ? { ...prev, [campo]: "" } : prev));
  }

  function validar(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!equipoId) e.equipo = "Elige el equipo.";
    const n = Number(puntos);
    if (puntos.trim() === "" || !Number.isInteger(n) || n < 1 || n > PUNTOS_EXTRA_MAX) {
      e.puntos = `Un número entero de 1 a ${fmtPts(PUNTOS_EXTRA_MAX)}.`;
    }
    if (!motivo.trim()) e.motivo = "Escribe por qué se suman o se quitan estos puntos.";
    return e;
  }

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    const e = validar();
    setErrores(e);
    setErrorServidor(null);
    if (Object.keys(e).length > 0) return;

    const datos: PuntosExtraDatos = {
      equipo_id: Number(equipoId),
      juego: aplicaA === "" ? null : aplicaA,
      puntos: (signo === "resta" ? -1 : 1) * Number(puntos),
      motivo: motivo.trim(),
    };
    setGuardando(true);
    try {
      await apiFetch<PuntosExtraFila>(inicial ? `/admin/juegos/puntos-extra/${inicial.id}` : "/admin/juegos/puntos-extra", {
        method: inicial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
      });
      if (!inicial) {
        // Lo normal es capturar varios seguidos: se conserva signo y a qué aplica, se limpia lo demás.
        setEquipoId("");
        setPuntos("");
        setMotivo("");
        setErrores({});
        equipoRef.current?.focus();
      }
      await onListo(inicial ? "Cambio guardado." : signo === "suma" ? "Puntos extra guardados." : "Descuento guardado.");
    } catch (err) {
      setErrorServidor(err instanceof ApiError ? err.message : "No se pudo guardar. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="extra-form" onSubmit={enviar} noValidate>
      <div className="extra-form-fila">
        <div className={`field ${errores.equipo ? "has-error" : ""}`}>
          <label htmlFor={`${uid}-equipo`}>Equipo</label>
          <select
            id={`${uid}-equipo`}
            ref={equipoRef}
            value={equipoId}
            aria-invalid={errores.equipo ? true : undefined}
            onChange={(e) => {
              setEquipoId(e.target.value);
              limpiarError("equipo");
            }}
          >
            <option value="">Elige un equipo…</option>
            {equiposOrdenados.map((eq) => (
              <option key={eq.equipo_id} value={eq.equipo_id}>
                {eq.nombre}
              </option>
            ))}
          </select>
          {errores.equipo && <p className="field-error">{errores.equipo}</p>}
        </div>

        <div className="field">
          <label htmlFor={`${uid}-aplica`}>Aplica a</label>
          <select id={`${uid}-aplica`} value={aplicaA} onChange={(e) => setAplicaA(e.target.value)}>
            <option value="">General (solo el total)</option>
            {juegos.map((j) => (
              <option key={j.clave} value={j.clave}>
                {j.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="extra-form-fila">
        <div className="field">
          <span className="extra-etiqueta" id={`${uid}-signo`}>
            ¿Qué hacer?
          </span>
          <div className="extra-signo" role="radiogroup" aria-labelledby={`${uid}-signo`}>
            <button type="button" role="radio" aria-checked={signo === "suma"} className={`extra-signo-btn ${signo === "suma" ? "is-suma" : ""}`} onClick={() => setSigno("suma")}>
              Sumar
            </button>
            <button type="button" role="radio" aria-checked={signo === "resta"} className={`extra-signo-btn ${signo === "resta" ? "is-resta" : ""}`} onClick={() => setSigno("resta")}>
              Quitar
            </button>
          </div>
        </div>

        <div className={`field ${errores.puntos ? "has-error" : ""}`}>
          <label htmlFor={`${uid}-puntos`}>Puntos</label>
          <input
            id={`${uid}-puntos`}
            type="number"
            inputMode="numeric"
            min={1}
            max={PUNTOS_EXTRA_MAX}
            step={1}
            value={puntos}
            placeholder="50"
            aria-invalid={errores.puntos ? true : undefined}
            onChange={(e) => {
              setPuntos(e.target.value);
              limpiarError("puntos");
            }}
          />
          {errores.puntos && <p className="field-error">{errores.puntos}</p>}
        </div>
      </div>

      <div className={`field ${errores.motivo ? "has-error" : ""}`}>
        <label htmlFor={`${uid}-motivo`}>
          Motivo <span className="muted extra-contador mono">{motivo.length}/{MOTIVO_MAX}</span>
        </label>
        <input
          id={`${uid}-motivo`}
          type="text"
          value={motivo}
          maxLength={MOTIVO_MAX}
          autoComplete="off"
          placeholder={signo === "suma" ? "Ej. Cabaña más limpia" : "Ej. Llegaron tarde al juego"}
          aria-invalid={errores.motivo ? true : undefined}
          onChange={(e) => {
            setMotivo(e.target.value);
            limpiarError("motivo");
          }}
        />
        {errores.motivo && <p className="field-error">{errores.motivo}</p>}
      </div>

      {errorServidor && (
        <p className="field-error" role="alert">
          {errorServidor}
        </p>
      )}

      <div className="extra-form-acciones">
        <button type="submit" className="btn btn-primary" disabled={guardando}>
          {guardando && <span className="spinner" />}
          {guardando ? "Guardando..." : inicial ? "Guardar cambios" : signo === "suma" ? "Sumar puntos" : "Quitar puntos"}
        </button>
        {inicial && (
          <button type="button" className="btn btn-ghost" onClick={onCancelar} disabled={guardando}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * Tarjeta «Puntos extra y descuentos»: el Admin suma o quita puntos a un equipo y deja escrito por qué.
 * En Posiciones muestra todos (los generales y los de cada juego); en la pestaña de un juego, solo los
 * suyos. Lo que se aplica a un juego cuenta en ese juego (y mueve su podio); lo general, solo en el
 * total. Los demás roles ven la lista sin formulario.
 */
export function PuntosExtra({ juegoClave, juegos, equipos, puntosExtra, canEdit, onCambio }: PuntosExtraProps) {
  const [editando, setEditando] = useState<PuntosExtraFila | null>(null);
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null);
  const tarjetaRef = useRef<HTMLDivElement>(null);

  // Quien no puede editar no tiene nada que hacer aquí si la lista está vacía.
  if (!canEdit && puntosExtra.length === 0) return null;

  const equipoDe = new Map(equipos.map((e) => [e.equipo_id, e]));
  const nombreJuego = (clave: string | null) => (clave === null ? "General" : (juegos.find((j) => j.clave === clave)?.nombre ?? clave));

  async function borrar(x: PuntosExtraFila) {
    setErrorBorrar(null);
    try {
      await apiFetch(`/admin/juegos/puntos-extra/${x.id}`, { method: "DELETE" });
      if (editando?.id === x.id) setEditando(null);
      await onCambio("Registro borrado.");
    } catch (err) {
      setErrorBorrar(err instanceof ApiError ? err.message : "No se pudo borrar. Intenta de nuevo.");
    }
  }

  function editar(x: PuntosExtraFila) {
    setEditando(x);
    setErrorBorrar(null);
    // El formulario está arriba de la lista: se lleva la vista hasta él para que se note que cambió a «editando».
    requestAnimationFrame(() => tarjetaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <div className="glass-card juegos-tarjeta extra" ref={tarjetaRef}>
      <h2 className="juegos-subtitulo">{editando ? `Editando · ${equipoDe.get(editando.equipo_id)?.nombre ?? ""}` : "Puntos extra y descuentos"}</h2>
      <p className="muted juegos-nota">
        {juegoClave === null
          ? "Suma o quita puntos a un equipo y deja el motivo. «General» solo cambia el total; si eliges un juego, también cambia su podio."
          : "Lo que pongas aquí cuenta en este juego y cambia su podio."}
      </p>

      {canEdit &&
        (equipos.length === 0 ? (
          <p className="muted">Primero crea los equipos en Equipos.</p>
        ) : (
          <Formulario
            key={editando?.id ?? "nuevo"}
            juegoClave={juegoClave}
            juegos={juegos}
            equipos={equipos}
            inicial={editando}
            onListo={async (mensaje) => {
              setEditando(null);
              await onCambio(mensaje);
            }}
            onCancelar={() => setEditando(null)}
          />
        ))}

      {errorBorrar && (
        <p className="field-error" role="alert">
          {errorBorrar}
        </p>
      )}

      {puntosExtra.length === 0 ? (
        <p className="muted extra-vacio">Sin puntos extra todavía.</p>
      ) : (
        <ul className="extra-lista">
          {puntosExtra.map((x) => (
            <li className={`extra-item ${editando?.id === x.id ? "is-editando" : ""}`} key={x.id}>
              <span className={`extra-valor mono ${x.puntos > 0 ? "is-suma" : "is-resta"}`} aria-label={`${x.puntos > 0 ? "Suma" : "Resta"} ${Math.abs(x.puntos)} puntos`}>
                {fmtExtra(x.puntos)}
              </span>
              <div className="extra-info">
                <p className="extra-motivo">{x.motivo}</p>
                <p className="muted extra-meta">
                  <Etiqueta equipo={equipoDe.get(x.equipo_id)} /> · {nombreJuego(x.juego)} · {x.actualizado_por ?? x.creado_por},{" "}
                  {formatFechaHora(x.actualizado_en ?? x.creado_en)}
                  {x.actualizado_en && " (editado)"}
                </p>
              </div>
              {canEdit && (
                <div className="extra-acciones">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => editar(x)}>
                    Editar
                  </button>
                  <ConfirmButton label="Borrar" confirmLabel="¿Seguro?" className="btn-sm" onConfirm={() => borrar(x)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
