import type { ComponentType } from "react";
import type { IconProps } from "./icons/types";

interface YesNoFieldProps {
  id: string;
  label: string;
  icon?: ComponentType<IconProps>;
  value: boolean | "";
  onChange: (value: boolean | "") => void;
  onBlur?: () => void;
  error?: string;
  className?: string;
}

/**
 * Select genérico Sí/No — reutilizado por "¿Obtuviste alguna promoción?" y
 * "¿Estás bautizado?" en vez de duplicar dos selects booleanos idénticos.
 */
export function YesNoField({ id, label, icon: Icon, value, onChange, onBlur, error, className }: YesNoFieldProps) {
  return (
    <div className={`field ${error ? "has-error" : ""} ${className ?? ""}`}>
      <label htmlFor={id}>
        {Icon && <Icon size={14} />} {label}
      </label>
      <select
        id={id}
        value={value === "" ? "" : value ? "si" : "no"}
        onChange={(e) => onChange(e.target.value === "" ? "" : e.target.value === "si")}
        onBlur={onBlur}
      >
        <option value="">Selecciona una opción</option>
        <option value="si">Sí</option>
        <option value="no">No</option>
      </select>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
