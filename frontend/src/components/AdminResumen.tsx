import { useEffect, useState } from "react";
import { Reveal } from "./Reveal";
import { CopyIcon } from "./icons";
import { apiFetch, ApiError, type TallaStatsResponse } from "../lib/api";
import { CAMP_NAME } from "../config";
import "./AdminResumen.css";

const FECHA = new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" });

/**
 * Arma el mismo texto que se muestra en la vista previa y el que se copia —
 * una sola fuente de verdad para que nunca se desincronicen.
 */
function construirResumen(stats: TallaStatsResponse): string {
  const totalCamisas = stats.items.reduce((acc, item) => acc + item.total, 0);
  const lineas = [
    `${CAMP_NAME} — Resumen`,
    "",
    `Registros totales: ${stats.total_campers}`,
    "",
    `Camisas: ${totalCamisas}`,
    ...stats.items.map((item) => `  ${item.talla}: ${item.total}`),
  ];
  if (stats.sin_talla > 0) {
    lineas.push(`  Sin talla: ${stats.sin_talla}`);
  }
  lineas.push("", `Actualizado: ${FECHA.format(new Date())}`);
  return lineas.join("\n");
}

/**
 * Tarjeta de solo lectura para copiar rápido los números del campamento
 * (registros totales + camisas por talla) cuando se los piden por fuera del
 * panel — reusa el mismo endpoint que AdminShirtStats.tsx
 * (`/admin/stats/tallas`), no requiere cambios de backend.
 */
export function AdminResumen() {
  const [stats, setStats] = useState<TallaStatsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<TallaStatsResponse>("/admin/stats/tallas")
      .then((res) => {
        setStats(res);
        setLoadError(null);
      })
      .catch((err) => {
        setStats(null);
        setLoadError(err instanceof ApiError ? err.message : "No se pudo cargar. Revisa tu conexión o el servidor.");
      });
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  if (!stats) {
    if (!loadError) return null;
    return (
      <Reveal delay={0.1} className="admin-resumen">
        <div className="glass-card admin-resumen-card">
          <div className="admin-resumen-header">
            <CopyIcon size={18} />
            <h2>Resumen para compartir</h2>
          </div>
          <p className="field-error">No se pudo cargar: {loadError}</p>
        </div>
      </Reveal>
    );
  }

  const resumen = construirResumen(stats);

  async function handleCopy() {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(resumen);
      setCopied(true);
    } catch {
      setCopyError("No se pudo copiar. Selecciona el texto y cópialo a mano.");
    }
  }

  return (
    <Reveal delay={0.1} className="admin-resumen">
      <div className="glass-card admin-resumen-card">
        <div className="admin-resumen-header">
          <CopyIcon size={18} />
          <h2>Resumen para compartir</h2>
        </div>

        <pre className="mono admin-resumen-preview">{resumen}</pre>

        <button type="button" className="btn btn-primary btn-sm" onClick={handleCopy}>
          <CopyIcon size={16} />
          {copied ? "¡Copiado!" : "Copiar resumen"}
        </button>
        {copyError && <span className="field-error">{copyError}</span>}
      </div>
    </Reveal>
  );
}
