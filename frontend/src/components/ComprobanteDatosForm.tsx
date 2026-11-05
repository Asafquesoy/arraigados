import { useState } from "react";
import type { ComprobanteMiembro, ComprobanteTipo } from "../lib/api";

export const COMPROBANTE_TIPO_LABEL: Record<ComprobanteTipo, string> = {
  transferencia: "Transferencia",
  deposito: "Depósito",
  ticket_descuento: "Ticket de descuento",
  campamento_gratis: "Campamento gratis",
  otro: "Otro",
};

export interface ComprobanteDatos {
  comp_tipo: ComprobanteTipo | null;
  monto_pesos: number | null;
  comp_fecha: string | null;
  comp_referencia: string | null;
  comp_clave_rastreo: string | null;
}

interface Props {
  /** Miembro cuyos datos se muestran como valores iniciales (el del grupo con monto). */
  base: ComprobanteMiembro;
  guardando: boolean;
  onGuardar: (datos: ComprobanteDatos) => void;
  onCancelar: () => void;
}

/** Corrección manual de lo que se leyó del comprobante. Los datos se aplican a
 * todo el grupo (misma transferencia), así que el padre hace un PATCH por miembro. */
export function ComprobanteDatosForm({ base, guardando, onGuardar, onCancelar }: Props) {
  const [tipo, setTipo] = useState<ComprobanteTipo | "">(base.comp_tipo ?? "");
  const [monto, setMonto] = useState(base.comp_monto_centavos != null ? String(base.comp_monto_centavos / 100) : "");
  const [fecha, setFecha] = useState(base.comp_fecha ?? "");
  const [referencia, setReferencia] = useState(base.comp_referencia ?? "");
  const [clave, setClave] = useState(base.comp_clave_rastreo ?? "");

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const m = monto.trim() === "" ? null : Number(monto);
    onGuardar({
      comp_tipo: tipo || null,
      monto_pesos: m != null && Number.isFinite(m) && m >= 0 ? m : null,
      comp_fecha: fecha || null,
      comp_referencia: referencia.trim() || null,
      comp_clave_rastreo: clave.trim() || null,
    });
  }

  return (
    <form className="conc-form" onSubmit={enviar}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`conc-tipo-${base.id}`}>Tipo</label>
          <select id={`conc-tipo-${base.id}`} value={tipo} onChange={(e) => setTipo(e.target.value as ComprobanteTipo | "")}>
            <option value="">Sin definir</option>
            {(Object.keys(COMPROBANTE_TIPO_LABEL) as ComprobanteTipo[]).map((t) => (
              <option key={t} value={t}>
                {COMPROBANTE_TIPO_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`conc-monto-${base.id}`}>Monto (pesos)</label>
          <input
            id={`conc-monto-${base.id}`}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`conc-fecha-${base.id}`}>Fecha de la operación</label>
          <input id={`conc-fecha-${base.id}`} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`conc-ref-${base.id}`}>Referencia / folio / n.º de cupón</label>
          <input
            id={`conc-ref-${base.id}`}
            type="text"
            maxLength={80}
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
          />
        </div>
        <div className="field conc-form-wide">
          <label htmlFor={`conc-clave-${base.id}`}>Clave de rastreo</label>
          <input
            id={`conc-clave-${base.id}`}
            type="text"
            maxLength={80}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
          />
        </div>
      </div>
      <div className="conc-form-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar datos"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
