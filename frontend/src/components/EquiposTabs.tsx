import { EquipoSelector } from "./EquipoSelector";
import type { EquipoOut } from "../lib/api";
import "./EquiposTabs.css";

export type EquiposTabId = "resumen" | "sin-equipo" | "staff" | number;

interface EquiposTabsProps {
  equipos: EquipoOut[];
  sinEquipoCount: number;
  staffCount: number;
  active: EquiposTabId;
  dimmed: boolean;
  onChange: (tab: EquiposTabId) => void;
}

/**
 * Barra de navegación de la pantalla de Equipos. Las vistas fijas (Resumen /
 * Sin equipo / Staff) son pastillas; los equipos NO van como una pestaña cada
 * uno (con ~10 se volvía una barra larguísima) sino detrás de un
 * `EquipoSelector` (‹ equipo actual ›). Mide lo mismo con 3 equipos que con
 * 10. En escritorio queda en una sola fila pegajosa bajo el navbar (mismo
 * patrón que `.admin-filters` en AdminPanel.css); en móvil son dos filas.
 */
export function EquiposTabs({ equipos, sinEquipoCount, staffCount, active, dimmed, onChange }: EquiposTabsProps) {
  return (
    <div className={`equipos-tabs ${dimmed ? "is-dimmed" : ""}`} role="tablist" aria-label="Equipos">
      <div className="equipos-tabs-vistas">
        <button
          type="button"
          role="tab"
          aria-selected={active === "resumen"}
          className={`equipos-tab ${active === "resumen" ? "is-active" : ""}`}
          onClick={() => onChange("resumen")}
        >
          Resumen
        </button>
        {sinEquipoCount > 0 && (
          <button
            type="button"
            role="tab"
            aria-selected={active === "sin-equipo"}
            className={`equipos-tab equipos-tab--sin ${active === "sin-equipo" ? "is-active" : ""}`}
            onClick={() => onChange("sin-equipo")}
          >
            Sin equipo <span className="equipos-tab-count">{sinEquipoCount}</span>
          </button>
        )}
        {staffCount > 0 && (
          <button
            type="button"
            role="tab"
            aria-selected={active === "staff"}
            className={`equipos-tab equipos-tab--sin ${active === "staff" ? "is-active" : ""}`}
            onClick={() => onChange("staff")}
          >
            Staff <span className="equipos-tab-count">{staffCount}</span>
          </button>
        )}
      </div>

      <EquipoSelector
        equipos={equipos}
        activoId={typeof active === "number" ? active : null}
        onChange={onChange}
      />
    </div>
  );
}
