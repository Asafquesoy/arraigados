import type { TallaCamisa } from "../lib/api";
import { ShirtIcon } from "./icons";

const TALLAS: TallaCamisa[] = ["XS", "S", "M", "L", "XL", "XXL"];

interface ShirtSizeFieldProps {
  value: TallaCamisa | "";
  onChange: (value: TallaCamisa | "") => void;
  error?: string;
}

/**
 * Campo aislado a propósito: se muestra u oculta por completo desde
 * SHOW_SHIRT_SIZE en src/config.ts, sin tocar el resto del formulario.
 */
export function ShirtSizeField({ value, onChange, error }: ShirtSizeFieldProps) {
  return (
    <div className="field">
      <label htmlFor="talla_camisa">
        <ShirtIcon size={14} /> Talla de camisa
      </label>
      <select
        id="talla_camisa"
        value={value}
        onChange={(e) => onChange(e.target.value as TallaCamisa | "")}
      >
        <option value="">Selecciona una talla</option>
        {TALLAS.map((talla) => (
          <option key={talla} value={talla}>
            {talla}
          </option>
        ))}
      </select>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
