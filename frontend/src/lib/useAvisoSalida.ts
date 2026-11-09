import { useEffect } from "react";

const MENSAJE = "Tienes datos sin guardar. Si sales se van a borrar. ¿Salir de todos modos?";

/**
 * Avisa antes de perder un formulario a medias.
 *
 * - Cerrar la pestaña, recargar o escribir otra dirección: `beforeunload`. El
 *   navegador muestra su propio texto genérico (no se puede personalizar).
 * - Tocar un enlace interno (menú, logo): la app usa `BrowserRouter`, donde
 *   `useBlocker` no existe, así que un listener de clic en fase de captura —
 *   corre antes que el `onClick` de `<Link>` de React Router— pregunta con
 *   `confirm` y, si cancelan, frena el clic antes de que navegue. Los enlaces
 *   externos ya los cubre `beforeunload`; los que apuntan a la misma ruta
 *   (p. ej. el ancla `#registro-form` del hero) no pierden nada y se dejan pasar.
 * - Límite conocido: el botón "atrás" del navegador dentro de la app no se puede
 *   interceptar con `BrowserRouter`; por eso `RegistroSitio.tsx` además guarda
 *   un borrador de la persona en curso.
 *
 * La navegación programática (`navigate(...)` tras enviar con éxito) tampoco pasa
 * por aquí: no es un clic en un enlace ni descarga la página.
 */
export function useAvisoSalida(hayCambios: boolean) {
  useEffect(() => {
    if (!hayCambios) return;

    function antesDeCerrar(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }

    function alHacerClic(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const destino = new URL(a.href, window.location.href);
      if (destino.origin !== window.location.origin) return;
      if (destino.pathname === window.location.pathname && destino.search === window.location.search) return;
      if (!window.confirm(MENSAJE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", antesDeCerrar);
    document.addEventListener("click", alHacerClic, true);
    return () => {
      window.removeEventListener("beforeunload", antesDeCerrar);
      document.removeEventListener("click", alHacerClic, true);
    };
  }, [hayCambios]);
}
