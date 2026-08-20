import { useState, type CSSProperties, type FormEvent } from "react";
import { m } from "motion/react";
import { ColorSwatches } from "./ColorSwatches";
import { ConfirmButton } from "./ConfirmButton";
import { MoverMiembro } from "./MoverMiembro";
import { Reveal } from "./Reveal";
import { CheckIcon, ReceiptIcon, ShieldCheckIcon, UserIcon } from "./icons";
import type { EquipoOut, MiembroOut } from "../lib/api";
import "./EquipoCard.css";

interface EquipoCardProps {
  equipo: EquipoOut;
  equipos: EquipoOut[];
  canEdit: boolean;
  q: string;
  movingId: number | null;
  busyId: number | null;
  delay?: number;
  onToggleMove: (id: number) => void;
  onMover: (miembro: MiembroOut, equipoActualId: number | null, destinoId: number | null) => void;
  onRename: (nombre: string, color: string) => Promise<void>;
  onDelete: () => void;
  /** "resumen": tarjeta compacta y clicable, sin lista de miembros — para la
   *  pestaña Resumen. "detalle" (default): lo de siempre, con la lista
   *  completa — para cuando ese equipo está seleccionado en las pestañas. */
  variant?: "resumen" | "detalle";
  onSelect?: () => void;
  /** Proporción 0–1 del tamaño de este equipo respecto al más grande —
   *  pinta la barra de tamaño en la variante "resumen" para que el
   *  desbalance salte a la vista sin leer números. */
  tamanoRelativo?: number;
}

function coincide(m: MiembroOut, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return m.nombre.toLowerCase().includes(needle) || m.iglesia.toLowerCase().includes(needle);
}

export function EquipoCard({
  equipo,
  equipos,
  canEdit,
  q,
  movingId,
  busyId,
  delay = 0,
  onToggleMove,
  onMover,
  onRename,
  onDelete,
  variant = "detalle",
  onSelect,
  tamanoRelativo,
}: EquipoCardProps) {
  const [editing, setEditing] = useState(false);
  const [draftNombre, setDraftNombre] = useState(equipo.nombre);
  const [draftColor, setDraftColor] = useState(equipo.color);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!draftNombre.trim()) {
      setError("Ponle un nombre al equipo.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onRename(draftNombre.trim(), draftColor);
      setEditing(false);
    } catch {
      setError("No se pudo guardar. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  const miembrosFiltrados = equipo.miembros.filter((m) => coincide(m, q));
  const { stats } = equipo;

  if (variant === "resumen") {
    return (
      <Reveal delay={delay} className="equipo-card-wrap">
        <m.button
          type="button"
          className="glass-card equipo-card equipo-card--resumen"
          style={{ "--color-equipo": equipo.color } as CSSProperties}
          onClick={onSelect}
        >
          <div className="equipo-card-header">
            <span className="equipo-card-dot" aria-hidden="true" />
            <h2 className="equipo-card-nombre">{equipo.nombre}</h2>
            <span className="muted equipo-card-total">
              <UserIcon size={13} /> {stats.total}
            </span>
          </div>

          <div className="equipo-card-barra" aria-hidden="true">
            <div className="equipo-card-barra-relleno" style={{ width: `${Math.round((tamanoRelativo ?? 0) * 100)}%` }} />
          </div>

          <div className="equipo-card-stats">
            {stats.edad_promedio !== null && (
              <span className="equipo-card-stat">Edad prom. {stats.edad_promedio}</span>
            )}
            <span className="equipo-card-stat">
              <ShieldCheckIcon size={13} /> Bautizados {stats.bautizados}/{stats.total}
            </span>
            <span className="equipo-card-stat">
              H {stats.hombres} / M {stats.mujeres}
            </span>
            <span className="equipo-card-stat">
              <ReceiptIcon size={13} /> {stats.iglesias_distintas} iglesias
            </span>
            {stats.consejeros > 0 && (
              <span className="equipo-card-stat">
                <CheckIcon size={13} /> {stats.consejeros} consejero{stats.consejeros === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </m.button>
      </Reveal>
    );
  }

  return (
    <Reveal delay={delay} className="equipo-card-wrap">
      <m.div
        className="glass-card equipo-card"
        style={{ "--color-equipo": equipo.color } as CSSProperties}
      >
        {editing ? (
          <form className="equipo-card-edit-form" onSubmit={handleSave}>
            <div className="field">
              <label htmlFor={`nombre-${equipo.id}`}>Nombre</label>
              <input
                id={`nombre-${equipo.id}`}
                type="text"
                value={draftNombre}
                onChange={(e) => setDraftNombre(e.target.value)}
                autoFocus
                maxLength={80}
              />
            </div>
            <ColorSwatches value={draftColor} onChange={setDraftColor} disabled={saving} />
            {error && <p className="field-error">{error}</p>}
            <div className="equipo-card-edit-actions">
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                {saving ? "Guardando..." : "Guardar"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setDraftNombre(equipo.nombre);
                  setDraftColor(equipo.color);
                  setError(null);
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div className="equipo-card-header">
            <span className="equipo-card-dot" aria-hidden="true" />
            <h2 className="equipo-card-nombre">{equipo.nombre}</h2>
            <span className="muted equipo-card-total">
              <UserIcon size={13} /> {stats.total}
            </span>
            {canEdit && (
              <div className="equipo-card-header-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
                  Editar
                </button>
                <ConfirmButton
                  label="Borrar"
                  confirmLabel="¿Seguro? Sí, borrar"
                  className="btn-sm"
                  onConfirm={onDelete}
                />
              </div>
            )}
          </div>
        )}

        <div className="equipo-card-stats">
          {stats.edad_promedio !== null && (
            <span className="equipo-card-stat">Edad prom. {stats.edad_promedio}</span>
          )}
          <span className="equipo-card-stat">
            <ShieldCheckIcon size={13} /> Bautizados {stats.bautizados}/{stats.total}
          </span>
          <span className="equipo-card-stat">
            H {stats.hombres} / M {stats.mujeres}
          </span>
          <span className="equipo-card-stat">
            <ReceiptIcon size={13} /> {stats.iglesias_distintas} iglesias
          </span>
          {stats.consejeros > 0 && (
            <span className="equipo-card-stat">
              <CheckIcon size={13} /> {stats.consejeros} consejero{stats.consejeros === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <div className="equipo-card-miembros">
          {equipo.miembros.length === 0 && <p className="muted equipo-card-empty">Aún no hay nadie en este equipo.</p>}
          {equipo.miembros.length > 0 && miembrosFiltrados.length === 0 && (
            <p className="muted equipo-card-empty">Nadie coincide con la búsqueda en este equipo.</p>
          )}
          {miembrosFiltrados.map((m) => (
            <MoverMiembro
              key={m.id}
              miembro={m}
              equipoActualId={equipo.id}
              equipos={equipos}
              canEdit={canEdit}
              open={movingId === m.id}
              busy={busyId === m.id}
              highlighted={q !== "" && coincide(m, q)}
              onToggle={() => onToggleMove(m.id)}
              onMover={(destinoId) => onMover(m, equipo.id, destinoId)}
            />
          ))}
        </div>
      </m.div>
    </Reveal>
  );
}
