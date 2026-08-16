import { useEffect, useState } from "react";

/**
 * Hook mínimo sobre matchMedia. SSR-safe (arranca en `false` si no hay
 * `window`) y se suscribe a cambios reales de viewport, no solo al montar.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== "undefined" ? window.matchMedia(query).matches : false));

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
