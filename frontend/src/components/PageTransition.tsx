import { useState, type ReactElement } from "react";
import { useLocation, type Location } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/**
 * Envuelve un único <Routes> y anima la transición entre páginas. Mantiene
 * la ruta anterior visible (displayLocation) mientras sale, y solo avanza a
 * la nueva ruta cuando la animación de salida termina — evita que <Routes>
 * cambie de contenido antes de que la animación de salida alcance a jugar.
 */
export function PageTransition({ children }: { children: (location: Location) => ReactElement }) {
  const location = useLocation();
  const reduce = useReducedMotion();
  const [displayLocation, setDisplayLocation] = useState(location);

  const isNewLocation = location.pathname !== displayLocation.pathname;
  const shownLocation = isNewLocation ? displayLocation : location;

  return (
    <AnimatePresence
      mode="wait"
      initial={false}
      onExitComplete={() => {
        if (isNewLocation) setDisplayLocation(location);
      }}
    >
      <motion.div
        key={shownLocation.pathname}
        initial={reduce ? { opacity: 1 } : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? { opacity: 1 } : { opacity: 0, y: -10 }}
        transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
      >
        {children(shownLocation)}
      </motion.div>
    </AnimatePresence>
  );
}
