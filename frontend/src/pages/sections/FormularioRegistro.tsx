import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FileDrop } from "../../components/FileDrop";
import { Reveal } from "../../components/Reveal";
import { ShirtSizeField } from "../../components/ShirtSizeField";
import { StepProgress } from "../../components/StepProgress";
import { YesNoField } from "../../components/YesNoField";
import { ZONA_LABEL, ZonaField } from "../../components/ZonaField";
import { CalendarIcon, ChurchIcon, DropIcon, TagIcon, UserIcon } from "../../components/icons";
import { ApiError } from "../../lib/api";
import type { Sexo, TallaCamisa, Zona } from "../../lib/api";
import { useSettings } from "../../lib/SettingsContext";
import "./FormularioRegistro.css";

interface FormState {
  nombre: string;
  edad: string;
  sexo: Sexo | "";
  bautizado: boolean | "";
  fecha_bautismo: string;
  iglesia: string;
  zona: Zona | "";
  talla_camisa: TallaCamisa | "";
  talla_otra: string;
  fecha_pago: string;
  tiene_promocion: boolean | "";
  promocion_detalle: string;
}

type FieldKey = keyof FormState | "ticket";

const INITIAL_STATE: FormState = {
  nombre: "",
  edad: "",
  sexo: "",
  bautizado: "",
  fecha_bautismo: "",
  iglesia: "",
  zona: "",
  talla_camisa: "",
  talla_otra: "",
  fecha_pago: "",
  tiene_promocion: "",
  promocion_detalle: "",
};

const STEPS = ["Quién eres", "De dónde vienes", "Tu pago"];

const HOY = new Date().toISOString().slice(0, 10);

function fieldError(
  key: FieldKey,
  form: FormState,
  ticket: File | null,
  showShirtSize: boolean,
  pedirComprobante: boolean
): string | null {
  switch (key) {
    case "nombre":
      return form.nombre.trim().length < 2 ? "Escribe el nombre completo del campero." : null;
    case "edad": {
      const n = Number(form.edad);
      return !form.edad || Number.isNaN(n) || n < 5 || n > 99 ? "Ingresa una edad válida (5-99)." : null;
    }
    case "sexo":
      return !form.sexo ? "Selecciona una opción." : null;
    case "bautizado":
      return form.bautizado === "" ? "Selecciona una opción." : null;
    case "fecha_bautismo":
      return form.bautizado === true && form.fecha_bautismo.trim().length < 1
        ? "Indica la fecha de tu bautismo."
        : null;
    case "iglesia":
      return form.iglesia.trim().length < 2 ? "Indica la iglesia de procedencia." : null;
    case "zona":
      return !form.zona ? "Selecciona tu zona." : null;
    case "talla_camisa":
      return showShirtSize && !form.talla_camisa ? "Selecciona una talla." : null;
    case "talla_otra":
      return showShirtSize && form.talla_camisa === "OTRA" && form.talla_otra.trim().length < 1
        ? "Menciona qué talla necesitas."
        : null;
    case "fecha_pago":
      if (!form.fecha_pago) return "Indica la fecha en que realizaste tu pago.";
      return form.fecha_pago > HOY ? "La fecha de pago no puede ser futura." : null;
    case "tiene_promocion":
      return form.tiene_promocion === "" ? "Selecciona una opción." : null;
    case "promocion_detalle":
      return form.tiene_promocion === true && form.promocion_detalle.trim().length < 1
        ? "Menciona qué promoción obtuviste."
        : null;
    case "ticket":
      return pedirComprobante && !ticket ? "Sube la imagen o PDF de tu comprobante de pago." : null;
    default:
      return null;
  }
}

const STEP_FIELDS: FieldKey[][] = [
  ["nombre", "edad", "sexo", "bautizado", "fecha_bautismo"],
  ["iglesia", "zona", "talla_camisa", "talla_otra"],
  ["fecha_pago", "tiene_promocion", "promocion_detalle", "ticket"],
];

export function FormularioRegistro() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { showShirtSize, pedirComprobante } = useSettings();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  // Arranca en false a propósito: si el primer campo tuviera autoFocus desde
  // el montaje inicial, el navegador haría scroll automático hacia él apenas
  // carga la página, saltándose el hero por completo. Solo se activa tras la
  // primera navegación explícita entre pasos (goNext/goBack) — ahí sí es
  // buena UX enfocar el primer campo del paso nuevo.
  const [hasNavigated, setHasNavigated] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [ticket, setTicket] = useState<File | null>(null);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  function validateStep(index: number): boolean {
    const fields = STEP_FIELDS[index];
    const next: typeof errors = { ...errors };
    let ok = true;
    for (const key of fields) {
      const err = fieldError(key, form, ticket, showShirtSize, pedirComprobante);
      if (err) {
        next[key] = err;
        ok = false;
      } else {
        delete next[key];
      }
    }
    setErrors(next);
    return ok;
  }

  function validateField(key: FieldKey) {
    const err = fieldError(key, form, ticket, showShirtSize, pedirComprobante);
    setErrors((prev) => {
      const next = { ...prev };
      if (err) next[key] = err;
      else delete next[key];
      return next;
    });
  }

  function goNext() {
    if (!validateStep(step)) return;
    setDirection(1);
    setHasNavigated(true);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setDirection(-1);
    setHasNavigated(true);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    for (let i = 0; i < STEPS.length; i++) {
      if (!validateStep(i)) {
        setStep(i);
        return;
      }
    }

    setSubmitting(true);
    try {
      const body = new FormData();
      body.append("nombre", form.nombre.trim());
      body.append("edad", form.edad);
      body.append("sexo", form.sexo);
      body.append("bautizado", String(form.bautizado === true));
      if (form.bautizado && form.fecha_bautismo.trim()) {
        body.append("fecha_bautismo", form.fecha_bautismo.trim());
      }
      body.append("iglesia", form.iglesia.trim());
      body.append("zona", form.zona);
      if (showShirtSize && form.talla_camisa) {
        body.append("talla_camisa", form.talla_camisa);
        if (form.talla_camisa === "OTRA" && form.talla_otra.trim()) {
          body.append("talla_otra", form.talla_otra.trim());
        }
      }
      body.append("fecha_pago", form.fecha_pago);
      body.append("tiene_promocion", String(form.tiene_promocion === true));
      if (form.tiene_promocion && form.promocion_detalle.trim()) {
        body.append("promocion_detalle", form.promocion_detalle.trim());
      }
      if (ticket) {
        body.append("ticket", ticket);
      }

      // El header ngrok-skip-browser-warning evita que, al probar detrás de
      // un túnel de ngrok, la advertencia interstitial de ngrok intercepte
      // este POST y devuelva HTML en vez de JSON — inofensivo fuera de
      // ngrok, cualquier otro servidor simplemente lo ignora.
      const res = await fetch("/api/registros", {
        method: "POST",
        body,
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new ApiError(data?.detail ?? "No se pudo completar el registro.", res.status);
      }
      const data = (await res.json()) as { folio: string; nombre: string };
      navigate("/registro-exitoso", { state: { nombre: data.nombre } });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "No se pudo completar el registro. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  const variants = {
    enter: (dir: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: dir * 40 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: dir * -40 }),
  };

  return (
    <section className="section-container form-section" id="registro-form">
      <Reveal>
        <p className="eyebrow">Formulario</p>
        <h2 className="display-title form-title">Tu lugar te espera</h2>
        <p className="muted">
          Completa tus datos{pedirComprobante ? " y sube tu comprobante de pago" : ""}. Tu registro será verificado
          por el equipo organizador. <a href="#pago">¿Todavía no pagas? Consulta los datos de pago.</a>
        </p>
      </Reveal>

      <Reveal delay={0.1}>
        <form className="glass-card form-card" onSubmit={handleSubmit} noValidate>
          <StepProgress steps={STEPS} current={step} />

          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={step}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            >
              {step === 0 && (
                <div className="form-grid">
                  <div className={`field ${errors.nombre ? "has-error" : ""}`}>
                    <label htmlFor="nombre">
                      <UserIcon size={14} /> Nombre completo
                    </label>
                    <input
                      id="nombre"
                      ref={firstFieldRef}
                      type="text"
                      autoFocus={hasNavigated}
                      value={form.nombre}
                      onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                      onBlur={() => validateField("nombre")}
                      placeholder="Nombre y apellidos"
                    />
                    {errors.nombre && <span className="field-error">{errors.nombre}</span>}
                  </div>

                  <div className={`field ${errors.sexo ? "has-error" : ""}`}>
                    <label htmlFor="sexo">Género</label>
                    <select
                      id="sexo"
                      value={form.sexo}
                      onChange={(e) => setForm({ ...form, sexo: e.target.value as Sexo })}
                      onBlur={() => validateField("sexo")}
                    >
                      <option value="">Selecciona una opción</option>
                      <option value="F">Mujer</option>
                      <option value="M">Hombre</option>
                    </select>
                    {errors.sexo && <span className="field-error">{errors.sexo}</span>}
                  </div>

                  <div className={`field ${errors.edad ? "has-error" : ""}`}>
                    <label htmlFor="edad">Edad</label>
                    <input
                      id="edad"
                      type="number"
                      min={5}
                      max={99}
                      value={form.edad}
                      onChange={(e) => setForm({ ...form, edad: e.target.value })}
                      onBlur={() => validateField("edad")}
                      placeholder="Edad"
                    />
                    {errors.edad && <span className="field-error">{errors.edad}</span>}
                  </div>

                  <YesNoField
                    id="bautizado"
                    label="¿Estás bautizado?"
                    icon={DropIcon}
                    value={form.bautizado}
                    onChange={(v) => setForm({ ...form, bautizado: v, fecha_bautismo: v ? form.fecha_bautismo : "" })}
                    onBlur={() => validateField("bautizado")}
                    error={errors.bautizado}
                  />

                  {form.bautizado === true && (
                    <div className={`field span-2 ${errors.fecha_bautismo ? "has-error" : ""}`}>
                      <label htmlFor="fecha_bautismo">Fecha de tu bautismo</label>
                      <input
                        id="fecha_bautismo"
                        type="text"
                        value={form.fecha_bautismo}
                        onChange={(e) => setForm({ ...form, fecha_bautismo: e.target.value })}
                        onBlur={() => validateField("fecha_bautismo")}
                        placeholder="Ej. 10/03/2015, Hace 7 meses, Hace 2 años"
                      />
                      <span className="field-hint">
                        Te dejamos algunos ejemplos de cómo puedes responder: 10/03/2015 · Hace 7 meses · Hace 2 años
                      </span>
                      {errors.fecha_bautismo && <span className="field-error">{errors.fecha_bautismo}</span>}
                    </div>
                  )}
                </div>
              )}

              {step === 1 && (
                <div className="form-grid">
                  <div className={`field ${errors.iglesia ? "has-error" : ""}`}>
                    <label htmlFor="iglesia">
                      <ChurchIcon size={14} /> Iglesia de procedencia
                    </label>
                    <input
                      id="iglesia"
                      type="text"
                      autoFocus
                      value={form.iglesia}
                      onChange={(e) => setForm({ ...form, iglesia: e.target.value })}
                      onBlur={() => validateField("iglesia")}
                      placeholder="Nombre de la iglesia"
                    />
                    {errors.iglesia && <span className="field-error">{errors.iglesia}</span>}
                  </div>

                  <ZonaField
                    value={form.zona}
                    onChange={(v) => setForm({ ...form, zona: v })}
                    onBlur={() => validateField("zona")}
                    error={errors.zona}
                  />

                  {showShirtSize && (
                    <ShirtSizeField
                      value={form.talla_camisa}
                      onChange={(v) => setForm({ ...form, talla_camisa: v, talla_otra: v === "OTRA" ? form.talla_otra : "" })}
                      onBlur={() => validateField("talla_camisa")}
                      error={errors.talla_camisa}
                      otra={form.talla_otra}
                      onOtraChange={(v) => setForm({ ...form, talla_otra: v })}
                      onOtraBlur={() => validateField("talla_otra")}
                      otraError={errors.talla_otra}
                    />
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="form-grid">
                  <div className={`field ${errors.fecha_pago ? "has-error" : ""}`}>
                    <label htmlFor="fecha_pago">
                      <CalendarIcon size={14} /> Fecha en la que realizaste tu pago
                    </label>
                    <input
                      id="fecha_pago"
                      type="date"
                      max={HOY}
                      value={form.fecha_pago}
                      onChange={(e) => setForm({ ...form, fecha_pago: e.target.value })}
                      onBlur={() => validateField("fecha_pago")}
                    />
                    {errors.fecha_pago && <span className="field-error">{errors.fecha_pago}</span>}
                  </div>

                  <YesNoField
                    id="tiene_promocion"
                    label="¿Obtuviste alguna promoción?"
                    icon={TagIcon}
                    value={form.tiene_promocion}
                    onChange={(v) =>
                      setForm({ ...form, tiene_promocion: v, promocion_detalle: v ? form.promocion_detalle : "" })
                    }
                    onBlur={() => validateField("tiene_promocion")}
                    error={errors.tiene_promocion}
                  />

                  {form.tiene_promocion === true && (
                    <div className={`field span-2 ${errors.promocion_detalle ? "has-error" : ""}`}>
                      <label htmlFor="promocion_detalle">Menciona qué promoción obtuviste</label>
                      <input
                        id="promocion_detalle"
                        type="text"
                        value={form.promocion_detalle}
                        onChange={(e) => setForm({ ...form, promocion_detalle: e.target.value })}
                        onBlur={() => validateField("promocion_detalle")}
                        placeholder="Promoción"
                      />
                      {errors.promocion_detalle && <span className="field-error">{errors.promocion_detalle}</span>}
                    </div>
                  )}

                  <div className="span-2 form-summary">
                    <p className="form-summary-title">Revisa tus datos</p>
                    <dl>
                      <div>
                        <dt>Nombre</dt>
                        <dd>{form.nombre || "—"}</dd>
                      </div>
                      <div>
                        <dt>Género</dt>
                        <dd>{form.sexo === "M" ? "Hombre" : form.sexo === "F" ? "Mujer" : "—"}</dd>
                      </div>
                      <div>
                        <dt>Edad</dt>
                        <dd>{form.edad || "—"}</dd>
                      </div>
                      <div>
                        <dt>Bautizado</dt>
                        <dd>{form.bautizado === "" ? "—" : form.bautizado ? "Sí" : "No"}</dd>
                      </div>
                      <div>
                        <dt>Iglesia</dt>
                        <dd>{form.iglesia || "—"}</dd>
                      </div>
                      <div>
                        <dt>Zona</dt>
                        <dd>{form.zona ? ZONA_LABEL[form.zona] : "—"}</dd>
                      </div>
                      {showShirtSize && (
                        <div>
                          <dt>Talla</dt>
                          <dd>{form.talla_camisa === "OTRA" ? form.talla_otra || "Otra" : form.talla_camisa || "—"}</dd>
                        </div>
                      )}
                      <div>
                        <dt>Promoción</dt>
                        <dd>{form.tiene_promocion === "" ? "—" : form.tiene_promocion ? form.promocion_detalle || "Sí" : "No"}</dd>
                      </div>
                    </dl>
                    <button type="button" className="form-summary-edit" onClick={() => setStep(0)}>
                      Editar datos
                    </button>
                  </div>

                  {pedirComprobante && (
                    <>
                      <p className="muted span-2 form-pago-hint">
                        ¿No tienes tu comprobante a la mano? <a href="#pago">Consulta los datos de pago aquí.</a>
                      </p>

                      <FileDrop file={ticket} onChange={setTicket} error={errors.ticket} />
                    </>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {serverError && <p className="field-error form-server-error">{serverError}</p>}

          <div className="form-actions">
            {step > 0 && (
              <button type="button" className="btn btn-ghost" onClick={goBack} disabled={submitting}>
                ← Atrás
              </button>
            )}
            <div className="form-actions-spacer" />
            {step < STEPS.length - 1 && (
              <button type="button" className="btn btn-primary" onClick={goNext}>
                Siguiente →
              </button>
            )}
            {step === STEPS.length - 1 && (
              <button className="btn btn-primary" type="submit" disabled={submitting}>
                {submitting && <span className="spinner" />}
                {submitting ? "Enviando..." : "Confirmar registro"}
              </button>
            )}
          </div>
        </form>
      </Reveal>
    </section>
  );
}
