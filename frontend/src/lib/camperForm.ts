// Estado y validación del formulario de datos de un campero — compartido entre
// el registro público (pages/sections/FormularioRegistro.tsx, captura paso a
// paso) y la edición admin (components/EditarCamperModal.tsx, todo en una
// pantalla). Mover esto a un módulo aparte es lo que evita que ambos flujos
// duplicen — y con el tiempo diverjan en — las mismas ~15 reglas de validación.
import type { CamperOut, CamperUpdate, Sexo, TallaCamisa, TipoParticipante, Zona } from "./api";

export interface FormState {
  tipo: TipoParticipante | "";
  nombre: string;
  edad: string;
  sexo: Sexo | "";
  telefono: string;
  bautizado: boolean | "";
  bautismo_mes: number | "";
  bautismo_anio: number | "";
  iglesia: string;
  zona: Zona | "";
  talla_camisa: TallaCamisa | "";
  talla_otra: string;
  fecha_pago: string;
  tiene_promocion: boolean | "";
  promocion_tipo: string;
}

export type FieldKey = keyof FormState | "ticket";

export const INITIAL_STATE: FormState = {
  tipo: "",
  nombre: "",
  edad: "",
  sexo: "",
  telefono: "",
  bautizado: "",
  bautismo_mes: "",
  bautismo_anio: "",
  iglesia: "",
  zona: "",
  talla_camisa: "",
  talla_otra: "",
  fecha_pago: "",
  tiene_promocion: "",
  promocion_tipo: "",
};

export const HOY = new Date().toISOString().slice(0, 10);

export function fieldError(
  key: FieldKey,
  form: FormState,
  ticket: File | null,
  showShirtSize: boolean,
  pedirComprobante: boolean
): string | null {
  switch (key) {
    case "tipo":
      return !form.tipo ? "Selecciona una opción." : null;
    case "nombre":
      return form.nombre.trim().length < 2 ? "Escribe tu nombre completo." : null;
    case "edad": {
      const n = Number(form.edad);
      return !form.edad || Number.isNaN(n) || n < 5 || n > 99 ? "Ingresa una edad válida (5-99)." : null;
    }
    case "sexo":
      return !form.sexo ? "Selecciona una opción." : null;
    case "telefono": {
      if (form.tipo !== "CONSEJERO") return null;
      const digits = form.telefono.replace(/[\s-]/g, "");
      return !/^\d{10}$/.test(digits) ? "Ingresa un teléfono de 10 dígitos." : null;
    }
    case "bautizado":
      return form.tipo === "CAMPERO" && form.bautizado === "" ? "Selecciona una opción." : null;
    case "bautismo_mes":
      return form.tipo === "CAMPERO" && form.bautizado === true && form.bautismo_mes === ""
        ? "Indica el mes de tu bautismo."
        : null;
    case "bautismo_anio": {
      if (form.tipo !== "CAMPERO" || form.bautizado !== true) return null;
      if (form.bautismo_anio === "") return "Indica el año de tu bautismo.";
      const hoy = new Date();
      if (
        form.bautismo_mes !== "" &&
        (form.bautismo_anio > hoy.getFullYear() ||
          (form.bautismo_anio === hoy.getFullYear() && form.bautismo_mes > hoy.getMonth() + 1))
      ) {
        return "La fecha de tu bautismo no puede ser futura.";
      }
      return null;
    }
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
    case "promocion_tipo":
      return form.tiene_promocion === true && form.promocion_tipo.trim().length < 1
        ? "Escribe qué promoción obtuviste."
        : null;
    case "ticket":
      return pedirComprobante && !ticket ? "Sube la imagen o PDF de tu comprobante de pago." : null;
    default:
      return null;
  }
}

/** Mapea un CamperOut ya guardado al estado editable del formulario — usado
 * por EditarCamperModal para precargar los campos actuales del registro. */
export function camperToForm(c: CamperOut): FormState {
  return {
    tipo: c.tipo ?? "",
    nombre: c.nombre,
    edad: String(c.edad),
    sexo: c.sexo,
    telefono: c.telefono ?? "",
    bautizado: c.bautizado ?? "",
    bautismo_mes: c.bautismo_mes ?? "",
    bautismo_anio: c.bautismo_anio ?? "",
    iglesia: c.iglesia,
    zona: c.zona ?? "",
    talla_camisa: c.talla_camisa ?? "",
    talla_otra: c.talla_otra ?? "",
    fecha_pago: c.fecha_pago ?? "",
    tiene_promocion: c.tiene_promocion ?? "",
    promocion_tipo: c.promocion_detalle ?? "",
  };
}

/** Construye el payload de PATCH /api/admin/registros/{id} a partir del
 * estado del formulario — mismo criterio de "qué se manda" que el FormData
 * del registro público en FormularioRegistro.tsx::handleSubmit. */
export function formToCamperUpdate(form: FormState, showShirtSize: boolean): CamperUpdate {
  return {
    nombre: form.nombre.trim(),
    iglesia: form.iglesia.trim(),
    edad: Number(form.edad),
    sexo: form.sexo as Sexo,
    zona: form.zona as Zona,
    tipo: form.tipo as TipoParticipante,
    fecha_pago: form.fecha_pago,
    tiene_promocion: form.tiene_promocion === true,
    telefono: form.tipo === "CONSEJERO" && form.telefono.trim() ? form.telefono.trim() : null,
    bautizado: form.tipo === "CAMPERO" ? form.bautizado === true : null,
    bautismo_mes:
      form.tipo === "CAMPERO" && form.bautizado === true && form.bautismo_mes !== "" ? form.bautismo_mes : null,
    bautismo_anio:
      form.tipo === "CAMPERO" && form.bautizado === true && form.bautismo_anio !== "" ? form.bautismo_anio : null,
    promocion_detalle: form.tiene_promocion === true && form.promocion_tipo.trim() ? form.promocion_tipo.trim() : null,
    talla_camisa: showShirtSize && form.talla_camisa ? form.talla_camisa : null,
    talla_otra:
      showShirtSize && form.talla_camisa === "OTRA" && form.talla_otra.trim() ? form.talla_otra.trim() : null,
  };
}
