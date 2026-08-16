import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FileDrop } from "../../components/FileDrop";
import { Reveal } from "../../components/Reveal";
import { ShirtSizeField } from "../../components/ShirtSizeField";
import { StepProgress } from "../../components/StepProgress";
import { CityIcon, ChurchIcon, UserIcon } from "../../components/icons";
import { ApiError } from "../../lib/api";
import type { Sexo, TallaCamisa } from "../../lib/api";
import { useSettings } from "../../lib/SettingsContext";
import "./FormularioRegistro.css";

interface FormState {
  nombre: string;
  ciudad: string;
  iglesia: string;
  edad: string;
  sexo: Sexo | "";
  talla_camisa: TallaCamisa | "";
}

type FieldKey = keyof FormState | "ticket";

const INITIAL_STATE: FormState = {
  nombre: "",
  ciudad: "",
  iglesia: "",
  edad: "",
  sexo: "",
  talla_camisa: "",
};

const STEPS = ["Quién eres", "De dónde vienes", "Tu comprobante"];

function fieldError(key: FieldKey, form: FormState, ticket: File | null, showShirtSize: boolean): string | null {
  switch (key) {
    case "nombre":
      return form.nombre.trim().length < 2 ? "Escribe el nombre completo del campero." : null;
    case "ciudad":
      return form.ciudad.trim().length < 2 ? "Indica la ciudad de procedencia." : null;
    case "iglesia":
      return form.iglesia.trim().length < 2 ? "Indica la iglesia de procedencia." : null;
    case "edad": {
      const n = Number(form.edad);
      return !form.edad || Number.isNaN(n) || n < 5 || n > 99 ? "Ingresa una edad válida (5-99)." : null;
    }
    case "sexo":
      return !form.sexo ? "Selecciona una opción." : null;
    case "talla_camisa":
      return showShirtSize && !form.talla_camisa ? "Selecciona una talla." : null;
    case "ticket":
      return !ticket ? "Sube la imagen o PDF de tu comprobante de pago." : null;
    default:
      return null;
  }
}

const STEP_FIELDS: FieldKey[][] = [
  ["nombre", "edad", "sexo"],
  ["ciudad", "iglesia", "talla_camisa"],
  ["ticket"],
];

export function FormularioRegistro() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { showShirtSize } = useSettings();
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
      const err = fieldError(key, form, ticket, showShirtSize);
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
    const err = fieldError(key, form, ticket, showShirtSize);
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
    if (!validateStep(2)) return;

    setSubmitting(true);
    try {
      const body = new FormData();
      body.append("nombre", form.nombre.trim());
      body.append("ciudad", form.ciudad.trim());
      body.append("iglesia", form.iglesia.trim());
      body.append("edad", form.edad);
      body.append("sexo", form.sexo);
      if (showShirtSize && form.talla_camisa) body.append("talla_camisa", form.talla_camisa);
      body.append("ticket", ticket as File);

      const res = await fetch("/api/registros", { method: "POST", body });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new ApiError(data?.detail ?? "No se pudo completar el registro.", res.status);
      }
      const data = (await res.json()) as { folio: string; nombre: string };
      navigate("/registro-exitoso", { state: { folio: data.folio, nombre: data.nombre } });
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
          Completa tus datos y sube tu comprobante de pago. Tu registro será verificado por el equipo organizador.
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
                      <UserIcon size={14} /> Nombre del campero
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

                  <div className={`field span-2 ${errors.sexo ? "has-error" : ""}`}>
                    <label htmlFor="sexo">Sexo</label>
                    <select
                      id="sexo"
                      value={form.sexo}
                      onChange={(e) => setForm({ ...form, sexo: e.target.value as Sexo })}
                      onBlur={() => validateField("sexo")}
                    >
                      <option value="">Selecciona una opción</option>
                      <option value="M">Masculino</option>
                      <option value="F">Femenino</option>
                    </select>
                    {errors.sexo && <span className="field-error">{errors.sexo}</span>}
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="form-grid">
                  <div className={`field ${errors.ciudad ? "has-error" : ""}`}>
                    <label htmlFor="ciudad">
                      <CityIcon size={14} /> Ciudad de procedencia
                    </label>
                    <input
                      id="ciudad"
                      type="text"
                      autoFocus
                      value={form.ciudad}
                      onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
                      onBlur={() => validateField("ciudad")}
                      placeholder="Ciudad"
                    />
                    {errors.ciudad && <span className="field-error">{errors.ciudad}</span>}
                  </div>

                  <div className={`field ${errors.iglesia ? "has-error" : ""}`}>
                    <label htmlFor="iglesia">
                      <ChurchIcon size={14} /> Iglesia de procedencia
                    </label>
                    <input
                      id="iglesia"
                      type="text"
                      value={form.iglesia}
                      onChange={(e) => setForm({ ...form, iglesia: e.target.value })}
                      onBlur={() => validateField("iglesia")}
                      placeholder="Nombre de la iglesia"
                    />
                    {errors.iglesia && <span className="field-error">{errors.iglesia}</span>}
                  </div>

                  {showShirtSize && (
                    <ShirtSizeField
                      value={form.talla_camisa}
                      onChange={(v) => setForm({ ...form, talla_camisa: v })}
                      error={errors.talla_camisa}
                    />
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="form-grid">
                  <div className="span-2 form-summary">
                    <p className="form-summary-title">Revisa tus datos</p>
                    <dl>
                      <div>
                        <dt>Nombre</dt>
                        <dd>{form.nombre || "—"}</dd>
                      </div>
                      <div>
                        <dt>Edad</dt>
                        <dd>{form.edad || "—"}</dd>
                      </div>
                      <div>
                        <dt>Sexo</dt>
                        <dd>{form.sexo === "M" ? "Masculino" : form.sexo === "F" ? "Femenino" : "—"}</dd>
                      </div>
                      <div>
                        <dt>Ciudad</dt>
                        <dd>{form.ciudad || "—"}</dd>
                      </div>
                      <div>
                        <dt>Iglesia</dt>
                        <dd>{form.iglesia || "—"}</dd>
                      </div>
                      {showShirtSize && (
                        <div>
                          <dt>Talla</dt>
                          <dd>{form.talla_camisa || "—"}</dd>
                        </div>
                      )}
                    </dl>
                    <button type="button" className="form-summary-edit" onClick={() => setStep(0)}>
                      Editar datos
                    </button>
                  </div>

                  <FileDrop file={ticket} onChange={setTicket} error={errors.ticket} />
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
