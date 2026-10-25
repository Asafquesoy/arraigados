// Búsqueda de sugerencias de iglesia para el autocompletado del formulario.
// A propósito NO quita palabras de relleno ("Iglesia Bautista"): aquí solo se
// busca, y quien escribe "iglesia bautista eli" debe poder encontrar
// "Iglesia Bautista Eliacim". La unificación real de nombres (que sí ignora el
// relleno) la hace el backend en `app/iglesias.py` al guardar.

export function normalizarParaBuscar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Opciones donde cada palabra de la consulta es prefijo de alguna palabra
 *  del nombre ("eli" encuentra "Iglesia Bautista Eliacim"). Con la consulta
 *  vacía devuelve las primeras `max` (el backend ya las manda por tamaño). */
export function filtrarSugerencias(opciones: string[], consulta: string, max = 6): string[] {
  const q = normalizarParaBuscar(consulta);
  if (!q) return opciones.slice(0, max);
  const palabras = q.split(" ");
  return opciones
    .filter((opcion) => {
      const palabrasOpcion = normalizarParaBuscar(opcion).split(" ");
      return palabras.every((p) => palabrasOpcion.some((po) => po.startsWith(p)));
    })
    .slice(0, max);
}
