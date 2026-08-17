import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { LockIcon } from "../components/icons";
import { PasswordInput } from "../components/PasswordInput";
import { CAMP_NAME } from "../config";
import { useAdminAuth } from "../lib/AdminAuthContext";
import { ApiError } from "../lib/api";
import "./AdminLogin.css";

export function AdminLogin() {
  const { username, loading, login } = useAdminAuth();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shake, setShake] = useState(0);

  if (!loading && username) {
    return <Navigate to="/admin/panel" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(form.username, form.password);
      navigate("/admin/panel");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión.");
      setShake((s) => s + 1);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-login">
      <div className="admin-login-art" aria-hidden="true">
        <img
          src="/poster.jpg"
          srcSet="/poster-800.jpg 800w, /poster-1600.jpg 1600w, /poster-2200.jpg 2200w"
          sizes="50vw"
          alt=""
        />
        <div className="admin-login-art-scrim" />
        <p className="admin-login-quote">"Arraigados y edificados, firmes en la fe."</p>
      </div>

      <div className="admin-login-panel">
        <motion.form
          className="glass-card admin-login-card"
          onSubmit={handleSubmit}
          animate={shake ? { x: reduce ? 0 : [0, -10, 8, -6, 4, 0] } : {}}
          transition={{ duration: 0.45 }}
          key={shake}
        >
          <div className="admin-login-badge">
            <LockIcon size={24} />
          </div>
          <h1 className="display-title admin-login-title">Panel administrativo</h1>
          <p className="muted admin-login-sub">Acceso exclusivo del equipo organizador de {CAMP_NAME}.</p>

          <div className="form-grid admin-login-grid">
            <div className="field span-2">
              <label htmlFor="username">Usuario</label>
              <input
                id="username"
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                autoFocus
                autoComplete="username"
              />
            </div>
            <div className="field span-2">
              <label htmlFor="password">Contraseña</label>
              <PasswordInput
                id="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="current-password"
              />
            </div>
          </div>

          {error && (
            <p className="field-error admin-login-error" role="alert" aria-live="assertive">
              {error}
            </p>
          )}

          <button className="btn btn-primary admin-login-submit" type="submit" disabled={submitting}>
            {submitting && <span className="spinner" />}
            {submitting ? "Ingresando..." : "Ingresar"}
          </button>
        </motion.form>
      </div>
    </div>
  );
}
