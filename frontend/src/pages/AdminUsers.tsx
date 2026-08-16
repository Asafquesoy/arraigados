import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { ConfirmButton } from "../components/ConfirmButton";
import { Reveal } from "../components/Reveal";
import { RootDivider } from "../components/RootDivider";
import { Toast } from "../components/Toast";
import { UserIcon } from "../components/icons";
import { useAdminAuth } from "../lib/AdminAuthContext";
import { apiFetch, ApiError, type AdminRole, type AdminUserOut } from "../lib/api";
import { useToast } from "../lib/useToast";
import "./AdminUsers.css";

const ROLE_LABELS: Record<AdminRole, string> = {
  ADMIN: "Administrador",
  VERIFICADOR_PAGO: "Verificador de pago",
  VISUALIZADOR: "Visualizador",
};

const ROLES: AdminRole[] = ["ADMIN", "VERIFICADOR_PAGO", "VISUALIZADOR"];

export function AdminUsers() {
  const { username, role, loading: authLoading } = useAdminAuth();
  const [users, setUsers] = useState<AdminUserOut[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useToast();

  const [form, setForm] = useState({ username: "", password: "", role: "VISUALIZADOR" as AdminRole });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await apiFetch<AdminUserOut[]>("/admin/usuarios");
      setUsers(res);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "No se pudo cargar la lista de cuentas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading && username && role === "ADMIN") fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, username, role]);

  if (!authLoading && !username) return <Navigate to="/admin" replace />;
  if (!authLoading && role !== "ADMIN") return <Navigate to="/admin/panel" replace />;

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (form.username.trim().length < 3) {
      setFormError("El usuario debe tener al menos 3 caracteres.");
      return;
    }
    if (form.password.length < 8) {
      setFormError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setCreating(true);
    try {
      await apiFetch<AdminUserOut>("/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setForm({ username: "", password: "", role: "VISUALIZADOR" });
      await fetchUsers();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "No se pudo crear la cuenta.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRoleChange(user: AdminUserOut, nextRole: AdminRole) {
    setUsers((prev) => prev?.map((u) => (u.id === user.id ? { ...u, role: nextRole } : u)) ?? prev);
    try {
      await apiFetch<AdminUserOut>(`/admin/usuarios/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
    } catch (err) {
      setUsers((prev) => prev?.map((u) => (u.id === user.id ? { ...u, role: user.role } : u)) ?? prev);
      setToast(err instanceof ApiError ? err.message : "No se pudo cambiar el rol.");
    }
  }

  async function handleResetPassword(user: AdminUserOut) {
    if (resetPassword.length < 8) {
      setToast("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    try {
      await apiFetch(`/admin/usuarios/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPassword }),
      });
      setResetTarget(null);
      setResetPassword("");
      setToast(`Contraseña de ${user.username} actualizada.`);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "No se pudo cambiar la contraseña.");
    }
  }

  async function handleDelete(user: AdminUserOut) {
    try {
      await apiFetch(`/admin/usuarios/${user.id}`, { method: "DELETE" });
      setUsers((prev) => prev?.filter((u) => u.id !== user.id) ?? prev);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "No se pudo borrar la cuenta.");
    }
  }

  return (
    <div className="page-container admin-users">
      <Reveal>
        <p className="eyebrow">Panel administrativo</p>
        <h1 className="display-title admin-users-title">Usuarios</h1>
        <p className="muted">
          Administra quién puede entrar al panel y qué puede hacer cada cuenta.
        </p>
      </Reveal>

      <RootDivider />

      <Reveal delay={0.06}>
        <form className="glass-card admin-users-form" onSubmit={handleCreate}>
          <h2 className="admin-users-form-title">Nueva cuenta</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="new-username">
                <UserIcon size={14} /> Usuario
              </label>
              <input
                id="new-username"
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="usuario"
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="new-password">Contraseña</label>
              <input
                id="new-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="mínimo 8 caracteres"
                autoComplete="new-password"
              />
            </div>
            <div className="field span-2">
              <label htmlFor="new-role">Rol</label>
              <select
                id="new-role"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as AdminRole })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {formError && <p className="field-error admin-users-form-error">{formError}</p>}
          <button className="btn btn-primary admin-users-form-submit" type="submit" disabled={creating}>
            {creating && <span className="spinner" />}
            {creating ? "Creando..." : "Crear cuenta"}
          </button>
        </form>
      </Reveal>

      <Reveal delay={0.12}>
        <div className="admin-users-list">
          {loading && <p className="muted">Cargando cuentas...</p>}
          {!loading &&
            users?.map((user) => {
              const isSelf = user.username === username;
              return (
                <div className="glass-card admin-users-row" key={user.id}>
                  <div className="admin-users-row-main">
                    <p className="admin-users-row-name">
                      {user.username}
                      {isSelf && <span className="muted admin-users-you"> (tú)</span>}
                    </p>
                    <p className="muted admin-users-row-meta mono">
                      Creada {new Date(user.created_at).toLocaleDateString("es-MX")}
                    </p>
                  </div>

                  <div className="admin-users-row-actions">
                    <select
                      className="admin-users-role-select"
                      value={user.role}
                      disabled={isSelf}
                      title={isSelf ? "No puedes cambiar tu propio rol" : undefined}
                      onChange={(e) => handleRoleChange(user, e.target.value as AdminRole)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>

                    {resetTarget === user.id ? (
                      <div className="admin-users-reset">
                        <input
                          type="password"
                          value={resetPassword}
                          onChange={(e) => setResetPassword(e.target.value)}
                          placeholder="nueva contraseña"
                          autoFocus
                        />
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleResetPassword(user)}
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setResetTarget(null);
                            setResetPassword("");
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setResetTarget(user.id)}
                      >
                        Restablecer contraseña
                      </button>
                    )}

                    <ConfirmButton
                      label="Borrar"
                      confirmLabel="¿Seguro?"
                      disabled={isSelf}
                      onConfirm={() => handleDelete(user)}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      </Reveal>

      <Toast message={toast} />
    </div>
  );
}
