import { useRef } from "react";
import { m, useReducedMotion, useScroll, useTransform } from "motion/react";
import { RootGrow } from "../../components/RootGrow";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { useSettings } from "../../lib/SettingsContext";
import { CAMP_DATE, CAMP_NAME, ORGANIZER } from "../../config";
import "./Hero.css";

const TITLE_WORDS = ["Regístrate", "para", `${CAMP_NAME}.`];

export function Hero({ onScrollToForm }: { onScrollToForm: () => void }) {
  const reduce = useReducedMotion();
  const isCoarse = useMediaQuery("(pointer: coarse)");
  const heroRef = useRef<HTMLElement>(null);
  const { registroAbierto } = useSettings();

  // Parallax escrito directo al DOM por motion (sin pasar por setState/render de
  // React en cada scroll) y acotado al alto del propio hero, no de toda la página.
  // Desactivado en pantallas táctiles: ahí el costo de GPU pesa más que el efecto.
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const posterY = useTransform(scrollYProgress, [0, 1], reduce || isCoarse ? ["0%", "0%"] : ["0%", "18%"]);

  return (
    <section className="hero" ref={heroRef}>
      <m.div className="hero-poster" style={{ y: posterY }}>
        <picture>
          <source
            type="image/webp"
            srcSet="/poster-800.webp 800w, /poster-1600.webp 1600w, /poster-2200.webp 2200w"
            sizes="100vw"
          />
          <img
            src="/poster.jpg"
            srcSet="/poster-800.jpg 800w, /poster-1600.jpg 1600w, /poster-2200.jpg 2200w"
            sizes="100vw"
            alt=""
            aria-hidden="true"
            // React 18's typings/runtime only know the camelCase `fetchPriority`
            // prop, which it silently drops instead of forwarding to the DOM
            // (support for actually setting the attribute lands in React 19) —
            // spreading the real lowercase HTML attribute name bypasses that.
            {...({ fetchpriority: "high" } as Record<string, string>)}
          />
        </picture>
      </m.div>
      <div className="hero-scrim" />

      <div className="hero-content">
        <picture>
          <source type="image/webp" srcSet="/logo.webp" />
          <m.img
            src="/logo.png"
            alt={CAMP_NAME}
            className="hero-logo"
            {...({ fetchpriority: "high" } as Record<string, string>)}
            // Antes animaba también `filter: blur(10px) -> blur(0px)`: es la
            // única animación no-compositable del proyecto (Lighthouse la
            // marca por nombre), y el elemento ya lleva un drop-shadow fijo en
            // Hero.css. opacity+scale solos dan la misma sensación de entrada
            // sin forzar un repintado por frame.
            initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          />
        </picture>

        <m.p
          className="badge hero-badge"
          initial={reduce ? { opacity: 1 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
        >
          {CAMP_DATE} · {ORGANIZER}
        </m.p>

        <h1 className="hero-title display-title">
          {TITLE_WORDS.map((word, i) => (
            <m.span
              key={word}
              className="hero-title-word"
              initial={reduce ? { opacity: 1 } : { opacity: 0, y: "0.6em" }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + i * 0.12, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              {word}&nbsp;
            </m.span>
          ))}
        </h1>

        <m.div
          className="hero-root"
          initial={reduce ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
        >
          <RootGrow delay={0.9} />
        </m.div>

        <m.button
          type="button"
          className="btn btn-primary hero-cta"
          onClick={onScrollToForm}
          disabled={!registroAbierto}
          initial={reduce ? { opacity: 1 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          whileHover={reduce || !registroAbierto ? undefined : { y: -2, scale: 1.02 }}
          whileTap={reduce || !registroAbierto ? undefined : { scale: 0.98 }}
        >
          {registroAbierto ? "Comenzar mi registro" : "Registro cerrado"}
        </m.button>
      </div>

      <m.div
        className="hero-scroll-hint"
        initial={reduce ? { opacity: 0.6 } : { opacity: 0 }}
        animate={reduce ? { opacity: 0.6 } : { opacity: 0.6, y: [0, 8, 0] }}
        transition={{ delay: 1.5, duration: 1.8, repeat: reduce ? 0 : Infinity, ease: "easeInOut" }}
        aria-hidden="true"
      >
        ↓
      </m.div>
    </section>
  );
}
