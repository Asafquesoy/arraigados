import type { FormEvent } from "react";
import { AnimatePresence } from "motion/react";
import { ColorSwatches } from "./ColorSwatches";
import { ConfirmButton } from "./ConfirmButton";
import { EquiposCriterios } from "./EquiposCriterios";
import { FieldReveal } from "./FieldReveal";
import { EquiposIcon } from "./icons";
import type { EquiposConfig } from "../lib/api";
import "./EquiposToolbar.css";

export type EquiposPanel = "nuevo" | "criterios" | "repartir" | null;

interface EquiposToolbarProps {
  canEdit: boolean;
  panel: EquiposPanel;
  onTogglePanel: (panel: EquiposPanel) => void;

  newNombre: string;
  onNewNombreChange: (v: string) => void;
  newColor: string;
  onNewColorChange: (v: string) => void;
  creating: boolean;
  createError: string | null;
  onCrear: (e: FormEvent) => void;

  config: EquiposConfig | null;
  configLoading: boolean;
  onConfigChange: (field: keyof EquiposConfig, value: boolean) => void;

  equiposCount: number;
  incluirFijados: boolean;
  onIncluirFijadosChange: (v: boolean) => void;
  repartiendo: boolean;
  onRepartir: () => void;
}

/**
 * Fusiona lo que antes eran tres cards siempre abiertas (nuevo equipo /
 * criterios / repartir — ver commit de "modulo de equipos") en una sola
 * barra de tres botones, cada uno con un panel plegable. Con ~10 equipos y
 * ~150 personas, esas tres cards abiertas de entrada añadían ~3 pantallas
 * de scroll antes de ver el primer equipo — aquí solo una está abierta a la
 * vez y ambas empiezan cerradas.
 */
export function EquiposToolbar({
  canEdit,
  panel,
  onTogglePanel,
  newNombre,
  onNewNombreChange,
  newColor,
  onNewColorChange,
  creating,
  createError,
  onCrear,
  config,
  configLoading,
  onConfigChange,
  equiposCount,
  incluirFijados,
  onIncluirFijadosChange,
  repartiendo,
  onRepartir,
}: EquiposToolbarProps) {
  function toggle(p: Exclude<EquiposPanel, null>) {
    onTogglePanel(panel === p ? null : p);
  }

  return (
    <div className="glass-card equipos-toolbar">
      <div className="equipos-toolbar-header">
        <EquiposIcon size={18} />
        <h2>Equipos</h2>
        <div className="equipos-toolbar-btns">
          {canEdit && (
            <>
              <button
                type="button"
                className={`btn btn-ghost btn-sm ${panel === "nuevo" ? "is-active" : ""}`}
                onClick={() => toggle("nuevo")}
              >
                + Nuevo equipo
              </button>
              {equiposCount > 0 && (
                <button
                  type="button"
                  className={`btn btn-ghost btn-sm ${panel === "repartir" ? "is-active" : ""}`}
                  onClick={() => toggle("repartir")}
                >
                  Repartir a todos
                </button>
              )}
            </>
          )}
          <button
            type="button"
            className={`btn btn-ghost btn-sm ${panel === "criterios" ? "is-active" : ""}`}
            onClick={() => toggle("criterios")}
          >
            Cómo se reparten
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {panel === "nuevo" && canEdit && (
          <FieldReveal>
            <form className="equipos-toolbar-form" onSubmit={onCrear}>
              <div className="field">
                <label htmlFor="nuevo-equipo-nombre">Nombre del equipo</label>
                <input
                  id="nuevo-equipo-nombre"
                  type="text"
                  value={newNombre}
                  onChange={(e) => onNewNombreChange(e.target.value)}
                  placeholder="Por ejemplo: Águilas"
                  maxLength={80}
                  autoFocus
                />
              </div>
              <div className="field">
                <label>Color</label>
                <ColorSwatches value={newColor} onChange={onNewColorChange} disabled={creating} />
              </div>
              {createError && <p className="field-error">{createError}</p>}
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating && <span className="spinner" />}
                {creating ? "Creando..." : "Crear equipo"}
              </button>
            </form>
          </FieldReveal>
        )}

        {panel === "criterios" && (
          <FieldReveal className="equipos-toolbar-panel">
            <EquiposCriterios config={config} loading={configLoading} canEdit={canEdit} onChange={onConfigChange} />
          </FieldReveal>
        )}

        {panel === "repartir" && canEdit && equiposCount > 0 && (
          <FieldReveal className="equipos-toolbar-panel">
            <div className="equipos-toolbar-repartir">
              <p className="muted equipos-toolbar-repartir-hint">
                Reacomoda a todo mundo según los criterios de arriba.
              </p>
              <label className="equipos-toolbar-check">
                <input
                  type="checkbox"
                  checked={incluirFijados}
                  onChange={(e) => onIncluirFijadosChange(e.target.checked)}
                />
                Incluir también a los que moví a mano
              </label>
              <ConfirmButton
                label={repartiendo ? "Repartiendo..." : "Repartir a todos"}
                confirmLabel="¿Seguro? Sí, repartir"
                className="btn-primary"
                disabled={repartiendo}
                onConfirm={onRepartir}
              />
            </div>
          </FieldReveal>
        )}
      </AnimatePresence>
    </div>
  );
}
