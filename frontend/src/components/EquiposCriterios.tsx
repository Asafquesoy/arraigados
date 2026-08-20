import { ToggleSwitch } from "./ToggleSwitch";
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
 * Contenido del panel "Cómo se reparten" dentro de EquiposToolbar.tsx — seis
 * interruptores: el maestro ("acomodar solo") y los cinco criterios de
 * balanceo que consume equipos_balance.py en el backend. Ya no trae su
 * propio glass-card/Reveal: el panel plegable que lo envuelve pone el marco.
 */
export function EquiposCriterios({ config, loading, canEdit, onChange }: EquiposCriteriosProps) {
  return (
    <div className="equipos-criterios">
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
  );
}
