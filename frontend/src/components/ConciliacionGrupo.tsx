import { useState } from "react";
import { AnimatePresence } from "motion/react";
import type { ComprobanteMiembro, ConciliacionGrupo as Grupo } from "../lib/api";
import { formatFechaCorta } from "../lib/fecha";
import { COMPROBANTE_TIPO_LABEL, ComprobanteDatosForm, type ComprobanteDatos } from "./ComprobanteDatosForm";
import { FieldReveal } from "./FieldReveal";
import { PencilIcon, ReceiptIcon, ShieldCheckIcon } from "./icons";
import { ToggleSwitch } from "./ToggleSwitch";
import "./ConciliacionGrupo.css";

export function pesos(centavos: number | null | undefined): string {
  if (centavos == null) return "—";
  return `$${(centavos / 100).toLocaleString("es-MX", { maximumFractionDigits: 2 })}`;
}

const FUENTE_LABEL: Record<string, string> = { gemini: "Leído con IA", local: "Leído localmente", manual: "Corregido a mano" };

interface Props {
  grupo: Grupo;
  puedeVerificarPago: boolean;
  ocupado: boolean;
  onVerComprobante: (m: ComprobanteMiembro) => void;
  onTogglePago: (m: ComprobanteMiembro, checked: boolean) => void;
  onGuardarDatos: (g: Grupo, datos: ComprobanteDatos) => Promise<boolean>;
  onRevisado: (g: Grupo, revisado: boolean, nota: string) => void;
}

export function ConciliacionGrupo({
  grupo,
  puedeVerificarPago,
  ocupado,
  onVerComprobante,
  onTogglePago,
  onGuardarDatos,
  onRevisado,
}: Props) {
  const [editando, setEditando] = useState(false);
  const [nota, setNota] = useState("");
  const n = grupo.miembros.length;
  const base = grupo.miembros.find((m) => m.comp_monto_centavos != null) ?? grupo.miembros[0];
  const esDinero = grupo.tipo === "transferencia" || grupo.tipo === "deposito";
  const hayAlta = grupo.alertas.some((a) => a.nivel === "alta");
  const revisado = grupo.estado === "revisado";
  const alertas = grupo.alertas;

  async function guardar(datos: ComprobanteDatos) {
    if (await onGuardarDatos(grupo, datos)) setEditando(false);
  }

  return (
    <article
      className={`glass-card conc-grupo conc-grupo--${grupo.estado} ${hayAlta && !revisado ? "conc-grupo--alta" : ""}`}
      aria-label={`Comprobante de ${grupo.miembros.map((m) => m.nombre).join(", ")}`}
    >
      <header className="conc-grupo-head">
        <div className="conc-grupo-resumen">
          <span className="conc-chip">{grupo.tipo ? COMPROBANTE_TIPO_LABEL[grupo.tipo] : "Sin leer"}</span>
          <p className="conc-monto mono">{pesos(grupo.monto_centavos)}</p>
          <p className="muted conc-fecha">
            {grupo.fecha ? formatFechaCorta(grupo.fecha) : "Sin fecha"}
            {base.comp_banco ? ` · ${base.comp_banco}` : ""}
          </p>
        </div>
        <div className="conc-cubre">
          {esDinero && grupo.cubre != null && grupo.tarifa != null ? (
            <>
              <p className={`conc-cubre-num ${grupo.cubre >= n ? "is-ok" : "is-mal"}`}>
                Cubre {grupo.cubre} de {n}
              </p>
              <p className="muted conc-cubre-det">
                {n} {n === 1 ? "inscripción" : "inscripciones"} × ${grupo.tarifa} = {pesos(grupo.esperado_centavos)}
              </p>
            </>
          ) : (
            <p className="muted conc-cubre-det">{n} {n === 1 ? "registro" : "registros"}</p>
          )}
          {revisado && (
            <p className="conc-revisado">
              <ShieldCheckIcon size={14} /> Revisado{base.comp_revisado_por ? ` por ${base.comp_revisado_por}` : ""}
            </p>
          )}
        </div>
      </header>

      {alertas.length > 0 && (
        <ul className="conc-alertas" aria-label="Alertas">
          {alertas.map((a) => (
            <li key={a.codigo} className={`conc-alerta conc-alerta--${a.nivel}`}>
              {a.texto}
            </li>
          ))}
        </ul>
      )}

      {grupo.por_que_juntos.length > 0 && (
        <p className="muted conc-juntos">Agrupados por: {grupo.por_que_juntos.join(", ")}.</p>
      )}

      <p className="conc-datos mono">
        {base.comp_referencia && <span>Ref. {base.comp_referencia}</span>}
        {base.comp_clave_rastreo && <span>Rastreo {base.comp_clave_rastreo}</span>}
        {base.ocr_fuente && <span className="conc-fuente">{FUENTE_LABEL[base.ocr_fuente] ?? base.ocr_fuente}</span>}
      </p>

      <ul className="conc-miembros">
        {grupo.miembros.map((m) => (
          <li key={m.id} className="conc-miembro">
            <div className="conc-miembro-info">
              <p className="conc-miembro-nombre">
                {m.nombre}
                {m.tipo === "CONSEJERO" && <span className="conc-chip conc-chip--sm">Consejero</span>}
              </p>
              <p className="muted conc-miembro-sub">
                <span className="mono">{m.folio}</span> · {m.iglesia}
                {m.fecha_pago ? ` · dijo pagar el ${formatFechaCorta(m.fecha_pago)}` : ""}
              </p>
              {m.tiene_promocion && m.promocion_detalle && (
                <p className="muted conc-miembro-sub">Promoción: «{m.promocion_detalle}»</p>
              )}
            </div>
            <div className="conc-miembro-acciones">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onVerComprobante(m)}>
                <ReceiptIcon size={15} /> Ver
              </button>
              <ToggleSwitch
                checked={m.pago_verificado}
                disabled={!puedeVerificarPago}
                onChange={(c) => onTogglePago(m, c)}
                label="Pago verificado"
              />
            </div>
          </li>
        ))}
      </ul>

      <AnimatePresence initial={false}>
        {editando && (
          <FieldReveal key="form">
            <ComprobanteDatosForm
              base={base}
              guardando={ocupado}
              onGuardar={guardar}
              onCancelar={() => setEditando(false)}
            />
          </FieldReveal>
        )}
      </AnimatePresence>

      <div className="conc-acciones">
        {!editando && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditando(true)}>
            <PencilIcon size={15} /> Corregir datos
          </button>
        )}
        {revisado ? (
          <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => onRevisado(grupo, false, "")}>
            Quitar revisado
          </button>
        ) : (
          <>
            <input
              type="text"
              className="conc-nota"
              aria-label="Nota de la revisión (opcional)"
              placeholder="Nota (opcional)"
              maxLength={300}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={ocupado}
              onClick={() => onRevisado(grupo, true, nota)}
            >
              Marcar revisado
            </button>
          </>
        )}
      </div>
      {revisado && base.comp_nota && <p className="muted conc-nota-texto">Nota: {base.comp_nota}</p>}
    </article>
  );
}
