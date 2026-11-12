import type { ReactNode } from "react";
import { fmtDigitos, segundosInvalidos, soloDigitos, type Tri } from "../lib/estaciones";
import "./EstacionesCaptura.css";

/** ✔ / ✖ como las dos marcas que el encargado circula en su hoja. Tocar la marca elegida la quita. */
export function MarcaSiNo({
  valor,
  onChange,
  etiqueta,
  invalido,
  textoSi = "bien",
  textoNo = "mal",
}: {
  valor: Tri;
  onChange: (v: Tri) => void;
  /** Lo que se lee en voz alta: «Prueba de raíz», «Unidad»… */
  etiqueta: string;
  invalido?: boolean;
  textoSi?: string;
  textoNo?: string;
}) {
  return (
    <div className={`marca-sino ${invalido ? "is-invalido" : ""}`} role="radiogroup" aria-label={etiqueta}>
      <button
        type="button"
        role="radio"
        aria-checked={valor === true}
        aria-label={`${etiqueta}: ${textoSi}`}
        className={`marca-btn is-si ${valor === true ? "is-activo" : ""}`}
        onClick={() => onChange(valor === true ? null : true)}
      >
        <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={valor === false}
        aria-label={`${etiqueta}: ${textoNo}`}
        className={`marca-btn is-no ${valor === false ? "is-activo" : ""}`}
        onClick={() => onChange(valor === false ? null : false)}
      >
        <svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Una fila de chips redondos para elegir una opción (¼ ½ ¾, 0–4, F/D…). Por omisión tocar la elegida la quita;
 * con `quitable={false}` siempre queda una elegida. Con `ancho` los botones se reparten todo el ancho (como un
 * control segmentado: «Terminó» / «No terminó»).
 */
export function OpcionesChip<T extends string | number>({
  opciones,
  valor,
  onChange,
  etiqueta,
  invalido,
  ancho,
  quitable = true,
}: {
  opciones: { valor: T; texto: ReactNode; leer?: string }[];
  valor: T | null;
  onChange: (v: T | null) => void;
  etiqueta: string;
  invalido?: boolean;
  ancho?: boolean;
  quitable?: boolean;
}) {
  return (
    <div className={`opciones-chip ${ancho ? "is-ancho" : ""} ${invalido ? "is-invalido" : ""}`} role="radiogroup" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button
          key={String(o.valor)}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          aria-label={o.leer ? `${etiqueta}: ${o.leer}` : undefined}
          className={`opcion-chip ${valor === o.valor ? "is-activo" : ""}`}
          onClick={() => onChange(valor === o.valor && quitable ? null : o.valor)}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

/**
 * Tiempo en UNA casilla: se escriben los números seguidos y las dos últimas cifras son los segundos
 * (250 → 2:50, 45 → 0:45, 1030 → 10:30). El teclado numérico del celular no trae «:», y así es un solo
 * toque. `valor` son solo los dígitos; lo que se ve ya lleva los dos puntos.
 */
export function CampoTiempo({
  valor,
  onChange,
  etiqueta,
  invalido,
}: {
  valor: string;
  onChange: (digitos: string) => void;
  etiqueta: string;
  invalido?: boolean;
}) {
  const malo = invalido || segundosInvalidos(valor);
  return (
    <div className={`campo-tiempo field ${malo ? "is-invalido" : ""}`}>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        enterKeyHint="next"
        value={fmtDigitos(valor)}
        placeholder="0:00"
        aria-label={`${etiqueta} (escribe los números seguidos: 250 es 2:50)`}
        aria-invalid={malo ? true : undefined}
        onChange={(e) => onChange(soloDigitos(e.target.value))}
      />
    </div>
  );
}

/** Casilla numérica corta («__ de __», «Son __»). */
export function CampoNumero({
  valor,
  onChange,
  etiqueta,
  invalido,
  max = 999,
}: {
  valor: string;
  onChange: (v: string) => void;
  etiqueta: string;
  invalido?: boolean;
  max?: number;
}) {
  return (
    <div className={`campo-numero field ${invalido ? "is-invalido" : ""}`}>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        step={1}
        value={valor}
        aria-label={etiqueta}
        aria-invalid={invalido ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
