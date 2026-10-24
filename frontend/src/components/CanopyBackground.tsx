import "./CanopyBackground.css";

/**
 * Fondo fijo de la app: dosel nocturno con rayos de luz dorada que respiran,
 * hojas a la deriva y una capa de grano. Se monta una sola vez en App.tsx.
 * Puramente decorativo (aria-hidden). Desactiva su movimiento con
 * prefers-reduced-motion y se recorta en móvil y en equipos lentos
 * (`.equipo-ligero`) — todo en CanopyBackground.css.
 */
export function CanopyBackground({ variant = "full" }: { variant?: "full" | "sutil" }) {
  return (
    <div className={`canopy canopy--${variant}`} aria-hidden="true">
      <div className="canopy-rayo canopy-rayo--a" />
      <div className="canopy-rayo canopy-rayo--b" />
      <div className="canopy-hojas">
        {Array.from({ length: 10 }).map((_, i) => (
          <span key={i} className={`canopy-hoja canopy-hoja--${(i % 5) + 1}`} />
        ))}
      </div>
      <div className="canopy-grano" />
    </div>
  );
}
