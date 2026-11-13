import { useEffect, useRef, useState, type FormEvent } from "react";
import { ConfirmButton } from "./ConfirmButton";
import type { EquipoRef, MarcadorTorneo, PartidoTorneo, TerminoPartido } from "../lib/api";
import { textoSobre } from "../lib/colorEquipo";
import { AYUDA_TERMINO, ETIQUETA_TERMINO, TERMINO_CORTO } from "../lib/torneo";

const TERMINOS: TerminoPartido[] = ["normal", "tope", "siguiente_punto", "volado"];
const META = 7;

export function EquipoPastilla({ equipo }: { equipo: EquipoRef }) {
  return (
    <span className="juegos-equipo" style={{ background: equipo.color, color: textoSobre(equipo.color) }}>
      {equipo.nombre}
    </span>
  );
}

interface TorneoPartidoProps {
  partido: PartidoTorneo;
  canEdit: boolean;
  /** Hay otra petición en curso: se deshabilitan los botones. */
  ocupado: boolean;
  /** Guarda el marcador; devuelve el mensaje de error del servidor, o `null` si todo salió bien. */
  onGuardar: (slot: string, marcador: MarcadorTorneo) => Promise<string | null>;
  onQuitar: (slot: string) => Promise<void>;
}

const SITUACION: Record<string, string> = {
  en_cancha: "En cancha",
  proximo: "Sigue",
  saltado: "Saltado",
};

function nombreCorto(p: PartidoTorneo): string {
  if (p.ronda === "r1" || p.ronda === "r2") return `Partido ${p.slot.split("-")[1]}`;
  return p.etiqueta;
}

/** Un dígito de 0 a 7 (o vacío): los puntos de un set a 7. */
function soloPuntos(valor: string): string | null {
  const limpio = valor.replace(/\D/g, "").slice(-1);
  if (limpio !== "" && Number(limpio) > META) return null;
  return limpio;
}

/**
 * Un partido del torneo: se ve «A 7 – 4 B» con el ganador resaltado, y el Admin lo captura o corrige
 * ahí mismo. El partido que está en cancha trae el formulario abierto; los demás, un botón.
 */
export function TorneoPartido({ partido, canEdit, ocupado, onGuardar, onQuitar }: TorneoPartidoProps) {
  const [abierto, setAbierto] = useState(false);
  const [pa, setPa] = useState("");
  const [pb, setPb] = useState("");
  const [termino, setTermino] = useState<TerminoPartido | null>(null); // null = se deduce de los puntos
  const [ganadorVolado, setGanadorVolado] = useState<"a" | "b" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const pbRef = useRef<HTMLInputElement>(null);
  const paRef = useRef<HTMLInputElement>(null);

  // Mientras el formulario está cerrado, sigue a lo que dice el servidor (otra persona pudo corregirlo).
  useEffect(() => {
    if (abierto) return;
    setPa(partido.pa === null ? "" : String(partido.pa));
    setPb(partido.pb === null ? "" : String(partido.pb));
    setTermino(partido.termino);
    setGanadorVolado(partido.termino === "volado" ? (partido.ganador_id === partido.a.id ? "a" : "b") : null);
    setError(null);
  }, [abierto, partido.pa, partido.pb, partido.termino, partido.ganador_id, partido.a.id]);

  const puedeEditar = canEdit && !partido.saltado;
  const formulario = puedeEditar && (abierto || (!partido.jugado && partido.estado === "en_cancha"));
  const mayor = Math.max(Number(pa || 0), Number(pb || 0));
  const efectivo: TerminoPartido = termino ?? (mayor === META || pa === "" || pb === "" ? "normal" : "tope");

  function abrir() {
    setAbierto(true);
    requestAnimationFrame(() => paRef.current?.focus());
  }

  function cancelar() {
    setAbierto(false);
    setError(null);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    let a: number;
    let b: number;
    if (efectivo === "volado") {
      if (!ganadorVolado) {
        setError("Elige quién ganó el volado.");
        return;
      }
      [a, b] = ganadorVolado === "a" ? [META, 0] : [0, META];
    } else {
      if (pa === "" || pb === "") {
        setError("Anota los puntos de los dos equipos.");
        return;
      }
      a = Number(pa);
      b = Number(pb);
    }
    setEnviando(true);
    setError(null);
    const fallo = await onGuardar(partido.slot, { pa: a, pb: b, termino: efectivo });
    setEnviando(false);
    if (fallo) setError(fallo);
    else setAbierto(false);
  }

  const bloqueado = ocupado || enviando;
  const etiquetaSituacion = SITUACION[partido.estado];

  return (
    <li className={`torneo-partido is-${partido.estado}`}>
      <div className="torneo-partido-cab">
        <span className="torneo-partido-nombre">{nombreCorto(partido)}</span>
        {etiquetaSituacion && <span className={`torneo-situacion is-${partido.estado}`}>{etiquetaSituacion}</span>}
      </div>

      {formulario ? (
        <form className="torneo-form" onSubmit={guardar} noValidate>
          {(
            [
              ["a", partido.a, pa, setPa, paRef],
              ["b", partido.b, pb, setPb, pbRef],
            ] as const
          ).map(([lado, equipo, valor, setValor, ref]) => (
            <div className="torneo-equipo-fila" key={lado}>
              <label htmlFor={`${partido.slot}-${lado}`} className="torneo-equipo-nombre">
                <EquipoPastilla equipo={equipo} />
                <span className="torneo-solo-lectores">Puntos de {equipo.nombre}</span>
              </label>
              {efectivo === "volado" ? (
                <button
                  type="button"
                  className={`btn btn-sm torneo-volado ${ganadorVolado === lado ? "btn-primary" : "btn-ghost"}`}
                  aria-pressed={ganadorVolado === lado}
                  onClick={() => setGanadorVolado(lado)}
                  disabled={bloqueado}
                >
                  {ganadorVolado === lado ? "Ganó el volado" : "Ganó"}
                </button>
              ) : (
                <input
                  id={`${partido.slot}-${lado}`}
                  ref={ref}
                  className="torneo-puntos-input mono"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={1}
                  value={valor}
                  disabled={bloqueado}
                  onFocus={(ev) => ev.currentTarget.select()}
                  onChange={(ev) => {
                    const nuevo = soloPuntos(ev.target.value);
                    if (nuevo === null) return;
                    setValor(nuevo);
                    setError(null);
                    // Al escribir el primer marcador, el cursor pasa solo al segundo.
                    if (lado === "a" && nuevo !== "") pbRef.current?.focus();
                  }}
                />
              )}
            </div>
          ))}

          <div className="torneo-termino" role="radiogroup" aria-label="Cómo terminó el partido">
            {TERMINOS.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={efectivo === t}
                className={`torneo-chip ${efectivo === t ? "is-activo" : ""}`}
                onClick={() => {
                  setTermino(t);
                  setError(null);
                }}
                disabled={bloqueado}
              >
                {ETIQUETA_TERMINO[t]}
              </button>
            ))}
          </div>
          <p className="muted torneo-ayuda">{AYUDA_TERMINO[efectivo]}</p>

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}

          <div className="torneo-acciones">
            <button type="submit" className="btn btn-primary btn-sm" disabled={bloqueado}>
              {enviando ? "Guardando…" : partido.jugado ? "Guardar corrección" : "Guardar marcador"}
            </button>
            {abierto && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={cancelar} disabled={bloqueado}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      ) : (
        <>
          <div className="torneo-marcador">
            {([partido.a, partido.b] as const).map((equipo, i) => {
              const puntos = i === 0 ? partido.pa : partido.pb;
              const gano = partido.jugado && partido.ganador_id === equipo.id;
              return (
                <div className={`torneo-equipo-fila ${gano ? "is-ganador" : ""}`} key={equipo.id}>
                  <span className="torneo-equipo-nombre">
                    <EquipoPastilla equipo={equipo} />
                    {gano && <span className="torneo-solo-lectores">ganó</span>}
                  </span>
                  <span className="torneo-puntos mono" aria-label={puntos === null ? "sin marcador" : `${puntos} puntos`}>
                    {puntos ?? "–"}
                  </span>
                </div>
              );
            })}
          </div>
          {partido.jugado && partido.termino && TERMINO_CORTO[partido.termino] && (
            <p className="muted torneo-ayuda">{TERMINO_CORTO[partido.termino]}</p>
          )}
          {puedeEditar && (
            <div className="torneo-acciones">
              {partido.jugado ? (
                <>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={abrir} disabled={bloqueado}>
                    Corregir
                  </button>
                  <ConfirmButton
                    label="Quitar marcador"
                    confirmLabel="¿Seguro?"
                    className="btn-sm"
                    disabled={bloqueado}
                    onConfirm={() => void onQuitar(partido.slot)}
                  />
                </>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" onClick={abrir} disabled={bloqueado}>
                  Anotar marcador
                </button>
              )}
            </div>
          )}
        </>
      )}
    </li>
  );
}
