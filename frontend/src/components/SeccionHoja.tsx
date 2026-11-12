import type { ReactNode } from "react";
import "./EstacionesCaptura.css";

/** Cómo se ve el punto de un bloque: pendiente (hueco), completo (verde) o falta (rojo, tras intentar guardar). */
export type EstadoVisual = "vacia" | "completa" | "falta" | "ninguno";

const TEXTO_ESTADO: Record<EstadoVisual, string> = {
  vacia: "pendiente",
  completa: "completo",
  falta: "falta completar",
  ninguno: "",
};

/**
 * Un campo de la hoja (Unidad, Pregunta, Palabra, ¿Fruto o carne?, Tiempo…) como un bloque propio: borde,
 * franja de título con el nombre que lleva en el papel y un puntito de estado. En escritorio (tabla) el CSS
 * lo convierte en una celda: el título lo da el encabezado de la columna y no se repite.
 */
export function Seccion({
  titulo,
  pista,
  estado = "ninguno",
  children,
}: {
  titulo: string;
  pista?: string;
  estado?: EstadoVisual;
  children: ReactNode;
}) {
  return (
    <section className={`estacion-seccion is-${estado}`} aria-label={titulo}>
      <header className="estacion-seccion-titulo">
        <span className="estacion-seccion-nombre">{titulo}</span>
        {pista && <span className="estacion-seccion-pista">{pista}</span>}
        {estado !== "ninguno" && <span className="estacion-punto" role="img" aria-label={TEXTO_ESTADO[estado]} />}
      </header>
      <div className="estacion-seccion-cuerpo">{children}</div>
    </section>
  );
}

/**
 * Una línea dentro de un bloque: etiqueta a la izquierda y control a la derecha. Si no caben juntos (teléfono
 * angosto) el control baja debajo de su etiqueta. `corta` es lo que se ve en lugar de la etiqueta en la tabla
 * de escritorio (p. ej. el número de la situación); `bloque` hace que el control ocupe todo el ancho.
 */
export function Campo({ etiqueta, corta, bloque, children }: { etiqueta: string; corta?: string; bloque?: boolean; children: ReactNode }) {
  return (
    <div className={`estacion-campo ${bloque ? "is-bloque" : ""}`}>
      <span className="estacion-campo-etiqueta">{etiqueta}</span>
      {corta && (
        <span className="estacion-campo-corta mono" aria-hidden="true">
          {corta}
        </span>
      )}
      <div className="estacion-campo-control">{children}</div>
    </div>
  );
}
