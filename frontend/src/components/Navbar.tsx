import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { CAMP_NAME } from "../config";
import { useAdminAuth } from "../lib/AdminAuthContext";
import { useMediaQuery } from "../lib/useMediaQuery";
import { CloseIcon, LockIcon, MenuIcon, RootIcon } from "./icons";
import "./Navbar.css";

interface NavLinkItem {
  to: string;
  label: string;
}

export function Navbar() {
  const location = useLocation();
  const { username, role, logout } = useAdminAuth();
  const isAdminArea = location.pathname.startsWith("/admin");
  const [scrolled, setScrolled] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const esMovil = useMediaQuery("(max-width: 767px)");
  const reduceMotion = useReducedMotion();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 12);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Cierra el panel al navegar o al pasar a escritorio — sin esto se queda
  // abierto encima de la pantalla nueva, o colgado tras rotar el teléfono.
  useEffect(() => {
    setMenuAbierto(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!esMovil) setMenuAbierto(false);
  }, [esMovil]);

  // Mismo patrón de foco/Escape/scroll-lock que TicketModal.tsx — no inventar otro.
  useEffect(() => {
    if (!menuAbierto) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuAbierto(false);
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
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

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      previouslyFocused?.focus();
    };
  }, [menuAbierto]);

  // Misma lista de enlaces (y el mismo gating de rol) para la barra de
  // escritorio y el panel móvil — una sola fuente de verdad.
  const adminLinks: NavLinkItem[] = isAdminArea && username
    ? [
        ...(role === "ADMIN" || role === "RECEPCION" ? [{ to: "/admin/recepcion", label: "Recepción" }] : []),
        ...(role !== "RECEPCION" ? [{ to: "/admin/panel", label: "Panel" }] : []),
        { to: "/admin/equipos", label: "Equipos" },
        ...(role === "ADMIN" ? [{ to: "/admin/usuarios", label: "Usuarios" }] : []),
      ]
    : [];

  function linkClassName(to: string) {
    return `navbar-link ${location.pathname === to ? "is-active" : ""}`;
  }

  return (
    <header className={`navbar ${scrolled ? "is-scrolled" : ""}`}>
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">
          <picture>
            <source type="image/webp" srcSet="/logo.webp" />
            <img src="/logo.png" alt={CAMP_NAME} className="navbar-logo" />
          </picture>
        </Link>

        {isAdminArea && username && esMovil ? (
          <>
            <button
              type="button"
              className="navbar-menu-btn"
              aria-label="Abrir menú"
              aria-expanded={menuAbierto}
              aria-controls="navbar-drawer"
              onClick={() => setMenuAbierto(true)}
            >
              <MenuIcon size={22} />
            </button>

            {createPortal(
              <AnimatePresence>
                {menuAbierto && (
                  <>
                    <m.div
                      className="navbar-backdrop"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1, transition: { duration: 0.2 } }}
                      exit={{ opacity: 0, transition: { duration: 0.15 } }}
                      onClick={() => setMenuAbierto(false)}
                    />
                    <m.div
                      id="navbar-drawer"
                      className="navbar-drawer"
                      role="dialog"
                      aria-modal="true"
                      aria-label="Menú de navegación"
                      ref={panelRef}
                      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
                      animate={
                        reduceMotion
                          ? { opacity: 1, transition: { duration: 0.15 } }
                          : { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } }
                      }
                      exit={
                        reduceMotion
                          ? { opacity: 0, transition: { duration: 0.15 } }
                          : { opacity: 0, y: -12, transition: { duration: 0.16, ease: [0.7, 0, 0.84, 0] } }
                      }
                    >
                      <div className="navbar-drawer-header">
                        <span className="navbar-admin-name">{username}</span>
                        <button
                          type="button"
                          className="navbar-menu-btn"
                          aria-label="Cerrar menú"
                          ref={closeBtnRef}
                          onClick={() => setMenuAbierto(false)}
                        >
                          <CloseIcon size={22} />
                        </button>
                      </div>
                      <nav className="navbar-drawer-links">
                        {adminLinks.map((link) => (
                          <Link
                            key={link.to}
                            to={link.to}
                            className={linkClassName(link.to)}
                            aria-current={location.pathname === link.to ? "page" : undefined}
                          >
                            {link.label}
                          </Link>
                        ))}
                      </nav>
                      <button
                        type="button"
                        className="navbar-link navbar-link-button navbar-drawer-logout"
                        onClick={() => logout()}
                      >
                        Cerrar sesión
                      </button>
                    </m.div>
                  </>
                )}
              </AnimatePresence>,
              document.body
            )}
          </>
        ) : (
          <nav className="navbar-links">
            {!isAdminArea && (
              <Link to="/" className="navbar-link">
                <RootIcon size={16} />
                Registro
              </Link>
            )}
            {isAdminArea &&
              username &&
              adminLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={linkClassName(link.to)}
                  aria-current={location.pathname === link.to ? "page" : undefined}
                >
                  {link.label}
                </Link>
              ))}
            {isAdminArea && username && (
              <>
                <span className="navbar-admin-name">{username}</span>
                <button className="navbar-link navbar-link-button" onClick={() => logout()}>
                  Cerrar sesión
                </button>
              </>
            )}
            {!isAdminArea && (
              <Link to="/admin" className="navbar-link">
                <LockIcon size={16} />
                Admin
              </Link>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
