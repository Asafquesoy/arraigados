import type { ReactNode } from "react";
import type { Tri } from "../lib/estaciones";
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

/** Una fila de chips redondos para elegir una opción (¼ ½ ¾, 0–4, F/D, 1.º/2.º…). Tocar la elegida la quita. */
export function OpcionesChip<T extends string | number>({
  opciones,
  valor,
  onChange,
  etiqueta,
  invalido,
}: {
  opciones: { valor: T; texto: ReactNode; leer?: string }[];
  valor: T | null;
  onChange: (v: T | null) => void;
  etiqueta: string;
  invalido?: boolean;
}) {
  return (
    <div className={`opciones-chip ${invalido ? "is-invalido" : ""}`} role="radiogroup" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button
          key={String(o.valor)}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          aria-label={o.leer ? `${etiqueta}: ${o.leer}` : undefined}
          className={`opcion-chip ${valor === o.valor ? "is-activo" : ""}`}
          onClick={() => onChange(valor === o.valor ? null : o.valor)}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

/** Tiempo como en la hoja: «__ : __» (minutos y segundos), cada uno en su casilla. */
export function CampoTiempo({
  min,
  seg,
  onChange,
  etiqueta,
  invalido,
}: {
  min: string;
  seg: string;
  onChange: (min: string, seg: string) => void;
  etiqueta: string;
  invalido?: boolean;
}) {
  return (
    <div className={`campo-tiempo ${invalido ? "is-invalido" : ""}`}>
      <div className="field">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={99}
          step={1}
          value={min}
          placeholder="min"
          aria-label={`${etiqueta}: minutos`}
          aria-invalid={invalido ? true : undefined}
          onChange={(e) => onChange(e.target.value, seg)}
        />
      </div>
      <span className="campo-tiempo-sep" aria-hidden="true">
        :
      </span>
      <div className="field">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={59}
          step={1}
          value={seg}
          placeholder="seg"
          aria-label={`${etiqueta}: segundos`}
          aria-invalid={invalido ? true : undefined}
          onChange={(e) => onChange(min, e.target.value)}
        />
      </div>
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
