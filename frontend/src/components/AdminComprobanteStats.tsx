import { useEffect, useState } from "react";
import { Reveal } from "./Reveal";
import { ToggleSwitch } from "./ToggleSwitch";
import { ReceiptIcon } from "./icons";
import { apiFetch, ApiError, type ComprobanteStats } from "../lib/api";
import { useSettings } from "../lib/SettingsContext";
import "./AdminComprobanteStats.css";

/**
 * Conteo de registros con/sin comprobante — independiente de si el
 * formulario público está pidiendo comprobante ahora mismo: aunque se
 * apague, los registros ya capturados con archivo se siguen contando aquí
 * (el backend cuenta sobre TODOS los registros, no solo la página/filtro
 * actual del listado). El toggle de arriba es lo que prende/apaga la
 * subida en el formulario público — solo visible si `canEdit`. Mismo
 * patrón que AdminShirtStats.tsx.
 */
export function AdminComprobanteStats({ canEdit }: { canEdit: boolean }) {
  const [stats, setStats] = useState<ComprobanteStats | null>(null);
  const { pedirComprobante, loading: settingsLoading, setPedirComprobante } = useSettings();
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ComprobanteStats>("/admin/stats/comprobantes")
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  async function handleToggle(next: boolean) {
    setToggling(true);
    setToggleError(null);
    try {
      await setPedirComprobante(next);
    } catch (err) {
      setToggleError(err instanceof ApiError ? err.message : "No se pudo actualizar. Intenta de nuevo.");
    } finally {
      setToggling(false);
    }
  }

  if (!stats) return null;

  const total = stats.con_comprobante + stats.sin_comprobante;

  return (
    <Reveal delay={0.1} className="admin-comprobante-stats">
      <div className="glass-card admin-comprobante-stats-card">
        <div className="admin-comprobante-stats-header">
          <ReceiptIcon size={18} />
          <h2>Comprobante de pago</h2>
          <span className="muted admin-comprobante-stats-total">{total} registros</span>
        </div>

        {canEdit && (
          <div className="admin-comprobante-stats-toggle">
            <ToggleSwitch
              checked={pedirComprobante}
              disabled={settingsLoading || toggling}
              onChange={handleToggle}
              label={pedirComprobante ? "El formulario pide comprobante" : "El formulario NO pide comprobante"}
            />
            {toggleError && <span className="field-error">{toggleError}</span>}
          </div>
        )}

        <div className="admin-comprobante-stats-grid">
          <div className="admin-comprobante-stats-item">
            <span className="admin-comprobante-stats-label">Con comprobante</span>
            <span className="admin-comprobante-stats-count">{stats.con_comprobante}</span>
          </div>
          <div className="admin-comprobante-stats-item">
            <span className="admin-comprobante-stats-label">Sin comprobante</span>
            <span className="admin-comprobante-stats-count">{stats.sin_comprobante}</span>
          </div>
        </div>
      </div>
    </Reveal>
  );
}
