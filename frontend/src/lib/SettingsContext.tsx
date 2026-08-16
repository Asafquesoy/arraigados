import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch, ApiError, type AppSettings } from "./api";

interface SettingsState {
  showShirtSize: boolean;
  loading: boolean;
  /** Optimista: refleja el cambio de inmediato y revierte si el PATCH falla (lanza en ese caso). */
  setShowShirtSize: (value: boolean) => Promise<void>;
}

const SettingsContext = createContext<SettingsState | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  // Por defecto false: coincide con el estado real actual (fecha límite de
  // playera ya pasada) y evita un parpadeo del campo mientras carga.
  const [showShirtSize, setState] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<AppSettings>("/settings")
      .then((res) => setState(res.show_shirt_size))
      .catch(() => {
        /* se queda en el valor por defecto si falla la carga inicial */
      })
      .finally(() => setLoading(false));
  }, []);

  async function setShowShirtSize(value: boolean) {
    const previous = showShirtSize;
    setState(value);
    try {
      await apiFetch<AppSettings>("/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ show_shirt_size: value }),
      });
    } catch (err) {
      setState(previous);
      throw err instanceof ApiError ? err : new Error("No se pudo actualizar la configuración.");
    }
  }

  return (
    <SettingsContext.Provider value={{ showShirtSize, loading, setShowShirtSize }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings debe usarse dentro de SettingsProvider");
  return ctx;
}
