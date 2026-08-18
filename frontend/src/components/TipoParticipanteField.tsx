import type { TipoParticipante } from "../lib/api";
import { UserIcon } from "./icons";

const TIPOS: TipoParticipante[] = ["CAMPERO", "CONSEJERO"];

export const TIPO_LABEL: Record<TipoParticipante, string> = {
  CAMPERO: "Campero",
  CONSEJERO: "Consejero",
};

interface TipoParticipanteFieldProps {
  value: TipoParticipante | "";
  onChange: (value: TipoParticipante | "") => void;
  onBlur?: () => void;
  error?: string;
}

export function TipoParticipanteField({ value, onChange, onBlur, error }: TipoParticipanteFieldProps) {
  return (
    <div className={`field ${error ? "has-error" : ""}`}>
      <label htmlFor="tipo">
        <UserIcon size={14} /> Te registras como
      </label>
      <select id="tipo" value={value} onChange={(e) => onChange(e.target.value as TipoParticipante | "")} onBlur={onBlur}>
        <option value="">Selecciona una opción</option>
        {TIPOS.map((tipo) => (
          <option key={tipo} value={tipo}>
            {TIPO_LABEL[tipo]}
          </option>
        ))}
      </select>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
