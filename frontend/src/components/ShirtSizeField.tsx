import type { TallaCamisa } from "../lib/api";
import { ShirtIcon } from "./icons";

const TALLAS: TallaCamisa[] = ["XCH", "CH", "M", "G", "XG", "OTRA"];

interface ShirtSizeFieldProps {
  value: TallaCamisa | "";
  onChange: (value: TallaCamisa | "") => void;
  onBlur?: () => void;
  error?: string;
  otra: string;
  onOtraChange: (value: string) => void;
  onOtraBlur?: () => void;
  otraError?: string;
}

/**
 * Campo aislado a propósito: se muestra u oculta por completo según
 * useSettings().showShirtSize (editable desde el panel admin, sección
 * "Camisetas"), sin tocar el resto del formulario.
 */
export function ShirtSizeField({
  value,
  onChange,
  onBlur,
  error,
  otra,
  onOtraChange,
  onOtraBlur,
  otraError,
}: ShirtSizeFieldProps) {
  return (
    <>
      <div className={`field ${error ? "has-error" : ""}`}>
        <label htmlFor="talla_camisa">
          <ShirtIcon size={14} /> Talla de playera
        </label>
        <select
          id="talla_camisa"
          value={value}
          onChange={(e) => onChange(e.target.value as TallaCamisa | "")}
          onBlur={onBlur}
        >
          <option value="">Selecciona una talla</option>
          {TALLAS.map((talla) => (
            <option key={talla} value={talla}>
              {talla === "OTRA" ? "Otra talla" : talla}
            </option>
          ))}
        </select>
        {error && <span className="field-error">{error}</span>}
      </div>

      {value === "OTRA" && (
        <div className={`field ${otraError ? "has-error" : ""}`}>
          <label htmlFor="talla_otra">Menciona cuál</label>
          <input
            id="talla_otra"
            type="text"
            value={otra}
            onChange={(e) => onOtraChange(e.target.value)}
            onBlur={onOtraBlur}
            placeholder="Talla"
          />
          {otraError && <span className="field-error">{otraError}</span>}
        </div>
      )}
    </>
  );
}
