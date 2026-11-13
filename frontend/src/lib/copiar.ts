/**
 * Copia texto al portapapeles. Devuelve `true` si se copió.
 *
 * `navigator.clipboard` solo existe en contextos seguros (https o localhost). En el campamento la
 * página se abre desde otro dispositivo por `http://<ip-de-la-laptop>:5173`, que NO lo es: ahí
 * `navigator.clipboard` es `undefined`. Por eso el respaldo con un `<textarea>` oculto y
 * `document.execCommand("copy")`, que sí funciona en http dentro de un gesto del usuario (un clic).
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // Permiso denegado o documento sin foco: se intenta el respaldo.
    }
  }
  return copiarConTextarea(texto);
}

function copiarConTextarea(texto: string): boolean {
  const campo = document.createElement("textarea");
  campo.value = texto;
  campo.setAttribute("readonly", "");
  campo.setAttribute("aria-hidden", "true");
  // Fuera de pantalla y con 16px: en iOS un campo menor a 16px hace zoom al enfocarse.
  campo.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;font-size:16px;";
  document.body.appendChild(campo);
  const foco = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  try {
    campo.focus({ preventScroll: true });
    campo.select();
    campo.setSelectionRange(0, texto.length); // iOS ignora select() a secas
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(campo);
    foco?.focus({ preventScroll: true });
  }
}
