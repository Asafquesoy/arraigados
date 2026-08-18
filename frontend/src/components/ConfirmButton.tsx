import { useEffect, useRef, useState } from "react";
import { m } from "motion/react";
import "./ConfirmButton.css";

interface ConfirmButtonProps {
  onConfirm: () => void;
  label: string;
  confirmLabel?: string;
  className?: string;
  disabled?: boolean;
  armedMs?: number;
}

/**
 * Botón de acción destructiva de dos pasos: el primer clic lo "arma" (cambia
 * de texto y se autodesarma solo tras `armedMs`), el segundo clic — mientras
 * sigue armado — dispara `onConfirm`. Evita construir un modal de
 * confirmación para una sola pregunta de sí/no.
 */
export function ConfirmButton({
  onConfirm,
  label,
  confirmLabel = "¿Seguro? Sí, borrar",
  className,
  disabled,
  armedMs = 4000,
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  function handleClick() {
    if (!armed) {
      setArmed(true);
      timerRef.current = setTimeout(() => setArmed(false), armedMs);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setArmed(false);
    onConfirm();
  }

  return (
    <m.button
      type="button"
      className={`btn btn-ghost confirm-btn ${armed ? "is-armed" : ""} ${className ?? ""}`}
      onClick={handleClick}
      disabled={disabled}
      animate={armed ? { scale: [1, 1.04, 1] } : { scale: 1 }}
      transition={{ duration: 0.25 }}
    >
      {armed ? confirmLabel : label}
    </m.button>
  );
}
