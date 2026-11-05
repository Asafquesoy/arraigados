import type { ChequeoOut } from "../lib/api";
import { CheckIcon, CloseIcon } from "./icons";
import "./ConciliacionChequeos.css";

interface Props {
  chequeos: ChequeoOut[];
  /** Si es true, solo se pinta la lista (sin título): el padre ya la rotula. */
  sinTitulo?: boolean;
}

/** «Lo que se comprobó»: lo que está bien (✓), lo que falló (✗) y lo que no hubo
 * con qué comprobar (–). Va junto a las alertas para ver también lo positivo. */
export function ConciliacionChequeos({ chequeos, sinTitulo }: Props) {
  if (chequeos.length === 0) return null;
  return (
    <div className="conc-chequeos">
      {!sinTitulo && <p className="conc-chequeos-titulo">Lo que se comprobó</p>}
      <ul>
        {chequeos.map((c, i) => (
          <li key={`${c.codigo}-${i}`} className={`conc-chequeo conc-chequeo--${c.ok === true ? "ok" : c.ok === false ? "mal" : "nd"}`}>
            <span className="conc-chequeo-marca" aria-label={c.ok === true ? "Comprobado" : c.ok === false ? "No cuadra" : "No se pudo comprobar"}>
              {c.ok === true ? <CheckIcon size={14} strokeWidth={2.6} /> : c.ok === false ? <CloseIcon size={14} strokeWidth={2.6} /> : "–"}
            </span>
            <span>{c.texto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
