import type { ReactNode } from "react";
import { m, useReducedMotion } from "motion/react";

interface RevealProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  y?: number;
  as?: "div" | "li";
}

/**
 * Envuelve contenido con un fade-up al entrar en el viewport. Se desactiva
 * automáticamente si el usuario prefiere movimiento reducido.
 */
export function Reveal({ children, delay = 0, className, y = 24, as = "div" }: RevealProps) {
  const reduce = useReducedMotion();
  const Component = m[as];

  return (
    <Component
      className={className}
      initial={reduce ? { opacity: 1 } : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </Component>
  );
}
