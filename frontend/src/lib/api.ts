const BASE = "/api";

export class ApiError extends Error {
  status: number;
  /** `detail` tal cual lo mandó el backend cuando no es un texto (p. ej. el 409
   *  de posible duplicado, que trae la lista de quienes ya existen). */
  detail?: unknown;
  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function parseError(res: Response): Promise<{ message: string; detail?: unknown }> {
  const generico = "Ocurrió un error inesperado.";
  try {
    const data = await res.json();
    if (typeof data.detail === "string") return { message: data.detail };
    if (data.detail && typeof data.detail === "object" && typeof data.detail.mensaje === "string") {
      return { message: data.detail.mensaje, detail: data.detail };
    }
    return { message: generico };
  } catch {
    return { message: generico };
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
    const { message, detail } = await parseError(res);
    throw new ApiError(message, res.status, detail);
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
  /** Cuenta que lo dio de alta en el campamento; null si se registró solo. */
  registrado_por: string | null;
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

/** POST /api/admin/registros — alta en el campamento (ver RegistroSitio.tsx). */
export interface RegistroSitioCreate extends Omit<CamperUpdate, "tiene_promocion"> {
  tiene_promocion?: boolean;
  /** true = "es otra persona, registrar igual" tras el aviso de duplicado. */
  forzar?: boolean;
}

export interface PosibleDuplicadoDetalle {
  codigo: "POSIBLE_DUPLICADO";
  mensaje: string;
  existentes: CamperOut[];
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
  /** ISO (UTC) de la hora a la que el registro se cierra solo; null = sin cierre programado. */
  registro_cierre_en: string | null;
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

// ---- Juegos (calificaciones de los jueces) ----
export type TipoCriterio = "escala" | "si_no";

export interface CriterioJuego {
  clave: string;
  nombre: string;
  descripcion: string;
  tipo: TipoCriterio;
  puntos: number;
  escala_max: number;
}

export type ModoJuego = "jueces" | "estaciones";
export type TipoEstacion = "rally" | "busqueda" | "capilla";
export type TipoAvance = "nivel" | "conteo" | "son_logro" | "lados";

/** Una estación de un juego en modo `estaciones` (rally / búsqueda): lo que hace falta para dibujar su hoja. */
export interface EstacionInfo {
  clave: string;
  nombre: string;
  tipo: TipoEstacion;
  /** Búsqueda: la señal de la estación (Luz blanca, Pandero…). */
  subtitulo: string;
  /** Rally: tiempo límite del juego, en segundos. */
  limite_seg: number;
  /** Rally: qué se anota si no terminaron. */
  avance: TipoAvance | null;
  etiqueta_avance: string;
  total_sugerido: number | null;
  /** Nombres de los equipos en el orden de los renglones de la hoja de papel. */
  orden_equipos: string[];
  puntos_max: number;
}

export interface JuegoInfo {
  clave: string;
  nombre: string;
  descripcion: string;
  puntos_max: number;
  modo: ModoJuego;
  criterios: CriterioJuego[];
  estaciones: EstacionInfo[];
}

/** Lo que puso el juez: número de 0 a `escala_max` (escala) o true/false (si_no). */
export type ValoresHoja = Record<string, number | boolean>;

/** Lo que marcó el encargado en un renglón de una estación (la forma depende del tipo de estación). */
export type ValoresFila = Record<string, number | boolean | string | boolean[]>;

export interface FilaEstacion {
  equipo_id: number;
  valores: ValoresFila;
}

export interface HojaCreate {
  equipo_id: number;
  juez: string;
  valores: ValoresHoja;
}

export interface HojaOut {
  id: number;
  juego: string;
  equipo_id: number;
  /** En juegos por estaciones es la clave de la estación. */
  juez: string;
  valores: ValoresFila;
  puntos: Record<string, number>;
  total: number;
  creado_en: string;
  creado_por: string;
  actualizado_en: string | null;
  actualizado_por: string | null;
}

export interface ResultadoEquipoJuego {
  equipo_id: number;
  nombre: string;
  color: string;
  hojas: number;
  por_criterio: Record<string, number>;
  /** Puntos extra (+) o descuentos (−) de este juego; ya están incluidos en `total`. */
  extra: number;
  total: number;
  posicion: number | null;
  /** Juegos por estaciones: tiempo que cuenta para el desempate. */
  tiempo_seg: number | null;
}

/** Puntos que se suman (positivo) o quitan (negativo) a un equipo, con el motivo. `juego` null = general. */
export interface PuntosExtra {
  id: number;
  equipo_id: number;
  juego: string | null;
  puntos: number;
  motivo: string;
  creado_en: string;
  creado_por: string;
  actualizado_en: string | null;
  actualizado_por: string | null;
}

export interface PuntosExtraDatos {
  equipo_id: number;
  juego: string | null;
  puntos: number;
  motivo: string;
}

export interface JuegoDetalle {
  juego: JuegoInfo;
  equipos: ResultadoEquipoJuego[];
  hojas: HojaOut[];
  /** Solo los puntos extra de este juego. */
  puntos_extra: PuntosExtra[];
}

export interface PosicionEquipo {
  equipo_id: number;
  nombre: string;
  color: string;
  /** Total de cada juego (con el extra de ese juego incluido); null = sin hojas ni extra. */
  por_juego: Record<string, number | null>;
  /** Lugar del equipo dentro de cada juego. */
  posicion_por_juego: Record<string, number | null>;
  /** Puntos extra generales (sin juego); ya están incluidos en `total`. */
  extra: number;
  total: number;
  posicion: number | null;
}

export interface Posiciones {
  juegos: JuegoInfo[];
  equipos: PosicionEquipo[];
  /** Todos los puntos extra, generales y de cada juego. */
  puntos_extra: PuntosExtra[];
}
