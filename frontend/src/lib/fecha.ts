// Formato de fechas del panel admin — único módulo de esto en el proyecto,
// úsalo en vez de `new Date(...).toLocaleX()` sueltos (ver AdminResumen.tsx,
// AdminUsers.tsx, Recepcion.tsx para los usos previos que esto reemplaza/evita
// duplicar).
const FORMATO_FECHA_HORA = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const FORMATO_FECHA_CORTA = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * Formatea un datetime ISO (created_at, verificado_en, asistio_en) como
 * "8 sept 2026, 14:03". El backend siempre escribe en UTC
 * (`models.py::_now`), pero en dev con SQLite el datetime sale "naive" (sin
 * `Z` ni offset) y `new Date()` lo interpretaría como hora local en vez de
 * UTC — se normaliza agregando `Z` cuando la cadena no trae zona.
 */
export function formatFechaHora(iso: string | null | undefined): string {
  const d = parseFechaUtc(iso);
  return d ? FORMATO_FECHA_HORA.format(d) : "—";
}

/** Parsea un datetime ISO del backend (UTC) a `Date`; `null` si falta o es inválido.
 * Misma normalización con `Z` que explica `formatFechaHora`. */
export function parseFechaUtc(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const normalizado = /[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`;
  const d = new Date(normalizado);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `YYYY-MM-DDTHH:mm` en hora LOCAL, el formato que usa `<input type="datetime-local">`. */
export function aInputLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Formatea una fecha pura "YYYY-MM-DD" (fecha_pago) como "8 sept 2026".
 * No usar `new Date(cadena)` directo: JS parsea date-only como UTC
 * medianoche, y en México (UTC-6) eso renderiza el día anterior. Se
 * construye la fecha en hora local a partir de sus partes.
 */
export function formatFechaCorta(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  const partes = fecha.split("-").map(Number);
  if (partes.length !== 3 || partes.some((n) => Number.isNaN(n))) return "—";
  const [anio, mes, dia] = partes;
  const d = new Date(anio, mes - 1, dia);
  if (Number.isNaN(d.getTime())) return "—";
  return FORMATO_FECHA_CORTA.format(d);
}
