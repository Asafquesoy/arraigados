import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

interface FieldRevealProps {
  children: ReactNode;
  className?: string;
}

// El mismo gap que .form-grid (global.css) — se anima marginBottom desde
// -GAP hasta 0 para que el hueco entre ítems del grid se colapse junto con
// la altura del campo, en vez de desaparecer de golpe al final.
const GAP_PX = 17.6; // 1.1rem a 16px base

/**
 * Envuelve un campo condicional del formulario (uno que aparece/desaparece
 * según la respuesta del usuario, p. ej. teléfono de consejero, fecha de
 * bautismo, detalle de promoción) y anima su entrada/salida como un
 * despliegue de altura + fundido, en vez del salto instantáneo de un
 * `{condición && <campo/>}` a secas. Úsese dentro de un
 * `<AnimatePresence initial={false}>` con `key` estable — ver
 * FormularioRegistro.tsx.
 */
export function FieldReveal({ children, className }: FieldRevealProps) {
  const reduce = useReducedMotion();
  // overflow: hidden solo mientras anima — si se queda fijo, el anillo de
  // foco (box-shadow, que se dibuja fuera de la caja) queda recortado para
  // siempre en un campo que ya terminó de desplegarse. Arranca en true: el
  // primer render ya pinta el estado "collapsed", así que debe recortar
  // desde el primer frame.
  const [animating, setAnimating] = useState(true);

  if (reduce) {
    return (
      <motion.div
        className={className}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        {children}
      </motion.div>
    );
  }

  const easeSuave = [0.16, 1, 0.3, 1] as const;
  const collapsed = { opacity: 0, height: 0, y: -6, marginBottom: -GAP_PX };

  return (
    <motion.div
      className={className}
      style={{ overflow: animating ? "hidden" : "visible" }}
      initial={collapsed}
      animate={{ opacity: 1, height: "auto", y: 0, marginBottom: 0, transition: { duration: 0.32, ease: easeSuave } }}
      exit={{ ...collapsed, transition: { duration: 0.22, ease: easeSuave } }}
      onAnimationStart={() => setAnimating(true)}
      // Se dispara tanto al terminar de entrar como al terminar de salir (justo
      // antes de que AnimatePresence lo desmonte) — en ambos casos es seguro
      // volver a "visible": si ya entró, el foco no debe recortarse; si ya
      // salió, el nodo está a punto de desaparecer.
      onAnimationComplete={() => setAnimating(false)}
    >
      {children}
    </motion.div>
  );
}
