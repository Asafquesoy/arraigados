import type { CSSProperties } from "react";
import { PinIcon } from "./icons";
import type { EquipoOut, MiembroOut } from "../lib/api";
import { ZONA_LABEL } from "./ZonaField";
import "./MoverMiembro.css";

interface MoverMiembroProps {
  miembro: MiembroOut;
  equipoActualId: number | null;
  equipos: EquipoOut[];
  canEdit: boolean;
  open: boolean;
  busy: boolean;
  highlighted: boolean;
  onToggle: () => void;
  onMover: (equipoId: number | null) => void;
}

/**
 * Fila de una persona dentro de una tarjeta de equipo (o de "Sin equipo"),
 * con el botón "Mover" que despliega, debajo de la persona, un botón grande
 * por cada equipo — nada de arrastrar y soltar, que es frágil en táctil y
 * poco descubrible para alguien no técnico.
 */
export function MoverMiembro({
  miembro,
  equipoActualId,
  equipos,
  canEdit,
  open,
  busy,
  highlighted,
  onToggle,
  onMover,
}: MoverMiembroProps) {
  return (
    <div className={`mover-miembro ${highlighted ? "is-highlighted" : ""}`}>
      <div className="mover-miembro-row">
        <div className="mover-miembro-info">
          <p className="mover-miembro-nombre">
            {miembro.nombre}
            {miembro.equipo_fijado && (
              <span className="mover-miembro-pin" title="Lo moviste a mano — «Repartir a todos» no lo cambia">
                <PinIcon size={13} />
              </span>
            )}
          </p>
          <p className="muted mover-miembro-meta">
            {miembro.iglesia}
            {miembro.zona ? ` · ${ZONA_LABEL[miembro.zona]}` : ""} · {miembro.edad} años
            {miembro.tipo === "CONSEJERO" ? " · Consejero" : ""}
          </p>
        </div>
        {canEdit && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onToggle} disabled={busy}>
            {busy ? "Moviendo..." : open ? "Cancelar" : "Mover"}
          </button>
        )}
      </div>

      {open && (
        <div className="mover-miembro-opciones" role="group" aria-label={`Mover a ${miembro.nombre}`}>
          {equipos
            .filter((e) => e.id !== equipoActualId)
            .map((e) => (
              <button
                key={e.id}
                type="button"
                className="mover-miembro-opcion"
                style={{ "--color-equipo": e.color } as CSSProperties}
                onClick={() => onMover(e.id)}
              >
                <span className="mover-miembro-dot" /> {e.nombre}
              </button>
            ))}
          {equipoActualId !== null && (
            <button type="button" className="mover-miembro-opcion mover-miembro-opcion--fuera" onClick={() => onMover(null)}>
              Sacar del equipo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
