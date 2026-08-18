import { useMemo } from "react";
import { DropIcon } from "./icons";

export const MES_LABEL: Record<number, string> = {
  1: "Enero",
  2: "Febrero",
  3: "Marzo",
  4: "Abril",
  5: "Mayo",
  6: "Junio",
  7: "Julio",
  8: "Agosto",
  9: "Septiembre",
  10: "Octubre",
  11: "Noviembre",
  12: "Diciembre",
};

const ANIO_MINIMO = 1960;

interface BautismoFechaFieldProps {
  mes: number | "";
  anio: number | "";
  onChange: (mes: number | "", anio: number | "") => void;
  onBlur?: () => void;
  errorMes?: string;
  errorAnio?: string;
}

/**
 * Reemplaza el texto libre de "hace cuánto te bautizaste" por dos
 * desplegables (mes + año) — así el dato llega ya estructurado y no hay
 * que sanitizar formatos distintos después.
 */
export function BautismoFechaField({ mes, anio, onChange, onBlur, errorMes, errorAnio }: BautismoFechaFieldProps) {
  const anios = useMemo(() => {
    const actual = new Date().getFullYear();
    const lista: number[] = [];
    for (let a = actual; a >= ANIO_MINIMO; a--) lista.push(a);
    return lista;
  }, []);

  return (
    <div className="span-2 form-grid">
      <div className={`field ${errorMes ? "has-error" : ""}`}>
        <label htmlFor="bautismo_mes">
          <DropIcon size={14} /> Mes de tu bautismo
        </label>
        <select
          id="bautismo_mes"
          value={mes}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "", anio)}
          onBlur={onBlur}
        >
          <option value="">Selecciona un mes</option>
          {Object.entries(MES_LABEL).map(([valor, label]) => (
            <option key={valor} value={valor}>
              {label}
            </option>
          ))}
        </select>
        {errorMes && <span className="field-error">{errorMes}</span>}
      </div>

      <div className={`field ${errorAnio ? "has-error" : ""}`}>
        <label htmlFor="bautismo_anio">Año de tu bautismo</label>
        <select
          id="bautismo_anio"
          value={anio}
          onChange={(e) => onChange(mes, e.target.value ? Number(e.target.value) : "")}
          onBlur={onBlur}
        >
          <option value="">Selecciona un año</option>
          {anios.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        {errorAnio && <span className="field-error">{errorAnio}</span>}
      </div>
    </div>
  );
}
