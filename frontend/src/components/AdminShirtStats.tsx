import { useEffect, useState } from "react";
import { Reveal } from "./Reveal";
import { ToggleSwitch } from "./ToggleSwitch";
import { ShirtIcon } from "./icons";
import { apiFetch, ApiError, type TallaStatsResponse } from "../lib/api";
import { useSettings } from "../lib/SettingsContext";
import "./AdminShirtStats.css";

/**
 * Conteo de playeras por talla — independiente de si el formulario público
 * está pidiendo talla ahora mismo: aunque se apague, los datos ya
 * capturados se siguen mostrando aquí (el backend cuenta sobre TODOS los
 * registros, no solo la página/filtro actual del listado). El toggle de
 * arriba es lo que prende/apaga el campo en el formulario público — solo
 * visible si `canEdit`.
 */
export function AdminShirtStats({ canEdit }: { canEdit: boolean }) {
  const [stats, setStats] = useState<TallaStatsResponse | null>(null);
  const { showShirtSize, loading: settingsLoading, setShowShirtSize } = useSettings();
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<TallaStatsResponse>("/admin/stats/tallas")
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  async function handleToggle(next: boolean) {
    setToggling(true);
    setToggleError(null);
    try {
      await setShowShirtSize(next);
    } catch (err) {
      setToggleError(err instanceof ApiError ? err.message : "No se pudo actualizar. Intenta de nuevo.");
    } finally {
      setToggling(false);
    }
  }

  if (!stats) return null;

  const totalConTalla = stats.items.reduce((acc, item) => acc + item.total, 0);

  return (
    <Reveal delay={0.1} className="admin-shirt-stats">
      <div className="glass-card admin-shirt-stats-card">
        <div className="admin-shirt-stats-header">
          <ShirtIcon size={18} />
          <h2>Camisetas</h2>
          <span className="muted admin-shirt-stats-total">
            {totalConTalla} camisetas registradas
          </span>
        </div>

        {canEdit && (
          <div className="admin-shirt-stats-toggle">
            <ToggleSwitch
              checked={showShirtSize}
              disabled={settingsLoading || toggling}
              onChange={handleToggle}
              label={showShirtSize ? "El formulario pide talla" : "El formulario NO pide talla"}
            />
            {toggleError && <span className="field-error">{toggleError}</span>}
          </div>
        )}

        {totalConTalla === 0 ? (
          <p className="muted">Todavía no hay registros con talla de playera.</p>
        ) : (
          <div className="admin-shirt-stats-grid">
            {stats.items.map((item) => (
              <div className="admin-shirt-stats-item" key={item.talla}>
                <span className="admin-shirt-stats-talla mono">{item.talla}</span>
                <span className="admin-shirt-stats-count">{item.total}</span>
                <span className="muted admin-shirt-stats-verif">{item.verificados} verificadas</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Reveal>
  );
}
