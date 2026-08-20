import type { CSSProperties } from "react";
import type { EquipoOut } from "../lib/api";
import "./EquiposTabs.css";

export type EquiposTabId = "resumen" | "sin-equipo" | number;

interface EquiposTabsProps {
  equipos: EquipoOut[];
  sinEquipoCount: number;
  active: EquiposTabId;
  dimmed: boolean;
  onChange: (tab: EquiposTabId) => void;
}

/**
 * Barra de pestañas por equipo — reemplaza tener las ~10 tarjetas de equipo
 * (cada una con hasta ~15 miembros) abiertas todas a la vez. En escritorio
 * queda pegajosa bajo el navbar (mismo patrón que `.admin-filters` en
 * AdminPanel.css); en móvil hace scroll horizontal con scroll-snap en vez de
 * apilarse verticalmente.
 */
export function EquiposTabs({ equipos, sinEquipoCount, active, dimmed, onChange }: EquiposTabsProps) {
  return (
    <div className={`equipos-tabs ${dimmed ? "is-dimmed" : ""}`} role="tablist" aria-label="Equipos">
      <button
        type="button"
        role="tab"
        aria-selected={active === "resumen"}
        className={`equipos-tab ${active === "resumen" ? "is-active" : ""}`}
        onClick={() => onChange("resumen")}
      >
        Resumen
      </button>
      {equipos.map((e) => (
        <button
          key={e.id}
          type="button"
          role="tab"
          aria-selected={active === e.id}
          className={`equipos-tab ${active === e.id ? "is-active" : ""}`}
          style={{ "--color-equipo": e.color } as CSSProperties}
          onClick={() => onChange(e.id)}
        >
          <span className="equipos-tab-dot" aria-hidden="true" />
          {e.nombre} <span className="equipos-tab-count">{e.stats.total}</span>
        </button>
      ))}
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
    </div>
  );
}
