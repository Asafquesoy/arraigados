import { Link, Navigate, useLocation } from "react-router-dom";
import { m, useReducedMotion } from "motion/react";
import { RootGrow } from "../components/RootGrow";
import { FacebookIcon, InstagramIcon, ShieldCheckIcon } from "../components/icons";
import { SOCIAL_LINKS } from "../config";
import "./Confirmacion.css";

interface LocationState {
  nombre: string;
}

export function Confirmacion() {
  const location = useLocation();
  const state = location.state as LocationState | null;
  const reduce = useReducedMotion();

  if (!state?.nombre) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="page-container confirmacion">
      <div className="confirmacion-leaves" aria-hidden="true">
        {Array.from({ length: 14 }).map((_, i) => (
          <m.span
            key={i}
            className="confirmacion-leaf"
            style={{ left: `${(i * 7.3) % 100}%` }}
            initial={reduce ? { opacity: 0 } : { y: -40, opacity: 0, rotate: 0 }}
            animate={
              // "vh" cae fuera del alto real de .confirmacion-leaves (que sigue al
              // de la tarjeta, no al del viewport) y se recorta antes de tiempo en
              // pantallas cortas; un valor fijo queda contenido de forma predecible.
              reduce ? { opacity: 0 } : { y: 520, opacity: [0, 0.8, 0], rotate: 220 + i * 10 }
            }
            transition={{ duration: 3 + (i % 5) * 0.4, delay: i * 0.08, ease: "easeIn" }}
          />
        ))}
      </div>

      <m.div
        className="glass-card confirmacion-card"
        initial={reduce ? { opacity: 1 } : { opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <m.div
          className="confirmacion-badge"
          initial={reduce ? { scale: 1 } : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <ShieldCheckIcon size={36} />
        </m.div>

        <h1 className="display-title confirmacion-title">¡Registro exitoso!</h1>
        <p className="muted">Gracias, {state.nombre}. Tu registro para Arraigados 2026 fue exitoso.</p>

        <div className="confirmacion-root">
          <RootGrow seed={19} delay={0.4} />
        </div>

        <p className="muted">¿Alguna duda? Escríbenos por nuestras redes sociales:</p>
        <div className="confirmacion-social">
          <a href={SOCIAL_LINKS.instagram} target="_blank" rel="noreferrer" className="btn btn-ghost">
            <InstagramIcon size={18} /> Instagram
          </a>
          <a href={SOCIAL_LINKS.facebook} target="_blank" rel="noreferrer" className="btn btn-ghost">
            <FacebookIcon size={18} /> Facebook
          </a>
        </div>

        <Link to="/" className="muted confirmacion-back">
          ← Volver al inicio
        </Link>
      </m.div>
    </div>
  );
}
