import { Reveal } from "./Reveal";
import { ToggleSwitch } from "./ToggleSwitch";
import { ShieldCheckIcon } from "./icons";
import { ApiError } from "../lib/api";
import { useSettings } from "../lib/SettingsContext";
import { useState } from "react";
import "./AdminRegistroToggle.css";

/**
 * Interruptor maestro del registro público — apagarlo cierra el formulario
 * en `FormularioRegistro.tsx` (se reemplaza por un aviso) y el backend
 * rechaza `POST /api/registros` con 403 aunque alguien lo intente igual
 * (revalidado server-side en `routers/public.py::crear_registro`, mismo
 * criterio que `pedir_comprobante`). Mismo patrón/estructura que
 * AdminComprobanteStats.tsx, pero sin estadísticas — es la tarjeta de mayor
 * impacto, por eso va primero en el panel.
 */
export function AdminRegistroToggle({ canEdit }: { canEdit: boolean }) {
  const { registroAbierto, loading, setRegistroAbierto } = useSettings();
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

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
      </div>
    </Reveal>
  );
}
