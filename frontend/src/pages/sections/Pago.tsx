import { Reveal } from "../../components/Reveal";
import { RootDivider } from "../../components/RootDivider";
import { Toast } from "../../components/Toast";
import { CopyIcon, WhatsAppIcon } from "../../components/icons";
import { useToast } from "../../lib/useToast";
import { useSettings } from "../../lib/SettingsContext";
import { BANK, CONTACTS } from "../../config";
import "./Pago.css";

const PESOS = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

const BANK_FIELDS: { label: string; value: string }[] = [
  { label: "Banco", value: BANK.banco },
  { label: "Titular", value: BANK.titular },
  { label: "Tarjeta", value: BANK.tarjeta },
  { label: "CLABE", value: BANK.clabe },
  { label: "Cuenta", value: BANK.cuenta },
];

export function Pago() {
  const { precioMxn } = useSettings();
  const [toast, setToast] = useToast();

  async function copiar(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value.replace(/\s/g, ""));
      setToast(`${label} copiado`);
    } catch {
      setToast("No se pudo copiar. Cópialo manualmente.");
    }
  }

  function scrollToForm() {
    document.getElementById("registro-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="section-container pago" id="pago">
      <Reveal>
        <p className="eyebrow">Costo e inscripción</p>
        <h2 className="display-title pago-title">Cómo pagar</h2>
        <p className="muted pago-precio">
          Tu lugar cuesta <strong className="mono">{PESOS.format(precioMxn)}</strong>. Deposita o
          transfiere a esta cuenta y sube tu comprobante al registrarte.
        </p>
      </Reveal>

      <RootDivider />

      <Reveal delay={0.08}>
        <div className="glass-card pago-bank-card">
          <dl className="pago-bank-grid">
            {BANK_FIELDS.map((field) => (
              <div className="pago-bank-row" key={field.label}>
                <dt>{field.label}</dt>
                <dd>
                  <span className="mono">{field.value}</span>
                  <button
                    type="button"
                    className="pago-copy-btn"
                    onClick={() => copiar(field.label, field.value)}
                    aria-label={`Copiar ${field.label}`}
                  >
                    <CopyIcon size={16} />
                  </button>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Reveal>

      <Reveal delay={0.14}>
        <div className="pago-contacts">
          <p className="muted">¿Dudas sobre tu pago o tu registro? Escríbenos:</p>
          <ul className="pago-contacts-list">
            {CONTACTS.map((contact) => (
              <li key={contact.whatsapp}>
                <a
                  href={`https://wa.me/${contact.whatsapp}`}
                  target="_blank"
                  rel="noreferrer"
                  className="pago-contact-link"
                >
                  <WhatsAppIcon size={18} />
                  {contact.name} · {contact.phone}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>

      <Reveal delay={0.2}>
        <button type="button" className="btn btn-primary pago-cta" onClick={scrollToForm}>
          Ya pagué, quiero registrarme →
        </button>
      </Reveal>

      <Toast message={toast} />
    </section>
  );
}
