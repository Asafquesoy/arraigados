import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence } from "motion/react";
import { Navigate, useSearchParams } from "react-router-dom";
import { BautismoFechaField } from "../components/BautismoFechaField";
import { ConfirmButton } from "../components/ConfirmButton";
import { EquipoDestacado } from "../components/EquipoDestacado";
import { FieldReveal } from "../components/FieldReveal";
import { IglesiaField } from "../components/IglesiaField";
import { Reveal } from "../components/Reveal";
import { ShirtSizeField } from "../components/ShirtSizeField";
import { Toast } from "../components/Toast";
import { ZONA_LABEL, ZonaField } from "../components/ZonaField";
import { CheckIcon, ChurchIcon, PhoneIcon, UserIcon } from "../components/icons";
import { useAdminAuth } from "../lib/AdminAuthContext";
import {
  apiFetch,
  ApiError,
  type CamperOut,
  type PosibleDuplicadoDetalle,
  type RegistroSitioCreate,
  type TipoParticipante,
  type Zona,
} from "../lib/api";
import { fechaLocalISO, fieldError, INITIAL_STATE, type FieldKey, type FormState } from "../lib/camperForm";
import { destinoPorRol } from "../lib/roles";
import { useSettings } from "../lib/SettingsContext";
import { useAvisoSalida } from "../lib/useAvisoSalida";
import { useToast } from "../lib/useToast";
import "./RegistroSitio.css";

// Campos que esta pantalla pide. No hay fecha de pago, comprobante ni promoción:
// quien se registra en el campamento paga ahí mismo (queda verificado).
const CAMPOS: FieldKey[] = [
  "nombre",
  "edad",
  "sexo",
  "telefono",
  "bautizado",
  "bautismo_mes",
  "bautismo_anio",
  "talla_camisa",
  "talla_otra",
];

const STORAGE_KEY = "arraigados-registro-sitio";
// Borrador de la persona que se está capturando: el botón "atrás" no se puede
// interceptar (ver useAvisoSalida), así que al volver a esta pantalla se restaura.
const BORRADOR_KEY = "arraigados-registro-sitio-borrador";

interface Registrado {
  id: number;
  nombre: string;
  folio: string;
  iglesia: string;
  equipoNombre: string | null;
  equipoColor: string | null;
  tipo: TipoParticipante | null;
}

interface Sesion {
  iniciado: boolean;
  zona: Zona | "";
  iglesia: string;
  registrados: Registrado[];
}

// sessionStorage solo para que una recarga accidental no pierda la lista de
// "registrados ahora" — la fuente de verdad es siempre el servidor.
function leerSesion(): Sesion {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Sesion;
  } catch {
    /* sin almacenamiento: se empieza de cero */
  }
  return { iniciado: false, zona: "", iglesia: "", registrados: [] };
}

function leerBorrador(): Partial<FormState> {
  try {
    const raw = sessionStorage.getItem(BORRADOR_KEY);
    if (raw) return JSON.parse(raw) as Partial<FormState>;
  } catch {
    /* sin borrador */
  }
  return {};
}

// Solo lo que se captura por persona: tipo, zona e iglesia se conservan entre
// personas a propósito y no cuentan como "datos sin guardar".
function personaTieneDatos(f: FormState): boolean {
  return (
    f.nombre.trim() !== "" ||
    f.edad !== "" ||
    f.sexo !== "" ||
    f.telefono.trim() !== "" ||
    f.bautizado !== "" ||
    f.bautismo_mes !== "" ||
    f.bautismo_anio !== "" ||
    f.talla_camisa !== "" ||
    f.talla_otra.trim() !== ""
  );
}

function guardarSesion(s: Sesion) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignorar */
  }
}

interface SegmentadoProps<T extends string | boolean> {
  label: string;
  opciones: { valor: T; texto: string }[];
  value: T | "";
  onChange: (v: T) => void;
  error?: string;
  icono?: React.ReactNode;
}

function Segmentado<T extends string | boolean>({ label, opciones, value, onChange, error, icono }: SegmentadoProps<T>) {
  return (
    <div className={`field ${error ? "has-error" : ""}`}>
      <span className="registro-sitio-label">
        {icono} {label}
      </span>
      <div className="registro-sitio-segmentado" role="group" aria-label={label}>
        {opciones.map((o) => (
          <button
            key={String(o.valor)}
            type="button"
            className={value === o.valor ? "is-active" : ""}
            aria-pressed={value === o.valor}
            onClick={() => onChange(o.valor)}
          >
            {o.texto}
          </button>
        ))}
      </div>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

export function RegistroSitio() {
  const { username, role, loading: authLoading } = useAdminAuth();
  const { showShirtSize } = useSettings();
  const [params] = useSearchParams();

  const [sesion, setSesion] = useState<Sesion>(leerSesion);
  const [form, setForm] = useState<FormState>(() => {
    const borrador = leerBorrador();
    return {
      ...INITIAL_STATE,
      tipo: "CAMPERO",
      ...borrador,
      nombre: params.get("nombre") ?? borrador.nombre ?? "",
      zona: sesion.zona,
      iglesia: sesion.iglesia,
    };
  });
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Posibles duplicados: `exacto` = el servidor ya lo rechazó (409) por llamarse igual.
  const [aviso, setAviso] = useState<{ lista: CamperOut[]; exacto: boolean }>({ lista: [], exacto: false });
  const [toast, setToast] = useToast(4200);

  const savingRef = useRef(false);
  const nombreRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    guardarSesion(sesion);
  }, [sesion]);

  const hayCambios = personaTieneDatos(form);
  useAvisoSalida(hayCambios);

  useEffect(() => {
    try {
      if (hayCambios) sessionStorage.setItem(BORRADOR_KEY, JSON.stringify(form));
      else sessionStorage.removeItem(BORRADOR_KEY);
    } catch {
      /* sin almacenamiento: solo se pierde el borrador */
    }
  }, [form, hayCambios]);

  // Aviso "¿Ya está registrado?" mientras se escribe el nombre.
  useEffect(() => {
    const nombre = form.nombre.trim();
    if (nombre.length < 3 || !sesion.iniciado) {
      setAviso({ lista: [], exacto: false });
      return;
    }
    let cancelado = false;
    const t = setTimeout(() => {
      apiFetch<CamperOut[]>(`/admin/registros/similares?nombre=${encodeURIComponent(nombre)}`)
        .then((lista) => {
          if (!cancelado) setAviso({ lista, exacto: false });
        })
        .catch(() => {
          /* el aviso es una ayuda; si falla, el servidor igual valida al guardar */
        });
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [form.nombre, sesion.iniciado]);

  if (!authLoading && !username) return <Navigate to="/admin" replace />;
  if (!authLoading && role !== "ADMIN" && role !== "RECEPCION") return <Navigate to={destinoPorRol(role)} replace />;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validateField(key: FieldKey) {
    const err = fieldError(key, form, null, showShirtSize, false, true);
    setErrors((prev) => {
      const next = { ...prev };
      if (err) next[key] = err;
      else delete next[key];
      return next;
    });
  }

  function validateAll(): boolean {
    const next: typeof errors = {};
    for (const key of CAMPOS) {
      const err = fieldError(key, form, null, showShirtSize, false, true);
      if (err) next[key] = err;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function empezar() {
    const next: typeof errors = {};
    const ez = fieldError("zona", form, null, showShirtSize, false, true);
    const ei = fieldError("iglesia", form, null, showShirtSize, false, true);
    if (ez) next.zona = ez;
    if (ei) next.iglesia = ei;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSesion((s) => ({ ...s, iniciado: true, zona: form.zona, iglesia: form.iglesia.trim() }));
    setTimeout(() => nombreRef.current?.focus(), 50);
  }

  async function guardar(forzar: boolean) {
    // savingRef y no solo `saving`: dos Enter seguidos caben antes de que React re-renderice.
    if (savingRef.current) return;
    setServerError(null);
    if (!validateAll()) return;

    savingRef.current = true;
    setSaving(true);
    try {
      const base = {
        nombre: form.nombre.trim(),
        iglesia: form.iglesia.trim(),
        edad: Number(form.edad),
        sexo: form.sexo as "M" | "F",
        zona: form.zona as Zona,
        tipo: form.tipo as TipoParticipante,
        fecha_pago: fechaLocalISO(),
        tiene_promocion: false,
        telefono: form.tipo === "CONSEJERO" && form.telefono.trim() ? form.telefono.trim() : null,
        bautizado: form.tipo === "CAMPERO" ? form.bautizado === true : null,
        bautismo_mes:
          form.tipo === "CAMPERO" && form.bautizado === true && form.bautismo_mes !== "" ? form.bautismo_mes : null,
        bautismo_anio:
          form.tipo === "CAMPERO" && form.bautizado === true && form.bautismo_anio !== "" ? form.bautismo_anio : null,
        talla_camisa: showShirtSize && form.talla_camisa ? form.talla_camisa : null,
        talla_otra:
          showShirtSize && form.talla_camisa === "OTRA" && form.talla_otra.trim() ? form.talla_otra.trim() : null,
        forzar,
      };
      const body: RegistroSitioCreate = base;
      const camper = await apiFetch<CamperOut>("/admin/registros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const nuevo: Registrado = {
        id: camper.id,
        nombre: camper.nombre,
        folio: camper.folio,
        iglesia: camper.iglesia,
        equipoNombre: camper.equipo?.nombre ?? null,
        equipoColor: camper.equipo?.color ?? null,
        tipo: camper.tipo,
      };
      setSesion((s) => ({ ...s, iglesia: camper.iglesia, registrados: [nuevo, ...s.registrados].slice(0, 200) }));
      setToast(
        camper.equipo
          ? `✓ ${camper.nombre} — ${camper.equipo.nombre}`
          : camper.tipo === "CONSEJERO"
            ? `✓ ${camper.nombre} registrado (los consejeros se asignan a equipo a mano)`
            : `✓ ${camper.nombre} registrado (sin equipo)`
      );
      setForm((f) => ({
        ...INITIAL_STATE,
        tipo: f.tipo,
        zona: f.zona,
        iglesia: camper.iglesia,
      }));
      setErrors({});
      setAviso({ lista: [], exacto: false });
      nombreRef.current?.focus();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.detail) {
        const d = err.detail as PosibleDuplicadoDetalle;
        setAviso({ lista: d.existentes, exacto: true });
      } else if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        // Sin conexión: puede que sí se haya guardado. Reintentar es seguro — si
        // ya existe, el servidor avisa de duplicado en vez de crear otro.
        setServerError("Sin conexión con el servidor. Intenta de nuevo; si ya se había guardado, te avisará que ya existe.");
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void guardar(false);
  }

  async function marcarLlegada(c: CamperOut) {
    try {
      const actualizado = await apiFetch<CamperOut>(`/admin/registros/${c.id}/asistencia`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asistio: true }),
      });
      setAviso((a) => ({ ...a, lista: a.lista.map((x) => (x.id === c.id ? actualizado : x)) }));
      setToast(`✓ ${actualizado.nombre}: llegada registrada`);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "No se pudo marcar la llegada. Intenta de nuevo.");
    }
  }

  async function deshacer(r: Registrado) {
    try {
      await apiFetch<void>(`/admin/registros/${r.id}`, { method: "DELETE" });
      setSesion((s) => ({ ...s, registrados: s.registrados.filter((x) => x.id !== r.id) }));
      setToast(`${r.nombre}: registro deshecho`);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "No se pudo deshacer. Intenta de nuevo.");
    }
  }

  const deEstaIglesia = sesion.registrados.filter((r) => r.iglesia === sesion.iglesia).length;

  return (
    <div className="page-container registro-sitio">
      <Reveal>
        <p className="eyebrow">Panel administrativo</p>
        <h1 className="display-title registro-sitio-title">Registrar en el campamento</h1>
        <p className="muted registro-sitio-sub">
          Para quien llegó sin registrarse. Queda con la llegada marcada y el pago verificado.
        </p>
      </Reveal>

      {!sesion.iniciado ? (
        <form
          className="glass-card registro-sitio-card"
          onSubmit={(e) => {
            e.preventDefault();
            empezar();
          }}
          noValidate
        >
          <h2 className="registro-sitio-heading">
            <ChurchIcon size={18} /> ¿De qué iglesia vienen?
          </h2>
          <p className="muted">Se pide una sola vez: después solo se captura a cada persona.</p>
          <div className="form-grid">
            <ZonaField
              value={form.zona}
              onChange={(v) => set("zona", v)}
              onBlur={() => validateField("zona")}
              error={errors.zona}
              autoFocus
            />
            <IglesiaField
              id="sitio-iglesia"
              value={form.iglesia}
              onChange={(v) => set("iglesia", v)}
              onBlur={() => validateField("iglesia")}
              error={errors.iglesia}
              zona={form.zona}
            />
          </div>
          <div className="registro-sitio-actions">
            <button className="btn btn-primary registro-sitio-big" type="submit">
              Empezar a registrar
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="glass-card registro-sitio-barra">
            <div className="registro-sitio-barra-info">
              <p className="registro-sitio-barra-iglesia">
                <ChurchIcon size={16} /> {sesion.iglesia}
              </p>
              <p className="muted registro-sitio-barra-meta">
                {sesion.zona ? ZONA_LABEL[sesion.zona] : ""} · {deEstaIglesia} registrado
                {deEstaIglesia === 1 ? "" : "s"} de esta iglesia
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setSesion((s) => ({ ...s, iniciado: false }))}
            >
              Cambiar iglesia
            </button>
          </div>

          <form className="glass-card registro-sitio-card" onSubmit={handleSubmit} noValidate>
            <div className="form-grid">
              <div className={`field span-2 ${errors.nombre ? "has-error" : ""}`}>
                <label htmlFor="sitio-nombre">
                  <UserIcon size={14} /> Nombre completo
                </label>
                <input
                  id="sitio-nombre"
                  ref={nombreRef}
                  className="registro-sitio-nombre"
                  type="text"
                  autoFocus
                  autoComplete="off"
                  value={form.nombre}
                  onChange={(e) => set("nombre", e.target.value)}
                  onBlur={() => validateField("nombre")}
                  placeholder="Nombre y apellidos"
                />
                {errors.nombre && <span className="field-error">{errors.nombre}</span>}
              </div>

              {aviso.lista.length > 0 && (
                <div className={`span-2 registro-sitio-aviso ${aviso.exacto ? "is-exacto" : ""}`} role="status">
                  <p className="registro-sitio-aviso-titulo">
                    {aviso.exacto ? "Ya hay alguien registrado con ese nombre" : "¿Ya está registrado?"}
                  </p>
                  <ul className="registro-sitio-aviso-lista">
                    {aviso.lista.map((c) => (
                      <li key={c.id} className="registro-sitio-aviso-item">
                        <div className="registro-sitio-aviso-datos">
                          <strong>{c.nombre}</strong>
                          <span className="muted">
                            {c.iglesia}
                            {c.equipo ? ` · ${c.equipo.nombre}` : ""} · {c.edad} años ·{" "}
                            {c.asistio ? "ya llegó" : "no ha llegado"}
                          </span>
                        </div>
                        {!c.asistio && (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void marcarLlegada(c)}>
                            <CheckIcon size={14} /> Marcar llegada
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {aviso.exacto && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={saving}
                      onClick={() => void guardar(true)}
                    >
                      Es otra persona, registrar igual
                    </button>
                  )}
                </div>
              )}

              <div className={`field ${errors.edad ? "has-error" : ""}`}>
                <label htmlFor="sitio-edad">Edad</label>
                <input
                  id="sitio-edad"
                  type="number"
                  inputMode="numeric"
                  min={5}
                  max={99}
                  value={form.edad}
                  onChange={(e) => set("edad", e.target.value)}
                  onBlur={() => validateField("edad")}
                  placeholder="Edad"
                />
                {errors.edad && <span className="field-error">{errors.edad}</span>}
              </div>

              <Segmentado
                label="Género"
                value={form.sexo}
                onChange={(v) => set("sexo", v)}
                error={errors.sexo}
                opciones={[
                  { valor: "M", texto: "Hombre" },
                  { valor: "F", texto: "Mujer" },
                ]}
              />

              <Segmentado<TipoParticipante>
                label="Registrar como"
                value={form.tipo}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    tipo: v,
                    bautizado: v === "CAMPERO" ? f.bautizado : "",
                    bautismo_mes: v === "CAMPERO" ? f.bautismo_mes : "",
                    bautismo_anio: v === "CAMPERO" ? f.bautismo_anio : "",
                    telefono: v === "CONSEJERO" ? f.telefono : "",
                  }))
                }
                opciones={[
                  { valor: "CAMPERO", texto: "Campero" },
                  { valor: "CONSEJERO", texto: "Consejero" },
                ]}
              />

              <AnimatePresence mode="wait" initial={false}>
                {form.tipo === "CONSEJERO" && (
                  <FieldReveal key="telefono">
                    <div className={`field ${errors.telefono ? "has-error" : ""}`}>
                      <label htmlFor="sitio-telefono">
                        <PhoneIcon size={14} /> Teléfono
                      </label>
                      <input
                        id="sitio-telefono"
                        type="tel"
                        inputMode="numeric"
                        value={form.telefono}
                        onChange={(e) => set("telefono", e.target.value)}
                        onBlur={() => validateField("telefono")}
                        placeholder="10 dígitos"
                      />
                      {errors.telefono && <span className="field-error">{errors.telefono}</span>}
                    </div>
                  </FieldReveal>
                )}
                {form.tipo === "CAMPERO" && (
                  <FieldReveal key="bautizado">
                    <Segmentado<boolean>
                      label="¿Está bautizado?"
                      value={form.bautizado}
                      onChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          bautizado: v,
                          bautismo_mes: v ? f.bautismo_mes : "",
                          bautismo_anio: v ? f.bautismo_anio : "",
                        }))
                      }
                      error={errors.bautizado}
                      opciones={[
                        { valor: true, texto: "Sí" },
                        { valor: false, texto: "No" },
                      ]}
                    />
                  </FieldReveal>
                )}
              </AnimatePresence>

              <AnimatePresence initial={false}>
                {form.tipo === "CAMPERO" && form.bautizado === true && (
                  <FieldReveal key="bautismo_fecha" className="span-2">
                    <p className="muted registro-sitio-opcional">Mes y año del bautismo (opcional, si lo recuerda).</p>
                    <BautismoFechaField
                      mes={form.bautismo_mes}
                      anio={form.bautismo_anio}
                      onChange={(mes, anio) => setForm((f) => ({ ...f, bautismo_mes: mes, bautismo_anio: anio }))}
                      onBlur={() => {
                        validateField("bautismo_mes");
                        validateField("bautismo_anio");
                      }}
                      errorMes={errors.bautismo_mes}
                      errorAnio={errors.bautismo_anio}
                    />
                  </FieldReveal>
                )}
              </AnimatePresence>

              {showShirtSize && (
                <ShirtSizeField
                  value={form.talla_camisa}
                  onChange={(v) => setForm((f) => ({ ...f, talla_camisa: v, talla_otra: v === "OTRA" ? f.talla_otra : "" }))}
                  onBlur={() => validateField("talla_camisa")}
                  error={errors.talla_camisa}
                  otra={form.talla_otra}
                  onOtraChange={(v) => set("talla_otra", v)}
                  onOtraBlur={() => validateField("talla_otra")}
                  otraError={errors.talla_otra}
                />
              )}
            </div>

            {serverError && <p className="field-error registro-sitio-error">{serverError}</p>}

            <div className="registro-sitio-actions">
              <button className="btn btn-primary registro-sitio-big" type="submit" disabled={saving}>
                {saving && <span className="spinner" />}
                {saving ? "Guardando..." : "Registrar y siguiente"}
              </button>
            </div>
          </form>
        </>
      )}

      {sesion.registrados.length > 0 && (
        <section className="registro-sitio-lista" aria-label="Registrados ahora">
          <h2 className="registro-sitio-heading">Registrados ahora ({sesion.registrados.length})</h2>
          {sesion.registrados.map((r) => (
            <div key={r.id} className="glass-card registro-sitio-fila">
              <div className="registro-sitio-fila-info">
                <p className="registro-sitio-fila-nombre">{r.nombre}</p>
                <p className="muted registro-sitio-fila-meta">
                  <span className="mono">{r.folio}</span> · {r.iglesia}
                </p>
              </div>
              <EquipoDestacado
                variante="pastilla"
                equipo={r.equipoNombre && r.equipoColor ? { id: r.id, nombre: r.equipoNombre, color: r.equipoColor } : null}
                tipo={r.tipo}
              />
              <ConfirmButton label="Deshacer" confirmLabel="¿Seguro?" className="btn-sm" onConfirm={() => void deshacer(r)} />
            </div>
          ))}
        </section>
      )}

      <Toast message={toast} />
    </div>
  );
}
