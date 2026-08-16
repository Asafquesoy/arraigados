/**
 * Feature flags del sitio. Apaga SHOW_SHIRT_SIZE para ocultar por completo
 * el campo de talla de camisa en el formulario y en el panel admin —
 * ningún otro cambio de código es necesario.
 */
export const SHOW_SHIRT_SIZE = true;

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
