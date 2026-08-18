import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, m, useReducedMotion } from "motion/react";

/**
 * Envuelve <Routes> y anima la transición entre páginas, siempre en la
 * ubicación real actual (no una "retrasada"): retrasar el cambio de ruta
 * hasta el fin de la animación de salida se ve elegante en el papel, pero si
 * la condición para avanzar nunca se cumple, la navegación se queda
 * congelada — justo lo que pasaba antes al confirmar el registro.
 *
 * `initial` (sin fijar en false) deja que el primer render también anime:
 * con `initial={false}` el AnimatePresence propaga "sin animación de entrada"
 * a todos los motion.* anidados en el primer mount de la app (no solo a este
 * wrapper), lo que apagaba las animaciones del Hero (logo, título, raíces)
 * en la primera carga de la página — solo se veían después de navegar.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  const reduce = useReducedMotion();

  return (
    <AnimatePresence mode="wait">
      <m.div
        key={location.pathname}
        className="page-motion"
        initial={reduce ? { opacity: 1 } : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? { opacity: 1 } : { opacity: 0, y: -10 }}
        transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}
