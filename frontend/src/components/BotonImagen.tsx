import { useEffect, useState } from "react";
import { DownloadIcon } from "./icons";
import "./BotonCopiar.css";

interface BotonImagenProps {
  label: string;
  /** Nombre del archivo sin extensión (se le añade la fecha). */
  nombre: string;
  generar: () => Promise<Blob>;
  className?: string;
}

type Estado = "reposo" | "generando" | "listo" | "error";

/**
 * Genera una imagen PNG al hacer clic. En teléfono con HTTPS abre el menú de compartir; en
 * `http://` (la laptop del campamento) o escritorio simplemente la descarga.
 */
export function BotonImagen({ label, nombre, generar, className = "btn-sm" }: BotonImagenProps) {
  const [estado, setEstado] = useState<Estado>("reposo");

  useEffect(() => {
    if (estado !== "listo" && estado !== "error") return;
    const t = setTimeout(() => setEstado("reposo"), 2500);
    return () => clearTimeout(t);
  }, [estado]);

  async function hacer() {
    setEstado("generando");
    try {
      const blob = await generar();
      const archivo = `${nombre}-${new Date().toISOString().slice(0, 10)}.png`;
      const file = new File([blob], archivo, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: nombre });
        } catch (err) {
          if ((err as DOMException).name !== "AbortError") throw err;
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = archivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
      setEstado("listo");
    } catch {
      setEstado("error");
    }
  }

  return (
    <div className="boton-copiar">
      <button type="button" className={`btn btn-ghost ${className}`} onClick={hacer} disabled={estado === "generando"}>
        <DownloadIcon size={16} />
        {estado === "generando" ? "Generando…" : estado === "listo" ? "¡Listo!" : label}
      </button>
      <span className="boton-copiar-estado" role="status">
        {estado === "listo" ? "Imagen lista" : estado === "error" ? "No se pudo crear la imagen" : ""}
      </span>
      {estado === "error" && <span className="field-error">No se pudo crear la imagen.</span>}
    </div>
  );
}
