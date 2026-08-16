import { Reveal } from "../../components/Reveal";
import { RootDivider } from "../../components/RootDivider";
import { ChurchIcon, CityIcon, RootIcon, ShirtIcon } from "../../components/icons";
import { CAMP_DETAILS, CAMP_INTRO, CAMP_NAME, type CampDetail } from "../../config";
import "./Detalles.css";

const ICONS: Record<CampDetail["icon"], typeof RootIcon> = {
  root: RootIcon,
  church: ChurchIcon,
  city: CityIcon,
  shirt: ShirtIcon,
};

export function Detalles() {
  return (
    <section className="section-container detalles">
      <Reveal>
        <p className="eyebrow">¿Qué es {CAMP_NAME}?</p>
      </Reveal>
      <Reveal delay={0.08}>
        <p className="detalles-intro muted">{CAMP_INTRO}</p>
      </Reveal>

      <RootDivider />

      <div className="detalles-grid">
        {CAMP_DETAILS.map((detail, i) => {
          const Icon = ICONS[detail.icon];
          return (
            <Reveal key={detail.title} delay={i * 0.1} y={30}>
              <div className="glass-card detalles-card">
                <span className="detalles-card-icon">
                  <Icon size={22} />
                </span>
                <h3>{detail.title}</h3>
                <p className="muted">{detail.body}</p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
