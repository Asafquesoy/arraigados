import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch, ApiError, type AppSettings } from "./api";
import { parseFechaUtc } from "./fecha";

interface SettingsState {
  showShirtSize: boolean;
  precioMxn: number;
  pedirComprobante: boolean;
  /** Ya descuenta el cierre programado: es `false` también en cuanto llega la hora de `registroCierreEn`. */
  registroAbierto: boolean;
  /** Hora a la que el registro se cierra solo (null = sin cierre programado). */
  registroCierreEn: Date | null;
  loading: boolean;
  /** Optimista: refleja el cambio de inmediato y revierte si el PATCH falla (lanza en ese caso). */
  setShowShirtSize: (value: boolean) => Promise<void>;
  setPrecioMxn: (value: number) => Promise<void>;
  setPedirComprobante: (value: boolean) => Promise<void>;
  setRegistroAbierto: (value: boolean) => Promise<void>;
  setRegistroCierreEn: (value: Date | null) => Promise<void>;
}

const SettingsContext = createContext<SettingsState | undefined>(undefined);

// setTimeout guarda el retraso en un entero de 32 bits: por encima de ~24.8 días
// se dispara de inmediato, así que los plazos largos se parten en tramos.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
// Si el reloj del navegador va adelantado, el servidor todavía no cerró; se
// vuelve a preguntar cada tanto en vez de quedarse mostrando "cerrado" por error.
const REINTENTO_MS = 5000;

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
  // true por defecto: el registro debe verse abierto mientras carga la
  // configuración real, para no ocultar el formulario por error.
  const [registroAbiertoGuardado, setRegistroAbiertoState] = useState(true);
  const [cierreIso, setCierreIsoState] = useState<string | null>(null);
  // true cuando el reloj local ya pasó la hora de cierre: cierra la UI al
  // instante sin esperar a que el servidor lo confirme (el servidor es quien
  // realmente rechaza los registros, ver registro_cierre.py).
  const [cierreAlcanzado, setCierreAlcanzado] = useState(false);
  // Sube para volver a armar el temporizador tras un reintento.
  const [reintento, setReintento] = useState(0);
  const [loading, setLoading] = useState(true);

  function aplicar(res: AppSettings) {
    setShowShirtSizeState(res.show_shirt_size);
    setPrecioMxnState(res.precio_mxn);
    setPedirComprobanteState(res.pedir_comprobante);
    setRegistroAbiertoState(res.registro_abierto);
    setCierreIsoState(res.registro_cierre_en);
  }

  useEffect(() => {
    apiFetch<AppSettings>("/settings")
      .then(aplicar)
      .catch(() => {
        /* se queda en el valor por defecto si falla la carga inicial */
      })
      .finally(() => setLoading(false));
  }, []);

  // Temporizador del cierre programado: al llegar la hora cierra la UI y vuelve
  // a pedir /settings para sincronizarse con lo que decidió el servidor.
  useEffect(() => {
    const cierre = parseFechaUtc(cierreIso);
    if (!cierre) {
      setCierreAlcanzado(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    let cancelado = false;

    const armar = () => {
      const falta = cierre.getTime() - Date.now();
      if (falta > 0) {
        setCierreAlcanzado(false);
        timer = setTimeout(armar, Math.min(falta, MAX_TIMEOUT_MS));
        return;
      }
      setCierreAlcanzado(true);
      apiFetch<AppSettings>("/settings")
        .then((res) => {
          if (cancelado) return;
          aplicar(res);
          // El servidor sigue abierto con la misma hora: el reloj local va
          // adelantado. Se quita el cierre local y se reintenta más tarde.
          if (res.registro_abierto && res.registro_cierre_en) {
            setCierreAlcanzado(false);
            timer = setTimeout(() => setReintento((n) => n + 1), REINTENTO_MS);
          }
        })
        .catch(() => {
          /* sin red: se queda cerrado en la UI; el servidor decide en el POST */
        });
    };

    armar();
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [cierreIso, reintento]);

  /** PATCH parcial con reflejo optimista de un solo campo; revierte ese
   * campo si la llamada falla y relanza para que el caller muestre el error.
   * La respuesta completa se aplica a todos los campos, por si el servidor
   * cambió otro (p. ej. borró la hora de cierre al reabrir). */
  async function patch<K extends keyof AppSettings>(
    field: K,
    value: AppSettings[K],
    setLocal: (value: AppSettings[K]) => void,
    previous: AppSettings[K]
  ) {
    setLocal(value);
    try {
      const res = await apiFetch<AppSettings>("/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      aplicar(res);
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

  async function setRegistroAbierto(value: boolean) {
    await patch("registro_abierto", value, setRegistroAbiertoState, registroAbiertoGuardado);
  }

  async function setRegistroCierreEn(value: Date | null) {
    await patch("registro_cierre_en", value ? value.toISOString() : null, setCierreIsoState, cierreIso);
  }

  const registroCierreEn = useMemo(() => parseFechaUtc(cierreIso), [cierreIso]);

  return (
    <SettingsContext.Provider
      value={{
        showShirtSize,
        precioMxn,
        pedirComprobante,
        registroAbierto: registroAbiertoGuardado && !cierreAlcanzado,
        registroCierreEn,
        loading,
        setShowShirtSize,
        setPrecioMxn,
        setPedirComprobante,
        setRegistroAbierto,
        setRegistroCierreEn,
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
