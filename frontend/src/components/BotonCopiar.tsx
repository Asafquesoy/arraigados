import { useEffect, useId, useRef, useState } from "react";
import { CopyIcon } from "./icons";
import { copiarTexto } from "../lib/copiar";
import "./BotonCopiar.css";

interface BotonCopiarProps {
  /** El texto se arma al hacer clic (no al dibujar) para que la hora de "Actualizado" sea la de ese momento. */
  texto: () => string;
  label: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Botón que copia un texto al portapapeles y dice "¡Copiado!" 2 s. Si el navegador no deja copiar
 * (ni con el respaldo de `lib/copiar.ts`), muestra el texto en un cuadro ya seleccionado para que se
 * copie a mano en vez de fallar en silencio.
 */
export function BotonCopiar({ texto, label, className = "btn-sm", disabled }: BotonCopiarProps) {
  const uid = useId();
  const [copiado, setCopiado] = useState(false);
  const [manual, setManual] = useState<string | null>(null);
  const cuadroRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(t);
  }, [copiado]);

  useEffect(() => {
    if (manual !== null) cuadroRef.current?.select();
  }, [manual]);

  async function copiar() {
    const t = texto();
    if (await copiarTexto(t)) {
      setManual(null);
      setCopiado(true);
    } else {
      setCopiado(false);
      setManual(t);
    }
  }

  return (
    <div className="boton-copiar">
      <button type="button" className={`btn btn-ghost ${className}`} onClick={copiar} disabled={disabled}>
        <CopyIcon size={16} />
        {copiado ? "¡Copiado!" : label}
      </button>
      <span className="boton-copiar-estado" role="status">
        {copiado ? "Copiado al portapapeles" : ""}
      </span>
      {manual !== null && (
        <div className="boton-copiar-manual">
          <label htmlFor={`${uid}-manual`} className="field-error">
            No se pudo copiar solo. Copia este texto a mano:
          </label>
          <textarea id={`${uid}-manual`} ref={cuadroRef} className="mono" readOnly rows={Math.min(12, manual.split("\n").length + 1)} value={manual} />
        </div>
      )}
    </div>
  );
}
