import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { ChevronDownIcon, CloseIcon } from "./icons";
import { useMediaQuery } from "../lib/useMediaQuery";
import type { EquipoOut } from "../lib/api";
import "./EquipoSelector.css";

interface EquipoSelectorProps {
  equipos: EquipoOut[];
  /** id del equipo seleccionado, o null si la vista activa no es un equipo
   *  (Resumen / Sin equipo / Staff). */
  activoId: number | null;
  onChange: (equipoId: number) => void;
}

interface PickerGridProps {
  equipos: EquipoOut[];
  activoId: number | null;
  onPick: (equipoId: number) => void;
}

// Compartida por la hoja (móvil) y el menú (compu) para que nunca muestren
// cosas distintas.
function EquipoPickerGrid({ equipos, activoId, onPick }: PickerGridProps) {
  return (
    <div className="equipo-picker-grid" role="listbox" aria-label="Equipos">
      {equipos.map((e) => (
        <button
          key={e.id}
          type="button"
          role="option"
          aria-selected={e.id === activoId}
          className={`equipo-picker-item ${e.id === activoId ? "is-active" : ""}`}
          style={{ "--color-equipo": e.color } as CSSProperties}
          onClick={() => onPick(e.id)}
        >
          <span className="equipo-picker-dot" aria-hidden="true" />
          <span className="equipo-picker-nombre">{e.nombre}</span>
          <span className="equipo-picker-count">{e.stats.total}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Selector de equipo para la pantalla de Equipos: ‹ botón-con-el-equipo-actual ›.
 * Reemplaza tener una pestaña por equipo en una barra (con ~10 equipos se
 * volvía larguísima). El botón abre una hoja inferior en móvil y un menú
 * anclado en compu, ambos con la misma cuadrícula de equipos.
 */
export function EquipoSelector({ equipos, activoId, onChange }: EquipoSelectorProps) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const activoIdx = equipos.findIndex((e) => e.id === activoId);
  const activo = activoIdx >= 0 ? equipos[activoIdx] : null;
  const prev = activoIdx > 0 ? equipos[activoIdx - 1] : null;
  const next = activoIdx >= 0 ? equipos[activoIdx + 1] ?? null : equipos[0] ?? null;

  function pick(id: number) {
    setOpen(false);
    onChange(id);
  }

  // Cambiar de breakpoint con el selector abierto dejaría la otra variante
  // montada a medias — mejor cerrar.
  useEffect(() => {
    setOpen(false);
  }, [isDesktop]);

  // Esc cierra en ambas variantes; clic fuera solo aplica al menú de compu
  // (en móvil el fondo de la hoja ya es clicable).
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (!isDesktop && e.key === "Tab" && sheetRef.current) {
        const focusable = sheetRef.current.querySelectorAll<HTMLElement>("button");
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    function onMouseDown(e: MouseEvent) {
      if (isDesktop && wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [open, isDesktop]);

  // Hoja modal en móvil: bloquea el scroll del body y mueve el foco adentro.
  useEffect(() => {
    if (!open || isDesktop) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      previouslyFocused?.focus();
    };
  }, [open, isDesktop]);

  if (equipos.length === 0) return null;

  return (
    <div className="equipo-selector" ref={wrapRef}>
      <button
        type="button"
        className="equipo-selector-flecha"
        aria-label="Equipo anterior"
        disabled={!prev}
        onClick={() => prev && onChange(prev.id)}
      >
        <ChevronDownIcon size={18} className="equipo-selector-flecha-izq" />
      </button>

      <button
        type="button"
        className={`equipo-selector-boton ${activo ? "is-active" : ""}`}
        style={{ "--color-equipo": activo?.color } as CSSProperties}
        aria-haspopup={isDesktop ? "listbox" : "dialog"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {activo ? (
          <>
            <span className="equipo-picker-dot" aria-hidden="true" />
            <span className="equipo-selector-nombre">{activo.nombre}</span>
            <span className="equipo-selector-count">
              {activo.stats.total} persona{activo.stats.total === 1 ? "" : "s"}
            </span>
          </>
        ) : (
          <span className="equipo-selector-nombre">Elegir equipo</span>
        )}
        <ChevronDownIcon size={16} className={`equipo-selector-caret ${open ? "is-open" : ""}`} />
      </button>

      <button
        type="button"
        className="equipo-selector-flecha"
        aria-label="Equipo siguiente"
        disabled={!next}
        onClick={() => next && onChange(next.id)}
      >
        <ChevronDownIcon size={18} className="equipo-selector-flecha-der" />
      </button>

      {isDesktop && (
        <AnimatePresence>
          {open && (
            <m.div
              className="equipo-selector-menu"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.16 } }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, transition: { duration: 0.12 } }}
            >
              <EquipoPickerGrid equipos={equipos} activoId={activoId} onPick={pick} />
            </m.div>
          )}
        </AnimatePresence>
      )}

      {!isDesktop &&
        createPortal(
          <AnimatePresence>
            {open && (
              <m.div
                className="equipo-sheet-backdrop"
                onClick={() => setOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                role="presentation"
              >
                <m.div
                  className="equipo-sheet"
                  ref={sheetRef}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Elige un equipo"
                  onClick={(e) => e.stopPropagation()}
                  initial={reduce ? { opacity: 0 } : { y: "100%" }}
                  animate={reduce ? { opacity: 1 } : { y: 0 }}
                  exit={reduce ? { opacity: 0 } : { y: "100%" }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="equipo-sheet-header">
                    <span>Elige un equipo</span>
                    <button
                      type="button"
                      className="equipo-sheet-close"
                      aria-label="Cerrar"
                      ref={closeBtnRef}
                      onClick={() => setOpen(false)}
                    >
                      <CloseIcon size={18} />
                    </button>
                  </div>
                  <div className="equipo-sheet-body">
                    <EquipoPickerGrid equipos={equipos} activoId={activoId} onPick={pick} />
                  </div>
                </m.div>
              </m.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
