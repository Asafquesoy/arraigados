import { useEffect, useState } from "react";
import { apiFetch, ApiError, type ComprobanteEvento } from "../lib/api";
import { formatFechaCorta, formatFechaHora } from "../lib/fecha";
import "./ComprobanteHistorial.css";

const CAMPO_LABEL: Record<string, string> = {
  comp_tipo: "Tipo",
  comp_banco: "Banco",
  comp_referencia: "Referencia",
  comp_clave_rastreo: "Clave de rastreo",
  comp_fecha: "Fecha",
  comp_monto_centavos: "Monto",
};

const TITULO: Record<string, string> = {
  PAGO_VERIFICADO: "Marcó el pago como verificado",
  PAGO_DESMARCADO: "Quitó la verificación del pago",
  REVISADO: "Marcó el grupo como revisado",
  REVISION_QUITADA: "Quitó la revisión",
  APROBADO: "Aprobó el pago",
  DATOS_CORREGIDOS: "Corrigió los datos del comprobante",
  LEIDO: "Lectura del comprobante",
  SEPARADO: "Lo separó del grupo («no es el mismo pago»)",
  UNIDO_DE_NUEVO: "Dejó que se vuelva a agrupar",
};

type Linea = { ok?: boolean | null; texto: string };

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function valor(campo: string, v: unknown): string {
  if (v == null || v === "") return "vacío";
  if (campo === "comp_monto_centavos" && typeof v === "number") return `$${(v / 100).toLocaleString("es-MX", { maximumFractionDigits: 2 })}`;
  if (campo === "comp_fecha" && typeof v === "string") return formatFechaCorta(v);
  return String(v);
}

/** Texto legible del detalle guardado en el evento (antes/después, lo que se veía al aprobar…). */
export function detalleLegible(e: ComprobanteEvento): Linea[] {
  const d = e.detalle ?? {};
  const out: Linea[] = [];
  if (e.accion === "DATOS_CORREGIDOS" && esObjeto(d.antes) && esObjeto(d.despues)) {
    for (const campo of Object.keys(d.despues)) {
      out.push({ texto: `${CAMPO_LABEL[campo] ?? campo}: ${valor(campo, d.antes[campo])} → ${valor(campo, d.despues[campo])}` });
    }
    if (d.revision_quitada) out.push({ texto: "Como ya estaba aprobado, volvió a «por revisar»." });
  } else if (e.accion === "LEIDO") {
    const fuente = d.fuente === "gemini" ? "con IA" : d.fuente === "local" ? "con el lector local" : String(d.fuente ?? "");
    const partes = [fuente && `Leído ${fuente}`, d.monto_centavos != null && `monto ${valor("comp_monto_centavos", d.monto_centavos)}`, d.fecha && `fecha ${valor("comp_fecha", d.fecha)}`];
    out.push({ texto: partes.filter(Boolean).join(" · ") || `Estado: ${String(d.estado ?? "")}` });
  } else if (e.accion === "SEPARADO" || e.accion === "UNIDO_DE_NUEVO") {
    const antes = Array.isArray(d.antes_junto_con) ? (d.antes_junto_con as string[]) : [];
    const ahora = Array.isArray(d.ahora_junto_con) ? (d.ahora_junto_con as string[]) : [];
    if (antes.length) out.push({ texto: `Estaba junto con: ${antes.join(", ")}` });
    if (ahora.length) out.push({ texto: `Ahora va junto con: ${ahora.join(", ")}` });
  } else if (e.accion === "REVISION_QUITADA" && d.motivo) {
    out.push({ texto: `Motivo: ${String(d.motivo)}` });
  }
  if ((e.accion === "APROBADO" || e.accion === "REVISADO") && Array.isArray(d.chequeos)) {
    out.push({ texto: "Lo que se veía en ese momento:" });
    for (const c of d.chequeos as { ok: boolean | null; texto: string }[]) out.push({ ok: c.ok, texto: c.texto });
    for (const a of (Array.isArray(d.alertas) ? d.alertas : []) as { nivel: string; texto: string }[]) {
      if (a.nivel !== "info") out.push({ ok: false, texto: `Alerta: ${a.texto}` });
    }
  }
  if (d.nota) out.push({ texto: `Nota: ${String(d.nota)}` });
  return out;
}

interface ListaProps {
  eventos: ComprobanteEvento[];
  /** En el historial global cada evento dice de quién es. */
  mostrarPersona?: boolean;
}

export function HistorialLista({ eventos, mostrarPersona }: ListaProps) {
  if (eventos.length === 0) return <p className="muted historial-vacio">Todavía no hay movimientos registrados.</p>;
  return (
    <ol className="historial">
      {eventos.map((e) => (
        <li key={e.id} className="historial-item">
          <p className="historial-titulo">
            {mostrarPersona && (
              <>
                <strong>{e.nombre}</strong> <span className="mono historial-folio">{e.folio}</span>
                <br />
              </>
            )}
            {TITULO[e.accion] ?? e.accion}
          </p>
          <p className="muted historial-meta">
            {formatFechaHora(e.creado_en)} · {e.usuario === "sistema" ? "automático" : e.usuario}
          </p>
          {detalleLegible(e).map((l, i) => (
            <p key={i} className={`historial-detalle ${l.ok === true ? "is-ok" : l.ok === false ? "is-mal" : ""}`}>
              {l.ok === true ? "✓ " : l.ok === false ? "✗ " : l.ok === null ? "– " : ""}
              {l.texto}
            </p>
          ))}
        </li>
      ))}
    </ol>
  );
}

/** Historial de los registros de un grupo: pide los eventos al abrirse. */
export function ComprobanteHistorial({ camperIds }: { camperIds: number[] }) {
  const [eventos, setEventos] = useState<ComprobanteEvento[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clave = camperIds.join(",");

  useEffect(() => {
    let vivo = true;
    Promise.all(camperIds.map((id) => apiFetch<ComprobanteEvento[]>(`/admin/comprobantes/historial?camper_id=${id}&limit=100`)))
      .then((listas) => {
        if (!vivo) return;
        setEventos(listas.flat().sort((a, b) => b.creado_en.localeCompare(a.creado_en) || b.id - a.id));
      })
      .catch((err) => vivo && setError(err instanceof ApiError ? err.message : "No se pudo cargar el historial."));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  if (error) return <p className="historial-vacio" role="alert">{error}</p>;
  if (eventos === null) return <p className="muted historial-vacio">Cargando historial…</p>;
  return <HistorialLista eventos={eventos} mostrarPersona={camperIds.length > 1} />;
}
