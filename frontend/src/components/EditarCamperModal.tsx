import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { apiFetch, ApiError, type CamperOut } from "../lib/api";
import { camperToForm, fieldError, formToCamperUpdate, type FieldKey, type FormState } from "../lib/camperForm";
import { useSettings } from "../lib/SettingsContext";
import { BautismoFechaField } from "./BautismoFechaField";
import { FieldReveal } from "./FieldReveal";
import { ShirtSizeField } from "./ShirtSizeField";
import { TipoParticipanteField } from "./TipoParticipanteField";
import { YesNoField } from "./YesNoField";
import { ZonaField } from "./ZonaField";
import { CalendarIcon, ChurchIcon, DropIcon, PhoneIcon, TagIcon, UserIcon } from "./icons";
import "./TicketModal.css";
import "./EditarCamperModal.css";

// Todos los campos que un cambio de tipo/bautizado/promoción puede invalidar —
// se revalidan juntos cada vez que uno de ellos cambia, igual criterio que
// FormularioRegistro.tsx pero sin pasos: aquí todo el formulario está a la vista.
const CAMPOS: FieldKey[] = [
  "tipo",
  "nombre",
  "edad",
  "sexo",
  "telefono",
  "bautizado",
  "bautismo_mes",
  "bautismo_anio",
  "iglesia",
  "zona",
  "talla_camisa",
  "talla_otra",
  "fecha_pago",
  "tiene_promocion",
  "promocion_tipo",
];

interface EditarCamperModalProps {
  camper: CamperOut;
  onClose: () => void;
  onSaved: (actualizado: CamperOut) => void;
}

export function EditarCamperModal({ camper, onClose, onSaved }: EditarCamperModalProps) {
  const { showShirtSize } = useSettings();
  const reduce = useReducedMotion();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormState>(() => camperToForm(camper));
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    firstFieldRef.current?.focus();
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      previouslyFocused?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  function validateField(key: FieldKey) {
    const err = fieldError(key, form, null, showShirtSize, false);
    setErrors((prev) => {
      const next = { ...prev };
      if (err) next[key] = err;
      else delete next[key];
      return next;
    });
  }

  function validateAll(): boolean {
    const next: typeof errors = {};
    let ok = true;
    for (const key of CAMPOS) {
      const err = fieldError(key, form, null, showShirtSize, false);
      if (err) {
        next[key] = err;
        ok = false;
      }
    }
    setErrors(next);
    return ok;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!validateAll()) return;

    setSaving(true);
    try {
      const actualizado = await apiFetch<CamperOut>(`/admin/registros/${camper.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToCamperUpdate(form, showShirtSize)),
      });
      onSaved(actualizado);
      onClose();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "No se pudieron guardar los cambios. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <m.div
      className="ticket-modal-backdrop"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="presentation"
    >
      <m.div
        className="editar-camper-modal"
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Editar registro de ${camper.nombre}`}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="ticket-modal-header">
          <span>
            Editar registro <span className="mono muted">{camper.folio}</span>
          </span>
          <button className="ticket-modal-close" onClick={onClose} aria-label="Cerrar" ref={closeBtnRef}>
            ×
          </button>
        </div>

        <form className="editar-camper-body" onSubmit={handleSubmit} noValidate>
          <section className="editar-camper-section">
            <h3 className="editar-camper-heading">Quién es</h3>
            <div className="form-grid">
              <TipoParticipanteField
                value={form.tipo}
                onChange={(v) =>
                  setForm({
                    ...form,
                    tipo: v,
                    bautizado: v === "CAMPERO" ? form.bautizado : "",
                    bautismo_mes: v === "CAMPERO" ? form.bautismo_mes : "",
                    bautismo_anio: v === "CAMPERO" ? form.bautismo_anio : "",
                    telefono: v === "CONSEJERO" ? form.telefono : "",
                  })
                }
                onBlur={() => validateField("tipo")}
                error={errors.tipo}
              />

              <div className={`field ${errors.nombre ? "has-error" : ""}`}>
                <label htmlFor="edit-nombre">
                  <UserIcon size={14} /> Nombre completo
                </label>
                <input
                  id="edit-nombre"
                  ref={firstFieldRef}
                  type="text"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  onBlur={() => validateField("nombre")}
                  placeholder="Nombre y apellidos"
                />
                {errors.nombre && <span className="field-error">{errors.nombre}</span>}
              </div>

              <div className={`field ${errors.sexo ? "has-error" : ""}`}>
                <label htmlFor="edit-sexo">Género</label>
                <select
                  id="edit-sexo"
                  value={form.sexo}
                  onChange={(e) => setForm({ ...form, sexo: e.target.value as FormState["sexo"] })}
                  onBlur={() => validateField("sexo")}
                >
                  <option value="">Selecciona una opción</option>
                  <option value="F">Mujer</option>
                  <option value="M">Hombre</option>
                </select>
                {errors.sexo && <span className="field-error">{errors.sexo}</span>}
              </div>

              <div className={`field ${errors.edad ? "has-error" : ""}`}>
                <label htmlFor="edit-edad">Edad</label>
                <input
                  id="edit-edad"
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

              <AnimatePresence mode="wait" initial={false}>
                {form.tipo === "CONSEJERO" && (
                  <FieldReveal key="telefono">
                    <div className={`field ${errors.telefono ? "has-error" : ""}`}>
                      <label htmlFor="edit-telefono">
                        <PhoneIcon size={14} /> Número de teléfono
                      </label>
                      <input
                        id="edit-telefono"
                        type="tel"
                        inputMode="numeric"
                        value={form.telefono}
                        onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                        onBlur={() => validateField("telefono")}
                        placeholder="10 dígitos"
                      />
                      {errors.telefono && <span className="field-error">{errors.telefono}</span>}
                    </div>
                  </FieldReveal>
                )}
                {form.tipo === "CAMPERO" && (
                  <FieldReveal key="bautizado">
                    <YesNoField
                      id="edit-bautizado"
                      label="¿Está bautizado?"
                      icon={DropIcon}
                      value={form.bautizado}
                      onChange={(v) =>
                        setForm({
                          ...form,
                          bautizado: v,
                          bautismo_mes: v ? form.bautismo_mes : "",
                          bautismo_anio: v ? form.bautismo_anio : "",
                        })
                      }
                      onBlur={() => validateField("bautizado")}
                      error={errors.bautizado}
                    />
                  </FieldReveal>
                )}
              </AnimatePresence>

              <AnimatePresence initial={false}>
                {form.tipo === "CAMPERO" && form.bautizado === true && (
                  <FieldReveal key="bautismo_fecha" className="span-2">
                    <BautismoFechaField
                      mes={form.bautismo_mes}
                      anio={form.bautismo_anio}
                      onChange={(mes, anio) => setForm({ ...form, bautismo_mes: mes, bautismo_anio: anio })}
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
            </div>
          </section>

          <section className="editar-camper-section">
            <h3 className="editar-camper-heading">De dónde viene</h3>
            <div className="form-grid">
              <div className={`field ${errors.iglesia ? "has-error" : ""}`}>
                <label htmlFor="edit-iglesia">
                  <ChurchIcon size={14} /> Iglesia de procedencia
                </label>
                <input
                  id="edit-iglesia"
                  type="text"
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
          </section>

          <section className="editar-camper-section">
            <h3 className="editar-camper-heading">Pago</h3>
            <div className="form-grid">
              <div className={`field ${errors.fecha_pago ? "has-error" : ""}`}>
                <label htmlFor="edit-fecha_pago">
                  <CalendarIcon size={14} /> Fecha en la que realizó su pago
                </label>
                <input
                  id="edit-fecha_pago"
                  type="date"
                  value={form.fecha_pago}
                  onChange={(e) => setForm({ ...form, fecha_pago: e.target.value })}
                  onBlur={() => validateField("fecha_pago")}
                />
                {errors.fecha_pago && <span className="field-error">{errors.fecha_pago}</span>}
              </div>

              <YesNoField
                id="edit-tiene_promocion"
                label="¿Obtuvo alguna promoción?"
                icon={TagIcon}
                value={form.tiene_promocion}
                onChange={(v) =>
                  setForm({
                    ...form,
                    tiene_promocion: v,
                    promocion_tipo: v ? form.promocion_tipo : "",
                  })
                }
                onBlur={() => validateField("tiene_promocion")}
                error={errors.tiene_promocion}
              />

              <AnimatePresence initial={false}>
                {form.tiene_promocion === true && (
                  <FieldReveal key="promocion_tipo" className="span-2">
                    <div className={`field ${errors.promocion_tipo ? "has-error" : ""}`}>
                      <label htmlFor="edit-promocion_tipo">¿Qué promoción obtuvo?</label>
                      <input
                        id="edit-promocion_tipo"
                        type="text"
                        value={form.promocion_tipo}
                        onChange={(e) => setForm({ ...form, promocion_tipo: e.target.value })}
                        onBlur={() => validateField("promocion_tipo")}
                      />
                      {errors.promocion_tipo && <span className="field-error">{errors.promocion_tipo}</span>}
                    </div>
                  </FieldReveal>
                )}
              </AnimatePresence>
            </div>
          </section>

          {serverError && <p className="field-error editar-camper-error">{serverError}</p>}

          <div className="editar-camper-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving && <span className="spinner" />}
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>
      </m.div>
    </m.div>
  );
}
