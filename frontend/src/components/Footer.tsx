import { CAMP_NAME, ORGANIZER, SOCIAL_LINKS } from "../config";
import { FacebookIcon, InstagramIcon } from "./icons";
import "./Footer.css";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p className="muted">
          {CAMP_NAME} · {ORGANIZER}
        </p>
        <div className="site-footer-social">
          <a href={SOCIAL_LINKS.instagram} target="_blank" rel="noreferrer" aria-label="Instagram de Dúnamis">
            <InstagramIcon size={20} />
          </a>
          <a href={SOCIAL_LINKS.facebook} target="_blank" rel="noreferrer" aria-label="Facebook de Dúnamis">
            <FacebookIcon size={20} />
          </a>
        </div>
      </div>
    </footer>
  );
}
