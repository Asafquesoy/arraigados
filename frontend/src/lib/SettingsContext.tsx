import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch, ApiError, type AppSettings } from "./api";

interface SettingsState {
  showShirtSize: boolean;
  precioMxn: number;
  pedirComprobante: boolean;
  loading: boolean;
  /** Optimista: refleja el cambio de inmediato y revierte si el PATCH falla (lanza en ese caso). */
  setShowShirtSize: (value: boolean) => Promise<void>;
  setPrecioMxn: (value: number) => Promise<void>;
  setPedirComprobante: (value: boolean) => Promise<void>;
}

const SettingsContext = createContext<SettingsState | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  // Por defecto false: coincide con el estado real actual (fecha límite de
  // playera ya pasada) y evita un parpadeo del campo mientras carga.
  const [showShirtSize, setShowShirtSizeState] = useState(false);
  // 350 como default: coincide con el precio actual del póster y evita un
  // parpadeo del monto mientras carga la configuración real.
  const [precioMxn, setPrecioMxnState] = useState(350);
  // true por defecto: es el comportamiento actual (comprobante obligatorio)
  // mientras carga la configuración real, para no dejar de pedirlo por error.
  const [pedirComprobante, setPedirComprobanteState] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<AppSettings>("/settings")
      .then((res) => {
        setShowShirtSizeState(res.show_shirt_size);
        setPrecioMxnState(res.precio_mxn);
        setPedirComprobanteState(res.pedir_comprobante);
      })
      .catch(() => {
        /* se queda en el valor por defecto si falla la carga inicial */
      })
      .finally(() => setLoading(false));
  }, []);

  /** PATCH parcial con reflejo optimista de un solo campo; revierte ese
   * campo si la llamada falla y relanza para que el caller muestre el error. */
  async function patch<K extends keyof AppSettings>(
    field: K,
    value: AppSettings[K],
    setLocal: (value: AppSettings[K]) => void,
    previous: AppSettings[K]
  ) {
    setLocal(value);
    try {
      await apiFetch<AppSettings>("/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
    } catch (err) {
      setLocal(previous);
      throw err instanceof ApiError ? err : new Error("No se pudo actualizar la configuración.");
    }
  }

  async function setShowShirtSize(value: boolean) {
    await patch("show_shirt_size", value, setShowShirtSizeState, showShirtSize);
  }

  async function setPrecioMxn(value: number) {
    await patch("precio_mxn", value, setPrecioMxnState, precioMxn);
  }

  async function setPedirComprobante(value: boolean) {
    await patch("pedir_comprobante", value, setPedirComprobanteState, pedirComprobante);
  }

  return (
    <SettingsContext.Provider
      value={{
        showShirtSize,
        precioMxn,
        pedirComprobante,
        loading,
        setShowShirtSize,
        setPrecioMxn,
        setPedirComprobante,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings debe usarse dentro de SettingsProvider");
  return ctx;
}
