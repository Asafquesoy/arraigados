import type { CSSProperties } from "react";
import type { EquipoBrief, TipoParticipante } from "../lib/api";
import "./EquipoDestacado.css";

interface EquipoDestacadoProps {
  equipo: EquipoBrief | null;
  esStaff?: boolean;
  tipo?: TipoParticipante | null;
  /** "bloque" = mosaico grande (tarjeta de Recepción); "pastilla" = en línea, para listas. */
  variante?: "bloque" | "pastilla";
}

/** Texto oscuro o claro según el brillo del color del equipo, para que el nombre
 *  se lea sobre cualquier color (el amarillo y el azul oscuro piden textos opuestos). */
function textoSobre(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "var(--hueso)";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "var(--corteza)" : "var(--hueso)";
}

/**
 * El equipo de una persona, bien visible: de aquí se toma el gafete en la mesa
 * de recepción, así que el nombre va grande y el color como relleno completo.
 * Sin equipo se muestra por qué (staff, consejero o pendiente) en vez de quedar vacío.
 */
export function EquipoDestacado({ equipo, esStaff, tipo, variante = "bloque" }: EquipoDestacadoProps) {
  if (!equipo) {
    const motivo = esStaff ? "Staff · no va en equipo" : tipo === "CONSEJERO" ? "Consejero · se asigna a mano" : "Avisa al admin";
    return (
      <div className={`equipo-destacado equipo-destacado--${variante} equipo-destacado--vacio`}>
        <span className="equipo-destacado-etiqueta">Equipo</span>
        <span className="equipo-destacado-nombre">{esStaff ? "Staff" : "Sin equipo"}</span>
        {variante === "bloque" && <span className="equipo-destacado-motivo">{motivo}</span>}
      </div>
    );
  }

  const estilo = { background: equipo.color, color: textoSobre(equipo.color) } as CSSProperties;
  return (
    <div className={`equipo-destacado equipo-destacado--${variante}`} style={estilo}>
      <span className="equipo-destacado-etiqueta">Equipo</span>
      <span className="equipo-destacado-nombre">{equipo.nombre}</span>
    </div>
  );
}
