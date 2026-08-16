/**
 * El interruptor de "mostrar talla de camisa" YA NO vive aquí como
 * constante — se volvió editable desde el panel admin (sección "Camisetas")
 * sin necesitar redeploy. Fuente de verdad: tabla `app_settings` en el
 * backend, expuesta vía GET /api/settings y leída en el cliente a través de
 * `useSettings().showShirtSize` (src/lib/SettingsContext.tsx). Los
 * consumidores (FormularioRegistro.tsx, AdminPanel.tsx) usan ese hook en vez
 * de importar un valor fijo de este archivo.
 */

export const CAMP_NAME = "Arraigados";
export const CAMP_DATE = "Noviembre 2026";
export const ORGANIZER = "Dunamis";

export const SOCIAL_LINKS = {
  instagram: "https://www.instagram.com/arbjdunamis/",
  facebook: "https://www.facebook.com/ARBJdunamis?locale=es_LA",
};

/**
 * Copy de la landing pública. Texto placeholder — edítalo libremente,
 * ningún componente necesita cambios para reflejar los cambios aquí.
 */
export const CAMP_INTRO =
  "Tres días para echar raíces profundas: comunidad, enseñanza y la presencia de Dios en medio del bosque. Arraigados es el campamento anual de jóvenes de Dunamis.";

export interface CampDetail {
  icon: "root" | "church" | "city" | "shirt";
  title: string;
  body: string;
}

export const CAMP_DETAILS: CampDetail[] = [
  {
    icon: "root",
    title: "Fecha",
    body: "Noviembre 2026 · próximamente confirmamos el fin de semana exacto.",
  },
  {
    icon: "city",
    title: "Sede",
    body: "Campamento en un entorno natural, rodeado de bosque — el lugar exacto se anuncia pronto.",
  },
  {
    icon: "church",
    title: "¿Para quién?",
    body: "Jóvenes de nuestras iglesias asociadas, con acompañamiento de líderes durante todo el campamento.",
  },
  {
    icon: "shirt",
    title: "Qué incluye",
    body: "Hospedaje, alimentos y playera oficial del campamento. Sube tu comprobante de pago al registrarte.",
  },
];
