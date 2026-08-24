import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// El snippet de Google Tag Manager (ver index.html) solo registra la vista de
// página inicial: al ser una SPA con React Router, navegar entre rutas no
// dispara ninguna petición nueva que GTM pueda ver por sí solo. Este módulo
// empuja un evento a `dataLayer` en cada cambio de ruta para que, del lado de
// GTM, se pueda crear un activador de evento personalizado (`spa_pageview`)
// que dispare la etiqueta de vista de página de GA4.

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

export function pushDataLayer(evento: Record<string, unknown>) {
  // Guard: dataLayer puede no existir si un bloqueador de anuncios detuvo el
  // script de GTM, o en el entorno de pruebas.
  if (!window.dataLayer) return;
  window.dataLayer.push(evento);
}

export function useAnalyticsPageviews() {
  const location = useLocation();

  useEffect(() => {
    pushDataLayer({
      event: "spa_pageview",
      page_path: location.pathname + location.search,
      page_title: document.title,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);
}
