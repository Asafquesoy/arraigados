import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch, type AdminRole } from "./api";

interface AdminAuthState {
  username: string | null;
  role: AdminRole | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthState | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ username: string; role: AdminRole }>("/auth/me")
      .then((res) => {
        setUsername(res.username);
        setRole(res.role);
      })
      .catch(() => {
        setUsername(null);
        setRole(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(user: string, password: string) {
    const res = await apiFetch<{ username: string; role: AdminRole }>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password }),
    });
    setUsername(res.username);
    setRole(res.role);
  }

  async function logout() {
    await apiFetch("/auth/logout", { method: "POST" });
    setUsername(null);
    setRole(null);
  }

  return (
    <AdminAuthContext.Provider value={{ username, role, loading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth debe usarse dentro de AdminAuthProvider");
  return ctx;
}
