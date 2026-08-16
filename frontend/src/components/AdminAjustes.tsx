import { useEffect, useState, type FormEvent } from "react";
import { Reveal } from "./Reveal";
import { ReceiptIcon } from "./icons";
import { ApiError } from "../lib/api";
import { useSettings } from "../lib/SettingsContext";
import "./AdminAjustes.css";

const PESOS = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

/**
 * Costo del campamento — editable desde aquí en vez de ser una constante en
 * config.ts porque cambia con el tiempo (a diferencia de la copia estática
 * de la landing). Mismo patrón que el toggle de camisetas en
 * AdminShirtStats.tsx: fuente de verdad en `app_settings`, leída/escrita vía
 * useSettings(), gateado a edición solo si `canEdit`.
 */
export function AdminAjustes({ canEdit }: { canEdit: boolean }) {
  const { precioMxn, loading, setPrecioMxn } = useSettings();
  const [draft, setDraft] = useState(String(precioMxn));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // El valor real llega asíncrono desde /api/settings (useState inicial solo
  // corre una vez) — se sincroniza el borrador mientras el usuario no haya
  // empezado a escribir, para no pisarle su cambio en curso.
  useEffect(() => {
    if (!dirty) setDraft(String(precioMxn));
  }, [precioMxn, dirty]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const value = Number(draft);
    if (!Number.isFinite(value) || value < 0) {
      setError("Ingresa un monto válido.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setPrecioMxn(Math.round(value));
      setDirty(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Reveal delay={0.08} className="admin-ajustes">
      <div className="glass-card admin-ajustes-card">
        <div className="admin-ajustes-header">
          <ReceiptIcon size={18} />
          <h2>Costo del campamento</h2>
          <span className="muted admin-ajustes-current">
            {loading ? "Cargando..." : PESOS.format(precioMxn)}
          </span>
        </div>

        {canEdit && (
          <form className="admin-ajustes-form" onSubmit={handleSubmit}>
            <label htmlFor="precio-mxn">Nuevo monto (MXN)</label>
            <div className="admin-ajustes-form-row">
              <input
                id="precio-mxn"
                type="number"
                min={0}
                step={1}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setDirty(true);
                }}
                disabled={loading || saving}
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={loading || saving || !dirty}>
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
            {error && <span className="field-error">{error}</span>}
          </form>
        )}
      </div>
    </Reveal>
  );
}
