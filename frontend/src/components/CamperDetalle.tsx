// Items del detalle expandible de un registro — compartido por la tabla de
// escritorio y la tarjeta móvil de AdminPanel.tsx, para que ambas vistas
// nunca vuelvan a mostrar campos distintos para el mismo camper (antes de
// esto, el detalle de escritorio mostraba Teléfono/Bautizado sin importar el
// tipo, mientras la tarjeta móvil sí lo filtraba correctamente).
import { MES_LABEL } from "./BautismoFechaField";
import { formatFechaCorta, formatFechaHora } from "../lib/fecha";
import type { CamperOut } from "../lib/api";

interface CamperDetalleProps {
  camper: CamperOut;
  showShirtSize: boolean;
}

export function CamperDetalle({ camper, showShirtSize }: CamperDetalleProps) {
  return (
    <div className="admin-table-detail-grid">
      <div className="admin-table-detail-item">
        <span className="admin-table-detail-label">Edad</span>
        <span>{camper.edad} años</span>
      </div>
      <div className="admin-table-detail-item">
        <span className="admin-table-detail-label">Sexo</span>
        <span>{camper.sexo === "M" ? "Masculino" : "Femenino"}</span>
      </div>
      {showShirtSize && (
        <div className="admin-table-detail-item">
          <span className="admin-table-detail-label">Talla</span>
          <span>{camper.talla_camisa === "OTRA" ? camper.talla_otra || "Otra" : camper.talla_camisa ?? "—"}</span>
        </div>
      )}
      {camper.tipo === "CONSEJERO" && (
        <div className="admin-table-detail-item">
          <span className="admin-table-detail-label">Teléfono</span>
          <span className="mono">{camper.telefono || "—"}</span>
        </div>
      )}
      {camper.tipo === "CAMPERO" && (
        <div className="admin-table-detail-item">
          <span className="admin-table-detail-label">Bautizado</span>
          <span>
            {camper.bautizado
              ? camper.bautismo_mes && camper.bautismo_anio
                ? `Sí (${MES_LABEL[camper.bautismo_mes]} ${camper.bautismo_anio})`
                : "Sí"
              : "No"}
          </span>
        </div>
      )}
      <div className="admin-table-detail-item">
        <span className="admin-table-detail-label">Promoción</span>
        <span>{camper.tiene_promocion ? camper.promocion_detalle || "Sí" : "No"}</span>
      </div>
      <div className="admin-table-detail-item">
        <span className="admin-table-detail-label">Fecha de pago</span>
        <span className="mono">{formatFechaCorta(camper.fecha_pago)}</span>
      </div>
      {camper.pago_verificado && (
        <div className="admin-table-detail-item">
          <span className="admin-table-detail-label">Verificado por</span>
          <span>
            {camper.verificado_por ?? "—"}
            {camper.verificado_en && (
              <>
                <br />
                <span className="muted mono">{formatFechaHora(camper.verificado_en)}</span>
              </>
            )}
          </span>
        </div>
      )}
      {camper.asistio && (
        <div className="admin-table-detail-item">
          <span className="admin-table-detail-label">Llegada registrada por</span>
          <span>
            {camper.asistio_por ?? "—"}
            {camper.asistio_en && (
              <>
                <br />
                <span className="muted mono">{formatFechaHora(camper.asistio_en)}</span>
              </>
            )}
          </span>
        </div>
      )}
      <div className="admin-table-detail-item">
        <span className="admin-table-detail-label">Registrado el</span>
        <span className="mono">{formatFechaHora(camper.created_at)}</span>
      </div>
    </div>
  );
}
