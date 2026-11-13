import { useEffect, useState } from "react";
import "./CuentaRegresiva.css";

function restante(hasta: Date) {
  const total = Math.max(0, Math.floor((hasta.getTime() - Date.now()) / 1000));
  return {
    dias: Math.floor(total / 86400),
    horas: Math.floor((total % 86400) / 3600),
    minutos: Math.floor((total % 3600) / 60),
    segundos: total % 60,
  };
}

const dos = (n: number) => String(n).padStart(2, "0");
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Cuenta regresiva hasta `hasta` (días / horas / min / seg). Solo muestra; qué
 * pasa al llegar a cero lo decide quien la usa (el SettingsContext cierra el
 * registro en ese instante). Los días se ocultan cuando ya son 0.
 *
 * `role="timer"` sin `aria-live`: el lector de pantalla no anuncia cada segundo,
 * pero quien navega hasta ahí oye el tiempo completo en el `aria-label`.
 */
export function CuentaRegresiva({ hasta, className = "" }: { hasta: Date; className?: string }) {
  const [t, setT] = useState(() => restante(hasta));

  useEffect(() => {
    setT(restante(hasta));
    const id = setInterval(() => setT(restante(hasta)), 1000);
    return () => clearInterval(id);
  }, [hasta]);

  const etiqueta = [
    t.dias > 0 ? plural(t.dias, "día", "días") : null,
    plural(t.horas, "hora", "horas"),
    plural(t.minutos, "minuto", "minutos"),
    plural(t.segundos, "segundo", "segundos"),
  ]
    .filter(Boolean)
    .join(", ");

  const unidades: { valor: string; nombre: string }[] = [
    ...(t.dias > 0 ? [{ valor: String(t.dias), nombre: t.dias === 1 ? "día" : "días" }] : []),
    { valor: dos(t.horas), nombre: "horas" },
    { valor: dos(t.minutos), nombre: "min" },
    { valor: dos(t.segundos), nombre: "seg" },
  ];

  return (
    <div className={`cuenta-regresiva ${className}`.trim()} role="timer" aria-label={`Faltan ${etiqueta}`}>
      {unidades.map((u) => (
        <div className="cuenta-regresiva-caja" key={u.nombre} aria-hidden="true">
          <span className="cuenta-regresiva-valor mono">{u.valor}</span>
          <span className="cuenta-regresiva-nombre">{u.nombre}</span>
        </div>
      ))}
    </div>
  );
}
