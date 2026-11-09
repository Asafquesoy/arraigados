// Tarjeta de un campero en el panel de admin para celular/tablet (<1024px). La
// tabla de escritorio y esta tarjeta muestran los mismos datos: el detalle
// plegable es `CamperDetalle`, compartido, para que nunca diverjan.
import type { CSSProperties } from "react";
import { AnimatePresence, m } from "motion/react";
import type { CamperOut } from "../lib/api";
import { iniciales, textoSobre } from "../lib/colorEquipo";
import { CamperDetalle } from "./CamperDetalle";
import { ConfirmButton } from "./ConfirmButton";
import { TIPO_LABEL } from "./TipoParticipanteField";
import { ToggleSwitch } from "./ToggleSwitch";
import { ZONA_LABEL } from "./ZonaField";
import { CheckIcon, ChevronDownIcon, ChurchIcon, PencilIcon, ReceiptIcon, ShieldCheckIcon } from "./icons";
import "./AdminCamperCard.css";

interface AdminCamperCardProps {
  camper: CamperOut;
  abierto: boolean;
  reduceMotion: boolean | null;
  showShirtSize: boolean;
  puedeVerificarPago: boolean;
  puedeEditar: boolean;
  puedeBorrar: boolean;
  onToggleDetalle: () => void;
  onTogglePago: (checked: boolean) => void;
  onVerComprobante: () => void;
  onEditar: () => void;
  onToggleStaff: () => void;
  onBorrar: () => void;
}

export function AdminCamperCard({
  camper,
  abierto,
  reduceMotion,
  showShirtSize,
  puedeVerificarPago,
  puedeEditar,
  puedeBorrar,
  onToggleDetalle,
  onTogglePago,
  onVerComprobante,
  onEditar,
  onToggleStaff,
  onBorrar,
}: AdminCamperCardProps) {
  const color = camper.equipo?.color ?? null;
  // La franja de la izquierda y el avatar llevan el color del equipo; sin equipo, el ámbar del sitio.
  const estilo = { "--color-equipo": color ?? "var(--ambar)" } as CSSProperties;
  const estiloAvatar: CSSProperties = color ? { background: color, color: textoSobre(color) } : {};
  // "Metro (Tampico, Madero, Altamira)" es largo para una pastilla: solo lo anterior al paréntesis.
  const zona = camper.zona ? ZONA_LABEL[camper.zona].split(" (")[0] : null;
  const verificado = camper.pago_verificado;

  return (
    <article className="glass-card admin-row" style={estilo}>
      <header className="admin-row-top">
        <span className="admin-row-avatar" style={estiloAvatar} aria-hidden="true">
          {iniciales(camper.nombre)}
        </span>
        <div className="admin-row-id">
          <h3 className="admin-row-name">{camper.nombre}</h3>
          <p className="admin-row-iglesia">
            <ChurchIcon size={13} />
            <span>{camper.iglesia}</span>
          </p>
        </div>
        <span className="mono admin-row-folio">{camper.folio}</span>
      </header>

      <div className="admin-row-pills">
        {camper.equipo ? (
          <span className="admin-row-pill admin-row-pill--equipo">
            <span className="admin-row-pill-dot" style={{ background: camper.equipo.color }} />
            {camper.equipo.nombre}
          </span>
        ) : camper.es_staff ? (
          <span className="admin-row-pill admin-row-pill--equipo">Staff</span>
        ) : (
          <span className="admin-row-pill admin-row-pill--vacio">Sin equipo</span>
        )}
        <span className="admin-row-pill">{camper.tipo ? TIPO_LABEL[camper.tipo] : "—"}</span>
        {zona && <span className="admin-row-pill">{zona}</span>}
        {camper.asistio && (
          <span className="admin-row-pill admin-row-pill--llego">
            <CheckIcon size={12} /> Llegó
          </span>
        )}
      </div>

      <div className={`admin-row-pago ${verificado ? "is-ok" : "is-pendiente"}`}>
        <ShieldCheckIcon size={20} className="admin-row-pago-icono" />
        <div className="admin-row-pago-texto">
          <strong>{verificado ? "Pago verificado" : "Pago pendiente"}</strong>
          <span>
            {verificado
              ? camper.verificado_por
                ? `por ${camper.verificado_por}`
                : "listo"
              : camper.tiene_comprobante
                ? "Revisa el comprobante"
                : "Sin comprobante todavía"}
          </span>
        </div>
        {puedeVerificarPago && (
          <ToggleSwitch
            checked={verificado}
            onChange={onTogglePago}
            label={verificado ? "Quitar verificación de pago" : "Marcar pago como verificado"}
          />
        )}
      </div>

      <div className="admin-row-acciones">
        {camper.tiene_comprobante ? (
          <button type="button" className="btn btn-ghost admin-row-btn" onClick={onVerComprobante}>
            <ReceiptIcon size={16} /> Comprobante
          </button>
        ) : (
          <span className="admin-row-sin-recibo">
            <ReceiptIcon size={16} /> Sin comprobante
          </span>
        )}
        <button
          type="button"
          className="btn btn-ghost admin-row-btn"
          aria-expanded={abierto}
          onClick={onToggleDetalle}
        >
          {abierto ? "Ocultar" : "Detalle"}
          <ChevronDownIcon size={16} className={abierto ? "is-open" : ""} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {abierto && (
          <m.div
            className="admin-row-detalle"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={
              reduceMotion
                ? { opacity: 1, transition: { duration: 0.15 } }
                : { opacity: 1, height: "auto", transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] } }
            }
            exit={
              reduceMotion
                ? { opacity: 0, transition: { duration: 0.15 } }
                : { opacity: 0, height: 0, transition: { duration: 0.2, ease: [0.7, 0, 0.84, 0] } }
            }
          >
            <CamperDetalle camper={camper} showShirtSize={showShirtSize} />
            {(puedeEditar || puedeBorrar) && (
              <div className="admin-row-actions">
                {puedeEditar && (
                  <button className="btn btn-ghost admin-ticket-btn" onClick={onEditar}>
                    <PencilIcon size={16} /> Editar
                  </button>
                )}
                {puedeEditar && (
                  <button className="btn btn-ghost admin-ticket-btn" onClick={onToggleStaff}>
                    {camper.es_staff ? "Quitar de staff" : "Marcar como staff"}
                  </button>
                )}
                {puedeBorrar && (
                  <ConfirmButton
                    label="Borrar registro"
                    confirmLabel="¿Seguro? Sí, borrar"
                    className="admin-delete-btn"
                    onConfirm={onBorrar}
                  />
                )}
              </div>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </article>
  );
}
