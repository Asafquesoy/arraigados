import type { AdminRole } from "./api";

/** Única fuente de las etiquetas/lista de roles — antes vivían solo dentro de
 * AdminUsers.tsx; se extrajeron aquí para que Recepcion.tsx también pueda
 * calcular el destino post-login y mostrar el rol sin duplicar el mapa. */
export const ROLE_LABELS: Record<AdminRole, string> = {
  ADMIN: "Administrador",
  VERIFICADOR_PAGO: "Verificador de pago",
  VISUALIZADOR: "Visualizador",
  RECEPCION: "Recepción",
};

export const ROLES: AdminRole[] = ["ADMIN", "VERIFICADOR_PAGO", "VISUALIZADOR", "RECEPCION"];

/** A dónde debe aterrizar cada rol tras iniciar sesión: recepción entra
 * directo a su pantalla de check-in, todos los demás al panel de siempre. */
export function destinoPorRol(role: AdminRole | null): string {
  return role === "RECEPCION" ? "/admin/recepcion" : "/admin/panel";
}
