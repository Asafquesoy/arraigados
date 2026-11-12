import type { FocusEvent } from "react";

/** Alto aproximado de la barra del sitio, que es fija arriba (`Navbar.css`, 76px) y también tapa. */
const ALTO_MENU = 80;

/**
 * Al enfocar una casilla de una hoja de captura, la lleva al centro de la pantalla si quedó tapada por la
 * barra de guardado fija de abajo (`.estacion-barra`) o por el menú de arriba. Hace falta porque el
 * navegador solo desplaza una casilla enfocada cuando está *totalmente* fuera de la vista: una a medias
 * detrás de una barra `sticky` la considera visible y la deja tapada. Se pone en el `onFocus` del `<form>`
 * (en React el foco burbujea).
 */
export function mantenerVisibleSobreBarra(ev: FocusEvent<HTMLElement>) {
  const el = ev.target as HTMLElement;
  if (el.tagName !== "INPUT") return;
  const barra = document.querySelector(".estacion-barra");
  const limiteInferior = (barra ? barra.getBoundingClientRect().top : window.innerHeight) - 8;
  const r = el.getBoundingClientRect();
  if (r.bottom > limiteInferior || r.top < ALTO_MENU) {
    const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reducir ? "auto" : "smooth" });
  }
}
