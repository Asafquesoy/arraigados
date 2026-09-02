import { Reveal } from "../../components/Reveal";
import { RootDivider } from "../../components/RootDivider";
import { DownloadIcon, ShieldCheckIcon } from "../../components/icons";
import { CARTA_PREINSCRIPCION } from "../../config";
import "./Carta.css";

const REQUISITOS = [
  "Una sola carta por unión/iglesia, no una por campero.",
  "Incluye nombre, edad, iglesia de procedencia y si es miembro o invitado de cada joven.",
  "Nombre y teléfono del responsable (pastor, consejero o líder) como contacto en caso de un incidente.",
  "Debe llevarse el día del campamento.",
];

function scrollToForm() {
  document.getElementById("registro-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function Carta() {
  return (
    <section className="section-container carta" id="carta">
      <Reveal>
        <p className="eyebrow">Requisito</p>
        <h2 className="display-title carta-title">Carta de preinscripción</h2>
        <p className="muted carta-intro">
          Cada unión debe entregar una carta de preinscripción por sus jóvenes. Descárgala,
          llénala y pide que tu pastor la firme y la selle antes de registrarte.
        </p>
      </Reveal>

      <RootDivider seed={43} />

      <Reveal delay={0.08}>
        <div className="glass-card carta-card">
          <ul className="carta-requisitos">
            {REQUISITOS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="carta-destacado">
            <ShieldCheckIcon size={18} />
            Indispensable: firma de autorización del pastor y sello de la iglesia.
          </p>
        </div>
      </Reveal>

      <Reveal delay={0.14}>
        <a
          className="btn btn-primary carta-download"
          href={CARTA_PREINSCRIPCION.href}
          download={CARTA_PREINSCRIPCION.filename}
        >
          <DownloadIcon size={18} />
          Descargar carta de preinscripción
        </a>
      </Reveal>

      <Reveal delay={0.2}>
        <button type="button" className="btn btn-ghost carta-cta" onClick={scrollToForm}>
          Continuar con mi registro →
        </button>
      </Reveal>
    </section>
  );
}
