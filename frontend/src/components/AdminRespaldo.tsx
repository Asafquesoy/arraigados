import { useEffect, useRef, useState } from "react";
import { ConfirmButton } from "./ConfirmButton";
import { Reveal } from "./Reveal";
import { DownloadIcon, UploadIcon } from "./icons";
import { apiFetch, ApiError } from "../lib/api";
import { formatFechaHora } from "../lib/fecha";
import "./AdminRespaldo.css";

interface Conteos {
  equipos: number;
  registros: number;
  calificaciones: number;
}

interface Resumen {
  creado_en: string | null;
  version: string | null;
  archivo: Conteos;
  actual: Conteos;
  importado: boolean;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function textoConteos(c: Conteos) {
  return `${plural(c.registros, "registro", "registros")}, ${plural(c.equipos, "equipo", "equipos")} y ${plural(
    c.calificaciones,
    "calificación",
    "calificaciones"
  )}`;
}

/**
 * Respaldo completo para la laptop sin internet (ver `backend/app/respaldo.py`).
 * "Descargar" baja un .zip de CSVs con todo (registros, equipos con colores,
 * calificaciones de Juegos y ajustes). "Importar" REEMPLAZA lo que hay en esta
 * computadora con ese archivo y solo aparece si el servidor lo permite
 * (`PERMITIR_IMPORTAR_RESPALDO=true`, o sea la laptop del campamento): en
 * producción queda apagado para que nadie pise los registros con un archivo viejo.
 * Dos pasos: primero se revisa el archivo (no cambia nada), luego se confirma.
 */
export function AdminRespaldo() {
  const [importarPermitido, setImportarPermitido] = useState<boolean | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [trabajando, setTrabajando] = useState<"revisando" | "importando" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch<{ importar_permitido: boolean }>("/admin/respaldo/info")
      .then((r) => setImportarPermitido(r.importar_permitido))
      .catch(() => setImportarPermitido(false));
  }, []);

  function elegirArchivo(f: File | null) {
    setArchivo(f);
    setResumen(null);
    setError(null);
    setListo(null);
  }

  async function enviar(confirmar: boolean) {
    if (!archivo) return;
    setTrabajando(confirmar ? "importando" : "revisando");
    setError(null);
    try {
      const body = new FormData();
      body.append("archivo", archivo);
      body.append("confirmar", String(confirmar));
      const res = await apiFetch<Resumen>("/admin/respaldo/importar", { method: "POST", body });
      if (!confirmar) {
        setResumen(res);
        return;
      }
      setListo(`Listo: ahora hay ${textoConteos(res.actual)}. Recargando…`);
      setResumen(null);
      // Los contextos (ajustes, sesión) se cargaron antes del reemplazo.
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setResumen(null);
      setError(err instanceof ApiError ? err.message : "No se pudo completar. Intenta de nuevo.");
    } finally {
      setTrabajando(null);
    }
  }

  return (
    <Reveal className="admin-respaldo">
      <div className="glass-card admin-respaldo-card">
        <div className="admin-respaldo-header">
          <DownloadIcon size={18} />
          <h2>Respaldo para la laptop</h2>
        </div>

        <p className="admin-respaldo-ayuda muted">
          Un solo archivo con los registros, los equipos (con sus colores) y las calificaciones de Juegos. Descárgalo
          antes del campamento: si allá no hay internet, se importa en la laptop y el equipo entra a la página desde
          ahí. Los comprobantes (imágenes) y las cuentas de admin no viajan.
        </p>

        <div className="admin-respaldo-acciones">
          <a className="btn btn-primary btn-sm" href="/api/admin/respaldo/descargar" download>
            <DownloadIcon size={14} /> Descargar respaldo
          </a>
        </div>

        <div className="admin-respaldo-importar">
          <h3>Importar un respaldo</h3>

          {importarPermitido === false && (
            <p className="admin-respaldo-ayuda muted">
              Importar solo está activo en la laptop del campamento: aquí reemplazaría los registros reales.
            </p>
          )}

          {importarPermitido && (
            <>
              <p className="admin-respaldo-aviso">
                Importar <strong>reemplaza</strong> todos los registros, equipos y calificaciones de esta computadora
                por los del archivo. Antes se guarda una copia de lo que había.
              </p>

              <label className="admin-respaldo-campo">
                <span>Archivo de respaldo (.zip)</span>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".zip,application/zip"
                  disabled={trabajando !== null}
                  onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)}
                />
              </label>

              {archivo && !resumen && !listo && (
                <div className="admin-respaldo-acciones">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void enviar(false)}
                    disabled={trabajando !== null}
                  >
                    <UploadIcon size={14} /> {trabajando === "revisando" ? "Revisando…" : "Revisar archivo"}
                  </button>
                </div>
              )}

              {resumen && (
                <div className="admin-respaldo-resumen" role="status">
                  <p>
                    Respaldo del <strong>{formatFechaHora(resumen.creado_en)}</strong>:{" "}
                    <strong>{textoConteos(resumen.archivo)}</strong>.
                  </p>
                  <p className="muted">Ahora en esta computadora: {textoConteos(resumen.actual)}. Se reemplazarán.</p>
                  <ConfirmButton
                    label="Reemplazar todo"
                    confirmLabel="¿Seguro? Sí, reemplazar"
                    onConfirm={() => void enviar(true)}
                    disabled={trabajando !== null}
                  />
                  {trabajando === "importando" && <span className="muted"> Importando…</span>}
                </div>
              )}
            </>
          )}

          {error && (
            <span className="field-error" role="alert">
              {error}
            </span>
          )}
          {listo && (
            <p className="admin-respaldo-listo" role="status">
              {listo}
            </p>
          )}
        </div>
      </div>
    </Reveal>
  );
}
