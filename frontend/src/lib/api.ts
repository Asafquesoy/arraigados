const BASE = "/api";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data.detail === "string") return data.detail;
    return "Ocurrió un error inesperado.";
  } catch {
    return "Ocurrió un error inesperado.";
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...options,
  });

  if (!res.ok) {
    throw new ApiError(await parseErrorMessage(res), res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type Sexo = "M" | "F";
export type TallaCamisa = "XS" | "S" | "M" | "L" | "XL" | "XXL";

export interface CamperOut {
  id: number;
  folio: string;
  nombre: string;
  ciudad: string;
  iglesia: string;
  edad: number;
  sexo: Sexo;
  talla_camisa: TallaCamisa | null;
  pago_verificado: boolean;
  verificado_en: string | null;
  verificado_por: string | null;
  created_at: string;
}

export interface CamperListResponse {
  items: CamperOut[];
  total: number;
  page: number;
  page_size: number;
}

export interface AppSettings {
  show_shirt_size: boolean;
  precio_mxn: number;
}

export type AdminRole = "ADMIN" | "VERIFICADOR_PAGO" | "VISUALIZADOR";

export interface AdminUserOut {
  id: number;
  username: string;
  role: AdminRole;
  created_at: string;
}

export interface AdminUserCreate {
  username: string;
  password: string;
  role: AdminRole;
}

export interface AdminUserUpdate {
  role?: AdminRole;
  password?: string;
}

export interface TallaStatsItem {
  talla: TallaCamisa;
  total: number;
  verificados: number;
}

export interface TallaStatsResponse {
  items: TallaStatsItem[];
  sin_talla: number;
  total_campers: number;
}
