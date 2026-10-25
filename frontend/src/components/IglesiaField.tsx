import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { ChurchIcon } from "./icons";
import { apiFetch } from "../lib/api";
import type { Zona } from "../lib/api";
import { filtrarSugerencias } from "../lib/iglesias";
import "./IglesiaField.css";

interface IglesiaFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  /** Zona ya elegida — de ahí salen las sugerencias (iglesias ya registradas
   *  en esa zona). Sin zona el campo funciona como texto libre. */
  zona: Zona | "";
}

// Una sola petición por zona mientras la página siga abierta.
const cacheIglesias = new Map<Zona, string[]>();

/**
 * Campo de iglesia con autocompletado sobre las iglesias ya registradas —
 * evita que la misma iglesia llegue escrita de varias formas, que es lo que
 * rompía el reparto de equipos por iglesia. Sugerir no obliga: lo que la
 * persona escriba sin elegir de la lista se guarda tal cual (el backend solo
 * lo unifica si es igual a una iglesia existente, ver `app/iglesias.py`).
 *
 * La lista va EN el flujo de la página (no flotando): así no la recorta el
 * contenedor animado de los pasos del formulario ni choca con el teclado del
 * teléfono.
 */
export function IglesiaField({ id, value, onChange, onBlur, error, zona }: IglesiaFieldProps) {
  const listId = useId();
  const [opciones, setOpciones] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [activo, setActivo] = useState(-1);

  useEffect(() => {
    if (!zona) {
      setOpciones([]);
      return;
    }
    const cached = cacheIglesias.get(zona);
    if (cached) {
      setOpciones(cached);
      return;
    }
    let cancelado = false;
    apiFetch<string[]>(`/iglesias?zona=${zona}`)
      .then((res) => {
        cacheIglesias.set(zona, res);
        if (!cancelado) setOpciones(res);
      })
      .catch(() => {
        /* sin sugerencias: el campo sigue funcionando como texto libre */
      });
    return () => {
      cancelado = true;
    };
  }, [zona]);

  const sugerencias = useMemo(() => filtrarSugerencias(opciones, value), [opciones, value]);
  // Si lo escrito ya es exactamente una de las opciones, no hay nada que sugerir.
  const yaEsOpcion = sugerencias.some((s) => s === value.trim());
  const visible = open && sugerencias.length > 0 && !yaEsOpcion;

  function elegir(nombre: string) {
    onChange(nombre);
    setOpen(false);
    setActivo(-1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!visible) {
        setOpen(true);
        return;
      }
      setActivo((i) => (i + 1) % sugerencias.length);
    } else if (e.key === "ArrowUp" && visible) {
      e.preventDefault();
      setActivo((i) => (i <= 0 ? sugerencias.length - 1 : i - 1));
    } else if (e.key === "Enter" && visible && activo >= 0) {
      // Enter sobre una sugerencia la elige — sin esto enviaría/avanzaría el formulario.
      e.preventDefault();
      elegir(sugerencias[activo]);
    } else if (e.key === "Escape" && visible) {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className={`field iglesia-field ${error ? "has-error" : ""}`}>
      <label htmlFor={id}>
        <ChurchIcon size={14} /> Iglesia de procedencia
      </label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={visible}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={visible && activo >= 0 ? `${listId}-${activo}` : undefined}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActivo(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          onBlur?.();
        }}
        onKeyDown={onKeyDown}
        placeholder="Nombre de la iglesia"
      />

      {visible && (
        // Dos capas a propósito: la caja exterior lleva el borde redondeado y
        // recorta; la lista interior es la que se desplaza. Así la barra de
        // scroll queda DENTRO del padding de la caja, separada de las
        // esquinas redondeadas, en vez de pegada al borde.
        <div className="iglesia-field-lista">
          <ul className="iglesia-field-opciones" id={listId} role="listbox" aria-label="Iglesias registradas">
            {sugerencias.map((nombre, i) => (
              <li
                key={nombre}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === activo}
                className={`iglesia-field-opcion ${i === activo ? "is-active" : ""}`}
                // mousedown (no click) + preventDefault: el input no pierde el
                // foco antes de que se registre la elección.
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(nombre);
                }}
              >
                <ChurchIcon size={14} /> {nombre}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!error && (
        <span className="iglesia-field-ayuda">
          {zona
            ? opciones.length > 0
              ? "Elige tu iglesia de la lista. ¿No aparece? Escríbela completa."
              : "Escribe el nombre completo de tu iglesia."
            : "Elige primero tu zona para ver sugerencias."}
        </span>
      )}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
