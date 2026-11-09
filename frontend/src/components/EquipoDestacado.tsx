import type { CSSProperties } from "react";
import type { EquipoBrief, TipoParticipante } from "../lib/api";
import { textoSobre } from "../lib/colorEquipo";
import "./EquipoDestacado.css";

interface EquipoDestacadoProps {
  equipo: EquipoBrief | null;
  esStaff?: boolean;
  tipo?: TipoParticipante | null;
  /** "bloque" = mosaico grande (tarjeta de Recepción); "pastilla" = en línea, para listas. */
  variante?: "bloque" | "pastilla";
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
