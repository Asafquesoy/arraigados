/**
 * El interruptor de "mostrar talla de camisa" YA NO vive aquí como
 * constante — se volvió editable desde el panel admin (sección "Camisetas")
 * sin necesitar redeploy. Fuente de verdad: tabla `app_settings` en el
 * backend, expuesta vía GET /api/settings y leída en el cliente a través de
 * `useSettings().showShirtSize` (src/lib/SettingsContext.tsx). Los
 * consumidores (FormularioRegistro.tsx, AdminPanel.tsx) usan ese hook en vez
 * de importar un valor fijo de este archivo. Lo mismo aplica al precio del
 * campamento (`useSettings().precioMxn`) — tampoco vive aquí, cambia con el
 * tiempo y se edita desde el panel (sección "Costo del campamento").
 */

export const CAMP_NAME = "Arraigados";
export const CAMP_DATE = "13 – 16 de noviembre de 2026";
export const ORGANIZER = "Dúnamis";
export const ORGANIZER_FULL = "ARBJ Dúnamis";
export const CAMP_VERSE = "Efesios 3:17";

export const VENUE = {
  name: "Campamento Mahanaim",
  address: "Pob. Adolfo López Mateos, Tamaulipas (Chamal Nuevo)",
};

export const BANK = {
  titular: "David Aldape",
  banco: "Santander",
  tarjeta: "5579 0701 5872 1715",
  clabe: "014813606326410809",
  cuenta: "60632641080",
};

export interface Contact {
  name: string;
  phone: string;
  /** Sin espacios ni guiones, con lada de país (52) — listo para wa.me/<whatsapp>. */
  whatsapp: string;
}

export const CONTACTS: Contact[] = [
  { name: "Karla Aguirre", phone: "834 175 7007", whatsapp: "528341757007" },
  { name: "Haniel Guevara", phone: "834 162 3612", whatsapp: "528341623612" },
];

export const SOCIAL_LINKS = {
  instagram: "https://www.instagram.com/arbjdunamis/",
  facebook: "https://www.facebook.com/ARBJdunamis?locale=es_LA",
};

/**
 * Copy de la landing pública. Texto placeholder — edítalo libremente,
 * ningún componente necesita cambios para reflejar los cambios aquí.
 */
export const CAMP_INTRO =
  "Cuatro días para echar raíces profundas: comunidad, enseñanza y la presencia de Dios en Campamento Mahanaim. Arraigados es el campamento anual de jóvenes de Dúnamis.";

export interface CampDetail {
  icon: "root" | "church" | "city" | "shirt";
  title: string;
  body: string;
}

export const CAMP_DETAILS: CampDetail[] = [
  {
    icon: "root",
    title: "Fecha",
    body: "Del 13 al 16 de noviembre de 2026 · cuatro días.",
  },
  {
    icon: "city",
    title: "Sede",
    body: `${VENUE.name} — ${VENUE.address}.`,
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
