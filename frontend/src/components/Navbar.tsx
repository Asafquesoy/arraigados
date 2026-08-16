import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CAMP_NAME } from "../config";
import { useAdminAuth } from "../lib/AdminAuthContext";
import { LockIcon, RootIcon } from "./icons";
import "./Navbar.css";

export function Navbar() {
  const location = useLocation();
  const { username, role, logout } = useAdminAuth();
  const isAdminArea = location.pathname.startsWith("/admin");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 12);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`navbar ${scrolled ? "is-scrolled" : ""}`}>
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">
          <img src="/logo.png" alt={CAMP_NAME} className="navbar-logo" />
        </Link>

        <nav className="navbar-links">
          {!isAdminArea && (
            <Link to="/" className="navbar-link">
              <RootIcon size={16} />
              Registro
            </Link>
          )}
          {isAdminArea && username && (
            <>
              {role === "ADMIN" && (
                <Link to="/admin/usuarios" className="navbar-link">
                  Usuarios
                </Link>
              )}
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
      </div>
    </header>
  );
}
