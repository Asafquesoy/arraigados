import { useState } from "react";
import { AnimatePresence } from "motion/react";
import type { ComprobanteMiembro, ConciliacionGrupo as Grupo } from "../lib/api";
import { formatFechaCorta } from "../lib/fecha";
import { COMPROBANTE_TIPO_LABEL, ComprobanteDatosForm, type ComprobanteDatos } from "./ComprobanteDatosForm";
import { FieldReveal } from "./FieldReveal";
import { PencilIcon, ReceiptIcon } from "./icons";
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
  const hayMedia = grupo.alertas.some((a) => a.nivel === "media");
  const ORDEN_NIVEL: Record<string, number> = { alta: 0, media: 1, info: 2 };
  const alertas = [...grupo.alertas].sort((a, b) => (ORDEN_NIVEL[a.nivel] ?? 3) - (ORDEN_NIVEL[b.nivel] ?? 3));
  const problemas = alertas.filter((a) => a.nivel !== "info");
  const notas = alertas.filter((a) => a.nivel === "info");
  const veredicto = revisado
    ? { clase: "revisado", texto: `Revisado${base.comp_revisado_por ? ` por ${base.comp_revisado_por}` : ""}` }
    : hayAlta
      ? { clase: "alta", texto: "Hay un problema" }
      : hayMedia
        ? { clase: "media", texto: "Conviene revisar" }
        : { clase: "ok", texto: "Todo cuadra" };

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
          <p className={`conc-veredicto conc-veredicto--${veredicto.clase}`}>
            <span className="conc-veredicto-punto" aria-hidden="true" />
            {veredicto.texto}
          </p>
          <span className="conc-chip">{grupo.tipo ? COMPROBANTE_TIPO_LABEL[grupo.tipo] : "Sin leer"}</span>
          {grupo.monto_centavos != null ? (
            <p className="conc-monto mono">{pesos(grupo.monto_centavos)}</p>
          ) : (
            <p className="muted conc-sin-monto">Sin monto</p>
          )}
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
        </div>
      </header>

      {problemas.length > 0 && (
        <ul className="conc-alertas" aria-label="Problemas detectados">
          {problemas.map((a) => (
            <li key={a.codigo} className={`conc-alerta conc-alerta--${a.nivel}`}>
              <span className="conc-alerta-nivel">{a.nivel === "alta" ? "Problema" : "Revisar"}</span>
              {a.texto}
            </li>
          ))}
        </ul>
      )}

      {(notas.length > 0 || grupo.por_que_juntos.length > 0) && (
        <ul className="conc-notas muted" aria-label="Notas">
          {notas.map((a) => (
            <li key={a.codigo}>{a.texto}</li>
          ))}
          {grupo.por_que_juntos.length > 0 && <li>Se agruparon por: {grupo.por_que_juntos.join(", ")}.</li>}
        </ul>
      )}

      <p className="conc-datos">
        {base.comp_referencia && (
          <span className="conc-dato">
            <em>Ref.</em> <span className="mono">{base.comp_referencia}</span>
          </span>
        )}
        {base.comp_clave_rastreo && (
          <span className="conc-dato">
            <em>Rastreo</em> <span className="mono">{base.comp_clave_rastreo}</span>
          </span>
        )}
        {base.ocr_fuente && <span className="conc-dato conc-fuente">{FUENTE_LABEL[base.ocr_fuente] ?? base.ocr_fuente}</span>}
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
