import "./ColorSwatches.css";

// Ocho colores tomados directo de tokens.css — mantiene los equipos dentro
// de la misma paleta del sitio en vez de dejar que cualquier color entre.
// El último swatch es un <input type="color"> nativo disfrazado de swatch:
// la salida para quien de verdad quiere un color fuera de la paleta.
const PALETA = [
  "#ffc800", // amarillo
  "#f5a623", // ambar
  "#ff8a3c", // naranja-raiz
  "#7fb539", // verde-follaje
  "#a7d94f", // verde-claro
  "#2c9be0", // azul-cielo
  "#ff9d8a", // coral-error
  "#f7f3e3", // hueso
];

interface ColorSwatchesProps {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}

export function ColorSwatches({ value, onChange, disabled }: ColorSwatchesProps) {
  const esPersonalizado = !PALETA.some((c) => c.toLowerCase() === value.toLowerCase());

  return (
    <div className="color-swatches" role="radiogroup" aria-label="Color del equipo">
      {PALETA.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={!esPersonalizado && value.toLowerCase() === color.toLowerCase()}
          aria-label={color}
          className={`color-swatch ${!esPersonalizado && value.toLowerCase() === color.toLowerCase() ? "is-selected" : ""}`}
          style={{ background: color }}
          disabled={disabled}
          onClick={() => onChange(color)}
        />
      ))}
      <label
        className={`color-swatch color-swatch--custom ${esPersonalizado ? "is-selected" : ""}`}
        style={esPersonalizado ? { background: value } : undefined}
        title="Otro color"
      >
        {!esPersonalizado && <span aria-hidden="true">+</span>}
        <input
          type="color"
          value={esPersonalizado ? value : "#ffffff"}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Elegir otro color"
        />
      </label>
    </div>
  );
}
