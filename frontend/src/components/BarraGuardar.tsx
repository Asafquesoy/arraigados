import type { ReactNode } from "react";
import { fmtPts } from "../lib/juegos";
import "./EstacionesCaptura.css";

/**
 * Barra de guardado fija al pie de la pantalla (compartida por las hojas de estación y la de la capilla):
 * así, después de capturar un equipo, el botón no queda 3,000 px más abajo. Muestra qué estación es, cuántos
 * equipos lleva, el total en vivo y los avisos de error. Es un `<button type="submit">` del `<form>` que la contiene.
 */
export function BarraGuardar({
  resumen,
  total,
  aviso,
  error,
  guardando,
  sucio,
  etiqueta,
}: {
  /** «Amor · 3 de 10 equipos» */
  resumen: ReactNode;
  total: number;
  /** Aviso de lo que falta (del lado del cliente). */
  aviso?: string | null;
  /** Error que devolvió el servidor. */
  error?: string | null;
  guardando: boolean;
  sucio: boolean;
  /** «Guardar estación» / «Guardar capilla» */
  etiqueta: string;
}) {
  return (
    <div className="estacion-barra" role="group" aria-label="Guardar">
      {(aviso || error) && (
        <p className="field-error estacion-barra-error" role="alert">
          {error ?? aviso}
        </p>
      )}
      <div className="estacion-barra-info" aria-live="polite">
        <strong className="estacion-barra-total mono">{fmtPts(total)} pts</strong>
        <span className="muted estacion-barra-resumen">{resumen}</span>
      </div>
      <button type="submit" className="btn btn-primary estacion-barra-boton" disabled={guardando || !sucio}>
        {guardando && <span className="spinner" />}
        {guardando ? "Guardando..." : sucio ? etiqueta : "Sin cambios"}
      </button>
    </div>
  );
}
