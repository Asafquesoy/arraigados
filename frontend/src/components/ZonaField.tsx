import type { Zona } from "../lib/api";
import { CityIcon } from "./icons";

const ZONAS: Zona[] = ["VALLES", "VICTORIA", "MANTE", "METRO", "OTRO"];

export const ZONA_LABEL: Record<Zona, string> = {
  VALLES: "Valles",
  VICTORIA: "Victoria",
  MANTE: "Mante",
  METRO: "Metro (Tampico, Madero, Altamira)",
  OTRO: "Otro",
};

interface ZonaFieldProps {
  value: Zona | "";
  onChange: (value: Zona | "") => void;
  onBlur?: () => void;
  error?: string;
}

export function ZonaField({ value, onChange, onBlur, error }: ZonaFieldProps) {
  return (
    <div className={`field ${error ? "has-error" : ""}`}>
      <label htmlFor="zona">
        <CityIcon size={14} /> Zona
      </label>
      <select id="zona" value={value} onChange={(e) => onChange(e.target.value as Zona | "")} onBlur={onBlur}>
        <option value="">Selecciona una opción</option>
        {ZONAS.map((zona) => (
          <option key={zona} value={zona}>
            {ZONA_LABEL[zona]}
          </option>
        ))}
      </select>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
