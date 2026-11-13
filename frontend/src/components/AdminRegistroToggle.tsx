import { Reveal } from "./Reveal";
import { ToggleSwitch } from "./ToggleSwitch";
import { ShieldCheckIcon } from "./icons";
import { ApiError } from "../lib/api";
import { aInputLocal, formatFechaHora } from "../lib/fecha";
import { useSettings } from "../lib/SettingsContext";
import { useEffect, useState } from "react";
import "./AdminRegistroToggle.css";

/** "2 d 4 h", "3 h 10 min" o "12 min" — cuánto falta para `hasta`. */
function faltan(hasta: Date, ahora: number): string {
  const min = Math.max(0, Math.floor((hasta.getTime() - ahora) / 60000));
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

/**
 * Interruptor maestro del registro público — apagarlo cierra el formulario
 * en `FormularioRegistro.tsx` (se reemplaza por un aviso) y el backend
 * rechaza `POST /api/registros` con 403 aunque alguien lo intente igual
 * (revalidado server-side en `routers/public.py::crear_registro`, mismo
 * criterio que `pedir_comprobante`). Mismo patrón/estructura que
 * AdminComprobanteStats.tsx, pero sin estadísticas — es la tarjeta de mayor
 * impacto, por eso va primero en el panel.
 *
 * Además permite programar el cierre: día y hora a la que se cierra solo
 * (`registro_cierre_en`, ver `backend/app/registro_cierre.py`). La página
 * principal muestra la cuenta regresiva mientras haya una hora programada.
 */
export function AdminRegistroToggle({ canEdit }: { canEdit: boolean }) {
  const { registroAbierto, registroCierreEn, loading, setRegistroAbierto, setRegistroCierreEn } = useSettings();
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const [valor, setValor] = useState("");
  const [guardandoCierre, setGuardandoCierre] = useState(false);
  const [cierreError, setCierreError] = useState<string | null>(null);
  // Refresca el "faltan ..." sin recargar; cada 30 s sobra (se muestra en minutos).
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!registroCierreEn) return;
    const id = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [registroCierreEn]);

  async function handleToggle(next: boolean) {
    setToggling(true);
    setToggleError(null);
    try {
      await setRegistroAbierto(next);
    } catch (err) {
      setToggleError(err instanceof ApiError ? err.message : "No se pudo actualizar. Intenta de nuevo.");
    } finally {
      setToggling(false);
    }
  }

  async function guardarCierre(fecha: Date | null) {
    setGuardandoCierre(true);
    setCierreError(null);
    try {
      await setRegistroCierreEn(fecha);
      setValor("");
    } catch (err) {
      setCierreError(
        err instanceof ApiError && err.status !== 422 ? err.message : "No se pudo guardar. Revisa que la hora sea futura."
      );
    } finally {
      setGuardandoCierre(false);
    }
  }

  function handleProgramar() {
    // datetime-local no trae zona: `new Date("YYYY-MM-DDTHH:mm")` lo toma como hora local.
    const fecha = valor ? new Date(valor) : null;
    if (!fecha || Number.isNaN(fecha.getTime())) {
      setCierreError("Elige el día y la hora del cierre.");
      return;
    }
    if (fecha.getTime() <= Date.now()) {
      setCierreError("Esa hora ya pasó. Elige una futura.");
      return;
    }
    void guardarCierre(fecha);
  }

  // Con el registro ya cerrado no tiene sentido programar un cierre.
  const mostrarCierre = !loading && registroAbierto && (canEdit || registroCierreEn);

  return (
    <Reveal className="admin-registro-toggle">
      <div className="glass-card admin-registro-toggle-card">
        <div className="admin-registro-toggle-header">
          <ShieldCheckIcon size={18} />
          <h2>Registro de camperos</h2>
          <span className={`admin-registro-toggle-status ${registroAbierto ? "is-open" : "is-closed"}`}>
            {loading ? "Cargando..." : registroAbierto ? "Abierto" : "Cerrado"}
          </span>
        </div>

        {canEdit && (
          <div className="admin-registro-toggle-control">
            <ToggleSwitch
              checked={registroAbierto}
              disabled={loading || toggling}
              onChange={handleToggle}
              label={registroAbierto ? "El formulario público acepta registros" : "El formulario público está cerrado"}
            />
            {toggleError && <span className="field-error">{toggleError}</span>}
          </div>
        )}

        {mostrarCierre && (
          <div className="admin-registro-cierre">
            <h3>Cierre automático</h3>

            {registroCierreEn ? (
              <p className="admin-registro-cierre-estado">
                Se cierra solo el <strong>{formatFechaHora(registroCierreEn.toISOString())}</strong> · faltan{" "}
                {faltan(registroCierreEn, ahora)}
              </p>
            ) : (
              <p className="admin-registro-cierre-ayuda muted">
                Sin hora programada. Si eliges una, el registro se cierra solo y en la página principal aparece la
                cuenta regresiva.
              </p>
            )}

            {canEdit && (
              <div className="admin-registro-cierre-form">
                <label className="admin-registro-cierre-campo">
                  <span>{registroCierreEn ? "Cambiar día y hora" : "Día y hora de cierre"}</span>
                  <input
                    type="datetime-local"
                    value={valor}
                    min={aInputLocal(new Date())}
                    onChange={(e) => setValor(e.target.value)}
                    disabled={guardandoCierre}
                  />
                </label>
                <div className="admin-registro-cierre-botones">
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleProgramar} disabled={guardandoCierre}>
                    {registroCierreEn ? "Cambiar hora" : "Programar cierre"}
                  </button>
                  {registroCierreEn && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => void guardarCierre(null)}
                      disabled={guardandoCierre}
                    >
                      Quitar cierre
                    </button>
                  )}
                </div>
                {cierreError && (
                  <span className="field-error" role="alert">
                    {cierreError}
                  </span>
                )}
                <span className="admin-registro-cierre-nota muted">Se usa la hora de este dispositivo.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </Reveal>
  );
}
