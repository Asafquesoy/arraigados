import { Reveal } from "./Reveal";
import { ToggleSwitch } from "./ToggleSwitch";
import { EquiposIcon } from "./icons";
import type { EquiposConfig } from "../lib/api";
import "./EquiposCriterios.css";

const CRITERIOS: { field: keyof EquiposConfig; label: string; hint: string }[] = [
  { field: "eq_balance_tamano", label: "Mismo tamaño", hint: "Que todos los equipos tengan más o menos la misma cantidad de personas." },
  { field: "eq_balance_edad", label: "Edad pareja", hint: "Que el promedio de edad sea parecido entre equipos." },
  {
    field: "eq_balance_bautismo",
    label: "Tiempo bautizado parejo",
    hint: "Que el promedio de tiempo bautizado sea parecido entre equipos.",
  },
  { field: "eq_balance_procedencia", label: "Mezclar iglesias", hint: "Que no se junten muchos de la misma iglesia en un equipo." },
  { field: "eq_balance_sexo", label: "Hombres y mujeres parejo", hint: "Que la proporción de hombres y mujeres sea parecida entre equipos." },
];

interface EquiposCriteriosProps {
  config: EquiposConfig | null;
  loading: boolean;
  canEdit: boolean;
  onChange: (field: keyof EquiposConfig, value: boolean) => void;
}

/**
 * Mismo patrón estructural que AdminRegistroToggle.tsx/AdminAjustes.tsx
 * (glass-card + header con icono + controles ocultos si !canEdit), pero con
 * seis interruptores en vez de uno: el maestro ("acomodar solo") y los cinco
 * criterios de balanceo que consume equipos_balance.py en el backend.
 */
export function EquiposCriterios({ config, loading, canEdit, onChange }: EquiposCriteriosProps) {
  return (
    <Reveal delay={0.1} className="equipos-criterios">
      <div className="glass-card equipos-criterios-card">
        <div className="equipos-criterios-header">
          <EquiposIcon size={18} />
          <h2>¿Cómo quieres que se repartan?</h2>
        </div>

        <p className="muted equipos-criterios-nota">
          Los consejeros nunca entran solos a un equipo — solo si tú los mueves a mano.
        </p>

        {!canEdit && (
          <p className="muted equipos-criterios-readonly">
            Solo un administrador puede cambiar estos ajustes.
          </p>
        )}

        {canEdit && (
          <>
            <div className="equipos-criterios-master">
              <ToggleSwitch
                checked={config?.equipos_auto ?? true}
                disabled={loading || !config}
                onChange={(v) => onChange("equipos_auto", v)}
                label={
                  config?.equipos_auto
                    ? "Cada quien que se registre entra solo a un equipo"
                    : "Nadie entra solo — solo con el botón «Repartir a todos»"
                }
              />
            </div>

            <div className="equipos-criterios-grid">
              {CRITERIOS.map(({ field, label, hint }) => (
                <div className="equipos-criterios-item" key={field}>
                  <ToggleSwitch
                    checked={config?.[field] ?? true}
                    disabled={loading || !config}
                    onChange={(v) => onChange(field, v)}
                    label={label}
                  />
                  <p className="muted equipos-criterios-hint">{hint}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Reveal>
  );
}
