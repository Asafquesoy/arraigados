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
    // ngrok-skip-browser-warning evita que la advertencia interstitial de
    // ngrok intercepte la llamada y devuelva HTML en vez de JSON al probar
    // detrás de un túnel — inofensivo fuera de ngrok.
    headers: { "ngrok-skip-browser-warning": "true", ...options.headers },
  });

  if (!res.ok) {
    throw new ApiError(await parseErrorMessage(res), res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type Sexo = "M" | "F";
export type TallaCamisa = "XCH" | "CH" | "M" | "G" | "XG" | "OTRA";
export type Zona = "VALLES" | "VICTORIA" | "MANTE" | "METRO" | "OTRO";
export type TipoParticipante = "CAMPERO" | "CONSEJERO";

export interface EquipoBrief {
  id: number;
  nombre: string;
  color: string;
}

export interface CamperOut {
  id: number;
  folio: string;
  nombre: string;
  ciudad: string | null;
  iglesia: string;
  edad: number;
  sexo: Sexo;
  zona: Zona | null;
  tipo: TipoParticipante | null;
  telefono: string | null;
  fecha_pago: string | null;
  tiene_promocion: boolean | null;
  promocion_detalle: string | null;
  bautizado: boolean | null;
  bautismo_mes: number | null;
  bautismo_anio: number | null;
  talla_camisa: TallaCamisa | null;
  talla_otra: string | null;
  tiene_comprobante: boolean;
  pago_verificado: boolean;
  verificado_en: string | null;
  verificado_por: string | null;
  asistio: boolean;
  asistio_en: string | null;
  asistio_por: string | null;
  created_at: string;
  equipo: EquipoBrief | null;
  equipo_fijado: boolean;
  es_staff: boolean;
}

export interface CamperUpdate {
  nombre: string;
  iglesia: string;
  edad: number;
  sexo: Sexo;
  zona: Zona;
  tipo: TipoParticipante;
  fecha_pago: string;
  tiene_promocion: boolean;
  telefono?: string | null;
  bautizado?: boolean | null;
  bautismo_mes?: number | null;
  bautismo_anio?: number | null;
  promocion_detalle?: string | null;
  talla_camisa?: TallaCamisa | null;
  talla_otra?: string | null;
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
  pedir_comprobante: boolean;
  registro_abierto: boolean;
}

export interface ComprobanteStats {
  con_comprobante: number;
  sin_comprobante: number;
}

export type AdminRole = "ADMIN" | "VERIFICADOR_PAGO" | "VISUALIZADOR" | "RECEPCION";

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

export interface AsistenciaStats {
  total: number;
  asistieron: number;
  faltan: number;
}

// ---- Equipos ----

export interface EquipoStats {
  total: number;
  edad_promedio: number | null;
  bautizados: number;
  bautismo_meses_promedio: number | null;
  hombres: number;
  mujeres: number;
  consejeros: number;
  iglesias_distintas: number;
}

export interface MiembroOut {
  id: number;
  nombre: string;
  edad: number;
  sexo: Sexo;
  tipo: TipoParticipante | null;
  iglesia: string;
  zona: Zona | null;
  bautizado: boolean | null;
  bautismo_mes: number | null;
  bautismo_anio: number | null;
  equipo_fijado: boolean;
  es_staff: boolean;
}

export interface EquipoOut {
  id: number;
  nombre: string;
  color: string;
  orden: number;
  stats: EquipoStats;
  miembros: MiembroOut[];
}

export interface DistribucionOut {
  equipos: EquipoOut[];
  sin_equipo: MiembroOut[];
  staff: MiembroOut[];
}

export interface EquiposConfig {
  equipos_auto: boolean;
  eq_balance_edad: boolean;
  eq_balance_bautismo: boolean;
  eq_balance_procedencia: boolean;
  eq_balance_sexo: boolean;
  eq_balance_tamano: boolean;
}

// ---- Conciliación de comprobantes (ver backend/app/conciliacion.py) ----

export type ComprobanteTipo = "transferencia" | "deposito" | "ticket_descuento" | "campamento_gratis" | "otro";
export type NivelAlerta = "alta" | "media" | "info";

export interface AlertaOut {
  codigo: string;
  nivel: NivelAlerta;
  texto: string;
}

export interface ChequeoOut {
  codigo: "LEIDO" | "MONTO" | "FECHA" | "SIN_COPIAS" | string;
  /** true = comprobado, false = falló, null = no hubo con qué comprobarlo */
  ok: boolean | null;
  texto: string;
}

export interface ComprobanteMiembro {
  id: number;
  folio: string;
  nombre: string;
  iglesia: string;
  tipo: TipoParticipante | null;
  fecha_pago: string | null;
  created_at: string;
  pago_verificado: boolean;
  tiene_promocion: boolean | null;
  promocion_detalle: string | null;
  ocr_estado: "PENDIENTE" | "LEIDO" | "INCOMPLETO" | "ERROR";
  ocr_fuente: string | null;
  comp_tipo: ComprobanteTipo | null;
  comp_banco: string | null;
  comp_referencia: string | null;
  comp_clave_rastreo: string | null;
  comp_fecha: string | null;
  comp_monto_centavos: number | null;
  comp_editado: boolean;
  comp_revisado: boolean;
  comp_revisado_por: string | null;
  comp_revisado_en: string | null;
  comp_nota: string | null;
  comp_separado: boolean;
}

export interface ConciliacionGrupo {
  id: number;
  estado: "ok" | "alerta" | "revisado";
  tipo: ComprobanteTipo | null;
  monto_centavos: number | null;
  fecha: string | null;
  tarifa: number | null;
  esperado_centavos: number | null;
  cubre: number | null;
  por_que_juntos: string[];
  alertas: AlertaOut[];
  chequeos: ChequeoOut[];
  clase: "individual" | "grupal";
  separado: boolean;
  miembros: ComprobanteMiembro[];
}

export interface ConciliacionResumen {
  con_comprobante: number;
  sin_comprobante: number;
  leidos: number;
  sin_leer: number;
  grupos: number;
  grupos_con_alerta: number;
  grupos_compartidos: number;
  grupos_revisados: number;
  verificados_individuales: number;
  verificados_grupales: number;
  dinero_leido_centavos: number;
  dinero_esperado_centavos: number;
  lector: "gemini" | "local";
}

export interface ConciliacionResponse {
  resumen: ConciliacionResumen;
  grupos: ConciliacionGrupo[];
}

export interface ComprobanteEvento {
  id: number;
  camper_id: number;
  folio: string;
  nombre: string;
  creado_en: string;
  usuario: string;
  accion: string;
  detalle: Record<string, unknown> | null;
}

export interface ProcesarEstado {
  corriendo: boolean;
  total: number;
  hechos: number;
  con_gemini: boolean;
  error: string | null;
}
